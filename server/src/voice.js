// Voice chat trong phòng: âm thanh đi thẳng giữa các trình duyệt (WebRTC, mã hóa đầu-cuối),
// server chỉ chuyển "tín hiệu" kết nối (SDP/ICE) và cấp thông tin máy chủ STUN/TURN.
//
// Biến môi trường:
//   VOICE_ENABLED=0                 tắt hẳn voice chat (mặc định: bật)
//   VOICE_MAX_PER_ROOM=6            số người tối đa trong kênh thoại mỗi phòng (mesh: mỗi người gửi N-1 luồng)
//   CF_TURN_KEY_ID, CF_TURN_KEY_API_TOKEN
//                                   TURN của Cloudflare (giúp kết nối qua 4G / mạng chặn P2P). Không đặt = chỉ STUN.
//   CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN
//                                   (tùy chọn) để server tự đọc dung lượng TURN đã dùng trong tháng (quyền "Account Analytics: Read")
//   VOICE_TURN_QUOTA_GB=900         ngưỡng GB/tháng (gói miễn phí 1.000 GB; để dư vì số liệu analytics là lấy mẫu, có độ trễ)
//   VOICE_QUOTA_ACTION=disable      khi chạm ngưỡng: 'disable' = tắt voice chat tới đầu tháng sau;
//                                   'stun' = vẫn cho dùng nhưng bỏ TURN (miễn phí, một số mạng sẽ không kết nối được)

const env = process.env;
const bool = (v, def) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(String(v)));
const num = (v, def) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : def);

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const CRED_TTL_S = 4 * 3600; // credential TURN sống tối đa 4 giờ (một buổi chơi)
const QUOTA_CHECK_MS = 10 * 60_000;

export class Voice {
  constructor({ onStatusChange = () => {}, fetchImpl = globalThis.fetch, log = console } = {}) {
    this.enabled = bool(env.VOICE_ENABLED, true);
    this.maxPerRoom = Math.max(2, Math.min(12, num(env.VOICE_MAX_PER_ROOM, 6)));
    this.turn = env.CF_TURN_KEY_ID && env.CF_TURN_KEY_API_TOKEN ? { keyId: env.CF_TURN_KEY_ID, token: env.CF_TURN_KEY_API_TOKEN } : null;
    this.analytics = this.turn && env.CF_ACCOUNT_ID && env.CF_ANALYTICS_TOKEN ? { account: env.CF_ACCOUNT_ID, token: env.CF_ANALYTICS_TOKEN } : null;
    this.quotaBytes = num(env.VOICE_TURN_QUOTA_GB, 900) * 1e9;
    this.quotaAction = env.VOICE_QUOTA_ACTION === 'stun' ? 'stun' : 'disable';
    this.usedBytes = null; // dung lượng TURN tháng này (null = chưa biết)
    this.overQuota = false;
    this.issued = []; // { username, exp } — để thu hồi khi chạm ngưỡng
    this.onStatusChange = onStatusChange;
    this.fetch = fetchImpl;
    this.log = log;
    this.timer = null;
  }

  /** Trạng thái gửi cho client. */
  status() {
    const off = !this.enabled || (this.overQuota && this.quotaAction === 'disable');
    return {
      enabled: !off,
      reason: !this.enabled ? 'Voice chat đang tắt trên server'
        : off ? 'Voice chat tạm tắt vì đã dùng hết hạn mức miễn phí tháng này' : null,
      maxPerRoom: this.maxPerRoom,
      relay: !!this.turn && !this.overQuota,
    };
  }

  /** Header Permissions-Policy cho micro: chỉ cho trang của mình dùng khi voice bật. */
  get micPolicy() { return this.enabled ? 'microphone=(self)' : 'microphone=()'; }

  start() {
    if (!this.enabled) return;
    this.log.log?.(`Voice chat: BẬT${this.turn ? ' (TURN Cloudflare' + (this.analytics ? `, ngưỡng ${this.quotaBytes / 1e9} GB/tháng → ${this.quotaAction})` : ', KHÔNG theo dõi dung lượng — đặt CF_ACCOUNT_ID + CF_ANALYTICS_TOKEN)') : ' (chỉ STUN)'}`);
    if (!this.analytics) return;
    const tick = () => this.checkQuota().catch((e) => this.log.warn?.('voice quota:', e.message));
    tick();
    this.timer = setInterval(tick, QUOTA_CHECK_MS);
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer); }

  /** Danh sách ICE server cho một người vào kênh thoại. */
  async iceServers() {
    if (!this.status().enabled) throw new Error(this.status().reason);
    if (!this.turn || this.overQuota) return STUN;
    try {
      const res = await this.fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.turn.keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.turn.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: CRED_TTL_S }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = (Array.isArray(data.iceServers) ? data.iceServers : [data.iceServers]).filter(Boolean).map((s) => ({
        ...s,
        // Cổng 53 bị trình duyệt chặn → bỏ để không phải chờ hết thời gian
        urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => typeof u === 'string' && !/:53(\?|$)/.test(u)),
      })).filter((s) => s.urls.length);
      const now = Date.now();
      this.issued = this.issued.filter((x) => x.exp > now);
      for (const s of list) if (s.username) this.issued.push({ username: s.username, exp: now + CRED_TTL_S * 1000 });
      return list.length ? list : STUN;
    } catch (e) {
      this.log.warn?.('TURN credentials:', e.message);
      return STUN; // lỗi phía Cloudflare → vẫn chạy được bằng STUN
    }
  }

  /** Đọc dung lượng TURN (egress) từ đầu tháng (UTC) qua GraphQL Analytics; chạm ngưỡng thì tắt/bỏ TURN. */
  async checkQuota(now = new Date()) {
    if (!this.analytics) return;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
    const end = now.toISOString().slice(0, 10);
    const query = `query($account: String!, $start: Date!, $end: Date!, $key: String!) {
      viewer { accounts(filter: { accountTag: $account }) {
        callsTurnUsageAdaptiveGroups(limit: 1, filter: { date_geq: $start, date_leq: $end, keyId: $key }) { sum { egressBytes } }
      } } }`;
    const res = await this.fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.analytics.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { account: this.analytics.account, start, end, key: this.turn.keyId } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.errors?.length) throw new Error(data.errors[0].message);
    const groups = data.data?.viewer?.accounts?.[0]?.callsTurnUsageAdaptiveGroups || [];
    this.setUsage(groups.reduce((a, g) => a + (Number(g.sum?.egressBytes) || 0), 0));
  }

  /** Cập nhật dung lượng đã dùng; đổi trạng thái khi vượt / về lại dưới ngưỡng (tháng mới). */
  setUsage(bytes) {
    this.usedBytes = bytes;
    const over = bytes >= this.quotaBytes;
    if (over === this.overQuota) return;
    this.overQuota = over;
    if (over) {
      this.log.warn?.(`Voice chat: TURN đã dùng ${(bytes / 1e9).toFixed(1)} GB ≥ ngưỡng → ${this.quotaAction === 'disable' ? 'TẮT voice chat' : 'chỉ dùng STUN'}`);
      this.revokeAll();
    } else {
      this.log.log?.('Voice chat: dung lượng TURN về dưới ngưỡng (tháng mới) → bật lại');
    }
    this.onStatusChange(this.status());
  }

  /** Thu hồi mọi credential TURN đã cấp để dừng phát sinh dung lượng ngay. */
  revokeAll() {
    if (!this.turn) return;
    const list = this.issued.splice(0);
    for (const { username } of list) {
      this.fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.turn.keyId)}/credentials/${encodeURIComponent(username)}/revoke`, {
        method: 'POST', headers: { Authorization: `Bearer ${this.turn.token}` }, signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    }
  }
}

/** Kiểm tra gói tín hiệu WebRTC trước khi chuyển tiếp (chỉ SDP hoặc ICE candidate, kích thước giới hạn). */
export function cleanSignal(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.description) {
    const d = data.description;
    if (!d || !['offer', 'answer', 'rollback'].includes(d.type)) return null;
    const sdp = typeof d.sdp === 'string' ? d.sdp : '';
    if (sdp.length > 12_000) return null;
    return { description: { type: d.type, sdp } };
  }
  if ('candidate' in data) {
    const c = data.candidate;
    if (c === null) return { candidate: null };
    if (!c || typeof c.candidate !== 'string' || c.candidate.length > 1000) return null;
    return { candidate: { candidate: c.candidate, sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid.slice(0, 32) : null, sdpMLineIndex: Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null } };
  }
  return null;
}

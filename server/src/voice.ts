// Voice chat trong phòng: âm thanh đi thẳng giữa các trình duyệt (WebRTC, mã hóa đầu-cuối),
// server chỉ chuyển "tín hiệu" kết nối (SDP/ICE) và cấp thông tin máy chủ STUN/TURN.
//
// Biến môi trường:
//   VOICE_ENABLED=0                 tắt hẳn voice chat (mặc định: bật)
//   VOICE_SERVERS=B4                chỉ bật voice chat cho các server (sảnh) có tên trong danh sách, cách nhau dấu phẩy
//                                   (tên như trong APP_SERVERS). '*' = mọi server. Mặc định: B4.
//                                   Chạy một server không đặt tên (APP_PASSWORD / không mật khẩu) thì không bị giới hạn này.
//   VOICE_MAX_PER_ROOM=6            số người tối đa trong kênh thoại mỗi phòng (mesh: mỗi người gửi N-1 luồng)
//   VOICE_TURN_ENABLED=0            tắt TURN Cloudflare dù đã đặt key (mặc định: BẬT nếu có key) — chỉ dùng STUN miễn phí
//   CF_TURN_KEY_ID, CF_TURN_KEY_API_TOKEN
//                                   TURN của Cloudflare (giúp kết nối qua 4G / mạng chặn P2P). Không đặt = chỉ STUN.
//   CF_ACCOUNT_ID, CF_ANALYTICS_TOKEN
//                                   (tùy chọn) để server tự đọc dung lượng TURN đã dùng trong tháng (quyền "Account Analytics: Read")
//   VOICE_TURN_QUOTA_GB=900         ngưỡng GB/tháng (gói miễn phí 1.000 GB; để dư vì số liệu analytics là lấy mẫu, có độ trễ)
//   VOICE_QUOTA_ACTION=disable      khi chạm ngưỡng: 'disable' = tắt voice chat tới đầu tháng sau;
//                                   'stun' = vẫn cho dùng nhưng bỏ TURN (miễn phí, một số mạng sẽ không kết nối được)

import type { IceServer, VoiceSignal, VoiceStatus } from '@game/shared/contracts';

const env = process.env;
const bool = (v: string | undefined, def: boolean) => (v === undefined || v === '' ? def : /^(1|true|yes|on)$/i.test(String(v)));
const num = (v: string | undefined, def: number) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : def);
const isRecord = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object';

/** Phần của fetch mà Voice dùng (tests truyền bản giả). */
export type VoiceFetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;
export interface VoiceLog { log?: (...args: unknown[]) => void; warn?: (...args: unknown[]) => void }
export interface VoiceDeps { onStatusChange?: (status: VoiceStatus) => void; fetchImpl?: VoiceFetch; log?: VoiceLog }

/** ICE server từ Cloudflare: chỉ giữ trường trình duyệt cần, bỏ URL cổng 53 (trình duyệt chặn). */
function iceServerOf(s: unknown): IceServer | null {
  if (!isRecord(s)) return null;
  const urls = (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u): u is string => typeof u === 'string' && !/:53(\?|$)/.test(u));
  if (!urls.length) return null;
  return {
    urls,
    ...(typeof s.username === 'string' ? { username: s.username } : {}),
    ...(typeof s.credential === 'string' ? { credential: s.credential } : {}),
  };
}

/** Tổng egress TURN trong kết quả GraphQL Analytics; báo lỗi nếu API trả lỗi. */
function egressBytes(data: unknown) {
  const body = isRecord(data) ? data : {};
  if (Array.isArray(body.errors) && body.errors.length) {
    const first: unknown = body.errors[0];
    throw new Error(String(isRecord(first) ? first.message : first));
  }
  const viewer = isRecord(body.data) && isRecord(body.data.viewer) ? body.data.viewer : {};
  const account: unknown = Array.isArray(viewer.accounts) ? viewer.accounts[0] : undefined;
  const groups: unknown[] = isRecord(account) && Array.isArray(account.callsTurnUsageAdaptiveGroups) ? account.callsTurnUsageAdaptiveGroups : [];
  return groups.reduce<number>((a, g) => a + (Number(isRecord(g) && isRecord(g.sum) ? g.sum.egressBytes : undefined) || 0), 0);
}

const STUN = [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }];
const CRED_TTL_S = 4 * 3600; // credential TURN sống tối đa 4 giờ (một buổi chơi)
const QUOTA_CHECK_MS = 10 * 60_000;

export class Voice {
  declare enabled: boolean;
  declare servers: Set<string> | null;
  declare maxPerRoom: number;
  declare turn: { keyId: string; token: string } | null;
  declare analytics: { account: string; token: string } | null;
  declare quotaBytes: number;
  declare quotaAction: 'stun' | 'disable';
  declare usedBytes: number | null;
  declare overQuota: boolean;
  declare issued: { username: string; exp: number }[];
  declare onStatusChange: (status: VoiceStatus) => void;
  declare fetch: VoiceFetch;
  declare log: VoiceLog;
  declare timer: ReturnType<typeof setInterval> | null;

  constructor({ onStatusChange = () => {}, fetchImpl = globalThis.fetch, log = console }: VoiceDeps = {}) {
    this.enabled = bool(env.VOICE_ENABLED, true);
    const list = (env.VOICE_SERVERS ?? 'B4').split(',').map((x) => x.trim()).filter(Boolean);
    this.servers = list.includes('*') ? null : new Set(list.map((x) => x.toLowerCase())); // null = mọi server
    this.maxPerRoom = Math.max(2, Math.min(12, num(env.VOICE_MAX_PER_ROOM, 6)));
    this.turn = bool(env.VOICE_TURN_ENABLED, true) && env.CF_TURN_KEY_ID && env.CF_TURN_KEY_API_TOKEN ? { keyId: env.CF_TURN_KEY_ID, token: env.CF_TURN_KEY_API_TOKEN } : null;
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

  /** Server (sảnh) này có được dùng voice chat không. name = null: chạy một server không đặt tên. */
  allowed(name: string | null | undefined) { return !this.servers || !name || this.servers.has(String(name).trim().toLowerCase()); }

  /** Trạng thái gửi cho client (theo server/sảnh người đó đang vào). */
  status(serverName: string | null = null): VoiceStatus {
    if (!this.allowed(serverName)) return { enabled: false, reason: null, hidden: true, maxPerRoom: this.maxPerRoom, relay: false };
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
    this.log.log?.(`Voice chat: BẬT cho ${this.servers ? 'server ' + [...this.servers].join(', ') : 'mọi server'}${this.turn ? ' (TURN Cloudflare' + (this.analytics ? `, ngưỡng ${this.quotaBytes / 1e9} GB/tháng → ${this.quotaAction})` : ', KHÔNG theo dõi dung lượng — đặt CF_ACCOUNT_ID + CF_ANALYTICS_TOKEN)') : ' (chỉ STUN)'}`);
    if (!this.analytics) return;
    const tick = () => this.checkQuota().catch((e: unknown) => this.log.warn?.('voice quota:', e instanceof Error ? e.message : e));
    tick();
    this.timer = setInterval(tick, QUOTA_CHECK_MS);
    this.timer.unref?.();
  }

  stop() { clearInterval(this.timer ?? undefined); }

  /** Danh sách ICE server cho một người vào kênh thoại. */
  async iceServers(serverName: string | null = null): Promise<IceServer[]> {
    const st = this.status(serverName);
    if (!st.enabled) throw new Error(st.reason || 'Voice chat không bật cho server này');
    if (!this.turn || this.overQuota) return STUN;
    try {
      const res = await this.fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(this.turn.keyId)}/credentials/generate-ice-servers`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.turn.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ttl: CRED_TTL_S }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: unknown = await res.json();
      const raw = isRecord(data) ? data.iceServers : undefined;
      const list = (Array.isArray(raw) ? raw : [raw]).map(iceServerOf).filter((s) => s !== null);
      const now = Date.now();
      this.issued = this.issued.filter((x) => x.exp > now);
      for (const s of list) if (s.username) this.issued.push({ username: s.username, exp: now + CRED_TTL_S * 1000 });
      return list.length ? list : STUN;
    } catch (e) {
      this.log.warn?.('TURN credentials:', e instanceof Error ? e.message : e);
      return STUN; // lỗi phía Cloudflare → vẫn chạy được bằng STUN
    }
  }

  /** Đọc dung lượng TURN (egress) từ đầu tháng (UTC) qua GraphQL Analytics; chạm ngưỡng thì tắt/bỏ TURN. */
  async checkQuota(now = new Date()) {
    if (!this.analytics || !this.turn) return;
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
    this.setUsage(egressBytes(await res.json()));
  }

  /** Cập nhật dung lượng đã dùng; đổi trạng thái khi vượt / về lại dưới ngưỡng (tháng mới). */
  setUsage(bytes: number) {
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
const DESCRIPTION_TYPES = ['offer', 'answer', 'rollback'] as const;
const isDescriptionType = (t: unknown): t is typeof DESCRIPTION_TYPES[number] => DESCRIPTION_TYPES.some((x) => x === t);

export function cleanSignal(data: unknown): VoiceSignal | null {
  if (!isRecord(data)) return null;
  if (data.description) {
    const d = data.description;
    if (!isRecord(d) || !isDescriptionType(d.type)) return null;
    const sdp = typeof d.sdp === 'string' ? d.sdp : '';
    if (sdp.length > 12_000) return null;
    return { description: { type: d.type, sdp } };
  }
  if ('candidate' in data) {
    const c = data.candidate;
    if (c === null) return { candidate: null };
    if (!isRecord(c) || typeof c.candidate !== 'string' || c.candidate.length > 1000) return null;
    return { candidate: { candidate: c.candidate, sdpMid: typeof c.sdpMid === 'string' ? c.sdpMid.slice(0, 32) : null, sdpMLineIndex: typeof c.sdpMLineIndex === 'number' && Number.isInteger(c.sdpMLineIndex) ? c.sdpMLineIndex : null } };
  }
  return null;
}

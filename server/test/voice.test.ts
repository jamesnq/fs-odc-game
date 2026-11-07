import test from 'node:test';
import assert from 'node:assert/strict';

import type { IceServer, VoiceStatus } from '@game/shared/contracts';
import type { VoiceFetch } from '../src/voice.js';

/** Cloudflare giả: chỉ trả các trường test cần; thiếu `ok` coi như lỗi HTTP như fetch thật. */
type FakeFetch = (url: string, init?: RequestInit) => Promise<{ ok?: boolean; status?: number; json?: () => Promise<unknown> }>;

const quiet = { log() {}, warn() {} };
const urlsOf = (s: IceServer) => [s.urls].flat();
async function makeVoice(envVars: Record<string, string>, fake: FakeFetch) {
  const saved = { ...process.env };
  Object.assign(process.env, envVars);
  // Query string bắt module đọc lại biến môi trường; TypeScript không phân giải được nên ghi rõ kiểu.
  const { Voice } = (await import(`../src/voice.js?${Math.random()}`)) as typeof import('../src/voice.js');
  const events: VoiceStatus[] = [];
  const fetchImpl: VoiceFetch = async (url, init) => {
    const res = await fake(url, init);
    return { ok: res.ok ?? false, status: res.status ?? 0, json: res.json ?? (async () => ({})) };
  };
  const v = new Voice({ onStatusChange: (s) => events.push(s), fetchImpl, log: quiet });
  process.env = saved;
  return { v, events };
}
const TURN: Record<string, string> = { CF_TURN_KEY_ID: 'k1', CF_TURN_KEY_API_TOKEN: 't1', CF_ACCOUNT_ID: 'a1', CF_ANALYTICS_TOKEN: 'an1', VOICE_TURN_QUOTA_GB: '900' };

test('không cấu hình TURN → chỉ STUN, vẫn bật', async () => {
  const { v } = await makeVoice({}, async () => { throw new Error('không được gọi'); });
  assert.equal(v.status().enabled, true);
  const ice = await v.iceServers();
  assert.ok(urlsOf(ice[0]).some((u) => u.startsWith('stun:')));
});

test('VOICE_ENABLED=0 → tắt, không cấp ICE, header chặn micro', async () => {
  const { v } = await makeVoice({ VOICE_ENABLED: '0' }, async () => ({}));
  assert.equal(v.status().enabled, false);
  assert.equal(v.micPolicy, 'microphone=()');
  await assert.rejects(() => v.iceServers());
});

test('cấp credential TURN, bỏ cổng 53', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:53?transport=udp', 'turn:turn.cloudflare.com:3478?transport=udp'], username: 'u1', credential: 'c1' }] }) });
  const { v } = await makeVoice(TURN, fetchImpl);
  const ice = await v.iceServers();
  assert.deepEqual(ice[0].urls, ['stun:stun.cloudflare.com:3478', 'turn:turn.cloudflare.com:3478?transport=udp']);
  assert.equal(v.issued.length, 1);
});

test('chạm ngưỡng dung lượng → tắt voice chat, thu hồi credential; tháng mới → bật lại', async () => {
  const calls: string[] = [];
  let used = 100e9;
  const fetchImpl: FakeFetch = async (url) => {
    calls.push(url);
    if (url.includes('graphql')) return { ok: true, json: async () => ({ data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: used } }] }] } } }) };
    if (url.includes('generate-ice-servers')) return { ok: true, json: async () => ({ iceServers: { urls: ['turn:turn.cloudflare.com:3478'], username: 'u9', credential: 'c' } }) };
    return { ok: true, json: async () => ({}) };
  };
  const { v, events } = await makeVoice(TURN, fetchImpl);
  await v.checkQuota();
  assert.equal(v.status().enabled, true);
  await v.iceServers();
  used = 950e9;
  await v.checkQuota();
  assert.equal(v.status().enabled, false);
  assert.match(v.status().reason ?? '', /hết hạn mức/);
  assert.equal(events.at(-1)?.enabled, false);
  assert.ok(calls.some((u) => u.includes('/credentials/u9/revoke')));
  await assert.rejects(() => v.iceServers());
  used = 1e9; // sang tháng mới, analytics đếm lại từ đầu
  await v.checkQuota();
  assert.equal(v.status().enabled, true);
});

test('VOICE_QUOTA_ACTION=stun → vẫn bật nhưng bỏ TURN khi chạm ngưỡng', async () => {
  const fetchImpl: FakeFetch = async (url) => (url.includes('graphql')
    ? { ok: true, json: async () => ({ data: { viewer: { accounts: [{ callsTurnUsageAdaptiveGroups: [{ sum: { egressBytes: 999e9 } }] }] } } }) }
    : { ok: true, json: async () => ({ iceServers: [{ urls: ['turn:x:3478'], username: 'u', credential: 'c' }] }) });
  const { v } = await makeVoice({ ...TURN, VOICE_QUOTA_ACTION: 'stun' }, fetchImpl);
  await v.checkQuota();
  assert.equal(v.status().enabled, true);
  assert.equal(v.status().relay, false);
  const ice = await v.iceServers();
  assert.ok(urlsOf(ice[0]).every((u) => u.startsWith('stun:')));
});

test('VOICE_SERVERS: mặc định chỉ server B4; "*" = mọi server; server không tên luôn được', async () => {
  const { v } = await makeVoice({}, async () => ({}));
  assert.equal(v.status('B4').enabled, true);
  assert.equal(v.status('b4 ').enabled, true, 'không phân biệt hoa thường / khoảng trắng');
  assert.equal(v.status('Bên A').enabled, false);
  assert.equal(v.status('Bên A').hidden, true);
  assert.equal(v.status(null).enabled, true, 'một server không đặt tên');
  await assert.rejects(() => v.iceServers('Bên A'));
  const { v: all } = await makeVoice({ VOICE_SERVERS: '*' }, async () => ({}));
  assert.equal(all.status('Bên A').enabled, true);
  const { v: two } = await makeVoice({ VOICE_SERVERS: 'B4, Bên A' }, async () => ({}));
  assert.equal(two.status('Bên A').enabled, true);
  assert.equal(two.status('Bên B').enabled, false);
});

test('VOICE_TURN_ENABLED=0 → tắt TURN dù có key, chỉ STUN, không gọi Cloudflare', async () => {
  const { v } = await makeVoice({ ...TURN, VOICE_TURN_ENABLED: '0' }, async () => { throw new Error('không được gọi Cloudflare'); });
  assert.equal(v.turn, null);
  assert.equal(v.analytics, null);
  const ice = await v.iceServers('B4');
  assert.ok(ice.every((s) => urlsOf(s).every((u) => u.startsWith('stun:'))));
});

test('có key TURN, không đặt VOICE_TURN_ENABLED → TURN bật mặc định', async () => {
  const { VOICE_TURN_ENABLED, ...keysOnly } = TURN;
  void VOICE_TURN_ENABLED;
  const { v } = await makeVoice(keysOnly, async () => { throw new Error('không gọi trong test này'); });
  assert.ok(v.turn);
  assert.ok(v.analytics);
});

test('TURN HTTP 401 falls back to STUN even though status.relay reports configured TURN', async () => {
  const { v } = await makeVoice(TURN, async () => ({ ok: false, status: 401 }));
  const ice = await v.iceServers();
  assert.equal(v.status().relay, true);
  assert.ok(ice.every((s) => urlsOf(s).every((u) => u.startsWith('stun:'))));
});

test('TURN network error or empty result falls back to STUN', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('timeout'); },
    async () => ({ ok: true, json: async () => ({ iceServers: [] }) }),
  ]) {
    const { v } = await makeVoice(TURN, fetchImpl);
    assert.ok((await v.iceServers()).every((s) => urlsOf(s).every((u) => u.startsWith('stun:'))));
  }
});

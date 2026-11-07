import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import { voiceNegotiation } from '../../client/src/voiceNegotiation.js';
import type { useVoice } from '../../client/src/voice.js';
import type { VoiceSignal } from '@game/shared/contracts';

/** Phần RTCPeerConnection mà voiceNegotiation dùng. */
interface FakePc {
  signalingState: string;
  remoteDescription: RTCSessionDescriptionInit | null;
  localDescription?: RTCSessionDescriptionInit;
  setRemoteDescription(d: RTCSessionDescriptionInit): Promise<void>;
  setLocalDescription(): Promise<void>;
  addIceCandidate(c: RTCIceCandidateInit): Promise<void>;
}
const asPc = (pc: FakePc) => pc as unknown as RTCPeerConnection;
type Handler = (payload?: unknown) => unknown;
/** Hàm mà hook phải đã đăng ký; thiếu thì test hỏng ngay thay vì bỏ qua. */
function must<T>(value: T | undefined, what: string): T {
  assert.ok(value, `chưa đăng ký ${what}`);
  return value;
}

const deferred = <T = void>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
};

test('ICE arriving before SDP is retained; async SDP finishes before ICE is applied', async () => {
  const gate = deferred();
  const added: RTCIceCandidateInit[] = [];
  const pc: FakePc = {
    signalingState: 'stable', remoteDescription: null,
    async setRemoteDescription(d) { await gate.promise; this.remoteDescription = d; },
    async setLocalDescription() { this.localDescription = { type: 'answer', sdp: 'answer' }; },
    async addIceCandidate(c) { assert.ok(this.remoteDescription); added.push(c); },
  };
  const sent: VoiceSignal[] = [];
  const n = voiceNegotiation(asPc(pc), true, (data) => sent.push(data));
  await n.receive({ candidate: { candidate: 'early' } });
  const offer = n.receive({ description: { type: 'offer', sdp: 'offer' } });
  const ice = n.receive({ candidate: { candidate: 'late' } });
  await Promise.resolve();
  assert.equal(added.length, 0);
  gate.resolve();
  await Promise.all([offer, ice]);
  assert.deepEqual(added.map((c) => c.candidate), ['early', 'late']);
  assert.equal(sent[0].description?.type, 'answer');
});

test('simultaneous offers: impolite peer ignores colliding SDP and ICE then accepts answer', async () => {
  const sent: VoiceSignal[] = [];
  const applied: (string | null | undefined)[] = [];
  const pc: FakePc = {
    signalingState: 'stable', remoteDescription: null,
    async setLocalDescription() { this.signalingState = 'have-local-offer'; this.localDescription = { type: 'offer', sdp: 'mine' }; },
    async setRemoteDescription(d) { applied.push(d.type); this.remoteDescription = d; this.signalingState = 'stable'; },
    async addIceCandidate(c) { applied.push(c.candidate); },
  };
  const n = voiceNegotiation(asPc(pc), false, (d) => sent.push(d));
  await n.negotiate();
  await n.receive({ description: { type: 'offer', sdp: 'collision' } });
  await n.receive({ candidate: { candidate: 'ignored' } });
  assert.deepEqual(applied, []);
  await n.receive({ description: { type: 'answer', sdp: 'accepted' } });
  await n.receive({ candidate: { candidate: 'accepted' } });
  assert.deepEqual(applied, ['answer', 'accepted']);
});

// Hook harness: exercise join timing without a browser or real microphone.
function harness({ micDenied = false, me = 'me' } = {}) {
  const handlers = new Map<string, Handler>();
  const cleanup: (() => void)[] = [];
  const ack = deferred<{ peers: string[]; iceServers: RTCIceServer[] }>();
  const peers: Peer[] = [];
  const signals: unknown[] = [];
  const media = { getAudioTracks: () => [track], getTracks: () => [track] };
  const track = { enabled: true, stop() {}, readyState: 'live' };
  class Peer {
  signalingState: string;
  remoteDescription: unknown;
  added: unknown[];
  received: unknown[];
  localDescription: RTCSessionDescriptionInit | undefined;
  /** Gắn bởi useVoice. */
  onnegotiationneeded?: () => Promise<void>;

    constructor() { this.signalingState = 'stable'; this.remoteDescription = null; this.added = []; this.received = []; peers.push(this); }
    addTrack(t: unknown) { this.added.push(t); }
    addTransceiver() {}
    getSenders() { return []; }
    async setRemoteDescription(d: unknown) { this.received.push(d); this.remoteDescription = d; }
    async setLocalDescription() { this.localDescription = { type: 'answer', sdp: 'answer' }; }
    close() { this.signalingState = 'closed'; }
  }
  const context: Record<string, unknown> = {
    useCallback: <F>(f: F) => f, useRef: <V>(v: V) => ({ current: v }), useState: (v: unknown) => [typeof v === 'function' ? v() : v, () => {}],
    useEffect: (f: () => (() => void) | void) => { const c = f(); if (c) cleanup.push(c); },
    socket: { on: (key: string, f: Handler) => handlers.set(key, f), off: (key: string) => handlers.delete(key) },
    request: (event: string, data: unknown) => {
      if (event === 'voice:join') return ack.promise;
      if (event === 'voice:signal') signals.push(data);
      return Promise.resolve({ ok: true });
    },
    navigator: { mediaDevices: { getUserMedia: async () => {
      if (micDenied) { micDenied = false; throw new Error('Permission denied'); }
      return media;
    } } },
    window: { RTCPeerConnection: Peer }, RTCPeerConnection: Peer,
    Audio: class { play() { return Promise.resolve(); } },
    localStorage: { getItem: () => null }, document: { removeEventListener() {} },
    voiceNegotiation, console, setTimeout, clearTimeout, clearInterval,
    setInterval: () => 1,
  };
  const source = fs.readFileSync(new URL('../../client/src/voice.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function useVoice', 'function useVoice');
  const code = transformSync(source, { loader: 'ts', target: 'es2022' }).code;
  vm.runInNewContext(`${code}\nthis.hook = useVoice;`, context);
  const hook = (context.hook as typeof useVoice)({ room: { voice: [] }, me, status: { enabled: true, maxPerRoom: 6 }, toast: () => {} });
  return { hook, ack, handlers, peers, signals, cleanup: () => cleanup.reverse().forEach((f) => f()) };
}

test('only the smaller ID initiates a new pair; either side can renegotiate later', async (t) => {
  const caller = harness({ me: 'a' });
  const callee = harness({ me: 'z' });
  t.after(caller.cleanup);
  t.after(callee.cleanup);
  caller.ack.resolve({ peers: ['z'], iceServers: [] });
  callee.ack.resolve({ peers: ['a'], iceServers: [] });
  await Promise.all([caller.hook.join(), callee.hook.join()]);
  await Promise.all([must(caller.peers[0].onnegotiationneeded, 'onnegotiationneeded')(), must(callee.peers[0].onnegotiationneeded, 'onnegotiationneeded')()]);
  assert.equal(caller.signals.length, 1);
  assert.equal(callee.signals.length, 0);
  callee.peers[0].remoteDescription = { type: 'offer' };
  await must(callee.peers[0].onnegotiationneeded, 'onnegotiationneeded')();
  assert.equal(callee.signals.length, 1);
});

test('microphone denied on entry can be enabled later for all four listeners', async (t) => {
  const h = harness({ micDenied: true });
  t.after(h.cleanup);
  h.ack.resolve({ peers: ['a', 'b', 'c', 'd'], iceServers: [] });
  await h.hook.join();
  for (const pc of h.peers) assert.equal(pc.added.length, 0);
  await h.hook.toggleMute();
  for (const pc of h.peers) assert.equal(pc.added.length, 1);
});

test('5-person room: offers arriving before join acknowledgement reach all 4 peers with mic attached', async (t) => {
  const h = harness();
  t.after(h.cleanup);
  const joining = h.hook.join();
  await Promise.resolve();
  for (const from of ['a', 'b', 'c', 'd']) {
    await must(h.handlers.get('voice:signal'), 'voice:signal')({ from, data: { description: { type: 'offer', sdp: from } } });
  }
  assert.equal(h.peers.length, 0);
  h.ack.resolve({ peers: ['a', 'b', 'c', 'd'], iceServers: [] });
  await joining;
  await new Promise((r) => setImmediate(r));
  assert.equal(h.peers.length, 4);
  for (const pc of h.peers) {
    assert.equal(pc.added.length, 1);
    assert.equal(pc.received.length, 1);
  }
});

test('disconnect while join is awaiting acknowledgement cannot resurrect voice connections', async (t) => {
  const h = harness();
  t.after(h.cleanup);
  const joining = h.hook.join();
  await Promise.resolve();
  must(h.handlers.get('disconnect'), 'disconnect')();
  h.ack.resolve({ peers: ['a', 'b', 'c', 'd'], iceServers: [] });
  await joining;
  assert.equal(h.peers.length, 0);
});

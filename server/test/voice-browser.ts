// Real Chromium/WebRTC regression check. Start an isolated backend and Vite client first.
// VITE_SERVER_URL=http://localhost:3011 npm exec -w client -- vite --port 5175
// PORT=3011 CORS_ORIGIN=http://localhost:5175 node server/dist/index.js
// npx tsx server/test/voice-browser.ts [http://localhost:5175] [chrome|msedge|chromium]
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

interface PeerSample { connection: RTCPeerConnectionState; signaling: RTCSignalingState; bytes: number; local?: string[]; remote?: string[]; senders: (MediaStreamTrackState | undefined)[] }
interface Snapshot { connected: boolean; disconnects: string[]; signals: number; signalErrors: string[]; peers: PeerSample[] }

const url = process.argv[2] || 'http://localhost:5175';
const channel = process.argv[3] || 'chrome';
const count = Number(process.argv[5] || 6);
const holdMs = Number(process.argv[6] || 0) * 1000;
assert.ok(Number.isInteger(count) && count >= 2 && count <= 12);
assert.ok(Number.isFinite(holdMs) && holdMs >= 0 && holdMs <= 60000);
const browser = await chromium.launch({
  channel: channel === 'chromium' ? undefined : channel,
  headless: true,
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});
const errors: string[] = [];
const pages: Page[] = [];
try {
  for (let i = 0; i < count; i++) {
    const context = await browser.newContext({ permissions: ['microphone'] });
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'warning' && m.text().startsWith('voice ')) console.log(`player ${i}: ${m.text()}`); });
    await page.addInitScript((name: string) => {
      localStorage.setItem('gl_name', name);
      window.voicePCs = [];
      const Native = window.RTCPeerConnection;
      window.RTCPeerConnection = class extends Native {
        constructor(config?: RTCConfiguration) { super(config); window.voicePCs.push(this); }
      };
    }, `Voice test ${i}`);
    await page.goto(url);
    await page.getByRole('heading', { name: 'Chọn trò chơi' }).waitFor();
    pages.push(page);
  }
  const roomId = await pages[0].evaluate(async (count: number): Promise<string> => {
    const { request } = await import(/* @vite-ignore */ String('/src/socket.js'));
    return (await request('room:create', { game: 'telephone', name: 'Voice regression', options: { maxSeats: count } })).roomId;
  }, count);
  assert.ok(roomId);
  await Promise.all(pages.slice(1).map((page) => page.evaluate(async (roomId: string) => {
    const { request } = await import(/* @vite-ignore */ String('/src/socket.js'));
    await request('room:join', { roomId });
  }, roomId)));
  await Promise.all(pages.map((page) => page.evaluate(async () => {
    const { socket } = await import(/* @vite-ignore */ String('/src/socket.js'));
    window.voiceDisconnects = [];
    window.voiceSignalErrors = [];
    window.voiceSignalCount = 0;
    const emit = socket.emit;
    socket.emit = function (this: unknown, event: string, ...args: unknown[]) {
      if (event === 'voice:signal') {
        window.voiceSignalCount++;
        const ack = args.at(-1);
        if (typeof ack === 'function') args[args.length - 1] = (...values: unknown[]) => {
          const failure = values.find((v): v is { ok: false; error: unknown } => !!v && typeof v === 'object' && 'ok' in v && v.ok === false);
          if (failure) window.voiceSignalErrors.push(String(failure.error));
          return ack(...values);
        };
      }
      return emit.call(this, event, ...args);
    };
    socket.on('disconnect', (reason: string) => window.voiceDisconnects.push(reason));
  })));
  const started = Date.now();
  const join = async (page: Page) => {
    await page.getByRole('button', { name: /^Vào kênh thoại/ }).first().click();
    await page.locator('.voice-mic').waitFor();
  };
  if (process.argv[4] === 'sequential') {
    for (const page of pages) await join(page);
  } else await Promise.all(pages.map(join));
  const sample = () => Promise.all(pages.map((page) => page.evaluate(async (): Promise<Snapshot> => {
      const { socket } = await import(/* @vite-ignore */ String('/src/socket.js'));
      const peers: PeerSample[] = [];
      for (const pc of window.voicePCs.filter((pc) => pc.signalingState !== 'closed')) {
        const stats = await pc.getStats();
        let bytes = 0;
        for (const stat of stats.values()) if (stat.type === 'inbound-rtp' && stat.kind === 'audio') bytes += stat.bytesReceived || 0;
        peers.push({ connection: pc.connectionState, signaling: pc.signalingState, bytes,
          local: pc.localDescription?.sdp.split('\r\n').filter((x) => /^(m=|a=(sendrecv|sendonly|recvonly|inactive))/.test(x)),
          remote: pc.remoteDescription?.sdp.split('\r\n').filter((x) => /^(m=|a=(sendrecv|sendonly|recvonly|inactive))/.test(x)),
          senders: pc.getSenders().map((s) => s.track?.readyState),
        });
      }
      return { connected: socket.connected, disconnects: window.voiceDisconnects, signals: window.voiceSignalCount, signalErrors: window.voiceSignalErrors, peers };
    })));
  const good = (snapshots: Snapshot[]) => snapshots.every((s) => s.connected && s.disconnects.length === 0 && s.peers.length === count - 1 && s.peers.every((p) => p.connection === 'connected' && p.bytes > 0));
  const end = Date.now() + 30000;
  let snapshots: Snapshot[];
  do {
    snapshots = await sample();
    if (snapshots.every((s) => s.connected && s.peers.length === count - 1 && s.peers.every((p) => p.connection === 'connected' && p.bytes > 0))) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (Date.now() < end);
  const ok = good(snapshots);
  const connectedMs = Date.now() - started;
  console.log(ok ? JSON.stringify(snapshots.map((s, player) => ({ player, connectedPeers: s.peers.length, receivedBytes: s.peers.map((p) => p.bytes) }))) : JSON.stringify(snapshots, null, 2));
  assert.deepEqual(errors, []);
  assert.ok(ok, `${count} clients must each receive audio from all ${count - 1} peers`);
  console.log(`PASS: all ${count} clients receive audio from all ${count - 1} peers after ${connectedMs}ms`);
  if (holdMs) {
    const initial = snapshots;
    const until = Date.now() + holdMs;
    while (Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(2000, until - Date.now())));
      snapshots = await sample();
      if (!good(snapshots)) console.log(JSON.stringify(snapshots.map((s, player) => ({ player, connected: s.connected, disconnects: s.disconnects, signals: s.signals, signalErrors: s.signalErrors, peers: s.peers.map((p) => ({ connection: p.connection, bytes: p.bytes })) })), null, 2));
      assert.ok(good(snapshots), 'all connections must remain active without disconnects');
    }
    for (let i = 0; i < count; i++) for (let j = 0; j < count - 1; j++) {
      assert.ok(snapshots[i].peers[j].bytes > initial[i].peers[j].bytes, 'audio must continue flowing');
    }
    await Promise.all(pages.map(async (page) => {
      const button = page.getByRole('button', { name: 'Người chơi', exact: true });
      await button.click();
      await page.locator('.voice-card').waitFor();
    }));
    assert.deepEqual(errors, []);
    console.log(`PASS: ${holdMs / 1000}s sustained audio; no disconnects; player panels respond on all ${count} clients`);
  }
} finally { await browser.close(); }

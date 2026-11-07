import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';
import type { AppContextValue } from '../../client/src/store.js';

type Handler = (payload?: unknown) => unknown;
type Provider = (props: { children: null }) => { props: { value: AppContextValue } };

function appHarness({ restoredRoom = null, joinFails = false }: {restoredRoom?: string | null; joinFails?: boolean} = {}) {
  const handlers = new Map<string, Handler>();
  const values: unknown[] = [];
  let cursor = 0;
  let mounted = false;
  const calls: string[] = [];
  const room = { id: 'old-room', state: {} };
  const location = { hash: '#/room/old-room' };
  const context: Record<string, unknown> = {
    createContext: () => ({ Provider: 'provider' }),
    useContext() {},
    useState(initial: unknown) {
      const i = cursor++;
      if (!mounted) values[i] = initial;
      return [values[i], (next: unknown) => { values[i] = typeof next === 'function' ? next(values[i]) : next; }];
    },
    useRef(initial: unknown) {
      const i = cursor++;
      if (!mounted) values[i] = { current: initial };
      return values[i];
    },
    useCallback: <F>(f: F) => f,
    useMemo: <T>(f: () => T) => f(),
    useEffect: (f: () => void) => { if (!mounted) f(); },
    h: (type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }),
    socket: { on: (event: string, f: Handler) => handlers.set(event, f), off() {}, connect() {} },
    request: async (event: string) => {
      calls.push(event);
      if (event === 'hello') return { server: { id: 'server' }, user: { id: 'new-user', name: 'An' }, roomId: restoredRoom, rooms: [] };
      if (event === 'room:join') {
        if (joinFails) throw new Error('Phòng không tồn tại');
        handlers.get('room:state')?.(room);
      }
      return {};
    },
    storage: { name: 'An', tokens: {}, setServerToken() {} }, AUTH_ERRORS: {},
    location, window: { addEventListener() {}, removeEventListener() {} },
    performance: { now: () => 1 }, setTimeout: () => 1,
  };
  let source = fs.readFileSync(new URL('../../client/src/store.tsx', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  source = transformSync(source, { loader: 'tsx', jsxFactory: 'h', target: 'es2022' }).code;
  vm.runInNewContext(`${source}\nthis.provider = AppProvider;`, context);
  const render = () => { cursor = 0; const node = (context.provider as Provider)({ children: null }); mounted = true; return node.props.value; };
  render();
  const onState = handlers.get('room:state');
  assert.ok(onState, 'AppProvider phải lắng nghe room:state');
  onState(room);
  const before = render();
  assert.equal(before.room?.id, 'old-room');
  return { render, before, location, calls, room };
}

test('server restart: missing room returns to lobby instead of leaving stale game mounted', async () => {
  const h = appHarness({ joinFails: true });
  await h.before.hello();
  assert.equal(h.render().room, null);
  assert.equal(h.location.hash, '');
  assert.equal(h.render().phase, 'ready');
});

test('reconnect to live room retains state and does not rejoin', async () => {
  const h = appHarness({ restoredRoom: 'old-room' });
  await h.before.hello();
  assert.equal(h.render().room?.id, 'old-room');
  assert.deepEqual(h.calls, ['hello']);
});

test('successful URL join keeps newly received room state', async () => {
  const h = appHarness();
  await h.before.hello();
  assert.equal(h.render().room?.id, 'old-room');
  assert.deepEqual(h.calls, ['hello', 'room:join']);
});

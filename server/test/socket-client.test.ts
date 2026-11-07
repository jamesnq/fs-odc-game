import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { transformSync } from 'esbuild';

function harness(response: unknown = { ok: true, user: { id: 'user', name: 'An' } }, error: Error | null = null) {
  const calls: { event: string; payload: unknown }[] = [];
  const socket = {
    connected: true,
    timeout(ms: number) { assert.equal(ms, 10_000); return this; },
    emit(event: string, payload: unknown, ack: (error: Error | null, response: unknown) => void) {
      assert.equal(this, socket, 'Socket.IO emit must retain its receiver');
      calls.push({ event, payload });
      ack(error, response);
    },
  };
  const source = readFileSync(new URL('../../client/src/socket.ts', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '').replaceAll('import.meta.env', '({})');
  const code = transformSync(source, { loader: 'ts', target: 'es2022' }).code;
  const context = { io: () => socket, localStorage: { removeItem() {} } };
  const request = vm.runInNewContext(`${code}\nrequest;`, context) as (event: string, payload?: unknown) => Promise<unknown>;
  return { request, socket, calls };
}

test('client request retains Socket.IO receiver and resolves successful acknowledgements', async () => {
  const h = harness();
  const response = await h.request('hello');
  assert.deepEqual(response, { ok: true, user: { id: 'user', name: 'An' } });
  assert.equal(h.calls[0].event, 'hello');
  assert.equal(Object.keys(h.calls[0].payload as object).length, 0);
  await h.request('hello', null);
  assert.equal(h.calls[1].payload, null, 'malformed payloads must reach server validation unchanged');
});

test('client request rejects server errors', async () => {
  const h = harness({ ok: false, error: 'Không tìm thấy phòng' });
  await assert.rejects(h.request('room:join', { roomId: 'missing' }), /Không tìm thấy phòng/);
});

test('client request rejects timeout and disconnected socket', async () => {
  const h = harness(undefined, new Error('timeout'));
  await assert.rejects(h.request('hello'), /Máy chủ không phản hồi/);
  h.socket.connected = false;
  await assert.rejects(h.request('hello'), /Mất kết nối tới máy chủ/);
  assert.equal(h.calls.length, 1);
});

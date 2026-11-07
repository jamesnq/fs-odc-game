import test from 'node:test';
import assert from 'node:assert/strict';
import { TelephoneHandler } from '../src/games/telephone.js';
import type { TestContext } from 'node:test';

/** Giá trị phải có trong test; báo lỗi rõ ràng nếu thiếu. */
function must<T>(value: T | null | undefined, what = 'giá trị'): T {
  assert.ok(value != null, `thiếu ${what}`);
  return value;
}
const taskOf = (g: TelephoneHandler, id: string) => must(g.view(id).task, `việc của ${id}`);

function setup(t: TestContext, mode: string | null = 'relay', n = 4) {
  const room = { ownerId: 'p0', system() {}, changed() {} };
  const g = new TelephoneHandler(room, { mode });
  t.after(() => g.dispose());
  for (let i = 0; i < n; i++) {
    g.sit({ id: `p${i}`, name: `Player ${i}` });
    if (i) g.action(`p${i}`, { type: 'ready' });
  }
  g.action('p0', { type: 'start' });
  return g;
}

test('relay: one drawer at a time, only previous drawing visible, final player guesses', (t) => {
  const g = setup(t);
  const order = g.players.map((p) => p.id);
  assert.equal(new Set(order).size, 4);
  const word = must(taskOf(g, order[0]).prev?.text, 'từ khóa');
  assert.ok(word);
  for (let k = 0; k < 3; k++) {
    const id = order[k];
    const task = taskOf(g, id);
    assert.equal(task.kind, 'draw');
    assert.equal(g.view('spectator').task, null);
    const other = order[(k + 1) % 4];
    assert.equal(g.view(other).task, null);
    assert.throws(() => g.action(other, { type: 'done', done: true }));
    g.stream(other, { turn: g.turnNo, ops: [{ k: 'l', id: 1, c: 1, w: 3, p: [1, 2] }] });
    assert.deepEqual(g.query(other, { type: 'canvas' }).ops, []);
    if (k) {
      const drawId = must(task.prev?.drawId, 'bức vẽ trước');
      assert.equal(task.prev?.kind, 'draw');
      assert.ok(g.query(id, { type: 'drawing', id: drawId }).ops.length);
      assert.throws(() => g.query(other, { type: 'drawing', id: drawId }));
      assert.equal(JSON.stringify(g.view(id)).includes(word), false);
    }
    g.stream(id, { turn: g.turnNo, ops: [{ k: 'l', id: 1, c: 1, w: 3, p: [k, 2] }] });
    g.action(id, { type: 'done', done: true });
  }
  assert.equal(taskOf(g, order[3]).kind, 'text');
  assert.throws(() => g.query(order[3], { type: 'drawing', id: '1.0.0' }));
  g.action(order[3], { type: 'text', text: 'con mèo', done: true });
  assert.equal(g.status, 'reveal');
  assert.deepEqual(g.chains[0].map((e) => e.kind), ['text', 'draw', 'draw', 'draw', 'text']);
  assert.equal(g.chains[0].at(-1)?.text, 'con mèo');
  while (g.status === 'reveal') g.action('p0', { type: 'next' });
  assert.equal(must(g.view('spectator').albums)[0].entries.length, 5);
  for (const id of order.filter((id) => id !== 'p0')) g.action(id, { type: 'ready' });
  g.action('p0', { type: 'start' });
  assert.equal(g.gameNo, 2);
  assert.equal(g.step, 0);
  assert.equal(g.chains[0].length, 1);
});

test('relay: leaving future player is skipped and timeout keeps draft', (t) => {
  const g = setup(t);
  const [first, second, third] = g.players.map((p) => p.id);
  g.stand(second);
  g.stream(first, { turn: g.turnNo, ops: [{ k: 'l', id: 1, c: 1, w: 3, p: [2, 3] }] });
  g._endStep();
  assert.equal(g.step, 2);
  assert.equal(taskOf(g, third).kind, 'draw');
  assert.equal(g.drawings.get('1.0.0')?.length, 1);
  g.stand(third);
  assert.equal(g.step, 3);
});

test('classic default preserves simultaneous alternating tasks', (t) => {
  const g = setup(t, null, 3);
  assert.equal(g.options.mode, 'classic');
  for (const p of g.players) {
    assert.equal(taskOf(g, p.id).kind, 'text');
    g.action(p.id, { type: 'text', text: 'con mèo', done: true });
  }
  assert.equal(g.step, 1);
  for (const p of g.players) assert.equal(taskOf(g, p.id).kind, 'draw');
});

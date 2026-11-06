import test from 'node:test';
import assert from 'node:assert/strict';
import { createBoard, findPath, findMove, applyGravity, remaining, OnetBoard, TILE_KINDS } from '../src/onet.js';

const G = (rows) => rows.map((s) => [...s].map((ch) => (ch === '.' ? 0 : Number(ch))));

test('tạo bàn: số ô đúng, mỗi loại xuất hiện số lần chẵn, cùng hạt giống thì cùng bàn', () => {
  const g = createBoard(9, 16, 42);
  assert.equal(g.length, 9);
  assert.equal(g[0].length, 16);
  assert.equal(remaining(g), 144);
  const count = new Map();
  for (const row of g) for (const v of row) count.set(v, (count.get(v) || 0) + 1);
  assert.equal(count.size, TILE_KINDS);
  for (const n of count.values()) assert.equal(n % 2, 0);
  assert.deepEqual(createBoard(9, 16, 42), g);
  assert.notDeepEqual(createBoard(9, 16, 43), g);
  assert.ok(findMove(g), 'luôn có nước đi');
  assert.throws(() => createBoard(3, 3, 1), /chẵn/);
});

test('nối thẳng, 1 lần rẽ, 2 lần rẽ và vòng ra ngoài viền', () => {
  // Kề nhau
  assert.deepEqual(findPath(G(['11']), [0, 0], [0, 1]), [[0, 0], [0, 1]]);
  // Thẳng qua ô trống
  assert.deepEqual(findPath(G(['1..1']), [0, 0], [0, 3]), [[0, 0], [0, 3]]);
  // Bị chặn trên hàng, phải vòng ra viền trên (2 lần rẽ)
  assert.deepEqual(findPath(G(['1221']), [0, 0], [0, 3]), [[0, 0], [-1, 0], [-1, 3], [0, 3]]);
  // Một lần rẽ (chữ L)
  const L = G(['1.', '21']);
  assert.ok(findPath(L, [0, 0], [1, 1]));
  assert.equal(findPath(L, [0, 0], [1, 1]).length, 3);
});

test('không nối được khi cần quá 2 lần rẽ, khác hình hoặc cùng ô', () => {
  const g = G([
    '33333',
    '31.23',
    '3222.',
    '3.213',
    '33333',
  ]);
  // (1,1) và (3,3): bị bao kín, cần ≥ 3 lần rẽ
  assert.equal(findPath(g, [1, 1], [3, 3]), null);
  assert.equal(findPath(G(['12']), [0, 0], [0, 1]), null);
  assert.equal(findPath(G(['11']), [0, 0], [0, 0]), null);
  assert.equal(findPath(G(['1.1']), [0, 1], [0, 2]), null, 'ô trống không nối');
});

test('trọng lực: hình rơi xuống dưới', () => {
  assert.deepEqual(applyGravity(G(['12', '.3', '4.'])), G(['..', '12', '43']));
});

test('OnetBoard: nối hết bàn bằng gợi ý, tự xáo khi bế tắc, tính điểm combo', () => {
  const b = new OnetBoard(createBoard(6, 8, 7), { rand: Math.random });
  let t = 0;
  while (!b.cleared) {
    const mv = b.hint();
    assert.ok(mv, 'luôn có gợi ý (bàn tự xáo khi bế tắc)');
    b.match(mv[0], mv[1], (t += 1000));
  }
  assert.equal(b.pairs, 24);
  assert.ok(b.score > 240, 'có điểm combo');
  assert.throws(() => new OnetBoard(G(['12'])).match([0, 0], [0, 1]), /không nối được/);
});

test('OnetBoard trọng lực: vẫn chơi hết được', () => {
  const b = new OnetBoard(createBoard(8, 12, 99), { gravity: true, rand: Math.random });
  for (let i = 0; i < 200 && !b.cleared; i++) {
    const mv = b.hint();
    b.match(mv[0], mv[1]);
  }
  assert.ok(b.cleared);
});

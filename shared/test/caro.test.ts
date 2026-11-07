import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, makeMove, undoMoves, findWin, coord } from '../src/caro.js';
import type { CaroState } from '../src/caro.js';

const play = (g: CaroState, cells: number[][]) => cells.reduce((s, [r, c]) => makeMove(s, r * s.size + c), g);

test('X đi trước, đổi lượt, không đánh vào ô đã có quân', () => {
  let g = createGame();
  assert.equal(g.size, 15);
  assert.equal(g.turn, 'x');
  g = makeMove(g, 0);
  assert.equal(g.turn, 'o');
  assert.throws(() => makeMove(g, 0), /đã có quân/);
  assert.throws(() => makeMove(g, 15 * 15), /không hợp lệ/);
});

test('5 quân hàng ngang thắng', () => {
  // X: (7,3..7), O: (8,3..6)
  const g = play(createGame(), [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [8, 6], [7, 7]]);
  assert.equal(g.result?.winner, 'x');
  assert.equal(g.result?.line?.length, 5);
  assert.throws(() => makeMove(g, 0), /kết thúc/);
});

test('5 quân chéo thắng', () => {
  const g = play(createGame(), [[2, 2], [0, 9], [3, 3], [1, 9], [4, 4], [2, 9], [5, 5], [3, 9], [6, 6]]);
  assert.equal(g.result?.winner, 'x');
});

test('bị chặn hai đầu thì không thắng (nếu bật luật)', () => {
  const cells = [[7, 2], [7, 1], [7, 3], [7, 7], [7, 4], [0, 0], [7, 5], [0, 1], [7, 6]];
  const blocked = play(createGame({ blockTwoEnds: true }), cells);
  assert.equal(blocked.result, undefined);
  const free = play(createGame({ blockTwoEnds: false }), cells);
  assert.equal(free.result?.winner, 'x');
});

test('chặn một đầu hoặc sát mép vẫn thắng', () => {
  const g = play(createGame(), [[0, 0], [1, 5], [0, 1], [1, 6], [0, 2], [1, 7], [0, 3], [1, 8], [0, 4]]);
  assert.equal(g.result?.winner, 'x');
  const board = Array(100).fill('.');
  for (let c = 0; c < 6; c++) board[c] = 'o';
  assert.equal(findWin(board, 10, 3)!.length, 6, 'dãy 6 vẫn thắng');
});

test('đi lại và hòa khi kín bàn', () => {
  let g = play(createGame(), [[0, 0], [1, 1]]);
  g = undoMoves(g, 2);
  assert.equal(g.history.length, 0);
  assert.equal(g.turn, 'x');
  assert.equal(g.board.filter((p) => p !== '.').length, 0);

  // Lấp kín bàn 10x10 theo mẫu (c + 2r) mod 4: mọi hướng chỉ có tối đa 2 quân liên tiếp
  let s = createGame({ size: 10, blockTwoEnds: false });
  const pat = (r: number, c: number) => ((c + 2 * r) % 4 < 2 ? 'x' : 'o');
  const xs: number[] = [], os: number[] = [];
  for (let r = 0; r < 10; r++) for (let c = 0; c < 10; c++) (pat(r, c) === 'x' ? xs : os).push(r * 10 + c);
  assert.equal(xs.length, os.length);
  for (let k = 0; k < xs.length; k++) { s = makeMove(s, xs[k]); s = makeMove(s, os[k]); }
  assert.deepEqual(s.result, { winner: null, reason: 'full' });
});

test('tọa độ', () => {
  assert.equal(coord(15, 0), 'A15');
  assert.equal(coord(15, 14 * 15 + 8), 'J1');
});

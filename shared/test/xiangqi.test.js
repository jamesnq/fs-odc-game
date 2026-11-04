import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, legalMovesFrom, makeMove, idx, undoMoves, isInCheck } from '../src/xiangqi.js';

const mv = (s, a, b) => makeMove(s, idx(...a), idx(...b));

test('nước đi khởi đầu có 44 nước', () => {
  const g = createGame();
  let n = 0;
  for (let i = 0; i < 90; i++) n += legalMovesFrom(g, i).length;
  assert.equal(n, 44);
});

test('pháo đầu và ký hiệu', () => {
  let g = createGame();
  g = mv(g, [7, 7], [7, 4]); // Pháo 2 bình 5
  assert.equal(g.history[0].san, 'P2-5');
  assert.equal(g.turn, 'b');
  g = mv(g, [0, 7], [2, 6]); // Mã 8 tiến 7 (đen)
  assert.equal(g.history[1].san, 'M8.7');
});

test('mã bị cản chân', () => {
  const g = createGame();
  assert.deepEqual(legalMovesFrom(g, idx(9, 1)).sort((a, b) => a - b), [idx(7, 0), idx(7, 2)]);
});

test('chiếu bí kết thúc ván', () => {
  const board = Array(90).fill('.');
  board[idx(0, 4)] = 'k';
  board[idx(9, 3)] = 'K';
  board[idx(1, 0)] = 'R';
  board[idx(2, 8)] = 'R';
  let g = { board, turn: 'r', history: [] };
  g = makeMove(g, idx(2, 8), idx(0, 8));
  assert.ok(isInCheck(g.board, 'b'));
  assert.equal(g.result?.winner, 'r');
});

test('không được lộ mặt tướng', () => {
  const board = Array(90).fill('.');
  board[idx(0, 4)] = 'k';
  board[idx(9, 4)] = 'K';
  board[idx(5, 4)] = 'R';
  board[idx(0, 0)] = 'r';
  const g = { board, turn: 'r', history: [] };
  const moves = legalMovesFrom(g, idx(5, 4));
  assert.ok(moves.length > 0);
  assert.ok(moves.every((t) => t % 9 === 4), 'xe chỉ được đi dọc cột giữa');
});

test('đi lại', () => {
  let g = createGame();
  g = mv(g, [7, 7], [7, 4]);
  g = mv(g, [0, 7], [2, 6]);
  const u = undoMoves(g, 2);
  assert.deepEqual(u.board, createGame().board);
  assert.equal(u.turn, 'r');
});

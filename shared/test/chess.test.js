import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  makeMove,
  legalMovesFrom,
  undoMoves,
  isInCheck,
  squareFromAlgebraic,
  squareName,
  isInsufficientMaterial,
} from '../src/chess.js';

test('khởi tạo bàn cờ vua chuẩn', () => {
  const g = createGame();
  assert.equal(g.board.length, 64);
  assert.equal(g.turn, 'w');
  assert.equal(g.board[squareFromAlgebraic('e1')], 'K');
  assert.equal(g.board[squareFromAlgebraic('e8')], 'k');
  assert.equal(g.board[squareFromAlgebraic('d1')], 'Q');
  assert.equal(g.board[squareFromAlgebraic('d8')], 'q');
  assert.equal(g.board[squareFromAlgebraic('e2')], 'P');
  assert.equal(g.board[squareFromAlgebraic('e7')], 'p');
});

test('tốt đi 1 ô và 2 ô từ vị trí xuất phát, đổi lượt', () => {
  let g = createGame();
  const e2 = squareFromAlgebraic('e2');
  const e4 = squareFromAlgebraic('e4');
  const e5 = squareFromAlgebraic('e5');
  const e7 = squareFromAlgebraic('e7');

  // e2 có thể đi e3 hoặc e4
  const moves = legalMovesFrom(g, e2);
  assert.ok(moves.includes(squareFromAlgebraic('e3')));
  assert.ok(moves.includes(e4));

  // Trắng đi e2-e4
  g = makeMove(g, e2, e4);
  assert.equal(g.turn, 'b');
  assert.equal(g.history[0].san, 'e4');
  assert.equal(g.enPassant, squareFromAlgebraic('e3'));

  // Đen đi e7-e5
  g = makeMove(g, e7, e5);
  assert.equal(g.turn, 'w');
  assert.equal(g.history[1].san, 'e5');
  assert.equal(g.enPassant, squareFromAlgebraic('e6'));
});

test('bắt tốt qua đường (En passant)', () => {
  let g = createGame();
  // 1. e4 a6 2. e5 d5 3. exd6 (en passant)
  g = makeMove(g, squareFromAlgebraic('e2'), squareFromAlgebraic('e4'));
  g = makeMove(g, squareFromAlgebraic('a7'), squareFromAlgebraic('a6'));
  g = makeMove(g, squareFromAlgebraic('e4'), squareFromAlgebraic('e5'));
  g = makeMove(g, squareFromAlgebraic('d7'), squareFromAlgebraic('d5'));

  const e5 = squareFromAlgebraic('e5');
  const d6 = squareFromAlgebraic('d6');
  const moves = legalMovesFrom(g, e5);
  assert.ok(moves.includes(d6), 'Tốt e5 phải có quyền bắt qua đường tại d6');

  g = makeMove(g, e5, d6);
  assert.equal(g.board[squareFromAlgebraic('d5')], '.', 'Tốt d5 của đen phải bị loại bỏ');
  assert.equal(g.board[d6], 'P');
  assert.equal(g.history[g.history.length - 1].san, 'exd6');
});

test('nhập thành gần (O-O) và xa (O-O-O)', () => {
  let g = createGame();
  // Dọn đường nhập thành gần cho Trắng: 1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O
  g = makeMove(g, squareFromAlgebraic('e2'), squareFromAlgebraic('e4'));
  g = makeMove(g, squareFromAlgebraic('e7'), squareFromAlgebraic('e5'));
  g = makeMove(g, squareFromAlgebraic('g1'), squareFromAlgebraic('f3'));
  g = makeMove(g, squareFromAlgebraic('b8'), squareFromAlgebraic('c6'));
  g = makeMove(g, squareFromAlgebraic('f1'), squareFromAlgebraic('c4'));
  g = makeMove(g, squareFromAlgebraic('f8'), squareFromAlgebraic('c5'));

  const e1 = squareFromAlgebraic('e1');
  const g1 = squareFromAlgebraic('g1');
  const moves = legalMovesFrom(g, e1);
  assert.ok(moves.includes(g1), 'Vua trắng phải có nước nhập thành g1');

  g = makeMove(g, e1, g1);
  assert.equal(g.history[g.history.length - 1].san, 'O-O');
  assert.equal(g.board[g1], 'K');
  assert.equal(g.board[squareFromAlgebraic('f1')], 'R');
  assert.equal(g.board[squareFromAlgebraic('h1')], '.');
});

test('nhập thành bị chặn khi ô trung gian bị tấn công hoặc đang bị chiếu', () => {
  const g = createGame();
  g.board[squareFromAlgebraic('f1')] = '.';
  g.board[squareFromAlgebraic('g1')] = '.';
  g.board[squareFromAlgebraic('f2')] = '.'; // Dọn tốt f2 để xe f8 nhìn thẳng xuống f1
  g.board[squareFromAlgebraic('f7')] = '.'; // Dọn đường để xe f8 nhìn thẳng xuống f1
  g.board[squareFromAlgebraic('f8')] = 'r';

  const e1 = squareFromAlgebraic('e1');
  const g1 = squareFromAlgebraic('g1');
  const moves = legalMovesFrom(g, e1);
  assert.ok(!moves.includes(g1), 'Không được nhập thành qua ô đang bị tấn công f1');
});

test('phong cấp tốt (Promotion)', () => {
  const g = createGame();
  // Đặt tốt trắng ở hàng 7 chuẩn bị phong cấp
  g.board[squareFromAlgebraic('a7')] = 'P';
  g.board[squareFromAlgebraic('a8')] = '.';
  g.turn = 'w';

  const a7 = squareFromAlgebraic('a7');
  const a8 = squareFromAlgebraic('a8');
  assert.ok(legalMovesFrom(g, a7).includes(a8));

  // Phong cấp Hậu
  const gPromo = makeMove(g, a7, a8, 'Q');
  assert.equal(gPromo.board[a8], 'Q');
  assert.ok(gPromo.history[0].san.includes('a8=Q'));
});

test('chiếu bí kết thúc ván (Scholar’s Mate)', () => {
  let g = createGame();
  // 1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#
  g = makeMove(g, squareFromAlgebraic('e2'), squareFromAlgebraic('e4'));
  g = makeMove(g, squareFromAlgebraic('e7'), squareFromAlgebraic('e5'));
  g = makeMove(g, squareFromAlgebraic('d1'), squareFromAlgebraic('h5'));
  g = makeMove(g, squareFromAlgebraic('b8'), squareFromAlgebraic('c6'));
  g = makeMove(g, squareFromAlgebraic('f1'), squareFromAlgebraic('c4'));
  g = makeMove(g, squareFromAlgebraic('g8'), squareFromAlgebraic('f6'));
  g = makeMove(g, squareFromAlgebraic('h5'), squareFromAlgebraic('f7'));

  assert.ok(g.result, 'Ván cờ phải kết thúc');
  assert.equal(g.result.winner, 'w');
  assert.equal(g.result.reason, 'checkmate');
  assert.equal(g.history[g.history.length - 1].san, 'Qxf7#');
});

test('hòa pat (Stalemate)', () => {
  const g = createGame();
  // Thế cờ hòa pat: Vua đen ở a8, Vua trắng ở c7, Hậu trắng ở b5 đi b6
  g.board.fill('.');
  g.board[squareFromAlgebraic('a8')] = 'k';
  g.board[squareFromAlgebraic('c7')] = 'K';
  g.board[squareFromAlgebraic('b5')] = 'Q';
  g.turn = 'w';

  const next = makeMove(g, squareFromAlgebraic('b5'), squareFromAlgebraic('b6'));
  assert.ok(next.result, 'Phải kết thúc ván cờ hòa');
  assert.equal(next.result.winner, null);
  assert.equal(next.result.reason, 'stalemate');
});

test('hòa do không đủ lực lượng', () => {
  const b = new Array(64).fill('.');
  b[squareFromAlgebraic('e1')] = 'K';
  b[squareFromAlgebraic('e8')] = 'k';
  assert.ok(isInsufficientMaterial(b), '2 vua là không đủ lực lượng');

  b[squareFromAlgebraic('c3')] = 'N';
  assert.ok(isInsufficientMaterial(b), 'Vua + Mã vs Vua không đủ lực lượng');

  b[squareFromAlgebraic('c3')] = 'B';
  assert.ok(isInsufficientMaterial(b), 'Vua + Tượng vs Vua không đủ lực lượng');

  b[squareFromAlgebraic('c4')] = 'P';
  assert.ok(!isInsufficientMaterial(b), 'Có tốt là vẫn đủ lực lượng');
});

test('hoàn tác nước đi (undo)', () => {
  let g = createGame();
  g = makeMove(g, squareFromAlgebraic('e2'), squareFromAlgebraic('e4'));
  g = makeMove(g, squareFromAlgebraic('e7'), squareFromAlgebraic('e5'));
  assert.equal(g.history.length, 2);

  const u = undoMoves(g, 1);
  assert.equal(u.history.length, 1);
  assert.equal(u.turn, 'b');
  assert.equal(u.board[squareFromAlgebraic('e5')], '.');
  assert.equal(u.board[squareFromAlgebraic('e7')], 'p');
});

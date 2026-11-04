// Engine Cờ caro (Gomoku kiểu Việt Nam):
//  - Bàn vuông size x size (mặc định 15), quân đánh vào ô. X đi trước.
//  - Ai có từ 5 quân liên tiếp trở lên (ngang, dọc, chéo) thì thắng.
//  - Luật "chặn hai đầu" (tùy chọn, bật mặc định): dãy bị quân đối thủ chặn cả hai đầu thì không tính thắng.
//    Mép bàn không tính là bị chặn.
//  - Bàn kín mà không ai thắng thì hòa.

export const MIN_SIZE = 10;
export const MAX_SIZE = 20;
export const WIN_LEN = 5;
export const other = (c) => (c === 'x' ? 'o' : 'x');

export function createGame({ size = 15, blockTwoEnds = true } = {}) {
  const n = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(Number(size)) || 15));
  return { size: n, blockTwoEnds: !!blockTwoEnds, board: Array(n * n).fill('.'), turn: 'x', history: [] };
}

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

/** Tìm dãy thắng đi qua ô `i` (quân vừa đặt). Trả về mảng chỉ số ô hoặc null. */
export function findWin(board, size, i, blockTwoEnds = true) {
  const p = board[i];
  if (p === '.') return null;
  const r0 = Math.floor(i / size), c0 = i % size;
  const at = (r, c) => (r < 0 || r >= size || c < 0 || c >= size ? null : board[r * size + c]);
  for (const [dr, dc] of DIRS) {
    const line = [i];
    let r = r0 + dr, c = c0 + dc;
    while (at(r, c) === p) { line.push(r * size + c); r += dr; c += dc; }
    const endA = at(r, c);
    r = r0 - dr; c = c0 - dc;
    while (at(r, c) === p) { line.unshift(r * size + c); r -= dr; c -= dc; }
    const endB = at(r, c);
    if (line.length < WIN_LEN) continue;
    const opp = other(p);
    if (blockTwoEnds && endA === opp && endB === opp) continue;
    return line;
  }
  return null;
}

/**
 * Đặt quân vào ô `i` cho bên đang tới lượt. Trả về state mới hoặc ném lỗi.
 * Nếu ván kết thúc, state mới có `result`: { winner: 'x'|'o'|null, reason: 'five'|'full', line? }
 */
export function makeMove(state, i) {
  if (state.result) throw new Error('Ván đã kết thúc');
  if (!Number.isInteger(i) || i < 0 || i >= state.board.length) throw new Error('Ô không hợp lệ');
  if (state.board[i] !== '.') throw new Error('Ô này đã có quân');
  const board = state.board.slice();
  board[i] = state.turn;
  const next = { ...state, board, turn: other(state.turn), history: [...state.history, { i, p: state.turn }] };
  const line = findWin(board, state.size, i, state.blockTwoEnds);
  if (line) next.result = { winner: state.turn, reason: 'five', line };
  else if (next.history.length === board.length) next.result = { winner: null, reason: 'full' };
  return next;
}

/** Hoàn tác n nước cuối. */
export function undoMoves(state, n = 1) {
  const board = state.board.slice();
  const history = state.history.slice();
  let turn = state.turn;
  for (let k = 0; k < n && history.length; k++) {
    const m = history.pop();
    board[m.i] = '.';
    turn = m.p;
  }
  const { result, ...rest } = state;
  return { ...rest, board, turn, history };
}

/** Tọa độ dạng "H8": cột theo chữ cái (bỏ I), hàng đếm từ dưới lên. */
const LETTERS = 'ABCDEFGHJKLMNOPQRSTU';
export function coord(size, i) {
  return LETTERS[i % size] + (size - Math.floor(i / size));
}
export const colLabel = (c) => LETTERS[c];

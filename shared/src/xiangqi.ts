// Engine Cờ tướng (Xiangqi) — luật theo chuẩn của Liên đoàn Cờ tướng châu Á (AXF), rút gọn:
//  - Bàn 9 cột x 10 hàng. Hàng 0 là hàng cuối của Đen (trên), hàng 9 là hàng cuối của Đỏ (dưới).
//  - Đỏ đi trước.
//  - Tướng/Sĩ chỉ đi trong cung; Tượng không qua sông, bị cản mắt; Mã bị cản chân; Pháo ăn phải có ngòi;
//    Tốt qua sông được đi ngang.
//  - Hai Tướng không được đối mặt trên cùng một cột mà không có quân cản (lộ mặt tướng).
//  - Không được đi nước để Tướng mình bị chiếu.
//  - Bên đến lượt mà không còn nước đi hợp lệ (bị chiếu bí hoặc hết nước) thì THUA.
//
// Quân: K Tướng, A Sĩ, B Tượng, N Mã, R Xe, C Pháo, P Tốt. Chữ hoa = Đỏ ('r'), chữ thường = Đen ('b').

export interface XiangqiMove { from: number; to: number; piece: string; captured: string; san: string; check?: boolean }
export interface XiangqiState {
  board: string[]; turn: string; history: XiangqiMove[];
  result?: { winner: string | null; reason: string };
}
export const ROWS = 10;
export const COLS = 9;

const INIT = [
  'rnbakabnr',
  '.........',
  '.c.....c.',
  'p.p.p.p.p',
  '.........',
  '.........',
  'P.P.P.P.P',
  '.C.....C.',
  '.........',
  'RNBAKABNR',
];

export const PIECE_NAME_VI = { K: 'Tướng', A: 'Sĩ', B: 'Tượng', N: 'Mã', R: 'Xe', C: 'Pháo', P: 'Tốt' };
export const PIECE_CHAR = {
  r: { K: '帥', A: '仕', B: '相', N: '傌', R: '俥', C: '炮', P: '兵' },
  b: { K: '將', A: '士', B: '象', N: '馬', R: '車', C: '砲', P: '卒' },
};
const NOTATION_LETTER: Record<string, string> = { K: 'Tg', A: 'S', B: 'T', N: 'M', R: 'X', C: 'P', P: 'B' };

export const idx = (r: number, c: number) => r * COLS + c;
export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;
export const colorOf = (p: string) => (p === '.' ? null : p === p.toUpperCase() ? 'r' : 'b');
export const typeOf = (p: string) => p.toUpperCase();
export const other = (color: string | null) => (color === 'r' ? 'b' : 'r');

export function initialBoard() {
  return INIT.join('').split('');
}

export function createGame(): XiangqiState {
  return { board: initialBoard(), turn: 'r', history: [] };
}

const inBoard = (r: number, c: number) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
const inPalace = (color: string | null, r: number, c: number) => c >= 3 && c <= 5 && (color === 'r' ? r >= 7 : r <= 2);
const ownSide = (color: string | null, r: number) => (color === 'r' ? r >= 5 : r <= 4);

/** Các ô đích giả hợp lệ (chưa xét tự chiếu) của quân tại ô `from`. */
export function pseudoMoves(board: string[], from: number) {
  const p = board[from];
  if (p === '.') return [];
  const color = colorOf(p);
  const t = typeOf(p);
  const r = rowOf(from), c = colOf(from);
  const res: number[] = [];
  const tryAdd = (rr: number, cc: number) => {
    if (!inBoard(rr, cc)) return;
    const q = board[idx(rr, cc)];
    if (q === '.' || colorOf(q) !== color) res.push(idx(rr, cc));
  };
  switch (t) {
    case 'K':
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (inPalace(color, r + dr, c + dc)) tryAdd(r + dr, c + dc);
      }
      break;
    case 'A':
      for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (inPalace(color, r + dr, c + dc)) tryAdd(r + dr, c + dc);
      }
      break;
    case 'B':
      for (const [dr, dc] of [[2, 2], [2, -2], [-2, 2], [-2, -2]]) {
        const rr = r + dr, cc = c + dc;
        if (!inBoard(rr, cc) || !ownSide(color, rr)) continue;
        if (board[idx(r + dr / 2, c + dc / 2)] !== '.') continue; // cản mắt tượng
        tryAdd(rr, cc);
      }
      break;
    case 'N':
      for (const [dr, dc, lr, lc] of [
        [2, 1, 1, 0], [2, -1, 1, 0], [-2, 1, -1, 0], [-2, -1, -1, 0],
        [1, 2, 0, 1], [-1, 2, 0, 1], [1, -2, 0, -1], [-1, -2, 0, -1],
      ]) {
        const rr = r + dr, cc = c + dc;
        if (!inBoard(rr, cc)) continue;
        if (board[idx(r + lr, c + lc)] !== '.') continue; // cản chân mã
        tryAdd(rr, cc);
      }
      break;
    case 'R':
    case 'C':
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        let rr = r + dr, cc = c + dc;
        let jumped = false;
        while (inBoard(rr, cc)) {
          const q = board[idx(rr, cc)];
          if (t === 'R') {
            if (q === '.') res.push(idx(rr, cc));
            else { if (colorOf(q) !== color) res.push(idx(rr, cc)); break; }
          } else if (!jumped) {
            if (q === '.') res.push(idx(rr, cc));
            else jumped = true;
          } else if (q !== '.') {
            if (colorOf(q) !== color) res.push(idx(rr, cc));
            break;
          }
          rr += dr; cc += dc;
        }
      }
      break;
    case 'P': {
      const fwd = color === 'r' ? -1 : 1;
      tryAdd(r + fwd, c);
      if (!ownSide(color, r)) { tryAdd(r, c + 1); tryAdd(r, c - 1); }
      break;
    }
  }
  return res;
}

function findKing(board: string[], color: string | null) {
  const k = color === 'r' ? 'K' : 'k';
  return board.indexOf(k);
}

/** Bên `color` có đang bị chiếu không (bao gồm lộ mặt tướng). */
export function isInCheck(board: string[], color: string | null) {
  const k = findKing(board, color);
  if (k < 0) return true;
  const ok = findKing(board, other(color));
  if (ok >= 0 && colOf(ok) === colOf(k)) {
    const c = colOf(k);
    const [a, b] = rowOf(k) < rowOf(ok) ? [rowOf(k), rowOf(ok)] : [rowOf(ok), rowOf(k)];
    let blocked = false;
    for (let r = a + 1; r < b; r++) if (board[idx(r, c)] !== '.') { blocked = true; break; }
    if (!blocked) return true;
  }
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p === '.' || colorOf(p) === color || typeOf(p) === 'K') continue;
    if (pseudoMoves(board, i).includes(k)) return true;
  }
  return false;
}

function applyRaw(board: string[], from: number, to: number) {
  const b = board.slice();
  b[to] = b[from];
  b[from] = '.';
  return b;
}

/** Nước đi hợp lệ từ ô `from` cho bên đang tới lượt. */
export function legalMovesFrom(state: XiangqiState, from: number) {
  const p = state.board[from];
  if (p === '.' || colorOf(p) !== state.turn) return [];
  return pseudoMoves(state.board, from).filter((to: number) => !isInCheck(applyRaw(state.board, from, to), state.turn));
}

export function hasAnyLegalMove(state: XiangqiState) {
  for (let i = 0; i < state.board.length; i++) {
    if (colorOf(state.board[i]) === state.turn && legalMovesFrom(state, i).length) return true;
  }
  return false;
}

/** Ký hiệu nước đi kiểu Việt Nam: vd "P2-5", "M8.7", "X1/2". */
export function notation(board: string[], from: number, to: number) {
  const p = board[from];
  const color = colorOf(p);
  const t = typeOf(p);
  const file = (col: number) => (color === 'r' ? COLS - col : col + 1);
  const fr = rowOf(from), fc = colOf(from), tr = rowOf(to), tc = colOf(to);
  let prefix = NOTATION_LETTER[t] + file(fc);
  // Hai quân cùng loại trên cùng một cột: dùng t (trước) / s (sau)
  const same: number[] = [];
  for (let r = 0; r < ROWS; r++) if (board[idx(r, fc)] === p) same.push(r);
  if (same.length >= 2 && t !== 'P') {
    const front = color === 'r' ? Math.min(...same) : Math.max(...same);
    prefix = NOTATION_LETTER[t] + (fr === front ? 't' : 's');
  }
  if (fr === tr) return `${prefix}-${file(tc)}`;
  const forward = color === 'r' ? tr < fr : tr > fr;
  const dir = forward ? '.' : '/';
  const diagonal = t === 'N' || t === 'B' || t === 'A';
  return `${prefix}${dir}${diagonal ? file(tc) : Math.abs(tr - fr)}`;
}

/**
 * Thực hiện nước đi. Trả về state mới hoặc ném lỗi nếu không hợp lệ.
 * state mới có thêm `result` nếu ván kết thúc: { winner: 'r'|'b', reason }
 */
export function makeMove(state: XiangqiState, from: number, to: number) {
  if (!legalMovesFrom(state, from).includes(to)) throw new Error('Nước đi không hợp lệ');
  const piece = state.board[from];
  const captured = state.board[to];
  const board = applyRaw(state.board, from, to);
  const turn = other(state.turn);
  const move: XiangqiMove = { from, to, piece, captured, san: notation(state.board, from, to) };
  const next: XiangqiState = { board, turn, history: [...state.history, move] };
  const check = isInCheck(board, turn);
  move.check = check;
  if (!hasAnyLegalMove(next)) {
    next.result = { winner: state.turn, reason: check ? 'checkmate' : 'stalemate' };
  } else if (!hasMaterialToWin(board)) {
    next.result = { winner: null, reason: 'insufficient' };
  }
  return next;
}

/** Hoàn tác n nước cuối. */
export function undoMoves(state: XiangqiState, n = 1) {
  const board = state.board.slice();
  const history = state.history.slice();
  let turn = state.turn;
  for (let k = 0; k < n && history.length; k++) {
    const m = history.pop()!;
    board[m.from] = m.piece;
    board[m.to] = m.captured;
    turn = other(turn);
  }
  return { board, turn, history };
}

/** Cả hai bên đều không còn quân tấn công (Xe, Mã, Pháo, Tốt) → hòa. */
function hasMaterialToWin(board: string[]) {
  return board.some((p: string) => p !== '.' && 'RNCP'.includes(typeOf(p)));
}

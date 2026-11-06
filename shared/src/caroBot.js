// Máy chơi Cờ caro (thuần JS, không phụ thuộc server).
//  - Chấm điểm mỗi ô trống gần các quân đã đánh theo "cửa sổ 5 ô": cửa sổ nào chỉ có quân một bên
//    thì càng nhiều quân càng nguy hiểm. Điểm tấn công = lợi cho mình, điểm phòng thủ = chặn đối thủ.
//  - Luôn thắng ngay nếu được, luôn chặn nước thắng của đối thủ (trừ mức Dễ thỉnh thoảng sót).
//  - Mức Khó: tìm kiếm negamax + alpha-beta vài nước trên các ô điểm cao nhất.
import { findWin, other } from './caro.js';

export const BOT_LEVELS = ['easy', 'medium', 'hard'];
export const BOT_LEVEL_NAMES = { easy: 'Dễ', medium: 'Vừa', hard: 'Khó' };

const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
// Điểm khi đặt thêm 1 quân vào cửa sổ đang có k quân của mình (k=4 → thành 5)
const ATTACK = [1, 12, 120, 2500, 1e7];
// Điểm khi chặn cửa sổ đang có k quân của đối thủ
const DEFEND = [0, 6, 80, 1500, 1e6];
// Điểm tĩnh của một cửa sổ chỉ có k quân của một bên
const WINDOW = [0, 1, 10, 120, 1500, 1e6];
const WIN_SCORE = 1e9;

/** Các cửa sổ 5 ô (mảng chỉ số ô) của bàn, và danh sách cửa sổ đi qua từng ô. */
const cache = new Map();
function windowsOf(size) {
  let w = cache.get(size);
  if (w) return w;
  const all = [];
  const byCell = Array.from({ length: size * size }, () => []);
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      for (const [dr, dc] of DIRS) {
        const er = r + dr * 4, ec = c + dc * 4;
        if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
        const cells = [];
        for (let k = 0; k < 5; k++) cells.push((r + dr * k) * size + (c + dc * k));
        const idx = all.length;
        all.push(cells);
        for (const i of cells) byCell[i].push(idx);
      }
    }
  }
  w = { all, byCell };
  cache.set(size, w);
  return w;
}

/** Ô trống trong bán kính `dist` quanh các quân đã đánh. */
function candidates(board, size, dist = 2) {
  const out = [];
  const seen = new Uint8Array(board.length);
  for (let i = 0; i < board.length; i++) {
    if (board[i] === '.') continue;
    const r0 = Math.floor(i / size), c0 = i % size;
    for (let dr = -dist; dr <= dist; dr++) {
      for (let dc = -dist; dc <= dist; dc++) {
        const r = r0 + dr, c = c0 + dc;
        if (r < 0 || r >= size || c < 0 || c >= size) continue;
        const j = r * size + c;
        if (board[j] !== '.' || seen[j]) continue;
        seen[j] = 1;
        out.push(j);
      }
    }
  }
  return out;
}

/** Điểm tấn công / phòng thủ khi `me` đặt quân vào ô trống `i`. */
function cellScore(board, size, i, me) {
  const { all, byCell } = windowsOf(size);
  const opp = other(me);
  let attack = 0, defend = 0, mine4 = false, theirs4 = false;
  for (const wi of byCell[i]) {
    let m = 0, o = 0;
    for (const j of all[wi]) {
      if (board[j] === me) m++;
      else if (board[j] === opp) o++;
    }
    if (o === 0) { attack += ATTACK[m]; if (m === 4) mine4 = true; }
    if (m === 0) { defend += DEFEND[o]; if (o === 4) theirs4 = true; }
  }
  return { attack, defend, mine4, theirs4 };
}

/** Điểm tĩnh của cả bàn theo góc nhìn `me` (bên sắp đi được thưởng thêm vì có lượt). */
function evaluate(board, size, me) {
  const { all } = windowsOf(size);
  const opp = other(me);
  let s = 0;
  for (const cells of all) {
    let m = 0, o = 0;
    for (const j of cells) {
      if (board[j] === me) m++;
      else if (board[j] === opp) o++;
    }
    if (m && !o) s += WINDOW[m] * 1.2; // có lượt đi nên thế của mình đáng giá hơn
    else if (o && !m) s -= WINDOW[o];
  }
  return s;
}

/** Ô làm `who` thắng ngay (theo đúng luật của ván, kể cả chặn hai đầu), hoặc -1. */
function winningCell(board, size, cells, who, blockTwoEnds) {
  for (const i of cells) {
    board[i] = who;
    const win = findWin(board, size, i, blockTwoEnds);
    board[i] = '.';
    if (win) return i;
  }
  return -1;
}

/** Xếp các ô ứng viên theo điểm (tấn công + phòng thủ) cho bên `me`. */
function ranked(board, size, me, cells, defendWeight = 1) {
  return cells
    .map((i) => {
      const s = cellScore(board, size, i, me);
      return { i, score: s.attack + s.defend * defendWeight, ...s };
    })
    .sort((a, b) => b.score - a.score);
}

function negamax(board, size, me, depth, alpha, beta, width, blockTwoEnds, deadline) {
  const cells = candidates(board, size, 1);
  if (!cells.length) return 0;
  const list = ranked(board, size, me, cells);
  // Có nước thắng ngay
  for (const m of list) {
    if (!m.mine4) continue;
    board[m.i] = me;
    const w = findWin(board, size, m.i, blockTwoEnds);
    board[m.i] = '.';
    if (w) return WIN_SCORE + depth;
  }
  if (depth === 0 || Date.now() > deadline) return evaluate(board, size, me);
  // Đối thủ dọa thắng → chỉ xét các ô chặn
  const forced = list.filter((m) => m.theirs4);
  const moves = (forced.length ? forced : list).slice(0, width);
  let best = -Infinity;
  for (const m of moves) {
    board[m.i] = me;
    const v = -negamax(board, size, other(me), depth - 1, -beta, -alpha, width, blockTwoEnds, deadline);
    board[m.i] = '.';
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/**
 * Chọn nước đi cho bên đang tới lượt.
 * @param state trạng thái ván (từ caro.js)
 * @param level 'easy' | 'medium' | 'hard'
 * @param rng hàm ngẫu nhiên [0,1) (để test cố định được)
 * @returns chỉ số ô
 */
export function chooseMove(state, level = 'medium', rng = Math.random) {
  const { size, blockTwoEnds } = state;
  const board = state.board.slice();
  const me = state.turn;
  const opp = other(me);
  const center = Math.floor(size / 2) * size + Math.floor(size / 2);
  if (!state.history.length) {
    if (level === 'hard') return center;
    // Lệch tâm một chút cho đỡ nhàm
    const r = Math.floor(size / 2) + Math.floor(rng() * 3) - 1, c = Math.floor(size / 2) + Math.floor(rng() * 3) - 1;
    return r * size + c;
  }
  const cells = candidates(board, size, level === 'easy' ? 1 : 2);
  if (!cells.length) return board.indexOf('.');

  // 1. Thắng ngay
  const win = winningCell(board, size, cells, me, blockTwoEnds);
  if (win >= 0 && (level !== 'easy' || rng() < 0.9)) return win;
  // 2. Chặn nước thắng của đối thủ (mức Dễ đôi khi không thấy)
  const block = winningCell(board, size, cells, opp, blockTwoEnds);
  if (block >= 0 && (level !== 'easy' || rng() < 0.75)) return block;

  if (level === 'easy') {
    // Phòng thủ kém, chọn ngẫu nhiên trong vài ô khá
    const list = ranked(board, size, me, cells, 0.5);
    const top = list.slice(0, Math.min(list.length, 6));
    return top[Math.floor(rng() * top.length)].i;
  }

  const list = ranked(board, size, me, cells);
  if (level === 'medium') {
    // Tham lam: ô điểm cao nhất, hòa điểm thì chọn ngẫu nhiên
    const best = list[0].score;
    const ties = list.filter((m) => m.score >= best * 0.95);
    return ties[Math.floor(rng() * ties.length)].i;
  }

  // Khó: tìm kiếm vài nước, giới hạn thời gian để không làm chậm server
  const deadline = Date.now() + 400;
  const width = 10;
  const top = list.slice(0, width);
  let bestMove = top[0].i, bestVal = -Infinity;
  for (const m of top) {
    board[m.i] = me;
    const v = -negamax(board, size, opp, 2, -Infinity, -bestVal, width, blockTwoEnds, deadline) + m.score * 1e-3;
    board[m.i] = '.';
    if (v > bestVal) { bestVal = v; bestMove = m.i; }
  }
  return bestMove;
}

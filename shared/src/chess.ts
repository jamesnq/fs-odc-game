// Engine Cờ vua (Chess) — chuẩn FIDE
//  - Bàn 8x8. Hàng 0 là hàng 8 (quân Đen), hàng 7 là hàng 1 (quân Trắng).
//  - Trắng đi trước ('w'), Đen đi sau ('b').
//  - Quân: K (Vua), Q (Hậu), R (Xe), B (Tượng), N (Mã), P (Tốt).
//    Chữ hoa = Trắng, chữ thường = Đen.
//  - Đầy đủ luật: Đi thường, Bắt quân, Bắt tốt qua đường (En passant),
//    Nhập thành (Castling gần & xa), Phong cấp (Promotion),
//    Chiếu, Chiếu bí (Checkmate), Hòa pat (Stalemate), Hòa không đủ lực lượng (Insufficient material),
//    Luật 50 nước, Lặp lại thế cờ 3 lần (Threefold repetition).

export interface ChessState {
  board: string[];
  turn: string;
  castling: Record<'w' | 'b', { k: boolean; q: boolean }>;
  enPassant: number | null;
  halfMoveClock: number;
  fullMoveNumber: number;
  history: ChessMove[];
  positionCounts: Record<string, number>;
  result: { winner: string | null; reason: string } | null;
}
export interface ChessMove {
  from: number; to: number; piece: string; captured: string | null;
  promotion: string | null; san: string; check: boolean; checkmate: boolean;
}
export type ChessPosition = Pick<ChessState, 'board' | 'turn' | 'castling' | 'enPassant'>;
export const ROWS = 8;
export const COLS = 8;

const INIT = [
  'rnbqkbnr',
  'pppppppp',
  '........',
  '........',
  '........',
  '........',
  'PPPPPPPP',
  'RNBQKBNR',
];

export const PIECE_NAME_VI: Record<string, string> = {
  K: 'Vua',
  Q: 'Hậu',
  R: 'Xe',
  B: 'Tượng',
  N: 'Mã',
  P: 'Tốt',
};

export const PIECE_UNICODE = {
  w: { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' },
  b: { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' },
};

export const idx = (r: number, c: number) => r * COLS + c;
export const rowOf = (i: number) => Math.floor(i / COLS);
export const colOf = (i: number) => i % COLS;
export const colorOf = (p: string) => (!p || p === '.' ? null : p === p.toUpperCase() ? 'w' : 'b');
export const typeOf = (p: string) => (!p || p === '.' ? null : p.toUpperCase());
export const other = (color: string | null) => (color === 'w' ? 'b' : 'w');

export const squareName = (i: number) => {
  const r = rowOf(i), c = colOf(i);
  return `${'abcdefgh'[c]}${8 - r}`;
};

export const squareFromAlgebraic = (alg: string) => {
  const file = alg.charCodeAt(0) - 97;
  const rank = Number(alg[1]);
  return idx(8 - rank, file);
};

export function initialBoard() {
  return INIT.join('').split('');
}

export function createGame(): ChessState {
  const board = initialBoard();
  const state: ChessState = {
    board,
    turn: 'w',
    castling: {
      w: { k: true, q: true },
      b: { k: true, q: true },
    },
    enPassant: null, // chỉ số ô mục tiêu bắt qua đường (ví dụ tốt trắng đi e2->e4 thì enPassant là ô e3)
    halfMoveClock: 0,
    fullMoveNumber: 1,
    history: [],
    positionCounts: {},
    result: null,
  };
  state.positionCounts[positionKey(state)] = 1;
  return state;
}

export function inBoard(r: number, c: number) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

/** Tạo chuỗi nhận diện vị trí để kiểm tra lặp lại 3 lần */
export function positionKey(state: ChessState) {
  const { board, turn, castling, enPassant } = state;
  const cast = `${castling.w.k ? 'K' : ''}${castling.w.q ? 'Q' : ''}${castling.b.k ? 'k' : ''}${castling.b.q ? 'q' : ''}` || '-';
  const ep = enPassant !== null ? squareName(enPassant) : '-';
  return `${board.join('')} ${turn} ${cast} ${ep}`;
}

/** Kiểm tra ô `targetIdx` có đang bị bên `byColor` tấn công không */
export function isSquareAttacked(board: string[], targetIdx: number, byColor: string | null) {
  const tr = rowOf(targetIdx), tc = colOf(targetIdx);

  // 1. Tốt
  const pawnDir = byColor === 'w' ? 1 : -1; // quân tấn công nằm ở phía đối diện
  for (const dc of [-1, 1]) {
    const pr = tr + pawnDir, pc = tc + dc;
    if (inBoard(pr, pc)) {
      const p = board[idx(pr, pc)];
      if (colorOf(p) === byColor && typeOf(p) === 'P') return true;
    }
  }

  // 2. Mã
  for (const [dr, dc] of [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ]) {
    const nr = tr + dr, nc = tc + dc;
    if (inBoard(nr, nc)) {
      const p = board[idx(nr, nc)];
      if (colorOf(p) === byColor && typeOf(p) === 'N') return true;
    }
  }

  // 3. Vua
  for (const dr of [-1, 0, 1]) {
    for (const dc of [-1, 0, 1]) {
      if (dr === 0 && dc === 0) continue;
      const kr = tr + dr, kc = tc + dc;
      if (inBoard(kr, kc)) {
        const p = board[idx(kr, kc)];
        if (colorOf(p) === byColor && typeOf(p) === 'K') return true;
      }
    }
  }

  // 4. Đường thẳng (Xe, Hậu)
  for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    let r = tr + dr, c = tc + dc;
    while (inBoard(r, c)) {
      const p = board[idx(r, c)];
      if (p !== '.') {
        if (colorOf(p) === byColor && (typeOf(p) === 'R' || typeOf(p) === 'Q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  // 5. Đường chéo (Tượng, Hậu)
  for (const [dr, dc] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let r = tr + dr, c = tc + dc;
    while (inBoard(r, c)) {
      const p = board[idx(r, c)];
      if (p !== '.') {
        if (colorOf(p) === byColor && (typeOf(p) === 'B' || typeOf(p) === 'Q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }

  return false;
}

export function findKing(board: string[], color: string | null) {
  const target = color === 'w' ? 'K' : 'k';
  return board.indexOf(target);
}

export function isInCheck(board: string[], color: string | null) {
  const king = findKing(board, color);
  if (king < 0) return true;
  return isSquareAttacked(board, king, other(color));
}

/**
 * Các nước đi giả hợp lệ (pseudo-moves) của quân tại `from`.
 * Bao gồm cả bắt quân, tốt đi 2 ô, en passant, và nhập thành (sẽ kiểm tra chiếu sau).
 */
export function pseudoMoves(state: ChessPosition, from: number) {
  const { board, castling, enPassant } = state;
  const p = board[from];
  if (!p || p === '.') return [];
  const color = colorOf(p);
  const type = typeOf(p);
  const r = rowOf(from), c = colOf(from);
  const res: number[] = [];

  const addIfEmptyOrEnemy = (rr: number, cc: number) => {
    if (!inBoard(rr, cc)) return false;
    const dest = idx(rr, cc);
    const q = board[dest];
    if (q === '.') {
      res.push(dest);
      return true; // tiếp tục tia
    }
    if (colorOf(q) !== color) {
      res.push(dest);
    }
    return false; // gặp quân chặn tia
  };

  switch (type) {
    case 'P': {
      const fwd = color === 'w' ? -1 : 1;
      const startRow = color === 'w' ? 6 : 1;
      const r1 = r + fwd;

      // Đi thẳng 1 ô
      if (inBoard(r1, c) && board[idx(r1, c)] === '.') {
        res.push(idx(r1, c));
        // Đi thẳng 2 ô từ vị trí ban đầu
        const r2 = r + 2 * fwd;
        if (r === startRow && inBoard(r2, c) && board[idx(r2, c)] === '.') {
          res.push(idx(r2, c));
        }
      }

      // Bắt chéo
      for (const dc of [-1, 1]) {
        const cc = c + dc;
        if (inBoard(r1, cc)) {
          const dest = idx(r1, cc);
          const q = board[dest];
          if (q !== '.' && colorOf(q) !== color) {
            res.push(dest);
          } else if (enPassant !== null && dest === enPassant) {
            // Bắt tốt qua đường
            res.push(dest);
          }
        }
      }
      break;
    }

    case 'N': {
      for (const [dr, dc] of [
        [-2, -1], [-2, 1], [-1, -2], [-1, 2],
        [1, -2], [1, 2], [2, -1], [2, 1],
      ]) {
        addIfEmptyOrEnemy(r + dr, c + dc);
      }
      break;
    }

    case 'B': {
      for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        let rr = r + dr, cc = c + dc;
        while (addIfEmptyOrEnemy(rr, cc)) {
          rr += dr; cc += dc;
        }
      }
      break;
    }

    case 'R': {
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        let rr = r + dr, cc = c + dc;
        while (addIfEmptyOrEnemy(rr, cc)) {
          rr += dr; cc += dc;
        }
      }
      break;
    }

    case 'Q': {
      for (const [dr, dc] of [
        [-1, -1], [-1, 1], [1, -1], [1, 1],
        [-1, 0], [1, 0], [0, -1], [0, 1],
      ]) {
        let rr = r + dr, cc = c + dc;
        while (addIfEmptyOrEnemy(rr, cc)) {
          rr += dr; cc += dc;
        }
      }
      break;
    }

    case 'K': {
      for (const dr of [-1, 0, 1]) {
        for (const dc of [-1, 0, 1]) {
          if (dr === 0 && dc === 0) continue;
          addIfEmptyOrEnemy(r + dr, c + dc);
        }
      }

      // Nhập thành
      if (color === 'w' && r === 7 && c === 4) {
        // Nhập thành gần O-O (hàng 7: e1 -> g1)
        if (castling.w.k && board[idx(7, 5)] === '.' && board[idx(7, 6)] === '.' && board[idx(7, 7)] === 'R') {
          res.push(idx(7, 6));
        }
        // Nhập thành xa O-O-O (hàng 7: e1 -> c1)
        if (castling.w.q && board[idx(7, 3)] === '.' && board[idx(7, 2)] === '.' && board[idx(7, 1)] === '.' && board[idx(7, 0)] === 'R') {
          res.push(idx(7, 2));
        }
      } else if (color === 'b' && r === 0 && c === 4) {
        // Nhập thành gần O-O (hàng 0: e8 -> g8)
        if (castling.b.k && board[idx(0, 5)] === '.' && board[idx(0, 6)] === '.' && board[idx(0, 7)] === 'r') {
          res.push(idx(0, 6));
        }
        // Nhập thành xa O-O-O (hàng 0: e8 -> c8)
        if (castling.b.q && board[idx(0, 3)] === '.' && board[idx(0, 2)] === '.' && board[idx(0, 1)] === '.' && board[idx(0, 0)] === 'r') {
          res.push(idx(0, 2));
        }
      }
      break;
    }
  }

  return res;
}

/** Áp dụng nước đi thử nghiệm lên mảng bàn cờ */
function applySimulatedMove(state: ChessPosition, from: number, to: number) {
  const board = state.board.slice();
  const p = board[from];
  const color = colorOf(p);
  const type = typeOf(p);

  // Xử lý bắt tốt qua đường
  if (type === 'P' && to === state.enPassant && colOf(from) !== colOf(to)) {
    const capturedPawnRow = rowOf(from);
    const capturedPawnCol = colOf(to);
    board[idx(capturedPawnRow, capturedPawnCol)] = '.';
  }

  // Xử lý di chuyển quân xe khi vua nhập thành
  if (type === 'K') {
    if (color === 'w') {
      if (from === idx(7, 4) && to === idx(7, 6)) { // O-O
        board[idx(7, 7)] = '.'; board[idx(7, 5)] = 'R';
      } else if (from === idx(7, 4) && to === idx(7, 2)) { // O-O-O
        board[idx(7, 0)] = '.'; board[idx(7, 3)] = 'R';
      }
    } else {
      if (from === idx(0, 4) && to === idx(0, 6)) { // O-O
        board[idx(0, 7)] = '.'; board[idx(0, 5)] = 'r';
      } else if (from === idx(0, 4) && to === idx(0, 2)) { // O-O-O
        board[idx(0, 0)] = '.'; board[idx(0, 3)] = 'r';
      }
    }
  }

  board[to] = p;
  board[from] = '.';
  return board;
}

/** Lấy tất cả nước đi hợp lệ từ ô `from` cho bên đang đến lượt */
export function legalMovesFrom(state: ChessPosition, from: number) {
  const p = state.board[from];
  if (!p || p === '.' || colorOf(p) !== state.turn) return [];

  const candidates = pseudoMoves(state, from);
  const color = state.turn;
  const enemy = other(color);

  return candidates.filter((to: number) => {
    // Kiểm tra đặc thù cho nhập thành:
    // 1. Vua không được đang bị chiếu.
    // 2. Ô vua đi qua và ô vua đáp xuống không bị tấn công.
    if (typeOf(p) === 'K' && Math.abs(colOf(to) - colOf(from)) === 2) {
      if (isInCheck(state.board, color)) return false;
      const r = rowOf(from);
      if (to === idx(r, 6)) {
        // O-O: kiểm tra ô c=5 và c=6
        if (isSquareAttacked(state.board, idx(r, 5), enemy)) return false;
        if (isSquareAttacked(state.board, idx(r, 6), enemy)) return false;
      } else if (to === idx(r, 2)) {
        // O-O-O: kiểm tra ô c=3 và c=2
        if (isSquareAttacked(state.board, idx(r, 3), enemy)) return false;
        if (isSquareAttacked(state.board, idx(r, 2), enemy)) return false;
      }
    }

    // Sau khi đi, Vua của mình có bị chiếu không?
    const nextBoard = applySimulatedMove(state, from, to);
    return !isInCheck(nextBoard, color);
  });
}

export function hasAnyLegalMove(state: ChessPosition) {
  for (let i = 0; i < state.board.length; i++) {
    if (colorOf(state.board[i]) === state.turn) {
      if (legalMovesFrom(state, i).length > 0) return true;
    }
  }
  return false;
}

/** Kiểm tra hòa do không đủ quân chiếu bí (K vs K, K+B vs K, K+N vs K, K+B vs K+B cùng màu ô) */
export function isInsufficientMaterial(board: string[]) {
  const pieces: { p: string; color: ReturnType<typeof colorOf>; type: ReturnType<typeof typeOf>; idx: number }[] = [];
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p !== '.') pieces.push({ p, color: colorOf(p), type: typeOf(p), idx: i });
  }

  // Nếu còn Tốt, Xe, Hậu -> đủ lực lượng
  if (pieces.some((x) => x.type === 'P' || x.type === 'R' || x.type === 'Q')) return false;

  // Chỉ có 2 vua
  if (pieces.length === 2) return true;

  // 3 quân: 2 Vua + 1 Mã hoặc 1 Tượng
  if (pieces.length === 3) {
    const nonKing = pieces.find((x) => x.type !== 'K');
    if (nonKing && (nonKing.type === 'B' || nonKing.type === 'N')) return true;
  }

  // 4 quân: 2 Vua + 2 Tượng (mỗi bên 1 Tượng) trên các ô cùng màu
  if (pieces.length === 4) {
    const wB = pieces.find((x) => x.p === 'B');
    const bB = pieces.find((x) => x.p === 'b');
    if (wB && bB) {
      const wSquareColor = (rowOf(wB.idx) + colOf(wB.idx)) % 2;
      const bSquareColor = (rowOf(bB.idx) + colOf(bB.idx)) % 2;
      if (wSquareColor === bSquareColor) return true;
    }
  }

  return false;
}

/** Tạo ký hiệu đại số tiêu chuẩn (SAN): ví dụ e4, Nf3, exd5, O-O, e8=Q#, v.v. */
export function getMoveNotation(state: ChessPosition, from: number, to: number, promotion: string | null) {
  const p = state.board[from];
  const type = typeOf(p);
  const isCapture = state.board[to] !== '.' || (type === 'P' && to === state.enPassant);

  // 1. Nhập thành
  if (type === 'K' && Math.abs(colOf(to) - colOf(from)) === 2) {
    return colOf(to) > colOf(from) ? 'O-O' : 'O-O-O';
  }

  // 2. Nước đi tốt
  if (type === 'P') {
    let san: string;
    if (isCapture) {
      san = `${'abcdefgh'[colOf(from)]}x${squareName(to)}`;
    } else {
      san = squareName(to);
    }
    if (promotion) {
      san += `=${promotion.toUpperCase()}`;
    }
    return san;
  }

  // 3. Nước đi của quân khác (N, B, R, Q, K)
  let san = type!;

  // Xác định xem có quân cùng loại nào khác cũng có thể đi đến ô `to` không để phân biệt (disambiguation)
  const others: number[] = [];
  for (let i = 0; i < state.board.length; i++) {
    if (i !== from && state.board[i] === p) {
      const moves = legalMovesFrom(state, i);
      if (moves.includes(to)) others.push(i);
    }
  }

  if (others.length > 0) {
    const sameFile = others.some((i: number) => colOf(i) === colOf(from));
    const sameRank = others.some((i: number) => rowOf(i) === rowOf(from));

    if (!sameFile) {
      san += 'abcdefgh'[colOf(from)];
    } else if (!sameRank) {
      san += String(8 - rowOf(from));
    } else {
      san += squareName(from);
    }
  }

  if (isCapture) san += 'x';
  san += squareName(to);

  return san;
}

/**
 * Thực hiện nước đi. Trả về state mới hoặc ném lỗi nếu không hợp lệ.
 * promotion: 'Q' | 'R' | 'B' | 'N' (mặc định 'Q')
 */
export function makeMove(state: ChessState, from: number, to: number, promotion: string | null = 'Q') {
  from = Number(from);
  to = Number(to);
  const legal = legalMovesFrom(state, from);
  if (!legal.includes(to)) {
    throw new Error('Nước đi không hợp lệ');
  }

  const board = state.board.slice();
  const p = board[from];
  const color = colorOf(p);
  const type = typeOf(p);
  const enemy = other(color);

  let captured = board[to];
  const isEnPassant = type === 'P' && to === state.enPassant && colOf(from) !== colOf(to);
  if (isEnPassant) {
    const capRow = rowOf(from);
    const capCol = colOf(to);
    captured = board[idx(capRow, capCol)];
    board[idx(capRow, capCol)] = '.';
  }

  // Di chuyển quân
  board[from] = '.';
  let finalPiece = p;

  // Phong cấp
  let isPromotion = false;
  const promoRow = color === 'w' ? 0 : 7;
  if (type === 'P' && rowOf(to) === promoRow) {
    isPromotion = true;
    const pr = ['Q', 'R', 'B', 'N'].includes(String(promotion).toUpperCase()) ? String(promotion).toUpperCase() : 'Q';
    finalPiece = color === 'w' ? pr : pr.toLowerCase();
  }
  board[to] = finalPiece;

  // Di chuyển xe khi nhập thành
  if (type === 'K') {
    if (color === 'w') {
      if (from === idx(7, 4) && to === idx(7, 6)) { // O-O
        board[idx(7, 7)] = '.'; board[idx(7, 5)] = 'R';
      } else if (from === idx(7, 4) && to === idx(7, 2)) { // O-O-O
        board[idx(7, 0)] = '.'; board[idx(7, 3)] = 'R';
      }
    } else {
      if (from === idx(0, 4) && to === idx(0, 6)) { // O-O
        board[idx(0, 7)] = '.'; board[idx(0, 5)] = 'r';
      } else if (from === idx(0, 4) && to === idx(0, 2)) { // O-O-O
        board[idx(0, 0)] = '.'; board[idx(0, 3)] = 'r';
      }
    }
  }

  // Cập nhật quyền nhập thành
  const castling = {
    w: { ...state.castling.w },
    b: { ...state.castling.b },
  };
  if (type === 'K') {
    castling[color!].k = false;
    castling[color!].q = false;
  }
  if (type === 'R') {
    if (from === idx(7, 7)) castling.w.k = false;
    if (from === idx(7, 0)) castling.w.q = false;
    if (from === idx(0, 7)) castling.b.k = false;
    if (from === idx(0, 0)) castling.b.q = false;
  }
  // Nếu quân xe ở góc bị bắt, mất quyền nhập thành bên đó
  if (to === idx(7, 7)) castling.w.k = false;
  if (to === idx(7, 0)) castling.w.q = false;
  if (to === idx(0, 7)) castling.b.k = false;
  if (to === idx(0, 0)) castling.b.q = false;

  // Cập nhật ô bắt tốt qua đường
  let nextEnPassant: number | null = null;
  if (type === 'P' && Math.abs(rowOf(to) - rowOf(from)) === 2) {
    const midRow = (rowOf(to) + rowOf(from)) / 2;
    nextEnPassant = idx(midRow, colOf(from));
  }

  // Đồng hồ 50 nước (reset nếu đi tốt hoặc có ăn quân)
  const isCaptureOrPawn = type === 'P' || captured !== '.';
  const halfMoveClock = isCaptureOrPawn ? 0 : state.halfMoveClock + 1;
  const fullMoveNumber = color === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber;

  // Lấy ký hiệu SAN
  let san = getMoveNotation(state, from, to, isPromotion ? typeOf(finalPiece) : null);

  // Tạo state tiếp theo để kiểm tra chiếu & chiếu bí
  const nextTurn = enemy;
  const nextState: ChessState = {
    board,
    turn: nextTurn,
    castling,
    enPassant: nextEnPassant,
    halfMoveClock,
    fullMoveNumber,
    history: [],
    positionCounts: { ...state.positionCounts },
    result: null,
  };

  const check = isInCheck(board, nextTurn);
  const anyLegal = hasAnyLegalMove(nextState);

  let checkmate = false;
  let stalemate = false;
  if (check && !anyLegal) {
    checkmate = true;
    san += '#';
  } else if (check) {
    san += '+';
  } else if (!anyLegal) {
    stalemate = true;
  }

  const moveRecord = {
    from,
    to,
    piece: p,
    captured: captured !== '.' ? captured : null,
    promotion: isPromotion ? typeOf(finalPiece) : null,
    san,
    check,
    checkmate,
  };

  nextState.history = [...state.history, moveRecord];

  // Cập nhật số lần lặp vị trí
  const key = positionKey(nextState);
  nextState.positionCounts[key] = (nextState.positionCounts[key] || 0) + 1;
  const repetition = nextState.positionCounts[key] >= 3;

  // Xác định kết quả
  if (checkmate) {
    nextState.result = { winner: color, reason: 'checkmate' };
  } else if (stalemate) {
    nextState.result = { winner: null, reason: 'stalemate' };
  } else if (isInsufficientMaterial(board)) {
    nextState.result = { winner: null, reason: 'insufficient' };
  } else if (repetition) {
    nextState.result = { winner: null, reason: 'repetition' };
  } else if (halfMoveClock >= 100) {
    nextState.result = { winner: null, reason: 'fifty_moves' };
  }

  return nextState;
}

/** Hoàn tác n nước cuối */
export function undoMoves(state: ChessState, n = 1) {
  if (n <= 0 || !state.history.length) return state;
  const targetHistoryLength = Math.max(0, state.history.length - n);
  let cur = createGame();
  for (let i = 0; i < targetHistoryLength; i++) {
    const m = state.history[i];
    cur = makeMove(cur, m.from, m.to, m.promotion);
  }
  return cur;
}

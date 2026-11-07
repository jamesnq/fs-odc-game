import type { Room } from '../lobby.js';
import { createGame, makeMove, undoMoves, isInCheck } from '@game/shared/xiangqi';
import type { XiangqiState } from '@game/shared/xiangqi';
import type { MoveAction } from './types.js';
import { DuelHandler } from './duel.js';
import { clampInt } from './options.js';

export class XiangqiHandler extends DuelHandler<XiangqiState> {
  static SIDES = ['r', 'b'];
  static LABELS = { r: 'Đỏ', b: 'Đen' };
  static REASONS = {
    checkmate: 'Chiếu bí',
    stalemate: 'Hết nước đi',
    insufficient: 'Hòa do không đủ quân tấn công',
  };

  constructor(room: Room, options: Record<string, unknown>) {
    super(room, { minutes: clampInt(options.minutes, 1, 60, 8) });
  }

  _newGame() { return createGame(); }
  _move(game: XiangqiState, a: MoveAction) {
    return makeMove(game, Number('from' in a ? a.from : undefined), Number('to' in a ? a.to : undefined));
  }

  _undo(game: XiangqiState, n: number) { return undoMoves(game, n); }

  _boardView() {
    const { board, turn, history } = this.game;
    const last = history[history.length - 1];
    return {
      board,
      turn,
      moves: history.map((m) => ({ san: m.san, from: m.from, to: m.to, captured: m.captured !== '.' ? m.captured : null })),
      lastMove: last ? { from: last.from, to: last.to } : null,
      inCheck: this.status === 'playing' && isInCheck(board, turn),
    };
  }
}

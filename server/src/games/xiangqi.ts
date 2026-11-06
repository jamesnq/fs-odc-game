import type { Room } from '../lobby.js';
import { createGame, makeMove, undoMoves, isInCheck } from '@game/shared/xiangqi';
import { DuelHandler } from './duel.js';
import { clampInt } from './options.js';

export class XiangqiHandler extends DuelHandler {
  static SIDES = ['r', 'b'];
  static LABELS = { r: 'Đỏ', b: 'Đen' };
  static REASONS = {
    checkmate: 'Chiếu bí',
    stalemate: 'Hết nước đi',
    insufficient: 'Hòa do không đủ quân tấn công',
  };

  constructor(room: Room, options: any) {
    super(room, { minutes: clampInt(options.minutes, 1, 60, 8) });
  }

  _newGame() { return createGame(); }
  _move(game: any, a: any) { return makeMove(game, Number(a.from), Number(a.to)); }
  _undo(game: any, n: any) { return undoMoves(game, n); }

  _boardView() {
    const { board, turn, history } = this.game;
    const last = history[history.length - 1];
    return {
      board,
      turn,
      moves: history.map((m: any) => ({ san: m.san, from: m.from, to: m.to, captured: m.captured !== '.' ? m.captured : null })),
      lastMove: last ? { from: last.from, to: last.to } : null,
      inCheck: this.status === 'playing' && isInCheck(board, turn),
    };
  }
}

import { createGame, makeMove, undoMoves, coord, MIN_SIZE, MAX_SIZE } from '@game/shared/caro';
import { botPool } from '../botPool.js';
import { botLevel } from './bots.js';
import { DuelHandler } from './duel.js';
import { bool, clampInt } from './options.js';

export class CaroHandler extends DuelHandler {
  static SIDES = ['x', 'o'];
  static LABELS = { x: 'X', o: 'O' };
  static REASONS = {
    five: 'Đủ 5 quân liên tiếp',
    full: 'Kín bàn',
  };

  constructor(room, options) {
    super(room, {
      minutes: clampInt(options.minutes, 1, 60, 10),
      size: clampInt(options.size, MIN_SIZE, MAX_SIZE, 15),
      blockTwoEnds: bool(options.blockTwoEnds, true),
    });
    // Tạo bàn kèm máy: máy ngồi ghế O, người tạo bàn ngồi X (đi trước)
    const bot = botLevel(options.bot);
    if (bot) this._addBot(room.ownerId, { level: bot, seat: 'o' });
  }

  _botMove(game, level) { return botPool.run(game, level); }

  _newGame() { return createGame({ size: this.options.size, blockTwoEnds: this.options.blockTwoEnds }); }
  _move(game, a) { return makeMove(game, Number(a.cell)); }
  _undo(game, n) { return undoMoves(game, n); }
  _resultDetails(r) { return { line: r.line }; } // 5 ô thắng để tô sáng

  _boardView() {
    const { size, board, turn, history } = this.game;
    return {
      size,
      board,
      turn,
      moves: history.map((m) => ({ cell: m.i, p: m.p, san: coord(size, m.i) })),
      lastMove: history.length ? history[history.length - 1].i : null,
    };
  }
}

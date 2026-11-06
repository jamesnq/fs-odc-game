import { TalaGame } from '@game/shared/tala';
import { CardTableHandler } from './cardTable.js';
import { clampInt } from './options.js';

export class TalaHandler extends CardTableHandler {
  constructor(room, options) {
    super(room, {
      maxSeats: clampInt(options.maxSeats, 2, 4, 4),
      unit: clampInt(options.unit, 1, 1000000, 10),
      turnSeconds: clampInt(options.turnSeconds, 10, 120, 30),
    });
  }

  _createGame(players, first) { return new TalaGame(players, first); }
  _startMessage() { return `Ván ${this.gameNo} bắt đầu`; }
  _turnKey(g) { return `${g.turn}:${g.discardCount[g.turn]}`; }

  _play(g, id, a) {
    switch (a.type) {
      case 'draw': return g.draw(id);
      case 'eat': return g.eat(id);
      case 'discard': return g.discard(id, String(a.card));
      case 'lay': return g.layMeld(id, Array.isArray(a.cards) ? a.cards.map(String) : []);
      case 'autoLay': return g.autoLay(id);
      case 'send': return g.send(id, String(a.card), Number(a.target), Number(a.meldIdx));
      case 'u': return g.declareU(id);
      default: throw new Error('Hành động không hợp lệ');
    }
  }
}

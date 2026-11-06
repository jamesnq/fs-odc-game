import type { Room } from '../lobby.js';
import { SamLocGame } from '@game/shared/samloc';
import { CardTableHandler } from './cardTable.js';
import { clampInt } from './options.js';

const SAM_SECONDS = 10; // thời gian báo Sâm đầu ván

export class SamLocHandler extends CardTableHandler {
  declare turnKey: any;

  constructor(room: Room, options: any) {
    super(room, {
      maxSeats: clampInt(options.maxSeats, 2, 5, 4),
      unit: clampInt(options.unit, 1, 1000000, 10),
      turnSeconds: clampInt(options.turnSeconds, 10, 120, 25),
    });
  }

  _createGame(players: any, first: any) { return new SamLocGame(players, first); }
  _startMessage(players: any, first: any) {
    return `Ván ${this.gameNo} bắt đầu — ${players[first].name} đi trước. Ai báo Sâm thì báo trong ${SAM_SECONDS} giây!`;
  }
  _turnKey(g: any) { return g.phase === 'sam' ? 'sam' : `${g.turn}:${g.log.length}`; }
  _onFinish(g: any) { this.room.system(`🏆 ${g.players[g.result.winner].name}: ${g.result.text}`); }

  _play(g: any, id: any, a: any) {
    switch (a.type) {
      case 'sam': return g.declareSam(id, !!a.yes);
      case 'play': return g.play(id, Array.isArray(a.cards) ? a.cards.map(String).slice(0, 13) : []);
      case 'pass': return g.pass(id);
      default: throw new Error('Hành động không hợp lệ');
    }
  }

  /** Đầu ván có pha báo Sâm (mọi người cùng quyết định), sau đó mới là đồng hồ theo lượt. */
  _resetTimer(force = false) {
    const g = this.game;
    if (!g || g.result || g.phase !== 'sam') return super._resetTimer(force);
    if (this._turnKey(g) === this.turnKey && !force) return;
    this.turnKey = this._turnKey(g);
    // Người rời bàn / mất kết nối coi như không báo
    for (const p of g.players) {
      if (this._isAway(p.id) && !g.samDecided.has(g.indexOf(p.id))) g.declareSam(p.id, false);
    }
    if (g.phase !== 'sam') return super._resetTimer(true);
    this._setTimer(SAM_SECONDS * 1000, () => {
      if (this.game !== g || g.phase !== 'sam') return;
      g.endSamPhase();
      this.room.system('Không ai báo Sâm');
      this._afterAction();
    });
  }
}

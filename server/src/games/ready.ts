import type { Room } from '../lobby.js';
// Luật bắt đầu ván dùng chung cho mọi trò: không tự bắt đầu.
// Người ngồi bàn bấm "Sẵn sàng"; khi mọi người đã sẵn sàng thì chủ phòng bấm "Bắt đầu".
// Chủ phòng (nếu đang ngồi) không cần bấm sẵn sàng — bấm "Bắt đầu" là đã sẵn sàng.
// Máy (bot) luôn được coi là đã sẵn sàng.
import { isBot } from './bots.js';

export class ReadyGate {
  declare room: Pick<Room, 'ownerId'>;
  declare ids: Set<string>;

  constructor(room: Pick<Room, 'ownerId'>) {
    this.room = room;
    this.ids = new Set();
  }

  has(id: string) { return isBot(id) || this.ids.has(id); }
  delete(id: string) { this.ids.delete(id); }
  clear() { this.ids.clear(); }
  toggle(id: string) {
    if (this.ids.has(id)) this.ids.delete(id);
    else this.ids.add(id);
  }

  /** Những người ngồi bàn chưa sẵn sàng (không tính chủ phòng). */
  waitingFor(ids: string[]) { return ids.filter((id: string) => id !== this.room.ownerId && !this.has(id)); }

  /**
   * Chủ phòng bấm bắt đầu: kiểm tra quyền, số người và mọi người đã sẵn sàng.
   * @param {string} id người bấm
   * @param {{id:string,name:string}[]} players người đang ngồi bàn
   */
  check(id: string, players: {id: string; name: string}[], min = 2) {
    if (id !== this.room.ownerId) throw new Error('Chỉ chủ phòng mới được bắt đầu ván');
    if (players.length < min) throw new Error(`Cần ít nhất ${min} người ngồi bàn`);
    const missing = this.waitingFor(players.map((p) => p.id));
    if (missing.length) {
      const names = players.filter((p) => missing.includes(p.id)).map((p) => p.name);
      throw new Error(`Chờ ${names.join(', ')} sẵn sàng`);
    }
  }

  /** Phần gửi xuống client. */
  view(ids: string[]) {
    return { ready: ids.filter((id: string) => this.has(id)), waitingFor: this.waitingFor(ids) };
  }
}

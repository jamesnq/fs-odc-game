import { PokerGame } from '@game/shared/poker';

const clampInt = (v, min, max, def) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export class PokerHandler {
  constructor(room, options) {
    this.room = room;
    const bigBlind = clampInt(options.bigBlind, 2, 100000, 20);
    this.options = {
      bigBlind,
      smallBlind: Math.max(1, Math.floor(bigBlind / 2)),
      buyIn: clampInt(options.buyIn, bigBlind * 10, bigBlind * 1000, bigBlind * 100),
      maxSeats: clampInt(options.maxSeats, 2, 9, 6),
      turnSeconds: clampInt(options.turnSeconds, 10, 120, 30),
    };
    this.game = new PokerGame({ smallBlind: this.options.smallBlind, bigBlind: this.options.bigBlind, maxSeats: this.options.maxSeats });
    this.stacks = new Map(); // chip giữ lại khi đứng dậy
    this.rebuys = new Map();
    this.turnTimer = null;
    this.deadline = 0;
    this.nextHandTimer = null;
    this.nextHandAt = 0;
    this.lastLogLen = -1;
  }

  get maxPlayers() { return this.options.maxSeats; }
  playerIds() { return this.game.seats.filter((s) => s && !s.left).map((s) => s.id); }
  isPlaying() { return this.game.inHand; }

  rename(id, name) {
    const s = this.game.seats.find((x) => x && x.id === id);
    if (s) s.name = name;
    const hp = this.game.hand && Object.values(this.game.hand.players).find((p) => p.id === id);
    if (hp) hp.name = name;
  }

  sit(user, seat) {
    if (this.game.seatOf(user.id) >= 0) throw new Error('Bạn đã ngồi rồi');
    let s = Number.isInteger(seat) ? seat : this.game.seats.findIndex((x) => !x);
    if (s < 0 || s >= this.game.seats.length || this.game.seats[s]) throw new Error('Không còn ghế trống');
    let chips = this.stacks.get(user.id);
    if (!chips || chips <= 0) chips = this.options.buyIn;
    this.game.sit(s, user.id, user.name, chips);
    this._maybeSchedule();
  }

  stand(id) {
    const s = this.game.seatOf(id);
    if (s < 0) return;
    this.stacks.set(id, this.game.seats[s].chips);
    this.game.leave(id);
    this._afterChange();
  }

  onLeave(id) { this.stand(id); }

  action(id, a) {
    const seat = this.game.seatOf(id);
    if (seat < 0) throw new Error('Bạn đang ở chế độ xem');
    const s = this.game.seats[seat];
    switch (a.type) {
      case 'act':
        this.game.act(id, String(a.action), a.amount);
        break;
      case 'rebuy': {
        if (this.game.inHand && this.game.hand.players[seat]) throw new Error('Đợi hết ván để nạp thêm');
        if (s.chips >= this.options.bigBlind) throw new Error('Chỉ nạp khi hết chip');
        s.chips = this.options.buyIn;
        this.rebuys.set(id, (this.rebuys.get(id) || 0) + 1);
        this.room.system(`${s.name} nạp thêm ${this.options.buyIn} chip`);
        break;
      }
      case 'sitout':
        s.sitOut = !s.sitOut;
        break;
      default:
        throw new Error('Hành động không hợp lệ');
    }
    this._afterChange();
  }

  _afterChange() {
    const h = this.game.hand;
    if (h && h.street === 'done') {
      clearTimeout(this.turnTimer);
      this.deadline = 0;
      this.game.cleanup();
    } else if (h) {
      this._resetTurnTimer();
    }
    this._maybeSchedule();
  }

  _resetTurnTimer() {
    clearTimeout(this.turnTimer);
    const h = this.game.hand;
    if (!h || h.street === 'done' || h.toAct < 0) { this.deadline = 0; return; }
    const key = `${h.no}:${h.toAct}:${h.log.length}`;
    if (key === this.timerKey && this.deadline) {
      this.turnTimer = setTimeout(() => this._onTimeout(), Math.max(0, this.deadline - Date.now()));
      return;
    }
    this.timerKey = key;
    const seat = this.game.seats[h.toAct];
    // Người đã rời / ngồi ngoài: tự động sau 1 giây
    const ms = seat && (seat.left || seat.sitOut || !this.room.isOnline(seat.id)) ? 3000 : this.options.turnSeconds * 1000;
    this.deadline = Date.now() + ms;
    this.turnTimer = setTimeout(() => this._onTimeout(), ms);
  }

  _onTimeout() {
    try {
      this.game.timeout();
    } catch (e) {
      console.error('poker timeout', e);
    }
    this._afterChange();
    this.room.changed();
  }

  _maybeSchedule() {
    if (this.game.inHand || this.nextHandTimer) return;
    if (!this.game.canStart()) { this.nextHandAt = 0; return; }
    const delay = this.game.hand ? 6000 : 3000; // xem kết quả ván trước
    this.nextHandAt = Date.now() + delay;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.nextHandAt = 0;
      if (!this.game.inHand && this.game.canStart()) {
        this.game.startHand();
        this._afterChange();
      }
      this.room.changed();
    }, delay);
  }

  view(viewerId) {
    const v = this.game.view(viewerId);
    return {
      ...v,
      config: this.options,
      turnLeft: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      turnTotal: this.options.turnSeconds * 1000,
      nextHandIn: this.nextHandAt ? Math.max(0, this.nextHandAt - Date.now()) : 0,
    };
  }

  dispose() {
    clearTimeout(this.turnTimer);
    clearTimeout(this.nextHandTimer);
  }
}

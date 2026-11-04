import { TalaGame } from '@game/shared/tala';

const clampInt = (v, min, max, def) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

export class TalaHandler {
  constructor(room, options) {
    this.room = room;
    this.options = {
      maxSeats: clampInt(options.maxSeats, 2, 4, 4),
      unit: clampInt(options.unit, 1, 1000000, 10),
      turnSeconds: clampInt(options.turnSeconds, 10, 120, 30),
    };
    this.seats = Array(this.options.maxSeats).fill(null); // { id, name }
    this.totals = new Map(); // tổng điểm tích lũy theo id
    this.game = null;
    this.gameSeats = []; // chỉ số ghế theo thứ tự người chơi trong ván
    this.left = new Set(); // người rời bàn khi đang chơi -> máy đánh hộ
    this.lastWinnerId = null;
    this.timer = null;
    this.deadline = 0;
    this.turnKey = '';
    this.gameNo = 0;
  }

  get maxPlayers() { return this.options.maxSeats; }
  playerIds() { return this.seats.filter(Boolean).map((s) => s.id); }
  isPlaying() { return !!this.game && !this.game.result; }
  seatOf(id) { return this.seats.findIndex((s) => s && s.id === id); }

  rename(id, name) {
    const s = this.seats.find((x) => x && x.id === id);
    if (s) s.name = name;
    if (this.game) for (const p of this.game.players) if (p.id === id) p.name = name;
  }

  sit(user, seat) {
    if (this.seatOf(user.id) >= 0) throw new Error('Bạn đã ngồi rồi');
    if (this.isPlaying()) throw new Error('Ván đang diễn ra, hãy đợi ván sau');
    const s = Number.isInteger(seat) ? seat : this.seats.findIndex((x) => !x);
    if (s < 0 || s >= this.seats.length || this.seats[s]) throw new Error('Không còn ghế trống');
    this.seats[s] = { id: user.id, name: user.name };
    if (!this.totals.has(user.id)) this.totals.set(user.id, 0);
  }

  stand(id) {
    const s = this.seatOf(id);
    if (s < 0) return;
    if (this.isPlaying() && this.game.indexOf(id) >= 0) {
      this.left.add(id);
      this.room.system(`${this.seats[s].name} rời bàn, máy sẽ đánh hộ đến hết ván`);
      this._resetTimer(true);
      return; // giữ ghế đến hết ván
    }
    this.seats[s] = null;
  }

  onLeave(id) { this.stand(id); }

  _start() {
    const seated = this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (seated.length < 2) throw new Error('Cần ít nhất 2 người');
    this.gameSeats = seated;
    const players = seated.map((i) => this.seats[i]);
    let first = players.findIndex((p) => p.id === this.lastWinnerId);
    if (first < 0) first = Math.floor(Math.random() * players.length);
    this.game = new TalaGame(players, first);
    this.left.clear();
    this.gameNo++;
    this.room.system(`Ván ${this.gameNo} bắt đầu`);
    this._resetTimer();
  }

  action(id, a) {
    if (a.type === 'start') {
      if (this.seatOf(id) < 0) throw new Error('Bạn đang ở chế độ xem');
      if (this.isPlaying()) throw new Error('Ván đang diễn ra');
      this._start();
      return;
    }
    const g = this.game;
    if (!g || g.result) throw new Error('Chưa có ván nào');
    const i = g.indexOf(id);
    if (i < 0) throw new Error('Bạn không chơi ván này');
    switch (a.type) {
      case 'draw': g.draw(id); break;
      case 'eat': g.eat(id); break;
      case 'discard': g.discard(id, String(a.card)); break;
      case 'lay': g.layMeld(id, Array.isArray(a.cards) ? a.cards.map(String) : []); break;
      case 'autoLay': g.autoLay(id); break;
      case 'send': g.send(id, String(a.card), Number(a.target), Number(a.meldIdx)); break;
      case 'u': g.declareU(id); break;
      default: throw new Error('Hành động không hợp lệ');
    }
    this._afterAction();
  }

  _afterAction() {
    const g = this.game;
    if (g.result) {
      clearTimeout(this.timer);
      this.deadline = 0;
      g.players.forEach((p, k) => {
        this.totals.set(p.id, (this.totals.get(p.id) || 0) + g.result.scores[k] * this.options.unit);
      });
      this.lastWinnerId = g.players[g.result.winner].id;
      // Giải phóng ghế người đã rời
      for (const id of this.left) {
        const s = this.seatOf(id);
        if (s >= 0) this.seats[s] = null;
      }
      this.left.clear();
      return;
    }
    this._resetTimer();
  }

  _resetTimer(force = false) {
    const g = this.game;
    if (!g || g.result) return;
    const key = `${g.turn}:${g.discardCount[g.turn]}`;
    if (key === this.turnKey && !force) return;
    this.turnKey = key;
    clearTimeout(this.timer);
    const id = g.players[g.turn].id;
    const auto = this.left.has(id) || !this.room.isOnline(id);
    const ms = auto ? 2000 : this.options.turnSeconds * 1000;
    this.deadline = Date.now() + ms;
    this.timer = setTimeout(() => {
      try {
        if (this.game === g && !g.result && g.players[g.turn].id === id) {
          g.autoPlay(id);
          this._afterAction();
          this.room.changed();
        }
      } catch (e) {
        console.error('tala autoplay', e);
      }
    }, ms);
  }

  view(viewerId) {
    return {
      config: this.options,
      seats: this.seats.map((s) => s && { ...s, total: this.totals.get(s.id) || 0, left: this.left.has(s.id), online: this.room.isOnline(s.id) }),
      gameSeats: this.gameSeats,
      game: this.game ? this.game.view(viewerId) : null,
      playing: this.isPlaying(),
      turnLeft: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      turnTotal: this.options.turnSeconds * 1000,
      mySeat: this.seatOf(viewerId),
    };
  }

  dispose() { clearTimeout(this.timer); }
}

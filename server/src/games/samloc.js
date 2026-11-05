import { SamLocGame } from '@game/shared/samloc';

const clampInt = (v, min, max, def) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};
const SAM_SECONDS = 10; // thời gian báo Sâm đầu ván

export class SamLocHandler {
  constructor(room, options) {
    this.room = room;
    this.options = {
      maxSeats: clampInt(options.maxSeats, 2, 5, 4),
      unit: clampInt(options.unit, 1, 1000000, 10),
      turnSeconds: clampInt(options.turnSeconds, 10, 120, 25),
    };
    this.seats = Array(this.options.maxSeats).fill(null); // { id, name }
    this.totals = new Map();
    this.game = null;
    this.gameSeats = [];
    this.left = new Set(); // rời bàn khi đang chơi → máy đánh hộ
    this.lastWinnerId = null;
    this.timer = null;
    this.deadline = 0;
    this.deadlineTotal = 0;
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
      return;
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
    this.game = new SamLocGame(players, first);
    this.left.clear();
    this.gameNo++;
    this.turnKey = '';
    this.room.system(`Ván ${this.gameNo} bắt đầu — ${players[first].name} đi trước. Ai báo Sâm thì báo trong ${SAM_SECONDS} giây!`);
    this._afterAction();
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
    if (g.indexOf(id) < 0) throw new Error('Bạn không chơi ván này');
    switch (a.type) {
      case 'sam': g.declareSam(id, !!a.yes); break;
      case 'play': g.play(id, Array.isArray(a.cards) ? a.cards.map(String).slice(0, 13) : []); break;
      case 'pass': g.pass(id); break;
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
      this.room.system(`🏆 ${g.players[g.result.winner].name}: ${g.result.text}`);
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
    const key = g.phase === 'sam' ? 'sam' : `${g.turn}:${g.log.length}`;
    if (key === this.turnKey && !force) return;
    this.turnKey = key;
    clearTimeout(this.timer);
    if (g.phase === 'sam') {
      // Người rời bàn / mất kết nối coi như không báo
      for (const p of g.players) {
        if ((this.left.has(p.id) || !this.room.isOnline(p.id)) && !g.samDecided.has(g.indexOf(p.id))) g.declareSam(p.id, false);
      }
      if (g.phase !== 'sam') return this._resetTimer(true);
      const ms = SAM_SECONDS * 1000;
      this.deadline = Date.now() + ms;
      this.deadlineTotal = ms;
      this.timer = setTimeout(() => {
        if (this.game === g && g.phase === 'sam') {
          g.endSamPhase();
          this.room.system('Không ai báo Sâm');
          this._afterAction();
          this.room.changed();
        }
      }, ms);
      return;
    }
    const id = g.players[g.turn].id;
    const auto = this.left.has(id) || !this.room.isOnline(id);
    const ms = auto ? 2000 : this.options.turnSeconds * 1000;
    this.deadline = Date.now() + ms;
    this.deadlineTotal = ms;
    this.timer = setTimeout(() => {
      try {
        if (this.game === g && !g.result && g.players[g.turn]?.id === id) {
          g.autoPlay(id);
          this._afterAction();
          this.room.changed();
        }
      } catch (e) {
        console.error('samloc autoplay', e);
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
      turnTotal: this.deadlineTotal || this.options.turnSeconds * 1000,
      mySeat: this.seatOf(viewerId),
      gameNo: this.gameNo,
    };
  }

  dispose() { clearTimeout(this.timer); }
}

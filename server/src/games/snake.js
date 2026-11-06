import { SnakeGame, replay, SPEEDS, MAZES, DIRS } from '@game/shared/snake';
import { clampInt } from './options.js';
import { ReadyGate } from './ready.js';

// Rắn săn mồi kiểu điện thoại cổ: mỗi người một con rắn trên bàn của mình, mọi người cùng hạt giống
// (mồi đầu tiên giống nhau). Client tự chạy trò và gửi lượt rẽ [tick, hướng] lên; server phát lại để
// tính điểm thật. Chơi nhiều người thì không được dừng: ai im lặng quá lâu, server tự cho rắn đi thẳng.

const COUNTDOWN_MS = 3000;
const AHEAD_SLACK_MS = 2000; // client được phép chạy trước đồng hồ server chừng này
const BEHIND_SLACK_MS = 4000; // chơi nhiều người: chậm hơn chừng này thì server tự đẩy rắn đi
const MAX_INPUTS = 4000;

export const MAZE_LABEL = { none: 'Không tường', box: 'Hộp kín', tunnel: 'Đường hầm', rooms: 'Bốn phòng', rails: 'Đường ray' };

export class SnakeHandler {
  constructor(room, options) {
    this.room = room;
    this.options = {
      maxSeats: clampInt(options.maxSeats, 1, 8, 4),
      level: clampInt(options.level, 1, 9, 5),
      maze: MAZES.includes(options.maze) ? options.maze : 'none',
      minutes: clampInt(options.minutes, 0, 30, 0),
    };
    this.seats = [];
    this.ready = new ReadyGate(room);
    this.status = 'waiting';
    this.players = [];
    this.seed = 0;
    this.startAt = 0;
    this.deadline = 0;
    this.gameNo = 0;
    this.result = null;
    this.timer = null;
    this.watch = null;
    this.wins = new Map();
  }

  get maxPlayers() { return this.options.maxSeats; }
  get tickMs() { return SPEEDS[this.options.level - 1]; }
  playerIds() { return this.seats.map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  seated(id) { return this.seats.some((s) => s.id === id); }
  player(id) { return this.players.find((p) => p.id === id); }
  gameOpts() { return { seed: this.seed, maze: this.options.maze, level: this.options.level }; }

  rename(id, name) {
    for (const s of this.seats) if (s.id === id) s.name = name;
    const p = this.player(id);
    if (p) p.name = name;
    const w = this.wins.get(id);
    if (w) w.name = name;
  }

  sit(user) {
    if (this.seated(user.id)) throw new Error('Bạn đã ngồi rồi');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra, đợi ván sau nhé');
    if (this.seats.length >= this.options.maxSeats) throw new Error('Bàn đã đủ người');
    this.seats.push({ id: user.id, name: user.name });
  }

  stand(id) {
    if (!this.seated(id)) return;
    const p = this.player(id);
    if (this.status === 'playing' && p && !p.done) {
      this._out(p, 'gaveUp');
      this.room.system(`${p.name} rời bàn — bỏ cuộc`);
      this._checkEnd();
    }
    this.seats = this.seats.filter((s) => s.id !== id);
    this.ready.delete(id);
  }

  onLeave(id) { this.stand(id); }

  /** Số bước tối đa đã có thể đi tính theo đồng hồ server. */
  _clockTick(now = Date.now()) {
    return Math.max(0, Math.floor((now - this.startAt) / this.tickMs));
  }

  action(id, a) {
    if (a.type === 'start') {
      if (this.status === 'playing') throw new Error('Ván đang diễn ra');
      this.ready.check(id, this.seats, 1);
      return this._start();
    }
    if (!this.seated(id)) throw new Error('Bạn đang ở chế độ xem');
    if (a.type === 'ready') {
      if (this.status === 'playing') throw new Error('Ván đang diễn ra');
      this.ready.toggle(id);
      return;
    }
    if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
    const p = this.player(id);
    if (!p) throw new Error('Bạn không chơi ván này');
    if (p.done) return; // gói tin đến trễ sau khi rắn đã chết — bỏ qua êm
    switch (a.type) {
      case 'sync': return this._sync(p, a);
      case 'giveup':
        this._out(p, 'gaveUp');
        this.room.system(`${p.name} bỏ cuộc (${p.game.score} điểm)`);
        this._checkEnd();
        return;
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  /** Nhận các lượt rẽ mới và tiến rắn tới `tick`. */
  _sync(p, a) {
    const tick = Math.floor(Number(a.tick));
    if (!Number.isFinite(tick) || tick < 0) throw new Error('Dữ liệu không hợp lệ');
    const limit = this._clockTick(Date.now() + AHEAD_SLACK_MS);
    if (tick > limit) throw new Error('Đồng hồ lệch quá nhiều');
    const list = Array.isArray(a.inputs) ? a.inputs : [];
    if (p.inputs.length + list.length > MAX_INPUTS) throw new Error('Quá nhiều lượt rẽ');
    let last = p.inputs.length ? p.inputs[p.inputs.length - 1][0] : 0;
    for (const x of list) {
      if (!Array.isArray(x)) throw new Error('Dữ liệu không hợp lệ');
      const t = Math.floor(Number(x[0]));
      const d = x[1];
      // Lượt rẽ cũ hơn chỗ server đã đi tới thì không còn sửa được — bỏ qua (client sẽ tự đồng bộ lại)
      if (!Number.isFinite(t) || t < p.game.tick || t < last || t > tick || !Object.hasOwn(DIRS, d)) continue;
      p.inputs.push([t, d]);
      last = t;
    }
    this._advance(p, tick);
  }

  _advance(p, tick) {
    const { used } = replay(null, p.inputs, tick, p.game, p.used);
    p.used = used;
    p.seq++;
    if (!p.game.alive) {
      this._out(p, 'dead');
      this.room.system(`💥 ${p.name} ${p.game.food < 0 ? 'lấp kín cả bàn!' : 'đâm phải'} — ${p.game.score} điểm, dài ${p.game.length}`);
      this._checkEnd();
    }
  }

  _out(p, why) {
    p.done = true;
    p[why] = true;
    p.endedAt = Math.max(0, Date.now() - this.startAt);
  }

  _start() {
    this.seed = (Math.random() * 2 ** 32) >>> 0;
    this.players = this.seats.map((s) => ({
      id: s.id,
      name: s.name,
      game: new SnakeGame(this.gameOpts()),
      inputs: [],
      used: 0,
      seq: 0,
      done: false,
      dead: false,
      gaveUp: false,
      timedOut: false,
      endedAt: null,
    }));
    this.status = 'playing';
    this.result = null;
    this.ready.clear();
    this.gameNo++;
    this.startAt = Date.now() + COUNTDOWN_MS;
    this.deadline = this.options.minutes ? this.startAt + this.options.minutes * 60_000 : 0;
    clearTimeout(this.timer);
    clearInterval(this.watch);
    if (this.deadline) {
      this.timer = setTimeout(() => {
        if (this.status !== 'playing') return;
        for (const p of this.players) if (!p.done) this._out(p, 'timedOut');
        this.room.system('⏰ Hết giờ!');
        this._finish();
        this.room.changed();
      }, this.deadline - Date.now());
    }
    // Nhiều người: không ai được "dừng hình" — rắn của người im lặng quá lâu vẫn tự bò tiếp
    if (this.players.length > 1) {
      this.watch = setInterval(() => this._nudge(), 1000);
    }
    const { level, maze } = this.options;
    const who = this.players.length > 1 ? `${this.players.length} người cùng đua điểm` : 'chơi một mình';
    this.room.system(`Ván ${this.gameNo}: cấp ${level}, ${MAZE_LABEL[maze]}${this.deadline ? `, ${this.options.minutes} phút` : ''} — ${who}. Chuẩn bị…`);
  }

  _nudge() {
    if (this.status !== 'playing') return;
    const min = this._clockTick(Date.now() - BEHIND_SLACK_MS);
    let moved = false;
    for (const p of this.players) {
      if (p.done || p.game.tick >= min) continue;
      this._advance(p, min);
      moved = true;
    }
    if (moved) this.room.changed();
  }

  _checkEnd() {
    if (this.status === 'playing' && this.players.every((p) => p.done)) this._finish();
  }

  _ranking() {
    return [...this.players].sort((x, y) => {
      if (x.game.score !== y.game.score) return y.game.score - x.game.score;
      if (x.gaveUp !== y.gaveUp) return x.gaveUp ? 1 : -1;
      return y.game.tick - x.game.tick || y.game.length - x.game.length;
    });
  }

  _finish() {
    clearTimeout(this.timer);
    clearInterval(this.watch);
    this.status = 'over';
    const ranking = this._ranking();
    const top = ranking[0];
    const winner = this.players.length > 1 && top && top.game.score > 0 ? top.id : null;
    this.result = { winner, ranking: ranking.map((p) => p.id), endedAt: Date.now() };
    for (const p of this.players) {
      const w = this.wins.get(p.id) || { id: p.id, name: p.name, games: 0, wins: 0, best: 0, longest: 0 };
      w.name = p.name;
      w.games++;
      if (p.id === winner) w.wins++;
      w.best = Math.max(w.best, p.game.score);
      w.longest = Math.max(w.longest, p.game.length);
      this.wins.set(p.id, w);
    }
    const line = ranking.map((p, i) => `${i + 1}. ${p.name} (${p.game.score})`).join(', ');
    if (this.players.length > 1) this.room.system(`🏁 ${winner ? `${this.player(winner).name} thắng!` : 'Không ai thắng'} Xếp hạng: ${line}`);
    else this.room.system(`🏁 Kết thúc: ${line}`);
  }

  view(viewerId) {
    const playing = this.status === 'playing';
    const now = Date.now();
    return {
      options: this.options,
      seats: this.seats,
      ...this.ready.view(this.seats.map((x) => x.id)),
      status: this.status,
      gameNo: this.gameNo,
      myId: this.seated(viewerId) ? viewerId : null,
      seed: this.status === 'waiting' ? 0 : this.seed,
      tickMs: this.tickMs,
      startIn: playing ? this.startAt - now : 0, // âm = đã chạy được chừng ấy ms
      timeLeft: playing && this.deadline ? Math.max(0, this.deadline - now) : 0,
      timeTotal: this.options.minutes * 60_000,
      solo: this.players.length <= 1,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: p.game.score,
        length: p.game.length,
        eaten: p.game.eaten,
        tick: p.game.tick,
        accepted: p.inputs.length,
        done: p.done,
        dead: p.dead,
        gaveUp: p.gaveUp,
        timedOut: p.timedOut,
        endedAt: p.endedAt,
        seq: p.seq,
        ...p.game.snapshot(),
      })),
      result: this.result,
      wins: [...this.wins.values()].sort((x, y) => y.wins - x.wins || y.best - x.best),
    };
  }

  dispose() {
    clearTimeout(this.timer);
    clearInterval(this.watch);
  }
}

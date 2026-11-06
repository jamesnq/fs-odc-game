import { createBoard, OnetBoard, rng } from '@game/shared/onet';
import { bool, clampInt } from './options.js';
import { ReadyGate } from './ready.js';

// Nối thú: mọi người chơi CÙNG một bàn (cùng hạt giống), mỗi người tự nối trên bàn của mình.
// Ai dọn sạch bàn trước thắng; hết giờ thì xếp theo điểm.

const cell = (p, rows, cols) => {
  if (!Array.isArray(p) || p.length !== 2) throw new Error('Ô không hợp lệ');
  const [r, c] = p.map((x) => Math.floor(Number(x)));
  if (!(r >= 0 && r < rows && c >= 0 && c < cols)) throw new Error('Ô không hợp lệ');
  return [r, c];
};

export class OnetHandler {
  constructor(room, options) {
    this.room = room;
    const rows = clampInt(options.rows, 4, 10, 9);
    let cols = clampInt(options.cols, 4, 18, 16);
    if ((rows * cols) % 2) cols = cols < 18 ? cols + 1 : cols - 1; // số ô phải chẵn
    this.options = {
      maxSeats: clampInt(options.maxSeats, 1, 8, 4),
      rows,
      cols,
      minutes: clampInt(options.minutes, 1, 30, 8),
      hints: clampInt(options.hints, 0, 20, 3),
      shuffles: clampInt(options.shuffles, 0, 20, 3),
      gravity: bool(options.gravity, false),
    };
    this.seats = [];
    this.ready = new ReadyGate(room);
    this.status = 'waiting'; // waiting | playing | over
    this.players = []; // người chơi trong ván hiện tại
    this.timer = null;
    this.startedAt = 0;
    this.deadline = 0;
    this.gameNo = 0;
    this.result = null;
    this.wins = new Map();
  }

  get maxPlayers() { return this.options.maxSeats; }
  playerIds() { return this.seats.map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  seated(id) { return this.seats.some((s) => s.id === id); }
  player(id) { return this.players.find((p) => p.id === id); }

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
      p.gaveUp = true;
      p.done = true;
      this.room.system(`${p.name} rời bàn — bỏ cuộc`);
      this._checkEnd();
    }
    this.seats = this.seats.filter((s) => s.id !== id);
    this.ready.delete(id);
  }

  onLeave(id) { this.stand(id); }

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
    if (p.done) throw new Error(p.gaveUp ? 'Bạn đã bỏ cuộc' : 'Bạn đã dọn xong bàn');
    const { rows, cols } = this.options;
    switch (a.type) {
      case 'match': {
        const x = cell(a.a, rows, cols);
        const y = cell(a.b, rows, cols);
        const { path, points, autoShuffled } = p.board.match(x, y);
        p.seq++;
        p.last = { seq: p.seq, path, cells: [x, y], points, combo: p.board.combo, autoShuffled };
        p.hint = null;
        if (p.board.cleared) {
          p.done = true;
          p.finishedAt = Date.now() - this.startedAt;
          const bonus = Math.ceil(Math.max(0, this.deadline - Date.now()) / 1000);
          p.board.score += bonus;
          p.bonus = bonus;
          const rank = this.players.filter((q) => q.finishedAt != null).length;
          this.room.system(`${rank === 1 ? '🏆' : '✅'} ${p.name} dọn sạch bàn sau ${fmtDur(p.finishedAt)} (thưởng ${bonus} điểm thời gian)`);
          this._checkEnd();
        }
        return;
      }
      case 'hint': {
        if (p.hintsLeft <= 0) throw new Error('Hết lượt gợi ý');
        p.hintsLeft--;
        p.hint = p.board.hint();
        p.seq++;
        return;
      }
      case 'shuffle': {
        if (p.shufflesLeft <= 0) throw new Error('Hết lượt đổi hình');
        p.shufflesLeft--;
        p.board.shuffle();
        p.hint = null;
        p.seq++;
        p.last = null;
        return;
      }
      case 'giveup': {
        p.gaveUp = true;
        p.done = true;
        this.room.system(`${p.name} bỏ cuộc`);
        this._checkEnd();
        return;
      }
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  _start() {
    const seed = (Math.random() * 2 ** 32) >>> 0;
    const { rows, cols, gravity, hints, shuffles } = this.options;
    const grid = createBoard(rows, cols, seed);
    this.players = this.seats.map((s, i) => ({
      id: s.id,
      name: s.name,
      board: new OnetBoard(grid, { gravity, rand: rng(seed + 1 + i) }),
      hintsLeft: hints,
      shufflesLeft: shuffles,
      hint: null,
      last: null,
      seq: 0,
      done: false,
      gaveUp: false,
      finishedAt: null,
      bonus: 0,
    }));
    this.status = 'playing';
    this.result = null;
    this.ready.clear();
    this.gameNo++;
    this.startedAt = Date.now();
    const ms = this.options.minutes * 60_000;
    this.deadline = this.startedAt + ms;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.status !== 'playing') return;
      this.room.system('⏰ Hết giờ!');
      this._finish();
      this.room.changed();
    }, ms);
    const who = this.players.length > 1 ? `${this.players.length} người cùng đua trên một bàn` : 'chơi một mình';
    this.room.system(`Ván ${this.gameNo} bắt đầu: ${rows}×${cols} ô, ${this.options.minutes} phút — ${who}. Nối nhanh lên!`);
  }

  _checkEnd() {
    if (this.status === 'playing' && this.players.every((p) => p.done)) this._finish();
  }

  _ranking() {
    return [...this.players].sort((x, y) => {
      const fx = x.finishedAt ?? Infinity, fy = y.finishedAt ?? Infinity;
      if (fx !== fy) return fx - fy;
      if (x.gaveUp !== y.gaveUp) return x.gaveUp ? 1 : -1;
      return y.board.score - x.board.score || y.board.pairs - x.board.pairs;
    });
  }

  _finish() {
    clearTimeout(this.timer);
    this.status = 'over';
    const ranking = this._ranking();
    const top = ranking[0];
    const winner = top && top.board.pairs > 0 && !top.gaveUp ? top.id : null;
    this.result = { winner, ranking: ranking.map((p) => p.id), endedAt: Date.now() };
    for (const p of this.players) {
      const w = this.wins.get(p.id) || { id: p.id, name: p.name, games: 0, wins: 0, best: 0, clears: 0 };
      w.name = p.name;
      w.games++;
      if (p.id === winner && this.players.length > 1) w.wins++;
      if (p.finishedAt != null) w.clears++;
      w.best = Math.max(w.best, p.board.score);
      this.wins.set(p.id, w);
    }
    const line = ranking.map((p, i) => `${i + 1}. ${p.name} (${p.board.score})`).join(', ');
    if (this.players.length > 1) this.room.system(`🏁 ${winner ? `${this.player(winner).name} thắng!` : 'Không ai thắng'} Xếp hạng: ${line}`);
    else this.room.system(`🏁 Kết thúc: ${line}`);
  }

  view(viewerId) {
    const playing = this.status === 'playing';
    return {
      options: this.options,
      seats: this.seats,
      ...this.ready.view(this.seats.map((x) => x.id)),
      status: this.status,
      gameNo: this.gameNo,
      myId: this.seated(viewerId) ? viewerId : null,
      timeLeft: playing ? Math.max(0, this.deadline - Date.now()) : 0,
      timeTotal: this.options.minutes * 60_000,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        grid: p.board.grid,
        left: p.board.left,
        pairs: p.board.pairs,
        score: p.board.score,
        combo: p.board.combo,
        done: p.done,
        gaveUp: p.gaveUp,
        finishedAt: p.finishedAt,
        bonus: p.bonus,
        seq: p.seq,
        last: p.last,
        // Gợi ý và lượt còn lại chỉ người đó thấy
        ...(p.id === viewerId ? { hint: p.hint, hintsLeft: p.hintsLeft, shufflesLeft: p.shufflesLeft } : {}),
      })),
      result: this.result,
      wins: [...this.wins.values()].sort((x, y) => y.wins - x.wins || y.best - x.best),
    };
  }

  dispose() { clearTimeout(this.timer); }
}

function fmtDur(ms) {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Khung chung cho game cờ đối kháng 2 người có đồng hồ (Cờ tướng, Cờ caro):
// ngồi / sẵn sàng / chơi lại, đồng hồ mỗi bên, cầu hòa, xin đi lại, xin thua, bảng điểm.
import { Scoreboard } from './scoreboard.js';
import { ReadyGate } from './ready.js';

const BASE_REASONS = {
  timeout: 'Hết giờ',
  resign: 'Xin thua',
  draw: 'Hai bên đồng ý hòa',
  leave: 'Rời bàn',
};

/**
 * Lớp con khai báo:
 *   static SIDES   ví dụ ['r', 'b'] — bên đi trước đứng đầu
 *   static LABELS  tên hiển thị của mỗi bên, ví dụ { r: 'Đỏ', b: 'Đen' }
 *   static REASONS lý do kết thúc riêng của game
 *   _newGame()          ván mới (trạng thái từ @game/shared)
 *   _move(game, a)      áp dụng nước đi, trả về trạng thái mới
 *   _undo(game, n)      lùi n nước
 *   _boardView()        phần trạng thái bàn cờ gửi cho client
 *   _resultDetails(r)   (tùy chọn) thông tin thêm khi ván tự kết thúc
 */
export class DuelHandler {
  constructor(room, options) {
    this.room = room;
    this.options = options; // ít nhất { minutes }
    const [a, b] = this.constructor.SIDES;
    this.sides = [a, b];
    this.seats = { [a]: null, [b]: null }; // { id, name }
    this.ready = new ReadyGate(room); // sẵn sàng → chủ phòng bấm bắt đầu (cả ván đầu lẫn chơi lại)
    this.status = 'waiting'; // waiting | playing | over
    this.game = this._newGame();
    this.clocks = this._fullClocks();
    this.turnStart = 0;
    this.pending = null; // { type: 'draw'|'undo', from: side }
    this.result = null;
    this.timer = null;
    this.gameNo = 0;
    this.score = new Scoreboard();
  }

  get maxPlayers() { return 2; }
  playerIds() { return Object.values(this.seats).filter(Boolean).map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  sideOf(id) { return this.sides.find((c) => this.seats[c]?.id === id) || null; }
  other(side) { return side === this.sides[0] ? this.sides[1] : this.sides[0]; }

  _fullClocks() { return Object.fromEntries(this.sides.map((c) => [c, this.options.minutes * 60000])); }
  _label(side) { return this.seats[side]?.name || this.constructor.LABELS[side]; }
  _resultDetails() { return {}; }

  rename(id, name) {
    const c = this.sideOf(id);
    if (c) this.seats[c].name = name;
    this.score.rename(id, name);
  }

  sit(user, seat) {
    if (this.sideOf(user.id)) throw new Error('Bạn đã ngồi rồi');
    const side = this.sides.includes(seat) ? seat : this.sides.find((c) => !this.seats[c]);
    if (!side || this.seats[side]) throw new Error('Bàn đã đủ người');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
    this.seats[side] = { id: user.id, name: user.name };
  }

  stand(id) {
    const c = this.sideOf(id);
    if (!c) return;
    if (this.status === 'playing') this._end(this.other(c), 'leave');
    this.seats[c] = null;
    this.ready.delete(id);
    if (this.status === 'over' && !this.playerIds().length) this.status = 'waiting';
  }

  onLeave(id) { this.stand(id); }

  _start() {
    // Chơi lại sau một ván: đổi bên đi trước
    if (this.status === 'over') {
      const [x, y] = this.sides;
      [this.seats[x], this.seats[y]] = [this.seats[y], this.seats[x]];
    }
    this.game = this._newGame();
    this.clocks = this._fullClocks();
    this.turnStart = Date.now();
    this.status = 'playing';
    this.pending = null;
    this.result = null;
    this.ready.clear();
    this.gameNo++;
    const [a, b] = this.sides;
    const { LABELS } = this.constructor;
    this.room.system(`Ván ${this.gameNo} bắt đầu: ${this.seats[a].name} (${LABELS[a]}) – ${this.seats[b].name} (${LABELS[b]})`);
    this._schedule();
  }

  /** Trừ thời gian đã dùng của bên đang đi; trả về true nếu bên đó hết giờ. */
  _chargeClock() {
    const now = Date.now();
    this.clocks[this.game.turn] -= now - this.turnStart;
    this.turnStart = now;
    return this.clocks[this.game.turn] <= 0;
  }

  _schedule() {
    clearTimeout(this.timer);
    if (this.status !== 'playing') return;
    const left = this.clocks[this.game.turn] - (Date.now() - this.turnStart);
    this.timer = setTimeout(() => {
      if (this.status !== 'playing') return;
      if (this._chargeClock()) {
        this._timeout(this.game.turn);
        this.room.changed();
      } else this._schedule();
    }, Math.max(0, left) + 50);
  }

  _timeout(side) {
    this.clocks[side] = 0;
    this._end(this.other(side), 'timeout');
  }

  _end(winner, reason, details = {}) {
    const started = this.status === 'playing';
    if (started) this._chargeClock();
    clearTimeout(this.timer);
    this.status = 'over';
    this.pending = null;
    const text = this.constructor.REASONS[reason] || BASE_REASONS[reason] || reason;
    this.result = { winner, reason, text, ...details };
    this.room.system(`Kết thúc: ${winner ? `${this._label(winner)} thắng` : 'Hòa'} — ${text}`);
    const [a, b] = this.sides.map((c) => this.seats[c] && { ...this.seats[c], side: c });
    if (started && a && b) {
      this.score.record([a, b], winner ? this.seats[winner].id : null, text, this.game.history.length);
      this.room.system(`Tỉ số: ${this.score.line(a, b)}`);
    }
  }

  _requirePlaying() {
    if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
  }

  action(id, a) {
    if (a.type === 'resetScore') return this._resetScore(id);
    if (a.type === 'start') {
      if (this.status === 'playing') throw new Error('Ván đang diễn ra');
      if (!this.sides.every((s) => this.seats[s])) throw new Error('Cần đủ 2 người ngồi bàn');
      this.ready.check(id, this.sides.map((s) => this.seats[s]));
      return this._start();
    }
    const c = this.sideOf(id);
    if (!c) throw new Error('Bạn đang ở chế độ xem');
    const opp = this.other(c);
    switch (a.type) {
      case 'ready':
      case 'rematch': {
        if (this.status === 'playing') throw new Error('Ván đang diễn ra');
        this.ready.toggle(id);
        if (this.status === 'over' && this.ready.has(id)) this.room.system(`${this.seats[c].name} muốn chơi lại`);
        return;
      }
      case 'move': {
        this._requirePlaying();
        if (this.game.turn !== c) throw new Error('Chưa tới lượt bạn');
        if (this._chargeClock()) return this._timeout(c);
        this.game = this._move(this.game, a);
        this.turnStart = Date.now();
        this.pending = null;
        const r = this.game.result;
        if (r) return this._end(r.winner, r.reason, this._resultDetails(r));
        this._schedule();
        return;
      }
      case 'resign':
        this._requirePlaying();
        return this._end(opp, 'resign');
      case 'offerDraw':
      case 'requestUndo': {
        this._requirePlaying();
        if (this.pending) throw new Error('Đang có một yêu cầu chờ trả lời');
        const draw = a.type === 'offerDraw';
        if (!draw && !this._undoCount(c)) throw new Error('Không có nước nào để đi lại');
        this.pending = { type: draw ? 'draw' : 'undo', from: c };
        this.room.system(`${this.seats[c].name} ${draw ? 'cầu hòa' : 'xin đi lại'}`);
        return;
      }
      case 'cancelRequest':
        if (this.pending?.from === c) this.pending = null;
        return;
      case 'respond':
        return this._respond(c, !!a.accept);
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  _resetScore(id) {
    if (id !== this.room.ownerId) throw new Error('Chỉ chủ phòng mới được đặt lại bảng điểm');
    if (this.status === 'playing') throw new Error('Không thể đặt lại khi ván đang diễn ra');
    this.score.reset();
    this.room.system('Chủ phòng đã đặt lại bảng điểm');
  }

  /** Trả lời yêu cầu cầu hòa / xin đi lại của đối thủ. */
  _respond(c, accept) {
    const opp = this.other(c);
    const p = this.pending;
    if (!p || p.from !== opp) throw new Error('Không có yêu cầu nào');
    this.pending = null;
    if (!accept) {
      this.room.system(`${this.seats[c].name} từ chối ${p.type === 'draw' ? 'cầu hòa' : 'đi lại'}`);
      return;
    }
    if (p.type === 'draw') return this._end(null, 'draw');
    const n = this._undoCount(opp);
    if (!n) return;
    this._chargeClock();
    this.game = this._undo(this.game, n);
    this.turnStart = Date.now();
    this.room.system(`${this.seats[c].name} đồng ý cho đi lại`);
    this._schedule();
  }

  /** Số nước cần lùi để quay về lượt của `side`. */
  _undoCount(side) {
    const h = this.game.history.length;
    if (this.game.turn === side) return h >= 2 ? 2 : 0; // đối thủ vừa đi: lùi 2 nước
    return h >= 1 ? 1 : 0; // mình vừa đi: lùi 1 nước
  }

  view(viewerId) {
    const playing = this.status === 'playing';
    const clocks = { ...this.clocks };
    if (playing) clocks[this.game.turn] = Math.max(0, clocks[this.game.turn] - (Date.now() - this.turnStart));
    return {
      options: this.options,
      seats: this.seats,
      // Bên nào đã sẵn sàng (chủ phòng không cần bấm) và còn chờ ai
      ready: Object.fromEntries(this.sides.map((c) => [c, !!this.seats[c] && this.ready.has(this.seats[c].id)])),
      waitingFor: this.ready.waitingFor(this.playerIds()),
      status: this.status,
      ...this._boardView(),
      clocks,
      running: playing,
      pending: this.pending,
      result: this.result,
      myColor: this.sideOf(viewerId),
      score: this.score.view(),
    };
  }

  dispose() { clearTimeout(this.timer); }
}

import { createGame, makeMove, undoMoves, coord, other, MIN_SIZE, MAX_SIZE } from '@game/shared/caro';

const REASON = {
  five: 'Đủ 5 quân liên tiếp',
  full: 'Kín bàn',
  timeout: 'Hết giờ',
  resign: 'Xin thua',
  draw: 'Hai bên đồng ý hòa',
  leave: 'Rời bàn',
};
const NAME = { x: 'X', o: 'O' };

export class CaroHandler {
  constructor(room, options) {
    this.room = room;
    const minutes = Math.min(60, Math.max(1, Number(options.minutes) || 10));
    const size = Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.floor(Number(options.size)) || 15));
    const blockTwoEnds = options.blockTwoEnds === undefined ? true : !!options.blockTwoEnds && options.blockTwoEnds !== 'false';
    this.options = { minutes, size, blockTwoEnds };
    this.seats = { x: null, o: null }; // { id, name }
    this.ready = { x: false, o: false };
    this.rematch = { x: false, o: false };
    this.status = 'waiting'; // waiting | playing | over
    this.game = this._newGame();
    this.clocks = { x: minutes * 60000, o: minutes * 60000 };
    this.turnStart = 0;
    this.pending = null; // { type: 'draw'|'undo', from: 'x'|'o' }
    this.result = null;
    this.timer = null;
    this.gameNo = 0;
  }

  _newGame() { return createGame({ size: this.options.size, blockTwoEnds: this.options.blockTwoEnds }); }

  get maxPlayers() { return 2; }
  playerIds() { return Object.values(this.seats).filter(Boolean).map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  colorOf(id) { return this.seats.x?.id === id ? 'x' : this.seats.o?.id === id ? 'o' : null; }

  rename(id, name) {
    for (const c of ['x', 'o']) if (this.seats[c]?.id === id) this.seats[c].name = name;
  }

  sit(user, seat) {
    if (this.colorOf(user.id)) throw new Error('Bạn đã ngồi rồi');
    const color = seat === 'x' || seat === 'o' ? seat : !this.seats.x ? 'x' : !this.seats.o ? 'o' : null;
    if (!color || this.seats[color]) throw new Error('Bàn đã đủ người');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
    this.seats[color] = { id: user.id, name: user.name };
    this.ready = { x: false, o: false };
    this.rematch = { x: false, o: false };
  }

  stand(id) {
    const c = this.colorOf(id);
    if (!c) return;
    if (this.status === 'playing') this._end(other(c), 'leave');
    this.seats[c] = null;
    this.ready = { x: false, o: false };
    this.rematch = { x: false, o: false };
    if (this.status === 'over' && !this.seats.x && !this.seats.o) this.status = 'waiting';
  }

  onLeave(id) { this.stand(id); }

  _start() {
    const ms = this.options.minutes * 60000;
    this.game = this._newGame();
    this.clocks = { x: ms, o: ms };
    this.turnStart = Date.now();
    this.status = 'playing';
    this.pending = null;
    this.result = null;
    this.ready = { x: false, o: false };
    this.rematch = { x: false, o: false };
    this.gameNo++;
    this.room.system(`Ván ${this.gameNo} bắt đầu: ${this.seats.x.name} (X) – ${this.seats.o.name} (O)`);
    this._schedule();
  }

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
        this.clocks[this.game.turn] = 0;
        this._end(other(this.game.turn), 'timeout');
        this.room.changed();
      } else this._schedule();
    }, Math.max(0, left) + 50);
  }

  _end(winner, reason, line = null) {
    if (this.status === 'playing') this._chargeClock();
    clearTimeout(this.timer);
    this.status = 'over';
    this.pending = null;
    this.result = { winner, reason, text: REASON[reason] || reason, line };
    const who = winner ? `${this.seats[winner]?.name || NAME[winner]} thắng` : 'Hòa';
    this.room.system(`Kết thúc: ${who} — ${this.result.text}`);
  }

  action(id, a) {
    const c = this.colorOf(id);
    if (!c) throw new Error('Bạn đang ở chế độ xem');
    const opp = other(c);
    switch (a.type) {
      case 'ready': {
        if (this.status === 'playing') throw new Error('Ván đang diễn ra');
        if (this.status === 'over') return this.action(id, { type: 'rematch' });
        this.ready[c] = !this.ready[c];
        if (this.ready.x && this.ready.o && this.seats.x && this.seats.o) this._start();
        return;
      }
      case 'rematch': {
        if (this.status !== 'over') throw new Error('Ván chưa kết thúc');
        if (!this.seats[opp]) throw new Error('Chưa có đối thủ');
        this.rematch[c] = true;
        if (this.rematch.x && this.rematch.o) {
          [this.seats.x, this.seats.o] = [this.seats.o, this.seats.x]; // đổi lượt đi trước
          this._start();
        } else this.room.system(`${this.seats[c].name} muốn chơi lại`);
        return;
      }
      case 'move': {
        if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
        if (this.game.turn !== c) throw new Error('Chưa tới lượt bạn');
        if (this._chargeClock()) {
          this.clocks[c] = 0;
          return this._end(opp, 'timeout');
        }
        this.game = makeMove(this.game, Number(a.cell));
        this.turnStart = Date.now();
        this.pending = null;
        const r = this.game.result;
        if (r) return this._end(r.winner, r.reason, r.line);
        this._schedule();
        return;
      }
      case 'resign':
        if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
        return this._end(opp, 'resign');
      case 'offerDraw':
      case 'requestUndo': {
        if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
        if (this.pending) throw new Error('Đang có một yêu cầu chờ trả lời');
        if (a.type === 'requestUndo' && !this._undoCount(c)) throw new Error('Không có nước nào để đi lại');
        this.pending = { type: a.type === 'offerDraw' ? 'draw' : 'undo', from: c };
        this.room.system(`${this.seats[c].name} ${a.type === 'offerDraw' ? 'cầu hòa' : 'xin đi lại'}`);
        return;
      }
      case 'cancelRequest':
        if (this.pending?.from === c) this.pending = null;
        return;
      case 'respond': {
        const p = this.pending;
        if (!p || p.from !== opp) throw new Error('Không có yêu cầu nào');
        this.pending = null;
        if (!a.accept) {
          this.room.system(`${this.seats[c].name} từ chối ${p.type === 'draw' ? 'cầu hòa' : 'đi lại'}`);
          return;
        }
        if (p.type === 'draw') return this._end(null, 'draw');
        const n = this._undoCount(opp);
        if (!n) return;
        this._chargeClock();
        this.game = undoMoves(this.game, n);
        this.turnStart = Date.now();
        this.room.system(`${this.seats[c].name} đồng ý cho đi lại`);
        this._schedule();
        return;
      }
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  /** Số nước cần lùi để quay về lượt của `color`. */
  _undoCount(color) {
    const h = this.game.history.length;
    if (this.game.turn === color) return h >= 2 ? 2 : 0;
    return h >= 1 ? 1 : 0;
  }

  view(viewerId) {
    const now = Date.now();
    const clocks = { ...this.clocks };
    if (this.status === 'playing') clocks[this.game.turn] = Math.max(0, clocks[this.game.turn] - (now - this.turnStart));
    const { size, board, turn, history } = this.game;
    return {
      options: this.options,
      seats: this.seats,
      ready: this.ready,
      rematch: this.rematch,
      status: this.status,
      size,
      board,
      turn,
      moves: history.map((m) => ({ cell: m.i, p: m.p, san: coord(size, m.i) })),
      lastMove: history.length ? history[history.length - 1].i : null,
      clocks,
      running: this.status === 'playing',
      pending: this.pending,
      result: this.result,
      myColor: this.colorOf(viewerId),
    };
  }

  dispose() { clearTimeout(this.timer); }
}

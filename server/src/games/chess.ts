import type { Room } from '../lobby.js';
import { Scoreboard } from './scoreboard.js';
import { createGame, makeMove, undoMoves, isInCheck, other } from '@game/shared/chess';
import type { ChessState } from '@game/shared/chess';
import type { GameAction, Identity } from '@game/shared/contracts';
import type { ChessView } from '@game/shared/views';

type Color = 'w' | 'b';
interface ChessRequest { type: 'draw' | 'undo'; from: Color }
interface ChessResult { winner: string | null; reason: string; text: string }

const REASON: Record<string, string> = {
  checkmate: 'Chiếu bí',
  stalemate: 'Hòa pat (hết nước đi)',
  timeout: 'Hết giờ',
  resign: 'Xin thua',
  draw: 'Hai bên đồng ý hòa',
  insufficient: 'Hòa do không đủ lực lượng chiếu bí',
  repetition: 'Hòa do lặp lại thế cờ 3 lần',
  fifty_moves: 'Hòa theo luật 50 nước',
  leave: 'Rời bàn',
};

const asColor = (c: string | null): Color | null => (c === 'w' || c === 'b' ? c : null);

export class ChessHandler {
  declare room: Room;
  declare options: { minutes: number };
  declare seats: Record<Color, Identity | null>;
  declare ready: Record<Color, boolean>;
  declare rematch: Record<Color, boolean>;
  declare status: string;
  declare game: ChessState;
  declare clocks: Record<string, number>;
  declare turnStart: number;
  declare pending: ChessRequest | null;
  declare result: ChessResult | null;
  declare timer: ReturnType<typeof setTimeout> | null;
  declare gameNo: number;
  declare score: Scoreboard;

  static maxPlayers = 2;

  constructor(room: Room, options: Record<string, unknown>) {
    this.room = room;
    const minutes = Math.min(60, Math.max(1, Number(options.minutes) || 10));
    this.options = { minutes };
    this.seats = { w: null, b: null }; // { id, name }
    this.ready = { w: false, b: false };
    this.rematch = { w: false, b: false };
    this.status = 'waiting'; // waiting | playing | over
    this.game = createGame();
    this.clocks = { w: minutes * 60000, b: minutes * 60000 };
    this.turnStart = 0;
    this.pending = null; // { type: 'draw' | 'undo', from: 'w' | 'b' }
    this.result = null;
    this.timer = null;
    this.gameNo = 0;
    this.score = new Scoreboard();
  }

  get maxPlayers() { return 2; }
  playerIds() { return Object.values(this.seats).filter((s) => s != null).map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  colorOf(id: string): Color | null { return this.seats.w?.id === id ? 'w' : this.seats.b?.id === id ? 'b' : null; }

  rename(id: string, name: string) {
    for (const c of ['w', 'b'] as const) { const seat = this.seats[c]; if (seat?.id === id) seat.name = name; }
    this.score.rename(id, name);
  }

  sit(user: Identity, seat?: string | number) {
    if (this.colorOf(user.id)) throw new Error('Bạn đã ngồi rồi');
    const color = seat === 'w' || seat === 'b' ? seat : !this.seats.w ? 'w' : !this.seats.b ? 'b' : null;
    if (!color || this.seats[color]) throw new Error('Bàn đã đủ người');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
    this.seats[color] = { id: user.id, name: user.name };
    this.ready = { w: false, b: false };
    this.rematch = { w: false, b: false };
  }

  stand(id: string) {
    const c = this.colorOf(id);
    if (!c) return;
    if (this.status === 'playing') this._end(other(c), 'leave');
    this.seats[c] = null;
    this.ready = { w: false, b: false };
    this.rematch = { w: false, b: false };
    if (this.status === 'over' && !this.seats.w && !this.seats.b) this.status = 'waiting';
  }

  onLeave(id: string) { this.stand(id); }

  _start() {
    const ms = this.options.minutes * 60000;
    this.game = createGame();
    this.clocks = { w: ms, b: ms };
    this.turnStart = Date.now();
    this.status = 'playing';
    this.pending = null;
    this.result = null;
    this.ready = { w: false, b: false };
    this.rematch = { w: false, b: false };
    this.gameNo++;
    this.room.system(`Ván ${this.gameNo} bắt đầu: ${this.seats.w?.name} (Trắng) – ${this.seats.b?.name} (Đen)`);
    this._schedule();
  }

  _chargeClock() {
    const now = Date.now();
    this.clocks[this.game.turn] -= now - this.turnStart;
    this.turnStart = now;
    return this.clocks[this.game.turn] <= 0;
  }

  _schedule() {
    clearTimeout(this.timer ?? undefined);
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

  _end(winner: Color | null, reason: string) {
    if (this.status === 'playing') this._chargeClock();
    clearTimeout(this.timer ?? undefined);
    const started = this.status === 'playing';
    this.status = 'over';
    this.pending = null;
    const text = REASON[reason] || reason;
    this.result = { winner, reason, text };
    const who = winner ? `${this.seats[winner]?.name || (winner === 'w' ? 'Trắng' : 'Đen')} thắng` : 'Hòa';
    this.room.system(`Kết thúc: ${who} — ${text}`);
    const [a, b] = (['w', 'b'] as const).map((c) => this.seats[c] && { ...this.seats[c], side: c });
    if (started && a && b) {
      this.score.record([a, b], winner ? this.seats[winner]?.id ?? null : null, text, this.game.history.length);
      this.room.system(`Tỉ số: ${this.score.line(a, b)}`);
    }
  }

  action(id: string, a: GameAction): void {
    if (a.type === 'resetScore') {
      if (id !== this.room.ownerId) throw new Error('Chỉ chủ phòng mới được đặt lại bảng điểm');
      if (this.status === 'playing') throw new Error('Không thể đặt lại khi ván đang diễn ra');
      this.score.reset();
      this.room.system('Chủ phòng đã đặt lại bảng điểm');
      return;
    }
    const c = this.colorOf(id);
    if (!c) throw new Error('Bạn đang ở chế độ xem');
    const opp = other(c);
    switch (a.type) {
      case 'ready': {
        if (this.status === 'playing') throw new Error('Ván đang diễn ra');
        if (this.status === 'over') return this.action(id, { type: 'rematch' });
        this.ready[c] = !this.ready[c];
        if (this.ready.w && this.ready.b && this.seats.w && this.seats.b) this._start();
        return;
      }
      case 'rematch': {
        if (this.status !== 'over') throw new Error('Ván chưa kết thúc');
        if (!this.seats[opp]) throw new Error('Chưa có đối thủ');
        this.rematch[c] = true;
        if (this.rematch.w && this.rematch.b) {
          [this.seats.w, this.seats.b] = [this.seats.b, this.seats.w]; // đổi màu
          this._start();
        } else this.room.system(`${this.seats[c]?.name} muốn chơi lại`);
        return;
      }
      case 'move': {
        if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
        if (this.game.turn !== c) throw new Error('Chưa tới lượt bạn');
        if (this._chargeClock()) {
          this.clocks[c] = 0;
          return this._end(opp, 'timeout');
        }
        const move = 'from' in a ? a : { from: undefined, to: undefined, promotion: undefined };
        this.game = makeMove(this.game, Number(move.from), Number(move.to), move.promotion || 'Q');
        this.turnStart = Date.now();
        this.pending = null;
        if (this.game.result) return this._end(asColor(this.game.result.winner), this.game.result.reason);
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
        if (a.type === 'requestUndo') {
          const n = this._undoCount(c);
          if (!n) throw new Error('Không có nước nào để đi lại');
        }
        this.pending = { type: a.type === 'offerDraw' ? 'draw' : 'undo', from: c };
        this.room.system(`${this.seats[c]?.name} ${a.type === 'offerDraw' ? 'cầu hòa' : 'xin đi lại'}`);
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
          this.room.system(`${this.seats[c]?.name} từ chối ${p.type === 'draw' ? 'cầu hòa' : 'đi lại'}`);
          return;
        }
        if (p.type === 'draw') return this._end(null, 'draw');
        const n = this._undoCount(opp);
        if (!n) return;
        this._chargeClock();
        this.game = undoMoves(this.game, n);
        this.turnStart = Date.now();
        this.room.system(`${this.seats[c]?.name} đồng ý cho đi lại`);
        this._schedule();
        return;
      }
      default:
        throw new Error('Hành động không hợp lệ');
    }
  }

  /** Số nước cần lùi để quay về lượt của `color` */
  _undoCount(color: Color) {
    const h = this.game.history.length;
    if (this.game.turn === color) return h >= 2 ? 2 : 0; // đối thủ vừa đi: lùi 2 nước
    return h >= 1 ? 1 : 0; // mình vừa đi: lùi 1 nước
  }

  view(viewerId: string): ChessView {
    const now = Date.now();
    const clocks = { ...this.clocks };
    if (this.status === 'playing') clocks[this.game.turn] = Math.max(0, clocks[this.game.turn] - (now - this.turnStart));
    const last = this.game.history[this.game.history.length - 1] || null;
    return {
      options: this.options,
      seats: this.seats,
      ready: this.ready,
      rematch: this.rematch,
      status: this.status,
      board: this.game.board,
      turn: this.game.turn,
      moves: this.game.history.map((m) => ({
        san: m.san,
        from: m.from,
        to: m.to,
        piece: m.piece,
        captured: m.captured,
        promotion: m.promotion,
        check: m.check,
        checkmate: m.checkmate,
      })),
      lastMove: last && { from: last.from, to: last.to },
      inCheck: this.status === 'playing' && isInCheck(this.game.board, this.game.turn),
      clocks,
      running: this.status === 'playing',
      pending: this.pending,
      result: this.result,
      myColor: this.colorOf(viewerId),
      score: this.score.view(),
    };
  }

  dispose() { clearTimeout(this.timer ?? undefined); }
}

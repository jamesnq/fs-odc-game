import type { Room } from '../lobby.js';
import type { GameAction, Identity } from '@game/shared/contracts';
import type { BotMove } from '../botPool.js';
import type { MoveAction, Seat } from './types.js';
import type { DuelView } from '@game/shared/views';
// Khung chung cho game cờ đối kháng 2 người có đồng hồ (Cờ tướng, Cờ caro):
// ngồi / sẵn sàng / chơi lại, đồng hồ mỗi bên, cầu hòa, xin đi lại, xin thua, bảng điểm.
import { Scoreboard } from './scoreboard.js';
import { ReadyGate } from './ready.js';
import { BOT_LEVEL_NAMES, botLevel, isBot, requireBotManager, thinkMs } from './bots.js';

const BASE_REASONS: Record<string, string> = {
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
 *   _botMove(game, lv)  (tùy chọn) nước đi của máy — có hàm này thì bàn cho phép chơi với máy
 *
 * Máy (bot) ngồi một ghế như người chơi, luôn sẵn sàng (chủ phòng bấm Bắt đầu là chơi), đồng ý cho đi lại,
 * từ chối cầu hòa (trừ khi bàn gần kín). Mỗi bàn tối đa một máy.
 */
export interface DuelGame {
  turn: string;
  board: readonly unknown[];
  history: readonly unknown[];
  result?: { winner: string | null; reason: string } | null;
}
export interface DuelOptions { minutes: number }
interface DuelRequest { type: 'draw' | 'undo'; from: string }
export interface DuelResult { winner: string | null; winnerName: string | null; reason: string; text: string; line?: number[] }

export abstract class DuelHandler<G extends DuelGame = DuelGame, O extends DuelOptions = DuelOptions, B extends object = object> {
  declare _botRevision: number | undefined;
  abstract _newGame(): G;
  abstract _move(game: G, action: MoveAction): G;
  abstract _undo(game: G, n: number): G;
  abstract _boardView(): B;
  _botMove?(game: G, level: string): Promise<BotMove>;
  declare static SIDES: string[];
  declare static LABELS: Record<string, string>;
  declare static REASONS: Record<string, string>;

  declare room: Room;
  declare options: O;
  declare sides: [string, string];
  declare seats: Record<string, Seat | null>;
  declare ready: ReadyGate;
  declare status: string;
  declare game: G;
  declare clocks: Record<string, number>;
  declare turnStart: number;
  declare pending: DuelRequest | null;
  declare result: DuelResult | null;
  declare timer: ReturnType<typeof setTimeout> | null;
  declare gameNo: number;
  declare score: Scoreboard;
  declare botTimer: ReturnType<typeof setTimeout> | null;

  constructor(room: Room, options: O) {
    this.room = room;
    this.options = options; // ít nhất { minutes }
    const [a, b] = (this.constructor as typeof DuelHandler).SIDES;
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
    this.botTimer = null;
  }

  get supportsBots() { return typeof this._botMove === 'function'; }
  botSide() { return this.sides.find((c) => isBot(this.seats[c]?.id)) || null; }
  botName(id: string) { return isBot(id) ? Object.values(this.seats).find((s) => s?.id === id)?.name : undefined; }

  get maxPlayers() { return 2; }
  playerIds() { return Object.values(this.seats).filter((s): s is NonNullable<typeof s> => !!s).map((s) => s.id); }
  isPlaying() { return this.status === 'playing'; }
  sideOf(id: string) { return this.sides.find((c) => this.seats[c]?.id === id) || null; }
  other(side: string) { return side === this.sides[0] ? this.sides[1] : this.sides[0]; }

  _fullClocks(): Record<string, number> { return Object.fromEntries(this.sides.map((c) => [c, this.options.minutes * 60000])); }
  _label(side: string) { return this.seats[side]?.name || (this.constructor as typeof DuelHandler).LABELS[side]; }
  _resultDetails(_result: NonNullable<G['result']>): Partial<DuelResult> { return {}; }

  rename(id: string, name: string) {
    const c = this.sideOf(id);
    if (c) this.seats[c]!.name = name;
    this.score.rename(id, name);
  }

  /** Ghế được chọn nếu hợp lệ, nếu không thì ghế trống đầu tiên. */
  _pickSide(seat: unknown) {
    return typeof seat === 'string' && this.sides.includes(seat) ? seat : this.sides.find((c) => !this.seats[c]);
  }

  sit(user: Identity, seat?: string | number) {
    if (this.sideOf(user.id)) throw new Error('Bạn đã ngồi rồi');
    const side = this._pickSide(seat);
    if (!side || this.seats[side]) throw new Error('Bàn đã đủ người');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
    this.seats[side] = { id: user.id, name: user.name };
  }

  stand(id: string) {
    const c = this.sideOf(id);
    if (!c) return;
    if (this.status === 'playing') this._end(this.other(c), 'leave');
    this.seats[c] = null;
    this.ready.delete(id);
    if (this.status === 'over' && !this.playerIds().length) this.status = 'waiting';
  }

  onLeave(id: string) { this.stand(id); }

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
    const { LABELS } = this.constructor as typeof DuelHandler;
    this.room.system(`Ván ${this.gameNo} bắt đầu: ${this.seats[a]!.name} (${LABELS[a]}) – ${this.seats[b]!.name} (${LABELS[b]})`);
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
    clearTimeout(this.timer ?? undefined);
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

  _timeout(side: string) {
    this.clocks[side] = 0;
    this._end(this.other(side), 'timeout');
  }

  _end(winner: string | null, reason: string, details: Partial<DuelResult> = {}) {
    const started = this.status === 'playing';
    if (started) this._chargeClock();
    clearTimeout(this.timer ?? undefined);
    this.status = 'over';
    this.pending = null;
    const text = (this.constructor as typeof DuelHandler).REASONS[reason] || BASE_REASONS[reason] || reason;
    this.result = { winner, winnerName: winner ? this._label(winner) : null, reason, text, ...details };
    this.room.system(`Kết thúc: ${winner ? `${this._label(winner)} thắng` : 'Hòa'} — ${text}`);
    const [a, b] = this.sides.map((c) => this.seats[c] && { ...this.seats[c], side: c });
    if (started && a && b) {
      this.score.record([a, b], winner ? this.seats[winner]!.id : null, text, this.game.history.length);
      this.room.system(`Tỉ số: ${this.score.line(a, b)}`);
    }
  }

  _requirePlaying() {
    if (this.status !== 'playing') throw new Error('Ván chưa bắt đầu');
  }

  action(id: string, a: GameAction) {
    try {
      return this._action(id, a);
    } finally {
      this._botTick();
    }
  }

  _action(id: string, a: GameAction) {
    if (a.type === 'resetScore') return this._resetScore(id);
    if (a.type === 'addBot') return this._addBot(id, a);
    if (a.type === 'removeBot') return this._removeBot(id);
    if (a.type === 'start') {
      if (this.status === 'playing') throw new Error('Ván đang diễn ra');
      const players = this.sides.map((s) => this.seats[s]).filter((s) => s != null);
      if (players.length < this.sides.length) throw new Error('Cần đủ 2 người ngồi bàn');
      this.ready.check(id, players);
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
        if (this.status === 'over' && this.ready.has(id)) this.room.system(`${this.seats[c]!.name} muốn chơi lại`);
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
        this.room.system(`${this.seats[c]!.name} ${draw ? 'cầu hòa' : 'xin đi lại'}`);
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

  // ---------- Máy ----------

  _addBot(id: string, a: { level?: string; seat?: string }) {
    if (!this.supportsBots) throw new Error('Trò chơi này chưa có chế độ chơi với máy');
    requireBotManager(this, id);
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
    if (this.botSide()) throw new Error('Bàn đã có máy');
    const level = botLevel(a.level, 'medium');
    const side = this._pickSide(a.seat);
    if (!side || this.seats[side]) throw new Error('Không còn ghế trống');
    const seat = { id: `bot:${level}`, name: `🤖 Máy (${(BOT_LEVEL_NAMES as Record<string, string>)[level]})`, bot: level };
    this.seats[side] = seat;
    this.room.system(`Đã thêm ${seat.name} vào bàn`);
  }

  _removeBot(id: string) {
    requireBotManager(this, id);
    const side = this.botSide();
    if (!side) throw new Error('Bàn không có máy');
    if (this.status === 'playing') throw new Error('Ván đang diễn ra');
    this.room.system(`Đã bỏ ${this.seats[side]!.name} khỏi bàn`);
    this.seats[side] = null;
    if (this.status === 'over' && !this.playerIds().length) this.status = 'waiting';
  }

  /** Sau mỗi thay đổi: nếu tới lượt máy (hoặc máy cần trả lời yêu cầu) thì hẹn giờ cho máy hành động. */
  _botTick() {
    this._botRevision = (this._botRevision || 0) + 1;
    const revision = this._botRevision;
    clearTimeout(this.botTimer ?? undefined);
    this.botTimer = null;
    const side = this.botSide();
    if (!side || this.status !== 'playing') return;
    const id = this.seats[side]!.id;
    const p = this.pending;
    let run: (() => void | Promise<void>) | null = null, delay = 0;
    if (p && p.from !== side) {
      delay = thinkMs(600, 1200);
      run = () => {
        // Đồng ý cho đi lại; cầu hòa chỉ đồng ý khi bàn gần kín
        const accept = p.type === 'undo' || this.game.history.length >= this.game.board.length * 0.8;
        this._action(id, { type: 'respond', accept });
      };
    } else if (!p && this.game.turn === side) {
      const level = this.seats[side]!.bot ?? 'medium';
      delay = level === 'easy' ? thinkMs(500, 1100) : thinkMs(350, 800);
      run = async () => {
        const game = this.game;
        const move = await this._botMove!(game, level);
        // A move may finish after undo, timeout, a pending request, or room disposal.
        if (this._botRevision !== revision || this.game !== game || this.status !== 'playing'
          || this.pending || this.game.turn !== side || this.seats[side]?.id !== id) return;
        // Number(null) giữ nguyên hành vi cũ: ô không hợp lệ sẽ bị engine từ chối.
        this._action(id, { type: 'move', cell: Number(move.cell) });
      };
    }
    if (!run) return;
    const act = run;
    this.botTimer = setTimeout(async () => {
      this.botTimer = null;
      if (this.status !== 'playing' || this.seats[side]?.id !== id) return;
      try {
        await act();
      } catch (e) {
        console.error('[bot]', e);
      }
      if (this._botRevision === revision) {
        this._botTick();
        this.room.changed();
      }
    }, delay);
  }

  _resetScore(id: string) {
    if (id !== this.room.ownerId) throw new Error('Chỉ chủ phòng mới được đặt lại bảng điểm');
    if (this.status === 'playing') throw new Error('Không thể đặt lại khi ván đang diễn ra');
    this.score.reset();
    this.room.system('Chủ phòng đã đặt lại bảng điểm');
  }

  /** Trả lời yêu cầu cầu hòa / xin đi lại của đối thủ. */
  _respond(c: string, accept: boolean) {
    const opp = this.other(c);
    const p = this.pending;
    if (!p || p.from !== opp) throw new Error('Không có yêu cầu nào');
    this.pending = null;
    if (!accept) {
      this.room.system(`${this.seats[c]!.name} từ chối ${p.type === 'draw' ? 'cầu hòa' : 'đi lại'}`);
      return;
    }
    if (p.type === 'draw') return this._end(null, 'draw');
    const n = this._undoCount(opp);
    if (!n) return;
    this._chargeClock();
    this.game = this._undo(this.game, n);
    this.turnStart = Date.now();
    this.room.system(`${this.seats[c]!.name} đồng ý cho đi lại`);
    this._schedule();
  }

  /** Số nước cần lùi để quay về lượt của `side`. */
  _undoCount(side: string) {
    const h = this.game.history.length;
    if (this.game.turn === side) return h >= 2 ? 2 : 0; // đối thủ vừa đi: lùi 2 nước
    return h >= 1 ? 1 : 0; // mình vừa đi: lùi 1 nước
  }

  view(viewerId: string): DuelView<O> & B {
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

  dispose() { this._botRevision = (this._botRevision || 0) + 1; clearTimeout(this.timer ?? undefined); clearTimeout(this.botTimer ?? undefined); }
}

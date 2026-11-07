import type { Room } from '../lobby.js';
import type { GameAction, Identity } from '@game/shared/contracts';
// Khung chung cho game bài đánh theo lượt quanh bàn (Tá lả, Sâm lốc):
// ghế, điểm tích lũy, người rời bàn giữa ván được máy đánh hộ, đồng hồ lượt, cam kết bộ bài.
import { randInt } from '@game/shared/cards';
import { DeckCommitments } from './fairness.js';
import { ReadyGate } from './ready.js';

const AUTO_PLAY_MS = 2000; // người rời bàn / mất kết nối: máy đánh hộ sau 2 giây

/**
 * Lớp con định nghĩa:
 *   _createGame(players, first)  ván mới (TalaGame / SamLocGame)
 *   _startMessage(players, first)
 *   _play(game, id, a)           áp dụng một hành động của người chơi
 *   _turnKey(game)               khóa thay đổi khi sang lượt mới (đặt lại đồng hồ)
 *   _resetTimer(force)           (tùy chọn) ghi đè nếu có pha đặc biệt; mặc định là đồng hồ lượt
 *   _onFinish(game)              (tùy chọn) khi ván kết thúc
 */
export interface CardGame {
  players: Identity[];
  turn: number;
  initialDeck: string[];
  result: { winner: number; scores: number[] } | null;
  indexOf(id: string): number;
  autoPlay(id: string): void;
  view(viewerId: string): object;
}
export interface CardTableOptions { maxSeats: number; unit: number; turnSeconds: number }

export abstract class CardTableHandler<G extends CardGame> {
  abstract _createGame(players: Identity[], first: number): G;
  abstract _startMessage(players: Identity[], first: number): string;
  abstract _play(game: G, id: string, action: GameAction): void;
  abstract _turnKey(game: G): string | number;
  declare room: Room;
  declare options: CardTableOptions;
  declare fair: DeckCommitments;
  declare seats: (Identity | null)[];
  declare totals: Map<string, number>;
  declare game: G | null;
  declare gameSeats: number[];
  declare left: Set<string>;
  declare ready: ReadyGate;
  declare lastWinnerId: string | null;
  declare timer: ReturnType<typeof setTimeout> | null;
  declare deadline: number;
  declare deadlineTotal: number;
  declare turnKey: string | number;
  declare gameNo: number;

  constructor(room: Room, options: CardTableOptions) {
    this.room = room;
    this.options = options; // ít nhất { maxSeats, unit, turnSeconds }
    this.fair = new DeckCommitments();
    this.seats = Array(options.maxSeats).fill(null); // { id, name }
    this.totals = new Map(); // tổng điểm tích lũy theo id
    this.game = null;
    this.gameSeats = []; // chỉ số ghế theo thứ tự người chơi trong ván
    this.left = new Set(); // người rời bàn khi đang chơi → máy đánh hộ
    this.ready = new ReadyGate(room);
    this.lastWinnerId = null;
    this.timer = null;
    this.deadline = 0;
    this.deadlineTotal = 0;
    this.turnKey = '';
    this.gameNo = 0;
  }

  get maxPlayers() { return this.options.maxSeats; }
  playerIds() { return this._seated().map((s) => s.id); }
  isPlaying() { return !!this.game && !this.game.result; }
  seatOf(id: string) { return this.seats.findIndex((s) => s && s.id === id); }
  _isAway(id: string) { return this.left.has(id) || !this.room.isOnline(id); }
  _onFinish(_game: G) {}

  rename(id: string, name: string) {
    const s = this.seats.find((x) => x && x.id === id);
    if (s) s.name = name;
    if (this.game) for (const p of this.game.players) if (p.id === id) p.name = name;
  }

  /** Ngồi vào ghế trống — kể cả khi ván đang diễn ra (ngồi chờ, vào chơi từ ván sau). */
  sit(user: Identity, seat?: string | number) {
    if (this.seatOf(user.id) >= 0) throw new Error('Bạn đã ngồi rồi');
    const s = typeof seat === 'number' && Number.isInteger(seat) ? seat : this.seats.findIndex((x) => !x);
    if (s < 0 || s >= this.seats.length || this.seats[s]) throw new Error('Không còn ghế trống');
    this.seats[s] = { id: user.id, name: user.name };
    if (!this.totals.has(user.id)) this.totals.set(user.id, 0);
  }

  stand(id: string) {
    const s = this.seatOf(id);
    if (s < 0) return;
    if (this.isPlaying() && this.game!.indexOf(id) >= 0) {
      this.left.add(id);
      this.room.system(`${this.seats[s]?.name} rời bàn, máy sẽ đánh hộ đến hết ván`);
      this._resetTimer(true);
      return; // giữ ghế đến hết ván
    }
    this.seats[s] = null;
    this.ready.delete(id);
  }

  /** Người đang ngồi bàn (theo thứ tự ghế). */
  _seated() { return this.seats.filter((s) => s != null); }

  onLeave(id: string) { this.stand(id); }

  _start() {
    const seated = this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0);
    if (seated.length < 2) throw new Error('Cần ít nhất 2 người');
    this.gameSeats = seated;
    const players = this._seated();
    let first = players.findIndex((p) => p.id === this.lastWinnerId);
    if (first < 0) first = randInt(players.length);
    this.game = this._createGame(players, first);
    this.left.clear();
    this.ready.clear();
    this.gameNo++;
    this.turnKey = '';
    this.room.system(this._startMessage(players, first));
    this._afterAction();
  }

  action(id: string, a: GameAction) {
    if (a.type === 'start') {
      if (this.isPlaying()) throw new Error('Ván đang diễn ra');
      this.ready.check(id, this._seated());
      return this._start();
    }
    if (a.type === 'ready') {
      if (this.seatOf(id) < 0) throw new Error('Bạn đang ở chế độ xem');
      if (this.isPlaying() && this.game!.indexOf(id) >= 0) throw new Error('Ván đang diễn ra');
      return this.ready.toggle(id);
    }
    const g = this.game;
    if (!g || g.result) throw new Error('Chưa có ván nào');
    if (g.indexOf(id) < 0) throw new Error('Bạn không chơi ván này');
    this._play(g, id, a);
    this._afterAction();
  }

  _afterAction() {
    const g = this.game;
    if (!g?.result) return this._resetTimer();
    const result = g.result;
    clearTimeout(this.timer ?? undefined);
    this.deadline = 0;
    g.players.forEach((p, k) => {
      this.totals.set(p.id, (this.totals.get(p.id) || 0) + result.scores[k] * this.options.unit);
    });
    this.lastWinnerId = g.players[result.winner].id;
    this._onFinish(g);
    // Giải phóng ghế người đã rời
    for (const id of this.left) {
      const s = this.seatOf(id);
      if (s >= 0) this.seats[s] = null;
      this.ready.delete(id);
    }
    this.left.clear();
  }

  _resetTimer(force = false) {
    const g = this.game;
    if (!g || g.result) return;
    const key = this._turnKey(g);
    if (key === this.turnKey && !force) return;
    this.turnKey = key;
    const id = g.players[g.turn].id;
    const ms = this._isAway(id) ? AUTO_PLAY_MS : this.options.turnSeconds * 1000;
    this._setTimer(ms, () => {
      if (this.game !== g || g.result || g.players[g.turn]?.id !== id) return;
      g.autoPlay(id); // hết giờ: máy đánh hộ
      this._afterAction();
    });
  }

  /** Hẹn giờ cho lượt hiện tại; xong thì phát trạng thái mới. */
  _setTimer(ms: number, fn: () => void) {
    clearTimeout(this.timer ?? undefined);
    this.deadline = Date.now() + ms;
    this.deadlineTotal = ms;
    this.timer = setTimeout(() => {
      try {
        fn();
      } catch (e) {
        console.error(`${this.constructor.name} timer`, e);
      }
      this.room.changed();
    }, ms);
  }

  view(viewerId: string) {
    this.fair.track(this.game?.initialDeck);
    return {
      fair: this.fair.view(!this.isPlaying()),
      config: this.options,
      seats: this.seats.map((s) => s && { ...s, total: this.totals.get(s.id) || 0, left: this.left.has(s.id), online: this.room.isOnline(s.id) }),
      gameSeats: this.gameSeats,
      game: this.game ? this.game.view(viewerId) : null,
      playing: this.isPlaying(),
      turnLeft: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      turnTotal: this.deadlineTotal || this.options.turnSeconds * 1000,
      mySeat: this.seatOf(viewerId),
      gameNo: this.gameNo,
      ...this.ready.view(this.playerIds()),
    };
  }

  dispose() { clearTimeout(this.timer ?? undefined); }
}

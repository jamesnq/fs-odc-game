import { PokerGame } from '@game/shared/poker';
import { cardLabel } from '@game/shared/cards';
import { DeckCommitments } from './fairness.js';
import { bool, clampInt } from './options.js';
import { ReadyGate } from './ready.js';

export class PokerHandler {
  constructor(room, options) {
    this.fair = new DeckCommitments();
    this.room = room;
    const bigBlind = clampInt(options.bigBlind, 2, 100000, 20);
    // Small blind nhập riêng (mặc định = ½ big blind), luôn trong khoảng 1..big blind
    const smallBlind = clampInt(options.smallBlind, 1, bigBlind, Math.max(1, Math.floor(bigBlind / 2)));
    this.options = {
      bigBlind,
      smallBlind,
      buyIn: clampInt(options.buyIn, bigBlind * 10, bigBlind * 1000, bigBlind * 100),
      maxSeats: clampInt(options.maxSeats, 2, 9, 6),
      turnSeconds: clampInt(options.turnSeconds, 10, 120, 30),
      rabbitHunt: bool(options.rabbitHunt, true),
    };
    this.game = new PokerGame({ smallBlind: this.options.smallBlind, bigBlind: this.options.bigBlind, maxSeats: this.options.maxSeats });
    this.stacks = new Map(); // chip giữ lại khi đứng dậy
    this.rebuys = new Map();
    this.turnTimer = null;
    this.deadline = 0;
    this.nextHandTimer = null;
    this.nextHandAt = 0;
    this.timerKey = ''; // lượt mà đồng hồ hiện tại đang tính
    // Không tự chia: mọi người sẵn sàng rồi chủ phòng bấm bắt đầu; sau đó các ván nối tiếp nhau
    // cho đến khi chủ phòng tạm dừng hoặc bàn còn dưới 2 người.
    this.ready = new ReadyGate(room);
    this.started = false;
  }

  /** Người đang ngồi bàn (chưa rời). */
  _seated() { return this.game.seats.filter((x) => x && !x.left); }

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
    this.ready.delete(id);
    this._afterChange();
  }

  onLeave(id) { this.stand(id); }

  action(id, a) {
    if (a.type === 'setBlinds') return this._setBlinds(id, a);
    if (a.type === 'start') {
      if (this.started) throw new Error('Bàn đang chơi');
      this.ready.check(id, this._seated());
      if (!this.game.canStart() && !this.game.inHand) throw new Error('Cần ít nhất 2 người có chip và không nghỉ ván');
      this.started = true;
      this.ready.clear();
      this.room.system('Chủ phòng bắt đầu — chia bài!');
      this._maybeSchedule();
      return;
    }
    if (a.type === 'pause') {
      if (id !== this.room.ownerId) throw new Error('Chỉ chủ phòng mới được tạm dừng');
      if (!this.started) throw new Error('Bàn chưa bắt đầu');
      this._stop();
      this.room.system(`Chủ phòng tạm dừng bàn${this.game.inHand ? ' sau ván này' : ''}`);
      return;
    }
    if (a.type === 'rabbit') {
      if (!this.options.rabbitHunt) throw new Error('Bàn này không cho xem rabbit');
      const cards = this.game.rabbitHunt(id);
      const name = this.game.seats.find((x) => x && x.id === id)?.name
        || Object.values(this.game.hand.players).find((p) => p.id === id)?.name || '?';
      this.room.system(`🐇 ${name} xem rabbit: ${cards.map(cardLabel).join(' ')}`);
      return;
    }
    if (a.type === 'show') {
      const cards = this.game.showCards(id);
      const name = Object.values(this.game.hand.players).find((p) => p.id === id)?.name || '?';
      this.room.system(`🃏 ${name} show bài: ${cards.map(cardLabel).join(' ')}`);
      return;
    }
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
      case 'ready':
        if (this.started) throw new Error('Bàn đang chơi');
        this.ready.toggle(id);
        break;
      default:
        throw new Error('Hành động không hợp lệ');
    }
    this._afterChange();
  }

  /** Chủ phòng đổi blind. Giữa ván thì áp dụng từ ván sau. */
  _setBlinds(id, a) {
    if (id !== this.room.ownerId) throw new Error('Chỉ chủ phòng mới được đổi blind');
    const bb = Math.floor(Number(a.bigBlind));
    const sb = Math.floor(Number(a.smallBlind));
    if (!Number.isFinite(bb) || bb < 2 || bb > 100000) throw new Error('Big blind phải từ 2 đến 100.000');
    if (!Number.isFinite(sb) || sb < 1 || sb > bb) throw new Error('Small blind phải từ 1 đến big blind');
    if (bb > this.options.buyIn) throw new Error(`Big blind không được lớn hơn buy-in (${this.options.buyIn})`);
    const now = this.game.setBlinds(sb, bb);
    if (now) {
      this.options.smallBlind = sb;
      this.options.bigBlind = bb;
    }
    this.room.system(`Chủ phòng đổi blind thành ${sb}/${bb}${now ? '' : ' — áp dụng từ ván sau'}`);
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
    // Người đã rời / ngồi ngoài / mất kết nối: tự động sau 3 giây
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

  /** Dừng chia ván mới (ván đang chơi vẫn chơi nốt). */
  _stop() {
    this.started = false;
    clearTimeout(this.nextHandTimer);
    this.nextHandTimer = null;
    this.nextHandAt = 0;
  }

  _maybeSchedule() {
    // Bàn còn dưới 2 người: dừng lại, lần sau phải sẵn sàng và bấm bắt đầu lại
    if (this.started && !this.game.inHand && this._seated().length < 2) {
      this._stop();
      this.room.system('Bàn còn dưới 2 người — tạm dừng, chờ chủ phòng bắt đầu lại');
    }
    if (!this.started || this.game.inHand || this.nextHandTimer) return;
    if (!this.game.canStart()) { this.nextHandAt = 0; return; }
    const delay = this.game.hand ? 6000 : 3000; // xem kết quả ván trước
    this.nextHandAt = Date.now() + delay;
    this.nextHandTimer = setTimeout(() => {
      this.nextHandTimer = null;
      this.nextHandAt = 0;
      if (this.started && !this.game.inHand && this.game.canStart()) {
        this.game.startHand();
        // Blind chờ (nếu có) vừa được áp dụng khi chia ván mới
        this.options.smallBlind = this.game.smallBlind;
        this.options.bigBlind = this.game.bigBlind;
        this._afterChange();
      }
      this.room.changed();
    }, delay);
  }

  query(viewerId, q) {
    if (q.type === 'handLog') return this.game.historyView(viewerId);
    throw new Error('Truy vấn không hợp lệ');
  }

  /** Lá của ván vừa xong mà người xem được thấy: bài chung, bài đã lật, rabbit, bài tẩy của chính mình. */
  _visibleCards(viewerId) {
    const e = this.game.history[this.game.history.length - 1];
    const set = new Set();
    if (!e) return set;
    for (const c of e.board) set.add(c);
    for (const v of Object.values(e.shown)) for (const c of v.hole) set.add(c);
    for (const p of e.players) if (p.id === viewerId) for (const c of p.hole) set.add(c);
    if (Array.isArray(e.rabbit)) for (const c of e.rabbit) set.add(c);
    return set;
  }

  view(viewerId) {
    this.fair.track(this.game.lastDeck);
    const v = this.game.view(viewerId);
    if (!this.options.rabbitHunt) v.canRabbit = false;
    const last = this.game.history[this.game.history.length - 1];
    return {
      ...v,
      fair: this.fair.view(!this.game.inHand, () => this._visibleCards(viewerId)),
      handLogCount: this.game.history.length,
      handLogLast: last ? last.no : 0,
      config: this.options,
      turnLeft: this.deadline ? Math.max(0, this.deadline - Date.now()) : 0,
      turnTotal: this.options.turnSeconds * 1000,
      nextHandIn: this.nextHandAt ? Math.max(0, this.nextHandAt - Date.now()) : 0,
      started: this.started,
      ...this.ready.view(this._seated().map((x) => x.id)),
    };
  }

  dispose() {
    clearTimeout(this.turnTimer);
    clearTimeout(this.nextHandTimer);
  }
}

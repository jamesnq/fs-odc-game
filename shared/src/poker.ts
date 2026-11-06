// Engine Poker Texas Hold'em No-Limit.
// Luật tham khảo: Robert's Rules of Poker / luật TDA:
//  - Nút dealer xoay vòng; SB, BB bắt buộc. Heads-up: dealer là SB, đi trước preflop, đi sau các vòng sau.
//  - Bet tối thiểu = BB. Raise tối thiểu = mức raise lớn nhất trước đó trong vòng.
//  - All-in nhỏ hơn một lần raise đầy đủ KHÔNG mở lại quyền raise cho người đã hành động.
//  - Side pot khi có người all-in. Pot chia đều, chip lẻ cho người gần bên trái dealer nhất.
import { newDeck, shuffle, rankOf } from './cards.js';

export interface PokerPlayer {
  seat: number; id: string; name: string; startChips: number; hole: string[];
  bet: number; total: number; folded: boolean; allIn: boolean; acted: boolean;
  lastAction: string | null;
}

// ---------- Đánh giá bài ----------
export const HAND_NAMES_VI = [
  'Mậu thầu', 'Một đôi', 'Thú (hai đôi)', 'Sám cô', 'Sảnh', 'Thùng', 'Cù lũ', 'Tứ quý', 'Thùng phá sảnh',
];

const pv = (c: string) => (rankOf(c) === 1 ? 14 : rankOf(c)); // A = 14 trong poker

/** Điểm số của 5 lá: số càng lớn càng mạnh. */
export function score5(cards: string[]) {
  const vals = cards.map(pv).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(vals)];
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (vals[0] - vals[4] === 4) straightHigh = vals[0];
    else if (vals[0] === 14 && vals[1] === 5) straightHigh = 5; // A-2-3-4-5
  }
  const counts: Record<string, number> = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  // Sắp theo (số lượng giảm dần, giá trị giảm dần)
  const groups = Object.entries(counts)
    .map(([v, n]) => [Number(v), n])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const kick = groups.map((g) => g[0]);
  let cat;
  let tiebreak;
  if (straightHigh && flush) { cat = 8; tiebreak = [straightHigh]; }
  else if (groups[0][1] === 4) { cat = 7; tiebreak = kick; }
  else if (groups[0][1] === 3 && groups[1][1] === 2) { cat = 6; tiebreak = kick; }
  else if (flush) { cat = 5; tiebreak = vals; }
  else if (straightHigh) { cat = 4; tiebreak = [straightHigh]; }
  else if (groups[0][1] === 3) { cat = 3; tiebreak = kick; }
  else if (groups[0][1] === 2 && groups[1][1] === 2) { cat = 2; tiebreak = kick; }
  else if (groups[0][1] === 2) { cat = 1; tiebreak = kick; }
  else { cat = 0; tiebreak = vals; }
  let s = cat;
  for (let i = 0; i < 5; i++) s = s * 16 + (tiebreak[i] || 0);
  return s;
}

export const categoryOf = (score: number) => Math.floor(score / 16 ** 5);

/** Bài mạnh nhất từ 5–7 lá. */
export function bestHand(cards: string[]) {
  let best = -1, bestCards: any = null;
  const n = cards.length;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) for (let c = b + 1; c < n; c++)
    for (let d = c + 1; d < n; d++) for (let e = d + 1; e < n; e++) {
      const h = [cards[a], cards[b], cards[c], cards[d], cards[e]];
      const s = score5(h);
      if (s > best) { best = s; bestCards = h; }
    }
  return { score: best, cards: bestCards, name: HAND_NAMES_VI[categoryOf(best)] };
}

/**
 * Mô tả bài hiện tại của một người từ 2 lá tẩy + bài chung (0–5 lá), dùng cho bảng "Bài mạnh nhất".
 * Trả về { cat, name, cards, used, draws }:
 *  - cards: 5 lá tạo thành bộ mạnh nhất (preflop: chỉ 2 lá tẩy)
 *  - used: các lá trong `cards` thật sự tạo nên bộ (bỏ kicker), để làm nổi bật
 *  - draws: các bộ đang "chờ" (chỉ khi còn bài chung chưa ra)
 */
export function describeHand(hole: string[], board: string[] = []) {
  const all = [...hole, ...board];
  let cat, cards;
  if (all.length >= 5) {
    const b = bestHand(all);
    cat = categoryOf(b.score);
    cards = b.cards.slice();
  } else {
    cat = hole.length === 2 && hole[0][0] === hole[1][0] ? 1 : 0;
    cards = all.slice();
  }
  // Sắp xếp để hiển thị: nhóm đông trước, rồi giá trị lớn trước (sảnh A-5 để A cuối)
  const cnt: Record<string, number> = {};
  for (const c of cards) cnt[pv(c)] = (cnt[pv(c)] || 0) + 1;
  const wheel = (cat === 4 || cat === 8) && cards.some((c: any) => pv(c) === 14) && cards.some((c: any) => pv(c) === 2);
  const val = (c: any) => (wheel && pv(c) === 14 ? 1 : pv(c));
  cards.sort((a: any, b: any) => cnt[pv(b)] - cnt[pv(a)] || val(b) - val(a));
  let used;
  if (cat === 0) used = cards.slice(0, 1);
  else if ([1, 2, 3, 7].includes(cat)) used = cards.filter((c: any) => cnt[pv(c)] >= 2);
  else used = cards.slice();
  const draws: any[] = [];
  if (board.length >= 3 && board.length < 5 && cat < 5) {
    const suits: Record<string, number> = {};
    for (const c of all) suits[c[1]] = (suits[c[1]] || 0) + 1;
    if (Object.values(suits).some((n) => n === 4)) draws.push('Chờ thùng');
    if (cat < 4) {
      const vs = new Set(all.map(pv));
      if (vs.has(14)) vs.add(1);
      let open = false, gut = false;
      for (let lo = 1; lo <= 10; lo++) {
        const have = [0, 1, 2, 3, 4].filter((k) => vs.has(lo + k)).length;
        if (have === 4) {
          if (vs.has(lo) && vs.has(lo + 1) && vs.has(lo + 2) && vs.has(lo + 3) && lo + 4 <= 14 && lo > 1) open = true;
          else gut = true;
        }
      }
      if (open) draws.push('Chờ sảnh 2 đầu');
      else if (gut) draws.push('Chờ sảnh');
    }
  }
  return { cat, name: HAND_NAMES_VI[cat], cards, used, draws };
}

// ---------- Bàn chơi ----------
export class PokerGame {
  declare smallBlind: any;
  declare bigBlind: any;
  declare seats: any;
  declare dealer: number;
  declare hand: any;
  declare handNo: number;
  declare nextBlinds: any;
  declare history: any;
  declare historyMax: number;
  declare lastDeck: any;

  constructor({ smallBlind = 10, bigBlind = 20, maxSeats = 6 }: any = {}) {
    this.smallBlind = smallBlind;
    this.bigBlind = bigBlind;
    this.seats = Array(maxSeats).fill(null); // { id, name, chips, sitOut, left }
    this.dealer = -1;
    this.hand = null;
    this.handNo = 0;
    this.nextBlinds = null; // blind mới chờ áp dụng từ ván sau: { smallBlind, bigBlind }
    this.history = []; // Hands log: các ván đã kết thúc (mới nhất ở cuối)
    this.historyMax = 50;
  }

  get inHand() {
    return !!this.hand && this.hand.street !== 'done';
  }

  sit(seat: any, id: any, name: any, chips: any) {
    if (this.seats[seat]) throw new Error('Ghế đã có người');
    if (this.seats.some((s: any) => s && s.id === id)) throw new Error('Bạn đã ngồi rồi');
    this.seats[seat] = { id, name, chips, sitOut: false, left: false };
  }

  seatOf(id: any) {
    return this.seats.findIndex((s: any) => s && s.id === id);
  }

  /** Rời ghế. Nếu đang trong ván thì tự bỏ bài, ghế được giải phóng khi hết ván. */
  leave(id: any) {
    const seat = this.seatOf(id);
    if (seat < 0) return;
    const hp = this.inHand && this.hand.players[seat];
    if (hp && !hp.folded) {
      this.seats[seat].left = true;
      this._forceFold(seat);
    } else if (this.inHand && hp) {
      this.seats[seat].left = true;
    } else {
      this.seats[seat] = null;
    }
  }

  /** Giải phóng ghế của người đã rời khi ván kết thúc. */
  cleanup() {
    if (!this.inHand) this.seats = this.seats.map((s: any) => (s && s.left ? null : s));
  }

  canStart() {
    return !this.inHand && this.seats.filter((s: any) => s && !s.left && !s.sitOut && s.chips > 0).length >= 2;
  }

  _nextSeat(from: any, pred: any) {
    const n = this.seats.length;
    for (let k = 1; k <= n; k++) {
      const i = (from + k + n) % n;
      if (pred(i)) return i;
    }
    return -1;
  }

  /**
   * Đổi mức blind. Đang giữa ván thì chờ tới ván sau mới áp dụng.
   * @returns true nếu áp dụng ngay, false nếu chờ ván sau
   */
  setBlinds(smallBlind: any, bigBlind: any) {
    const sb = Math.floor(Number(smallBlind));
    const bb = Math.floor(Number(bigBlind));
    if (!Number.isFinite(sb) || !Number.isFinite(bb) || sb < 1 || bb < 2) throw new Error('Blind không hợp lệ');
    if (sb > bb) throw new Error('Small blind không được lớn hơn big blind');
    if (this.inHand) {
      this.nextBlinds = { smallBlind: sb, bigBlind: bb };
      return false;
    }
    this.smallBlind = sb;
    this.bigBlind = bb;
    this.nextBlinds = null;
    return true;
  }

  startHand() {
    if (!this.canStart()) throw new Error('Cần ít nhất 2 người chơi có chip');
    if (this.nextBlinds) {
      ({ smallBlind: this.smallBlind, bigBlind: this.bigBlind } = this.nextBlinds);
      this.nextBlinds = null;
    }
    // Dọn ghế của người đã rời
    this.seats = this.seats.map((s: any) => (s && s.left ? null : s));
    const eligible = (i: any) => { const s = this.seats[i]; return !!s && !s.sitOut && s.chips > 0; };
    const participants = this.seats.map((_: any, i: any) => i).filter(eligible);
    this.dealer = this._nextSeat(this.dealer < 0 ? -1 : this.dealer, eligible);
    const players: Record<string, any> = {};
    for (const i of participants) {
      players[i] = { seat: i, id: this.seats[i].id, name: this.seats[i].name, startChips: this.seats[i].chips, hole: [] as any[], bet: 0, total: 0, folded: false, allIn: false, acted: false, lastAction: null };
    }
    const heads = participants.length === 2;
    const sb = heads ? this.dealer : this._nextSeat(this.dealer, (i: any) => !!players[i]);
    const bb = this._nextSeat(sb, (i: any) => !!players[i]);
    this.handNo++;
    const deck = shuffle(newDeck());
    /** Thứ tự bộ bài lúc vừa xáo (lá chia trước ở cuối mảng) — để server cam kết/công bố. */
    this.lastDeck = deck.slice();
    this.hand = {
      no: this.handNo,
      deck,
      board: [] as any[],
      street: 'preflop',
      players,
      dealer: this.dealer,
      sb, bb,
      currentBet: 0,
      minRaise: this.bigBlind,
      toAct: -1,
      result: null,
      log: [] as any[],
      actions: [] as any[], // { street, seat, type, amount, to, allIn } — dùng cho Hands log
      startedAt: Date.now(),
    };
    this._put(sb, Math.min(this.smallBlind, this.seats[sb].chips));
    this._put(bb, Math.min(this.bigBlind, this.seats[bb].chips));
    players[sb].lastAction = 'SB';
    players[bb].lastAction = 'BB';
    this._record(sb, 'sb', players[sb].bet);
    this._record(bb, 'bb', players[bb].bet);
    this.hand.currentBet = Math.max(players[sb].bet, players[bb].bet, this.bigBlind);
    // Chia 2 lá, bắt đầu từ SB
    for (let r = 0; r < 2; r++) {
      let s = sb;
      for (let k = 0; k < participants.length; k++) {
        players[s].hole.push(this.hand.deck.pop());
        s = this._nextSeat(s, (i: any) => !!players[i]);
      }
    }
    this._log(`Ván #${this.handNo} bắt đầu. Dealer: ${this.seats[this.dealer].name}`);
    this.hand.toAct = bb; // tìm người kế tiếp sau BB
    this._advance(true);
  }

  /** Ghi một hành động có cấu trúc cho Hands log. amount = số chip bỏ thêm, to = mức cược sau hành động. */
  _record(seat: any, type: any, amount = 0) {
    const h = this.hand;
    const p = h.players[seat];
    h.actions.push({ street: h.street, seat, type, amount, to: p.bet, allIn: p.allIn });
  }

  _log(msg: any) {
    this.hand.log.push(msg);
    if (this.hand.log.length > 60) this.hand.log.shift();
  }

  _put(seat: any, amount: any) {
    const p = this.hand.players[seat];
    const s = this.seats[seat];
    amount = Math.min(amount, s.chips);
    s.chips -= amount;
    p.bet += amount;
    p.total += amount;
    if (s.chips === 0) p.allIn = true;
  }

  get pot() {
    if (!this.hand) return 0;
    return Object.values(this.hand.players as Record<number, PokerPlayer>).reduce((a, p) => a + p.total, 0);
  }

  _active() {
    return Object.values(this.hand.players as Record<number, PokerPlayer>).filter((p) => !p.folded);
  }

  _needsToAct(p: any) {
    const h = this.hand;
    if (p.folded || p.allIn) return false;
    const othersCanAct = Object.values(h.players as Record<number, PokerPlayer>).some((q) => q !== p && !q.folded && !q.allIn);
    if (p.bet >= h.currentBet && !othersCanAct) return false;
    return !p.acted || p.bet < h.currentBet;
  }

  /** Các lựa chọn hợp lệ cho ghế đang tới lượt. */
  options(seat: any) {
    const h = this.hand;
    if (!this.inHand || h.toAct !== seat) return null;
    const p = h.players[seat];
    const chips = this.seats[seat].chips;
    const toCall = Math.max(0, h.currentBet - p.bet);
    const othersCanAct = Object.values(h.players as Record<number, PokerPlayer>).some((q) => q !== p && !q.folded && !q.allIn);
    const maxTo = p.bet + chips;
    const canRaise = !p.acted && othersCanAct && maxTo > h.currentBet;
    const minTo = Math.min(maxTo, h.currentBet === 0 ? this.bigBlind : h.currentBet + h.minRaise);
    // All-in thực tế: không đặt quá mức đối thủ còn theo được (phần dư vô nghĩa), và nếu không được tố thì chỉ theo
    let reach = h.currentBet;
    for (const [k, q] of Object.entries(h.players as Record<number, PokerPlayer>)) {
      if (q !== p && !q.folded) reach = Math.max(reach, q.bet + (q.allIn ? 0 : this.seats[k].chips));
    }
    const allInTo = canRaise ? Math.min(maxTo, Math.max(reach, minTo)) : Math.min(maxTo, h.currentBet);
    return {
      toCall: Math.min(toCall, chips),
      canCheck: toCall === 0,
      canCall: toCall > 0,
      canBet: canRaise && h.currentBet === 0,
      canRaise: canRaise && h.currentBet > 0,
      minTo,
      maxTo,
      allInTo: Math.max(p.bet, allInTo),
      currentBet: h.currentBet,
      myBet: p.bet,
      pot: this.pot,
    };
  }

  /**
   * action: 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin'
   * amount (bet/raise): tổng số chip muốn đặt trong vòng này ("raise to").
   */
  act(id: any, action: any, amount?: number) {
    const h = this.hand;
    if (!this.inHand) throw new Error('Chưa có ván nào');
    const seat = this.seatOf(id);
    if (seat < 0 || h.toAct !== seat) throw new Error('Chưa tới lượt bạn');
    const p = h.players[seat];
    const o = this.options(seat)!;
    const name = this.seats[seat].name;
    switch (action) {
      case 'fold':
        p.folded = true;
        p.lastAction = 'Bỏ';
        this._log(`${name} bỏ bài`);
        this._record(seat, 'fold');
        break;
      case 'check':
        if (!o.canCheck) throw new Error('Không thể check, phải theo hoặc bỏ');
        p.lastAction = 'Check';
        this._log(`${name} check`);
        this._record(seat, 'check');
        break;
      case 'call':
        if (!o.canCall) { // không có gì để theo -> coi như check
          p.lastAction = 'Check';
          this._log(`${name} check`);
          this._record(seat, 'check');
          break;
        }
        this._put(seat, o.toCall);
        p.lastAction = p.allIn ? 'All-in' : 'Theo';
        this._log(`${name} theo ${o.toCall}`);
        this._record(seat, 'call', o.toCall);
        break;
      case 'bet':
      case 'raise':
      case 'allin': {
        let to = action === 'allin' ? o.allInTo : Math.floor(Number(amount));
        if (!Number.isFinite(to)) throw new Error('Số chip không hợp lệ');
        if (to >= o.maxTo) to = o.maxTo;
        if (to <= h.currentBet) {
          // all-in để theo: không đủ tiền, hoặc không được tố thêm → chỉ đặt đúng phần cần theo
          if (action !== 'allin') throw new Error(`Phải đặt lớn hơn ${h.currentBet}`);
          const add = to - p.bet;
          if (add <= 0) { // không phải bỏ thêm gì → coi như check
            p.lastAction = 'Check';
            this._log(`${name} check`);
            this._record(seat, 'check');
            break;
          }
          this._put(seat, add);
          p.lastAction = p.allIn ? 'All-in' : 'Theo';
          this._log(`${name} ${p.allIn ? 'all-in' : 'theo'} ${add}`);
          this._record(seat, 'call', add);
          break;
        }
        if (!o.canBet && !o.canRaise) throw new Error('Bạn không được tố thêm lúc này (chỉ theo hoặc bỏ)');
        if (to < o.minTo && to < o.maxTo) throw new Error(`Mức tối thiểu là ${o.minTo}`);
        const raiseSize = to - h.currentBet;
        const full = raiseSize >= h.minRaise || (h.currentBet === 0 && to >= this.bigBlind);
        const add = to - p.bet;
        this._put(seat, add);
        if (full) {
          h.minRaise = Math.max(h.minRaise, raiseSize);
          for (const q of Object.values(h.players as Record<number, PokerPlayer>)) if (q !== p) q.acted = false;
        }
        const wasBet = h.currentBet === 0;
        h.currentBet = to;
        p.lastAction = p.allIn ? 'All-in' : wasBet ? 'Cược' : 'Tố';
        this._log(`${name} ${p.allIn ? 'all-in' : wasBet ? 'cược' : 'tố lên'} ${to}`);
        this._record(seat, wasBet ? 'bet' : 'raise', add);
        break;
      }
      default:
        throw new Error('Hành động không hợp lệ');
    }
    p.acted = true;
    this._advance(false);
  }

  _forceFold(seat: any) {
    const h = this.hand;
    const p = h.players[seat];
    p.folded = true;
    p.acted = true;
    p.lastAction = 'Bỏ';
    this._log(`${p.name} bỏ bài (rời bàn)`);
    this._record(seat, 'fold');
    if (h.toAct === seat || this._active().length <= 1) this._advance(false);
  }

  /** Hết giờ: tự check nếu được, không thì bỏ bài. */
  timeout() {
    if (!this.inHand) return;
    const seat = this.hand.toAct;
    const o = this.options(seat);
    if (!o) return;
    this.act(this.seats[seat].id, o.canCheck ? 'check' : 'fold');
  }

  _advance(first?: boolean) {
    const h = this.hand;
    const active = this._active();
    if (active.length === 1) return this._finish();
    const next = this._nextSeat(h.toAct, (i: any) => h.players[i] && this._needsToAct(h.players[i]));
    if (next >= 0 && (first || next !== h.toAct || this._needsToAct(h.players[next]))) {
      h.toAct = next;
      return;
    }
    // Hết vòng cược
    for (const p of Object.values(h.players as Record<number, PokerPlayer>)) { p.bet = 0; p.acted = false; if (!p.folded && !p.allIn) p.lastAction = null; }
    h.currentBet = 0;
    h.minRaise = this.bigBlind;
    const canAct = active.filter((p) => !p.allIn).length;
    if (h.street === 'river' || canAct <= 1) {
      while (h.board.length < 5) this._dealStreet();
      return this._finish();
    }
    this._dealStreet();
    h.toAct = this._nextSeat(h.dealer, (i: any) => h.players[i] && !h.players[i].folded && !h.players[i].allIn);
  }

  _dealStreet() {
    const h = this.hand;
    h.deck.pop(); // burn
    if (h.board.length === 0) { h.board.push(h.deck.pop(), h.deck.pop(), h.deck.pop()); h.street = 'flop'; }
    else if (h.board.length === 3) { h.board.push(h.deck.pop()); h.street = 'turn'; }
    else { h.board.push(h.deck.pop()); h.street = 'river'; }
    this._log(`--- ${h.street.toUpperCase()}: ${h.board.join(' ')}`);
  }

  _finish() {
    const h = this.hand;
    const all = Object.values(h.players as Record<number, PokerPlayer>);
    const active = this._active();
    const winnings: Record<string, any> = {};
    const shown: Record<string, any> = {};
    const potsOut: any[] = [];
    if (active.length === 1) {
      const w = active[0];
      winnings[w.seat] = this.pot;
      potsOut.push({ amount: this.pot, winners: [w.seat], hand: null });
      this._log(`${w.name} thắng ${this.pot}`);
    } else {
      const evals: Record<string, any> = {};
      for (const p of active) {
        evals[p.seat] = bestHand([...p.hole, ...h.board]);
        shown[p.seat] = { hole: p.hole, hand: evals[p.seat].name, best: evals[p.seat].cards };
      }
      // Thứ tự chia chip lẻ: bắt đầu bên trái dealer
      const orderFromDealer: any[] = [];
      let s = h.dealer;
      for (let k = 0; k < this.seats.length; k++) {
        s = (s + 1) % this.seats.length;
        if (h.players[s]) orderFromDealer.push(s);
      }
      const levels = [...new Set(active.map((p) => p.total))].sort((a, b) => a - b);
      let prev = 0;
      for (const L of levels) {
        let amount = 0;
        for (const p of all) amount += Math.max(0, Math.min(p.total, L) - prev);
        const eligible = active.filter((p) => p.total >= L);
        prev = L;
        if (!amount) continue;
        const best = Math.max(...eligible.map((p) => evals[p.seat].score));
        const winners = orderFromDealer.filter((seat) => eligible.some((p) => p.seat === seat) && evals[seat].score === best);
        const share = Math.floor(amount / winners.length);
        let rem = amount - share * winners.length;
        for (const w of winners) {
          winnings[w] = (winnings[w] || 0) + share + (rem > 0 ? 1 : 0);
          if (rem > 0) rem--;
        }
        potsOut.push({ amount, winners, hand: evals[winners[0]].name });
      }
      // Chip bỏ lại của người đã fold vượt mức cao nhất (hiếm) -> cho người thắng pot cuối
      const totalAll = all.reduce((a, p) => a + p.total, 0);
      const distributed = Object.values(winnings).reduce((a, b) => a + b, 0);
      if (totalAll > distributed && potsOut.length) {
        const w = potsOut[potsOut.length - 1].winners[0];
        winnings[w] += totalAll - distributed;
      }
      for (const pot of potsOut) {
        this._log(`${pot.winners.map((w: any) => h.players[w].name).join(', ')} thắng ${pot.amount} (${pot.hand})`);
      }
    }
    for (const [seat, amt] of Object.entries(winnings)) {
      const st = this.seats[seat];
      if (st && st.id === h.players[seat].id) st.chips += amt;
    }
    h.result = { winnings, shown, pots: potsOut };
    const showdown = active.length > 1;
    h.street = 'done';
    h.toAct = -1;
    this._archive(showdown);
  }

  /**
   * Rabbit hunt: ván kết thúc sớm (mọi người bỏ bài) thì lật các lá bài chung lẽ ra sẽ ra tiếp,
   * đúng theo thứ tự chia thật (có đốt bài). Không ảnh hưởng kết quả.
   */
  canRabbit(id: any) {
    const h = this.hand;
    return !!h && h.street === 'done' && h.board.length < 5 && !h.rabbit
      && Object.values(h.players as Record<number, PokerPlayer>).some((p) => p.id === id);
  }

  rabbitHunt(id: any) {
    const h = this.hand;
    if (!h || h.street !== 'done') throw new Error('Chỉ xem rabbit khi ván đã kết thúc');
    if (h.board.length >= 5) throw new Error('Ván đã ra đủ 5 lá bài chung');
    if (h.rabbit) throw new Error('Đã lật rabbit rồi');
    if (!Object.values(h.players as Record<number, PokerPlayer>).some((p) => p.id === id)) throw new Error('Chỉ người chơi trong ván mới được xem rabbit');
    const deck = h.deck.slice();
    const cards: string[][] = [];
    while (h.board.length + cards.length < 5) {
      deck.pop(); // đốt bài như khi chia thật
      if (h.board.length + cards.length === 0) cards.push(deck.pop(), deck.pop(), deck.pop());
      else cards.push(deck.pop());
    }
    h.rabbit = cards;
    const entry = this.history.find((e: any) => e.no === h.no);
    if (entry) entry.rabbit = cards.slice();
    return cards;
  }

  /**
   * Chủ động show bài: khi ván đã kết thúc, người chơi trong ván mà bài chưa được lật
   * (đã bỏ bài, hoặc thắng vì mọi người bỏ) có thể tự lật 2 lá tẩy cho cả bàn xem. Không ảnh hưởng kết quả.
   */
  canShow(id: any) {
    const h = this.hand;
    if (!h || h.street !== 'done' || !h.result) return false;
    const p = Object.values(h.players as Record<number, PokerPlayer>).find((q) => q.id === id);
    return !!p && !h.result.shown[p.seat];
  }

  showCards(id: any) {
    const h = this.hand;
    if (!h || h.street !== 'done' || !h.result) throw new Error('Chỉ show bài khi ván đã kết thúc');
    const p = Object.values(h.players as Record<number, PokerPlayer>).find((q) => q.id === id);
    if (!p) throw new Error('Bạn không chơi ván này');
    if (h.result.shown[p.seat]) throw new Error('Bài của bạn đã được lật rồi');
    const ev = h.board.length >= 3 ? bestHand([...p.hole, ...h.board]) : null;
    h.result.shown[p.seat] = { hole: p.hole.slice(), hand: ev ? ev.name : null, best: ev ? ev.cards : null, voluntary: true };
    const entry = this.history.find((e: any) => e.no === h.no);
    if (entry) entry.shown[p.seat] = { hole: p.hole.slice(), hand: ev ? ev.name : null, voluntary: true };
    this._log(`${p.name} show bài: ${p.hole.join(' ')}${ev ? ` (${ev.name})` : ''}`);
    return p.hole.slice();
  }

  /** Lưu ván vừa kết thúc vào Hands log. Bài tẩy được lưu đủ, view sẽ lọc theo người xem. */
  _archive(showdown: any) {
    const h = this.hand;
    const r = h.result;
    this.history.push({
      no: h.no,
      startedAt: h.startedAt,
      endedAt: Date.now(),
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      dealer: h.dealer, sb: h.sb, bb: h.bb,
      board: h.board.slice(),
      showdown,
      players: Object.values(h.players as Record<number, PokerPlayer>).map((p) => ({
        seat: p.seat, id: p.id, name: p.name, startChips: p.startChips, hole: p.hole.slice(),
        invested: p.total, won: r.winnings[p.seat] || 0, net: (r.winnings[p.seat] || 0) - p.total, folded: p.folded,
      })),
      actions: h.actions.slice(),
      shown: Object.fromEntries(Object.entries(r.shown as Record<string, {hole: string[]; hand: string | null}>).map(([s, v]) => [s, { hole: v.hole.slice(), hand: v.hand }])),
      pots: r.pots.map((pt: any) => ({ amount: pt.amount, winners: pt.winners.slice(), hand: pt.hand })),
      pot: Object.values(h.players as Record<number, PokerPlayer>).reduce((a, p) => a + p.total, 0),
      rabbit: null,
    });
    if (this.history.length > this.historyMax) this.history.shift();
  }

  /**
   * Hands log cho người xem: chỉ lộ bài tẩy của chính mình và bài đã lật ở showdown.
   * Bài đã bỏ (muck) của người khác luôn bị ẩn.
   */
  historyView(viewerId: any, limit = this.historyMax) {
    return this.history.slice(-limit).reverse().map((e: any) => ({
      ...e,
      players: e.players.map(({ hole, ...p }: any) => ({
        ...p,
        hole: p.id === viewerId ? hole : e.shown[p.seat] ? e.shown[p.seat].hole : null,
        me: p.id === viewerId,
      })),
    }));
  }

  /** Dữ liệu gửi cho client, ẩn bài tẩy của người khác. */
  view(viewerId: any) {
    const h = this.hand;
    const seats = this.seats.map((s: any, i: any) => {
      if (!s) return null;
      const hp = h && h.players[i];
      let hole: string[] | null = null;
      if (hp) {
        if (s.id === viewerId) hole = hp.hole;
        else if (h.result && h.result.shown[i]) hole = h.result.shown[i].hole;
        else hole = hp.folded ? [] : ['??', '??'];
      }
      return {
        id: s.id, name: s.name, chips: s.chips, sitOut: s.sitOut, left: s.left,
        inHand: !!hp,
        bet: hp ? hp.bet : 0,
        folded: hp ? hp.folded : false,
        allIn: hp ? hp.allIn : false,
        lastAction: hp ? hp.lastAction : null,
        hole,
      };
    });
    const mySeat = this.seatOf(viewerId);
    return {
      smallBlind: this.smallBlind,
      bigBlind: this.bigBlind,
      nextBlinds: this.nextBlinds,
      seats,
      hand: h ? {
        no: h.no,
        board: h.board,
        street: h.street,
        dealer: h.dealer, sb: h.sb, bb: h.bb,
        currentBet: h.currentBet,
        toAct: h.toAct,
        pot: this.pot,
        result: h.result,
        rabbit: h.rabbit || null,
        log: h.log.slice(-20),
      } : null,
      mySeat,
      canRabbit: this.canRabbit(viewerId),
      canShow: this.canShow(viewerId),
      options: mySeat >= 0 && h ? this.options(mySeat) : null,
    };
  }
}

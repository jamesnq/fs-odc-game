// Engine Tá lả (Phỏm) — luật phổ biến miền Bắc:
//  - 2–4 người, bộ 52 lá. Người đi đầu (cái) 10 lá, còn lại 9 lá. Đi theo vòng.
//  - Phỏm: ≥3 lá cùng hạng (bộ) hoặc ≥3 lá liên tiếp cùng chất (sảnh). A là lá nhỏ nhất, không có Q-K-A.
//  - Mỗi lượt: BỐC 1 lá từ nọc hoặc ĂN lá người trước vừa đánh (nếu tạo phỏm với bài trên tay), rồi ĐÁNH 1 lá.
//    Người cái lượt đầu chỉ đánh, không bốc.
//  - Lá đã ăn phải nằm trong phỏm khi hạ và không được đánh đi; 2 lá ăn không được nằm cùng một phỏm.
//  - Mỗi người đánh đúng 4 lượt. Ở lượt thứ 4 (lượt cuối), sau khi bốc/ăn: HẠ phỏm, GỬI lá vào phỏm đã hạ
//    (của mình hoặc người khác), rồi đánh lá cuối.
//  - Kết thúc: điểm = tổng lá còn lại (A=1 … K=13). Không có phỏm nào = MÓM. Ít điểm nhất là Nhất,
//    hòa điểm thì ai hạ trước xếp trên.
//  - Ù: khi bài trên tay (10 lá) xếp được ≥9 lá vào phỏm → thắng ngay.
//
// Tính điểm (đơn vị = mức cược của bàn):
//  - Nhì trả 1, Ba trả 2, Bét trả 3, Móm trả 4 cho Nhất.
//  - Bị ăn: người đánh trả cho người ăn 1; bị ăn CHỐT (lá đánh ở lượt cuối) trả 4.
//  - Ù: mỗi người trả 5. Nếu Ù ngay sau khi ăn lá của ai thì người đó "đền" thay cả làng.
import { newDeck, shuffle, rankOf, suitOf } from './cards.js';

export const TALA_RULES = {
  rankPay: [0, 1, 2, 3],
  momPay: 4,
  eatPay: 1,
  chotPay: 4,
  uPay: 5,
};

// ---------- Phỏm ----------
export function isSet(cards) {
  return cards.length >= 3 && cards.length <= 4 && cards.every((c) => c[0] === cards[0][0]);
}

export function isRun(cards) {
  if (cards.length < 3) return false;
  if (!cards.every((c) => suitOf(c) === suitOf(cards[0]))) return false;
  const r = cards.map(rankOf).sort((a, b) => a - b);
  for (let i = 1; i < r.length; i++) if (r[i] !== r[i - 1] + 1) return false;
  return true;
}

export const isMeld = (cards) => isSet(cards) || isRun(cards);

export const points = (cards) => cards.reduce((a, c) => a + rankOf(c), 0);

/** Liệt kê mọi phỏm có thể tạo từ tập lá. */
export function enumerateMelds(cards) {
  const melds = [];
  const byRank = {};
  const bySuit = {};
  for (const c of cards) {
    (byRank[c[0]] ||= []).push(c);
    (bySuit[c[1]] ||= []).push(c);
  }
  for (const g of Object.values(byRank)) {
    if (g.length === 3) melds.push(g);
    if (g.length === 4) {
      melds.push(g);
      for (let i = 0; i < 4; i++) melds.push(g.filter((_, j) => j !== i));
    }
  }
  for (const g of Object.values(bySuit)) {
    const sorted = g.slice().sort((a, b) => rankOf(a) - rankOf(b));
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 2; j < sorted.length; j++) {
        const seg = sorted.slice(i, j + 1);
        if (rankOf(seg[seg.length - 1]) - rankOf(seg[0]) !== seg.length - 1) break;
        melds.push(seg);
      }
    }
  }
  return melds;
}

/**
 * Tìm cách xếp phỏm tốt nhất từ `hand` sao cho mỗi lá trong `locked` (lá đã ăn) nằm trong đúng 1 phỏm
 * và không phỏm nào chứa 2 lá đã ăn.
 * objective: 'points' (tối đa điểm được xếp) hoặc 'count' (tối đa số lá).
 * maxCards: giới hạn số lá được xếp (để còn lá đánh).
 * Trả về { melds, count, points } hoặc null nếu không thể xếp hết lá đã ăn.
 */
export function bestArrangement(hand, locked = [], { objective = 'points', maxCards = Infinity } = {}) {
  const lockedSet = new Set(locked);
  const melds = enumerateMelds(hand).filter((m) => m.filter((c) => lockedSet.has(c)).length <= 1);
  const index = new Map(hand.map((c, i) => [c, i]));
  const masks = melds.map((m) => m.reduce((a, c) => a | (1 << index.get(c)), 0));
  let lockedMask = 0;
  for (const c of locked) if (index.has(c)) lockedMask |= 1 << index.get(c);
  if (locked.some((c) => !index.has(c))) return null;

  let best = null;
  const chosen = [];
  const evalScore = (count, pts) => (objective === 'count' ? count * 1000 + pts : pts * 100 + count);
  function rec(i, used, count, pts) {
    if ((used & lockedMask) === lockedMask) {
      const s = evalScore(count, pts);
      if (!best || s > best.s) best = { s, melds: chosen.slice(), count, points: pts };
    }
    for (let k = i; k < melds.length; k++) {
      if (masks[k] & used) continue;
      const n = count + melds[k].length;
      if (n > maxCards) continue;
      chosen.push(melds[k]);
      rec(k + 1, used | masks[k], n, pts + points(melds[k]));
      chosen.pop();
    }
  }
  rec(0, 0, 0, 0);
  return best && { melds: best.melds, count: best.count, points: best.points };
}

export const lockedFeasible = (hand, locked) => !!bestArrangement(hand, locked, { objective: 'count' });

// ---------- Ván chơi ----------
export class TalaGame {
  /**
   * players: [{ id, name }] theo thứ tự ngồi (chiều kim đồng hồ)
   * first: chỉ số người đi đầu (cầm 10 lá)
   */
  constructor(players, first = 0) {
    if (players.length < 2 || players.length > 4) throw new Error('Cần 2–4 người chơi');
    this.players = players.map((p) => ({ id: p.id, name: p.name }));
    const n = players.length;
    this.n = n;
    this.first = first;
    this.deck = shuffle(newDeck());
    this.hands = Array.from({ length: n }, () => []);
    for (let r = 0; r < 9; r++) for (let i = 0; i < n; i++) this.hands[(first + i) % n].push(this.deck.pop());
    this.hands[first].push(this.deck.pop());
    this.eaten = Array.from({ length: n }, () => []);
    this.discards = Array.from({ length: n }, () => []);
    this.discardCount = Array(n).fill(0);
    this.melds = Array.from({ length: n }, () => []); // phỏm đã hạ: [{ cards, owner }]
    this.finished = Array(n).fill(false); // đã đánh lá cuối
    this.finishOrder = [];
    this.scores = Array(n).fill(0); // điểm (đơn vị) thắng/thua trong ván
    this.turn = first;
    this.phase = 'discard';
    this.lastDiscard = null; // { card, by }
    this.eatenThisTurn = null; // chỉ số người bị ăn trong lượt hiện tại
    this.result = null;
    this.log = [];
    this._log(`${this.players[first].name} đi đầu`);
  }

  _log(m) {
    this.log.push(m);
    if (this.log.length > 50) this.log.shift();
  }

  indexOf(id) {
    return this.players.findIndex((p) => p.id === id);
  }

  _me(id, phases) {
    if (this.result) throw new Error('Ván đã kết thúc');
    const i = this.indexOf(id);
    if (i < 0) throw new Error('Bạn không chơi ván này');
    if (i !== this.turn) throw new Error('Chưa tới lượt bạn');
    if (phases && !phases.includes(this.phase)) throw new Error('Không thể thực hiện lúc này');
    return i;
  }

  get isFinalTurn() {
    return this.discardCount[this.turn] === 3;
  }

  _afterTake(i) {
    this.phase = this.discardCount[i] === 3 ? 'lay' : 'discard';
  }

  draw(id) {
    const i = this._me(id, ['draw']);
    if (!this.deck.length) throw new Error('Hết nọc');
    const c = this.deck.pop();
    this.hands[i].push(c);
    this.lastDiscard = null;
    this._log(`${this.players[i].name} bốc bài`);
    this._afterTake(i);
    return c;
  }

  canEat(i) {
    if (this.result || i !== this.turn || this.phase !== 'draw' || !this.lastDiscard) return false;
    const c = this.lastDiscard.card;
    return lockedFeasible([...this.hands[i], c], [...this.eaten[i], c]);
  }

  eat(id) {
    const i = this._me(id, ['draw']);
    if (!this.canEat(i)) throw new Error('Không ăn được lá này');
    const { card, by } = this.lastDiscard;
    this.discards[by].pop();
    this.hands[i].push(card);
    this.eaten[i].push(card);
    const chot = this.discardCount[by] === 4;
    const pay = chot ? TALA_RULES.chotPay : TALA_RULES.eatPay;
    this.scores[i] += pay;
    this.scores[by] -= pay;
    this.eatenThisTurn = by;
    this.lastDiscard = null;
    this._log(`${this.players[i].name} ăn ${chot ? 'CHỐT ' : ''}lá của ${this.players[by].name} (+${pay})`);
    this._afterTake(i);
  }

  canDiscard(i, card) {
    if (!this.hands[i].includes(card) || this.eaten[i].includes(card)) return false;
    const rest = this.hands[i].filter((c) => c !== card);
    return lockedFeasible(rest, this.eaten[i]);
  }

  discard(id, card) {
    const i = this._me(id, ['discard', 'lay']);
    if (this.eaten[i].includes(card)) throw new Error('Không được đánh lá đã ăn');
    if (!this.hands[i].includes(card)) throw new Error('Bạn không có lá này');
    if (this.phase === 'lay' && this.eaten[i].length) throw new Error('Phải hạ hết phỏm chứa lá đã ăn trước');
    if (!this.canDiscard(i, card)) throw new Error('Đánh lá này sẽ phá phỏm chứa lá đã ăn');
    this.hands[i] = this.hands[i].filter((c) => c !== card);
    this.discards[i].push(card);
    this.discardCount[i]++;
    this.lastDiscard = { card, by: i };
    this.eatenThisTurn = null;
    this._log(`${this.players[i].name} đánh ${card}`);
    if (this.phase === 'lay') {
      this.finished[i] = true;
      this.finishOrder.push(i);
      if (!this.melds[i].length) this._log(`${this.players[i].name} MÓM`);
    }
    if (this.discardCount.every((d) => d >= 4)) return this._finish();
    this.turn = (i + 1) % this.n;
    this.phase = 'draw';
  }

  /** Hạ một phỏm (chỉ ở lượt cuối). */
  layMeld(id, cards) {
    const i = this._me(id, ['lay']);
    cards = [...new Set(cards)];
    if (!cards.every((c) => this.hands[i].includes(c))) throw new Error('Lá không có trên tay');
    if (!isMeld(cards)) throw new Error('Không phải phỏm hợp lệ');
    const lockedIn = cards.filter((c) => this.eaten[i].includes(c));
    if (lockedIn.length > 1) throw new Error('Một phỏm không được chứa 2 lá đã ăn');
    const rest = this.hands[i].filter((c) => !cards.includes(c));
    if (!rest.length) throw new Error('Phải giữ lại ít nhất 1 lá để đánh');
    const restLocked = this.eaten[i].filter((c) => !cards.includes(c));
    if (!lockedFeasible(rest, restLocked)) throw new Error('Cách hạ này làm lá đã ăn không còn phỏm');
    this.hands[i] = rest;
    this.eaten[i] = restLocked;
    this.melds[i].push({ cards: sortMeld(cards), owner: i });
    this._log(`${this.players[i].name} hạ phỏm ${cards.join(' ')}`);
  }

  /** Hạ tự động: xếp tối đa điểm, giữ lại ít nhất 1 lá. */
  autoLay(id) {
    const i = this._me(id, ['lay']);
    const best = bestArrangement(this.hands[i], this.eaten[i], { maxCards: this.hands[i].length - 1 });
    if (!best) throw new Error('Không thể hạ');
    for (const m of best.melds) this.layMeld(id, m);
    return best.melds.length;
  }

  /** Gửi 1 lá vào phỏm đã hạ của người khác (hoặc của mình). */
  send(id, card, target, meldIdx) {
    const i = this._me(id, ['lay']);
    if (!this.melds[i].length) throw new Error('Phải hạ phỏm trước khi gửi');
    if (!this.hands[i].includes(card)) throw new Error('Lá không có trên tay');
    if (this.eaten[i].includes(card)) throw new Error('Không được gửi lá đã ăn');
    if (this.hands[i].length <= 1) throw new Error('Phải giữ lại ít nhất 1 lá để đánh');
    const m = this.melds[target] && this.melds[target][meldIdx];
    if (!m) throw new Error('Phỏm không tồn tại');
    const next = [...m.cards, card];
    if (!isMeld(next)) throw new Error('Lá này không gửi được vào phỏm đó');
    m.cards = sortMeld(next);
    this.hands[i] = this.hands[i].filter((c) => c !== card);
    this._log(`${this.players[i].name} gửi ${card} cho ${this.players[target].name}`);
  }

  /** Tìm chỗ gửi được cho lá `card`. */
  sendTargets(card) {
    const res = [];
    this.melds.forEach((ms, t) => ms.forEach((m, k) => { if (isMeld([...m.cards, card])) res.push({ target: t, meldIdx: k }); }));
    return res;
  }

  canU(i) {
    if (this.result || i !== this.turn || this.phase === 'draw') return false;
    if (this.melds[i].length || this.hands[i].length < 10) return false;
    const best = bestArrangement(this.hands[i], this.eaten[i], { objective: 'count' });
    return !!best && best.count >= 9;
  }

  declareU(id) {
    const i = this._me(id, ['discard', 'lay']);
    if (!this.canU(i)) throw new Error('Chưa Ù được');
    const best = bestArrangement(this.hands[i], this.eaten[i], { objective: 'count' });
    const pay = TALA_RULES.uPay;
    const den = this.eatenThisTurn;
    for (let k = 0; k < this.n; k++) {
      if (k === i) continue;
      if (den !== null && den !== undefined) this.scores[den] -= pay;
      else this.scores[k] -= pay;
      this.scores[i] += pay;
    }
    this.melds[i] = best.melds.map((m) => ({ cards: sortMeld(m), owner: i }));
    const used = new Set(best.melds.flat());
    this.hands[i] = this.hands[i].filter((c) => !used.has(c));
    this._log(`${this.players[i].name} Ù!${den !== null && den !== undefined ? ` ${this.players[den].name} đền làng.` : ''}`);
    this.result = {
      type: 'u',
      winner: i,
      den,
      ranking: [i, ...this.players.map((_, k) => k).filter((k) => k !== i)],
      points: this.hands.map(points),
      mom: Array(this.n).fill(false),
      scores: this.scores.slice(),
    };
    this.turn = -1;
    this.phase = 'done';
  }

  _finish() {
    const pts = this.hands.map(points);
    const mom = this.melds.map((m) => m.length === 0);
    const order = this.finishOrder;
    const ranking = order.slice().sort((a, b) => (mom[a] - mom[b]) || (pts[a] - pts[b]) || (order.indexOf(a) - order.indexOf(b)));
    const winner = ranking[0];
    ranking.forEach((p, rank) => {
      if (rank === 0) return;
      const pay = mom[p] ? TALA_RULES.momPay : TALA_RULES.rankPay[rank];
      this.scores[p] -= pay;
      this.scores[winner] += pay;
    });
    this._log(`Nhất: ${this.players[winner].name}`);
    this.result = { type: 'normal', winner, ranking, points: pts, mom, scores: this.scores.slice() };
    this.turn = -1;
    this.phase = 'done';
  }

  /** Gợi ý lá nên đánh: lá rác có điểm cao nhất. */
  suggestDiscard(i) {
    const hand = this.hands[i];
    const best = bestArrangement(hand, this.eaten[i], { maxCards: hand.length - 1 });
    const inMeld = new Set(best ? best.melds.flat() : []);
    const cands = hand.filter((c) => this.canDiscard(i, c)).sort((a, b) => (inMeld.has(a) - inMeld.has(b)) || rankOf(b) - rankOf(a));
    return cands[0];
  }

  /** Tự đánh khi hết giờ. */
  autoPlay(id) {
    const i = this.indexOf(id);
    if (i !== this.turn || this.result) return;
    if (this.phase === 'draw') this.draw(id);
    if (this.phase === 'lay') { try { this.autoLay(id); } catch { /* móm */ } }
    this.discard(id, this.suggestDiscard(i));
  }

  view(viewerId) {
    const me = this.indexOf(viewerId);
    const done = !!this.result;
    return {
      players: this.players.map((p, i) => ({
        id: p.id,
        name: p.name,
        handCount: this.hands[i].length,
        hand: i === me || done ? this.hands[i] : null,
        eaten: this.eaten[i],
        discards: this.discards[i],
        discardCount: this.discardCount[i],
        melds: this.melds[i],
        finished: this.finished[i],
        score: this.scores[i],
      })),
      first: this.first,
      deckCount: this.deck.length,
      turn: this.turn,
      phase: this.phase,
      lastDiscard: this.lastDiscard,
      me,
      canEat: me >= 0 && this.canEat(me),
      canU: me >= 0 && this.canU(me),
      result: this.result,
      log: this.log.slice(-15),
    };
  }
}

export function sortMeld(cards) {
  return cards.slice().sort((a, b) => rankOf(a) - rankOf(b) || a[1].localeCompare(b[1]));
}

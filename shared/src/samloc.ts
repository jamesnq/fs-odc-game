// Engine Sâm lốc (luật miền Bắc phổ biến):
//  - 2–5 người, mỗi người 10 lá. Thứ tự: 3 < 4 < … < K < A < 2 (heo). KHÔNG xét chất.
//  - Bộ đánh: rác (1 lá), đôi, sám (3 lá cùng số), tứ quý, sảnh (≥3 lá liên tiếp).
//    Sảnh: A đứng đầu (A-2-3…) hoặc đứng cuối (…Q-K-A); heo chỉ nằm trong sảnh bắt đầu bằng A; không vòng K-A-2.
//  - Chặn bằng bộ cùng loại, cùng số lá, lá cao nhất lớn hơn. Tứ quý chặt được heo (1 lá 2).
//  - Vòng đánh: người đi đầu đánh bộ bất kỳ; người sau chặn hoặc bỏ lượt (đã bỏ thì nghỉ tới hết vòng).
//    Mọi người bỏ thì người đánh cuối được đi vòng mới.
//  - Báo 1: người kế tiếp còn 1 lá thì nếu đánh rác phải đánh lá lớn nhất.
//  - Báo Sâm: đầu ván, người báo Sâm đi trước và phải đánh hết bài mà không bị ai chặn.
//  - Tới trắng: tứ quý heo, sảnh rồng (10 lá liên tiếp), 5 đôi, 3 sám, 10 lá đồng màu.
//  - Người hết bài đầu tiên thắng, ván kết thúc ngay.
import { newDeck, shuffle, isRed, cardLabel } from './cards.js';

const cardsText = (cards: any) => cards.map(cardLabel).join(' ');

/** Mức trả (đơn vị). Có thể chỉnh theo luật từng nơi. */
export const SAM_RULES = {
  perCard: 1, // mỗi lá còn lại
  cong: 20, // cóng: chưa đánh được lá nào
  thoiHeo: 5, // mỗi lá heo còn trên tay khi thua
  sam: 20, // báo Sâm thành công / thất bại (mỗi nhà)
  toiTrang: 20, // tới trắng (mỗi nhà)
  chatHeo: 10, // bị tứ quý chặt heo trả người chặt
};
export const HAND_SIZE = 10;

const VALUE: Record<string, any> = { 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, T: 10, J: 11, Q: 12, K: 13, A: 14, 2: 15 };
/** Giá trị lá: 3..13, A = 14, 2 (heo) = 15 */
export const valueOf = (c: any) => VALUE[c[0]];
export const isHeo = (c: any) => c[0] === '2';
export const sortHand = (cards: any) => cards.slice().sort((a: any, b: any) => valueOf(a) - valueOf(b) || a[1].localeCompare(b[1]));
export const COMBO_VI: Record<string, any> = { single: 'Rác', pair: 'Đôi', triple: 'Sám', four: 'Tứ quý', straight: 'Sảnh' };

/** Giá trị dùng cho sảnh: A có thể là 1 hoặc 14, heo = 2. */
function straightTop(cards: any) {
  if (cards.length < 3) return 0;
  const vals = cards.map(valueOf).map((v: any) => (v === 15 ? 2 : v));
  const tryVals = (vs: any) => {
    const s = vs.slice().sort((a: any, b: any) => a - b);
    for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1] + 1) return 0;
    if (s.includes(2) && s[0] !== 1) return 0; // heo chỉ nằm trong sảnh bắt đầu bằng A
    return s[s.length - 1];
  };
  const high = tryVals(vals); // A = 14
  const low = vals.includes(14) ? tryVals(vals.map((v: any) => (v === 14 ? 1 : v))) : 0; // A = 1
  return Math.max(high, low);
}

/**
 * Phân loại bộ bài. Trả về { type, len, top, cards } hoặc null nếu không hợp lệ.
 * top: giá trị để so sánh (lá cao nhất).
 */
export function classify(cards: any) {
  if (!Array.isArray(cards) || !cards.length) return null;
  const vals = cards.map(valueOf);
  if (vals.some((v) => !v)) return null;
  const n = cards.length;
  const same = vals.every((v) => v === vals[0]);
  if (n === 1) return { type: 'single', len: 1, top: vals[0], cards };
  if (same && n === 2) return { type: 'pair', len: 2, top: vals[0], cards };
  if (same && n === 3) return { type: 'triple', len: 3, top: vals[0], cards };
  if (same && n === 4) return { type: 'four', len: 4, top: vals[0], cards };
  const top = straightTop(cards);
  if (top) return { type: 'straight', len: n, top, cards };
  return null;
}

/** `next` có chặn được `prev` không. */
export function beats(next: any, prev: any) {
  if (!next) return false;
  if (!prev) return true;
  if (next.type === prev.type && next.len === prev.len) return next.top > prev.top;
  // Tứ quý chặt heo
  if (next.type === 'four' && prev.type === 'single' && prev.top === 15) return true;
  return false;
}

/** Kiểm tra tới trắng. Trả về tên hoặc null. */
export function instantWin(hand: any) {
  if (hand.length !== HAND_SIZE) return null;
  const counts: Record<string, any> = {};
  for (const c of hand) counts[valueOf(c)] = (counts[valueOf(c)] || 0) + 1;
  if (counts[15] === 4) return 'Tứ quý heo';
  if (straightTop(hand)) return 'Sảnh rồng';
  const groups = Object.values(counts);
  if (groups.reduce((a, n) => a + Math.floor(n / 2), 0) >= 5) return '5 đôi';
  if (groups.filter((n) => n >= 3).length >= 3) return '3 sám';
  if (hand.every(isRed) || hand.every((c: any) => !isRed(c))) return 'Đồng màu';
  return null;
}

export class SamLocGame {
  declare initialDeck: any;
  declare players: any;
  declare leader: any;
  declare turn: any;
  declare phase: string;
  declare samDecided: any;
  declare samBy: number;
  declare lastPlay: any;
  declare bonuses: any;
  declare log: any;
  declare result: any;

  /**
   * @param players [{ id, name }] theo thứ tự lượt
   * @param leader chỉ số người đi trước
   * @param deck tùy chọn (để test)
   */
  constructor(players: any, leader = 0, deck: any = null) {
    if (players.length < 2 || players.length > 5) throw new Error('Sâm lốc chơi 2–5 người');
    const d = deck ? deck.slice() : shuffle(newDeck());
    /** Thứ tự bộ bài lúc vừa xáo (lá chia trước ở đầu mảng) — để server cam kết/công bố. */
    this.initialDeck = d.slice();
    this.players = players.map((p: any) => ({
      id: p.id, name: p.name, hand: sortHand(d.splice(0, HAND_SIZE)), played: 0, passed: false,
    }));
    this.leader = leader;
    this.turn = leader;
    this.phase = 'sam'; // sam (báo Sâm) | play | done
    this.samDecided = new Set();
    this.samBy = -1; // người báo Sâm
    this.lastPlay = null; // { by, combo }
    this.bonuses = []; // { from, to, amount, reason }
    this.log = [];
    this.result = null;
    // Tới trắng: xét từ người đi trước theo vòng
    for (let k = 0; k < this.players.length; k++) {
      const i = (leader + k) % this.players.length;
      const w = instantWin(this.players[i].hand);
      if (w) { this._finish(i, 'toiTrang', w); break; }
    }
  }

  indexOf(id: any) { return this.players.findIndex((p: any) => p.id === id); }
  _seat(id: any) {
    const i = this.indexOf(id);
    if (i < 0) throw new Error('Bạn không chơi ván này');
    return i;
  }
  _next(i: any) { return (i + 1) % this.players.length; }

  // ---------- Báo Sâm ----------
  declareSam(id: any, yes: any) {
    if (this.phase !== 'sam') throw new Error('Đã hết thời gian báo Sâm');
    const i = this._seat(id);
    if (this.samDecided.has(i)) throw new Error('Bạn đã quyết định rồi');
    this.samDecided.add(i);
    if (yes) {
      this.samBy = i;
      this.log.push(`${this.players[i].name} báo Sâm!`);
      this._startPlay(i);
    } else if (this.samDecided.size === this.players.length) {
      this._startPlay(this.leader);
    }
  }

  /** Hết giờ báo Sâm: coi như không ai báo. */
  endSamPhase() {
    if (this.phase === 'sam') this._startPlay(this.leader);
  }

  _startPlay(leader: any) {
    this.phase = 'play';
    this.turn = leader;
    this.leader = leader;
  }

  // ---------- Đánh bài ----------
  /** Luật báo 1: người kế tiếp (chưa bỏ lượt vòng này hoặc sẽ đi vòng mới) còn 1 lá. */
  _nextHasOne(i: any) {
    return this.players[this._next(i)].hand.length === 1;
  }

  /** Kiểm tra một nước đánh, trả về combo hoặc ném lỗi. */
  check(id: any, cards: any) {
    if (this.phase !== 'play') throw new Error(this.phase === 'sam' ? 'Đang chờ báo Sâm' : 'Ván đã kết thúc');
    const i = this._seat(id);
    if (this.turn !== i) throw new Error('Chưa tới lượt bạn');
    const p = this.players[i];
    if (new Set(cards).size !== cards.length || !cards.every((c: any) => p.hand.includes(c))) throw new Error('Bạn không có những lá này');
    const combo = classify(cards);
    if (!combo) throw new Error('Bộ bài không hợp lệ');
    if (this.lastPlay && !beats(combo, this.lastPlay.combo)) {
      throw new Error(`Không chặn được ${COMBO_VI[this.lastPlay.combo.type].toLowerCase()} trên bàn`);
    }
    if (combo.type === 'single' && this._nextHasOne(i)) {
      const max = Math.max(...p.hand.map(valueOf));
      if (combo.top < max) throw new Error('Người sau báo 1: đánh rác thì phải đánh lá lớn nhất');
    }
    return combo;
  }

  play(id: any, cards: any) {
    const combo = this.check(id, cards);
    const i = this.turn;
    const p = this.players[i];
    // Bị chặn khi đang báo Sâm → Sâm thất bại
    if (this.samBy >= 0 && i !== this.samBy && this.lastPlay) {
      p.hand = p.hand.filter((c: any) => !cards.includes(c));
      p.played += cards.length;
      this.lastPlay = { by: i, combo };
      this.log.push(`${p.name} chặn Sâm bằng ${COMBO_VI[combo.type].toLowerCase()} ${cardsText(cards)}`);
      return this._finish(i, 'samFail');
    }
    // Tứ quý chặt heo
    if (this.lastPlay && combo.type === 'four' && this.lastPlay.combo.type === 'single' && this.lastPlay.combo.top === 15) {
      const victim = this.lastPlay.by;
      this.bonuses.push({ from: victim, to: i, amount: SAM_RULES.chatHeo, reason: 'Chặt heo' });
      this.log.push(`${p.name} chặt heo của ${this.players[victim].name}!`);
    }
    p.hand = p.hand.filter((c: any) => !cards.includes(c));
    p.played += cards.length;
    this.lastPlay = { by: i, combo };
    this.log.push(`${p.name}: ${COMBO_VI[combo.type]} ${cardsText(cards)}`);
    if (!p.hand.length) return this._finish(i, this.samBy === i ? 'sam' : 'normal');
    this._advance();
  }

  pass(id: any) {
    if (this.phase !== 'play') throw new Error('Không thể bỏ lượt lúc này');
    const i = this._seat(id);
    if (this.turn !== i) throw new Error('Chưa tới lượt bạn');
    if (!this.lastPlay) throw new Error('Bạn đang đi đầu vòng, phải đánh');
    this.players[i].passed = true;
    this.log.push(`${this.players[i].name} bỏ lượt`);
    this._advance();
  }

  _advance() {
    const n = this.players.length;
    for (let k = 1; k < n; k++) {
      const j = (this.turn + k) % n;
      if (j === this.lastPlay.by) break;
      if (!this.players[j].passed) { this.turn = j; return; }
    }
    // Mọi người đã bỏ → người đánh cuối đi vòng mới
    this.turn = this.lastPlay.by;
    this.lastPlay = null;
    for (const p of this.players) p.passed = false;
  }

  /** Nước đi tự động khi hết giờ: đi đầu thì đánh lá nhỏ nhất (theo luật báo 1), không thì bỏ. */
  autoPlay(id: any) {
    if (this.phase === 'sam') return this.declareSam(id, false);
    const i = this._seat(id);
    if (this.turn !== i || this.phase !== 'play') return;
    if (this.lastPlay) return this.pass(id);
    const hand = this.players[i].hand;
    const card = this._nextHasOne(i) ? hand[hand.length - 1] : hand[0];
    this.play(id, [card]);
  }

  // ---------- Kết thúc ----------
  _finish(winner: any, type: any, detail: any = null) {
    const n = this.players.length;
    const scores = Array(n).fill(0);
    const lines = Array.from({ length: n }, () => [] as {amount: number; reason: string; with: number}[]);
    const pay = (from: any, to: any, amount: any, reason: any) => {
      scores[from] -= amount;
      scores[to] += amount;
      lines[from].push({ amount: -amount, reason, with: to });
      lines[to].push({ amount, reason, with: from });
    };
    for (let k = 0; k < n; k++) {
      if (type === 'samFail') {
        // Người báo Sâm đền cho tất cả các nhà khác
        if (k !== this.samBy) pay(this.samBy, k, SAM_RULES.sam, 'Đền Sâm');
        continue;
      }
      if (k === winner) continue;
      if (type === 'toiTrang') pay(k, winner, SAM_RULES.toiTrang, `Tới trắng (${detail})`);
      else if (type === 'sam') pay(k, winner, SAM_RULES.sam, 'Sâm thành công');
      else {
        const p = this.players[k];
        if (p.played === 0) pay(k, winner, SAM_RULES.cong, 'Cóng');
        else pay(k, winner, p.hand.length * SAM_RULES.perCard, `${p.hand.length} lá`);
        const heo = p.hand.filter(isHeo).length;
        if (heo) pay(k, winner, heo * SAM_RULES.thoiHeo, `Thối ${heo} heo`);
      }
    }
    for (const b of this.bonuses) pay(b.from, b.to, b.amount, b.reason);
    this.phase = 'done';
    this.turn = -1;
    const TYPE_VI: Record<string, any> = { normal: 'Về nhất', sam: 'Sâm thành công', samFail: `${this.samBy >= 0 ? this.players[this.samBy].name : ''} bị chặn Sâm`, toiTrang: `Tới trắng: ${detail}` };
    // Khi đền Sâm, người "thắng" ván là người chặn; người thua là người báo Sâm
    this.result = { winner, type, text: TYPE_VI[type], scores, lines, samBy: this.samBy };
    this.log.push(`Kết thúc — ${this.players[winner].name}: ${TYPE_VI[type]}`);
  }

  view(viewerId: any) {
    const me = this.indexOf(viewerId);
    const reveal = !!this.result;
    return {
      me,
      phase: this.phase,
      turn: this.turn,
      leader: this.leader,
      samBy: this.samBy,
      samDecided: [...this.samDecided],
      players: this.players.map((p: any, i: any) => ({
        id: p.id, name: p.name, count: p.hand.length, played: p.played, passed: p.passed,
        hand: i === me || reveal ? p.hand : null,
      })),
      lastPlay: this.lastPlay && { by: this.lastPlay.by, type: this.lastPlay.combo.type, cards: this.lastPlay.combo.cards },
      log: this.log.slice(-30),
      result: this.result,
    };
  }
}

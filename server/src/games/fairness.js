import crypto from 'node:crypto';

/**
 * Xáo bài kiểm chứng được (commit–reveal, "provably fair"), cam kết theo từng lá:
 *
 *  1. Ngay khi xáo, với mỗi vị trí i của bộ bài, server tạo muối ngẫu nhiên salt_i (128 bit) và tính
 *       leaf_i = SHA-256("i:<lá>:salt_i")
 *     rồi công bố commit = SHA-256(leaf_0 ‖ leaf_1 ‖ … ‖ leaf_51) — TRƯỚC khi ai thấy lá nào.
 *  2. Khi ván xong, server công bố toàn bộ leaf_i và (lá, salt_i) của những lá người xem được phép thấy
 *     (Sâm lốc/Tá lả: cả bộ; Poker: bài chung, bài đã lật, bài tẩy của chính mình — bài bỏ của người khác vẫn ẩn).
 *  3. Người chơi kiểm tra: SHA-256(nối các leaf) == commit nhận lúc đầu ván, và mỗi lá được công bố
 *     băm ra đúng leaf ở vị trí của nó. Khớp ⇒ server không thể đổi/sắp lại lá nào sau khi đã cam kết.
 *
 * Muối riêng từng lá giúp: không dò ngược được lá từ leaf (chỉ có 52 khả năng/lá nếu không có muối),
 * và có thể công bố một phần bộ bài mà không lộ phần còn lại.
 */
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const leafOf = (i, card, salt) => sha256(`${i}:${card}:${salt}`);
export const commitOfLeaves = (leaves) => sha256(leaves.join(''));

export class DeckCommitments {
  constructor() {
    this.ref = null; // mảng bộ bài của ván hiện tại (so theo tham chiếu để biết vừa có ván mới)
    this.current = null; // { no, deck, salts, leaves, commit }
    this.no = 0;
  }

  /** Gọi trước khi phát trạng thái: nếu vừa xáo bộ mới thì tạo cam kết mới. */
  track(deck) {
    if (!deck || deck === this.ref) return;
    this.ref = deck;
    const salts = deck.map(() => crypto.randomBytes(16).toString('hex'));
    const leaves = deck.map((c, i) => leafOf(i, c, salts[i]));
    this.current = { no: ++this.no, deck: deck.slice(), salts, leaves, commit: commitOfLeaves(leaves) };
  }

  /**
   * Phần gửi cho client.
   * @param finished ván hiện tại đã xong chưa (chưa xong thì chỉ có commit)
   * @param visible  (cards[]) => Set|null — các lá người xem được thấy của một ván; null = cả bộ
   */
  view(finished, visible = () => null) {
    if (!this.current) return null;
    const reveal = (c) => {
      const allowed = visible(c.deck);
      return {
        no: c.no,
        commit: c.commit,
        leaves: c.leaves,
        cards: c.deck.flatMap((card, i) => (!allowed || allowed.has(card) ? [{ i, card, salt: c.salts[i] }] : [])),
        total: c.deck.length,
      };
    };
    return finished ? reveal(this.current) : { no: this.current.no, commit: this.current.commit };
  }
}

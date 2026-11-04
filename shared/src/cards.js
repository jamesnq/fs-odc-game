// Biểu diễn lá bài dạng chuỗi 2 ký tự: hạng + chất. Ví dụ "AS" = Át bích, "TD" = 10 rô.
export const RANKS = 'A23456789TJQK';
export const SUITS = 'SCDH'; // ♠ bích, ♣ chuồn/tép, ♦ rô, ♥ cơ
export const SUIT_SYMBOL = { S: '♠', C: '♣', D: '♦', H: '♥' };
export const RANK_LABEL = { A: 'A', T: '10', J: 'J', Q: 'Q', K: 'K' };

/** Hạng 1..13 (A = 1, K = 13) */
export const rankOf = (c) => RANKS.indexOf(c[0]) + 1;
export const suitOf = (c) => c[1];
export const isRed = (c) => c[1] === 'D' || c[1] === 'H';
export const cardLabel = (c) => (RANK_LABEL[c[0]] || c[0]) + SUIT_SYMBOL[c[1]];

export function newDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

function randInt(n) {
  const c = globalThis.crypto;
  if (c && c.getRandomValues) {
    // Loại bỏ modulo bias
    const max = Math.floor(0x100000000 / n) * n;
    const buf = new Uint32Array(1);
    do c.getRandomValues(buf); while (buf[0] >= max);
    return buf[0] % n;
  }
  return Math.floor(Math.random() * n);
}

/** Fisher–Yates */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

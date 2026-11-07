// Biểu diễn lá bài dạng chuỗi 2 ký tự: hạng + chất. Ví dụ "AS" = Át bích, "TD" = 10 rô.
export const RANKS = 'A23456789TJQK';
export const SUITS = 'SCDH'; // ♠ bích, ♣ chuồn/tép, ♦ rô, ♥ cơ
export const SUIT_SYMBOL: Record<string, string> = { S: '♠', C: '♣', D: '♦', H: '♥' };
export const RANK_LABEL: Record<string, string> = { A: 'A', T: '10', J: 'J', Q: 'Q', K: 'K' };

/** Hạng 1..13 (A = 1, K = 13) */
export const rankOf = (c: string) => RANKS.indexOf(c[0]) + 1;
export const suitOf = (c: string) => c[1];
export const isRed = (c: string) => c[1] === 'D' || c[1] === 'H';
export const cardLabel = (c: string) => (RANK_LABEL[c[0]] || c[0]) + SUIT_SYMBOL[c[1]];

export function newDeck() {
  const d: string[] = [];
  for (const s of SUITS) for (const r of RANKS) d.push(r + s);
  return d;
}

/**
 * Số nguyên ngẫu nhiên đều trong [0, n) từ bộ sinh số ngẫu nhiên an toàn mật mã (CSPRNG)
 * của hệ điều hành (Web Crypto — có sẵn trong Node ≥ 19 và mọi trình duyệt).
 * Dùng rejection sampling để loại bỏ modulo bias: mọi giá trị có xác suất đúng bằng 1/n.
 * Không có CSPRNG thì báo lỗi thay vì lùi về Math.random (đoán trước được).
 */
export function randInt(n: number) {
  if (!Number.isInteger(n) || n < 1 || n > 0x100000000) throw new RangeError('randInt: n không hợp lệ');
  const c = globalThis.crypto;
  if (!c || typeof c.getRandomValues !== 'function') throw new Error('Không có bộ sinh số ngẫu nhiên an toàn (crypto.getRandomValues)');
  const max = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  do c.getRandomValues(buf); while (buf[0] >= max);
  return buf[0] % n;
}

/**
 * Fisher–Yates (Durstenfeld) dùng randInt ở trên: mỗi trong 52! hoán vị có xác suất như nhau.
 * Đi kèm cơ chế cam kết–công bố (commit–reveal) ở server để người chơi kiểm chứng bộ bài không bị đổi giữa ván.
 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

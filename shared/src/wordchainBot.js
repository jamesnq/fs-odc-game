// Máy chơi Nối từ: chọn từ trong danh sách từ ghép, bắt đầu bằng chữ cần nối và chưa dùng trong ván.
//  - Dễ: chọn ngẫu nhiên, ưu tiên từ để lại nhiều đường nối cho người sau; thỉnh thoảng "bí" (hết giờ).
//  - Vừa: chọn ngẫu nhiên, hiếm khi bí.
//  - Khó: gài bẫy — chọn từ có chữ cuối khó nối tiếp nhất (ít từ bắt đầu bằng chữ đó còn chưa dùng);
//    thỉnh thoảng dùng luôn từ cụt (không còn từ nối tiếp → thắng luôn theo luật Nối từ).
//  - Dễ / Vừa không cố ý dùng từ cụt.
import { parseWord, syllableKey, WORD_SYLLABLES } from './wordchain.js';

/** Xác suất máy "bí" mỗi lượt (không trả lời → hết giờ). */
export const BOT_MISS = { easy: 0.12, medium: 0.03, hard: 0.01 };
/** Xác suất máy Khó dùng từ cụt (nối xong không còn từ nào nối tiếp → thắng luôn) khi có. */
export const DEAD_END_RATE = 0.35;

/**
 * Tạo chỉ mục từ danh sách từ ghép: chữ đầu → các từ.
 * @returns {{ byFirst: Map<string, {text, key, lastKey}[]>, all: {text, key, lastKey}[] }}
 */
export function buildWordIndex(list) {
  const byFirst = new Map();
  const all = [];
  const seen = new Set();
  for (const raw of list) {
    let w;
    try { w = parseWord(raw); } catch { continue; }
    const key = w.keys.join(' ');
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { text: w.text, key, lastKey: w.keys[WORD_SYLLABLES - 1] };
    all.push(entry);
    const first = w.keys[0];
    if (!byFirst.has(first)) byFirst.set(first, []);
    byFirst.get(first).push(entry);
  }
  return { byFirst, all };
}

/** Số từ còn chưa dùng bắt đầu bằng chữ `key`. */
function exits(index, used, key) {
  const list = index.byFirst.get(key);
  if (!list) return 0;
  let n = 0;
  for (const e of list) if (!used.has(e.key)) n++;
  return n;
}

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

/**
 * Chọn từ cho máy.
 * @param game WordChainGame (cần .required, .used)
 * @param level 'easy' | 'medium' | 'hard'
 * @param index từ buildWordIndex
 * @param opts { rng, miss } miss: ghi đè xác suất bí
 * @returns chuỗi từ, hoặc null nếu máy bí
 */
export function chooseWord(game, level, index, { rng = Math.random, miss = BOT_MISS[level] ?? 0.03 } = {}) {
  if (rng() < miss) return null;
  const used = game.used;
  const req = game.required;
  const pool = (req ? index.byFirst.get(syllableKey(req)) || [] : index.all).filter((e) => !used.has(e.key));
  if (!pool.length) return null;
  if (!req) {
    // Từ đầu tiên: chọn từ dễ nối tiếp để ván vui
    const easy = pool.filter((e) => exits(index, used, e.lastKey) >= 20);
    return pick(easy.length ? easy : pool, rng).text;
  }
  // Mỗi lượt chỉ xét tối đa ~200 từ để không tốn thời gian
  const sample = pool.length > 200 ? Array.from({ length: 200 }, () => pick(pool, rng)) : pool;
  // n = số từ còn nối tiếp được sau từ này (không tính chính nó)
  const scored = sample.map((e) => ({ e, n: exits(index, used, e.lastKey) - (e.lastKey === e.key.split(' ')[0] ? 1 : 0) }));
  // Luật Nối từ: nối từ cụt (n = 0) là thắng luôn → chỉ máy Khó mới dùng, và không phải lúc nào cũng dùng
  const open = scored.filter((x) => x.n > 0);
  const alive = open.length ? open : scored;
  if (level === 'medium') return pick(alive, rng).e.text;
  if (level === 'easy') {
    const friendly = alive.filter((x) => x.n >= 10);
    return pick(friendly.length ? friendly : alive, rng).e.text;
  }
  // Khó: từ cụt (35%) hoặc từ ít đường nối nhất; ngẫu nhiên trong vài lựa chọn tốt nhất để không lặp lại
  const dead = scored.filter((x) => x.n === 0);
  if (dead.length && (rng() < DEAD_END_RATE || !open.length)) return pick(dead, rng).e.text;
  alive.sort((a, b) => a.n - b.n);
  const best = alive[0].n;
  const top = alive.filter((x) => x.n <= best + 1).slice(0, 5);
  return pick(top, rng).e.text;
}

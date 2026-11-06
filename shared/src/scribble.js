// Trò Vẽ đoán chữ: một người vẽ, những người còn lại đoán từ.
// Phần dùng chung giữa server và client: bảng màu, kích thước khung vẽ, chuẩn hóa câu đoán,
// gợi ý chữ cái, tính điểm, kiểm tra nét vẽ gửi lên.

/** Khung vẽ có kích thước logic cố định (tỉ lệ 4:3); trình duyệt tự co giãn khi hiển thị. */
export const CANVAS_W = 800;
export const CANVAS_H = 600;

/** Bảng màu — nét vẽ chỉ gửi chỉ số màu. Màu 0 (trắng) cũng là cục tẩy. */
export const PALETTE = [
  '#ffffff', '#000000', '#7f7f7f', '#c3c3c3', '#ef4444', '#f97316', '#facc15', '#22c55e',
  '#15803d', '#38bdf8', '#2563eb', '#7c3aed', '#ec4899', '#f9a8d4', '#92400e', '#fde68a',
];
export const BRUSH_SIZES = [3, 6, 12, 20, 32];
const MAX_POINTS_PER_OP = 400;
const MAX_OPS_PER_PACKET = 30;

/** Bỏ dấu (thanh và mũ / móc / trăng, đ → d) để đoán không cần gõ dấu. */
export function stripAccents(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}

/** Chuẩn hóa câu đoán / đáp án: chữ thường, bỏ dấu câu, gộp khoảng trắng. */
export function normalizeGuess(s) {
  return String(s || '').normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** So khớp không phân biệt dấu: "con meo" = "con mèo". */
export const guessKey = (s) => stripAccents(normalizeGuess(s));

/** Khoảng cách sửa (Levenshtein) giữa hai chuỗi ngắn. */
export function editDistance(a, b) {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

/** Kết quả một câu đoán: 'correct' | 'close' (sai 1 chữ cái) | 'wrong'. */
export function checkGuess(guess, word) {
  const g = guessKey(guess);
  const w = guessKey(word);
  if (!g) return 'wrong';
  if (g === w) return 'correct';
  if (w.length >= 4 && Math.abs(g.length - w.length) <= 1 && editDistance(g, w) === 1) return 'close';
  return 'wrong';
}

/** Đáp án có lộ ra trong tin nhắn không (để chặn người vẽ / người đã đoán đúng nhắc bài). */
export function revealsWord(text, word) {
  const t = ` ${guessKey(text)} `;
  const w = guessKey(word);
  return !!w && t.includes(` ${w} `);
}

/** Mặt nạ gợi ý: chữ chưa lộ thành "_", giữ khoảng trắng. revealed: các vị trí đã lộ. */
export function maskWord(word, revealed = new Set()) {
  return [...word].map((ch, i) => (ch === ' ' ? ' ' : revealed.has(i) ? ch : '_')).join('');
}

/** Số chữ cái được gợi ý tối đa (không bao giờ lộ quá nửa từ). */
export function hintCount(word) {
  const letters = [...word].filter((c) => c !== ' ').length;
  return letters <= 3 ? 1 : Math.min(4, Math.floor(letters * 0.4));
}

/** Điểm người đoán đúng: đoán càng sớm càng nhiều điểm, người đoán trước được thêm. */
export function guessPoints(timeLeftMs, totalMs, order) {
  const frac = Math.max(0, Math.min(1, timeLeftMs / totalMs));
  return Math.round(50 + 350 * frac) + Math.max(0, 50 - order * 15);
}

/** Điểm người vẽ cho mỗi người đoán đúng. */
export const DRAWER_POINTS = 60;

const int = (v, min, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
};

/**
 * Kiểm tra và làm sạch các thao tác vẽ gửi lên. Trả về mảng thao tác hợp lệ.
 *   { k: 'l', id, c, w, p: [x0, y0, x1, y1, …] }   nét vẽ (một nét dài gửi thành nhiều đoạn cùng id)
 *   { k: 'f', id, c, p: [x, y] }                   đổ màu
 *   { k: 'u', id }                                 hoàn tác nét có id này
 *   { k: 'c' }                                     xóa hết
 */
export function cleanOps(ops) {
  if (!Array.isArray(ops)) return [];
  const out = [];
  for (const o of ops.slice(0, MAX_OPS_PER_PACKET)) {
    if (!o || typeof o !== 'object') continue;
    if (o.k === 'c') { out.push({ k: 'c' }); continue; }
    const id = int(o.id, 0, 1e9);
    if (id === null) continue;
    if (o.k === 'u') { out.push({ k: 'u', id }); continue; }
    const c = Number(o.c);
    if (!Number.isInteger(c) || c < 0 || c >= PALETTE.length || !Array.isArray(o.p)) continue;
    if (o.k === 'f') {
      const x = int(o.p[0], 0, CANVAS_W - 1);
      const y = int(o.p[1], 0, CANVAS_H - 1);
      if (x !== null && y !== null) out.push({ k: 'f', id, c, p: [x, y] });
      continue;
    }
    if (o.k !== 'l') continue;
    const w = int(o.w, 1, 60);
    const raw = o.p.slice(0, MAX_POINTS_PER_OP * 2);
    const p = [];
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const x = int(raw[i], -20, CANVAS_W + 20);
      const y = int(raw[i + 1], -20, CANVAS_H + 20);
      if (x === null || y === null) break;
      p.push(x, y);
    }
    if (w !== null && p.length >= 2) out.push({ k: 'l', id, c, w, p });
  }
  return out;
}

/** Danh sách từ tự thêm của chủ phòng: cách nhau dấu phẩy hoặc xuống dòng. */
export function parseCustomWords(text, max = 300) {
  const seen = new Set();
  const out = [];
  for (const raw of String(text || '').split(/[,\n;]/)) {
    const w = normalizeGuess(raw);
    if (!w || w.length > 30 || seen.has(guessKey(w))) continue;
    seen.add(guessKey(w));
    out.push(w);
    if (out.length >= max) break;
  }
  return out;
}

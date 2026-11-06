// Engine trò Đoán chữ (kiểu Wordle, cho tiếng Việt): đoán một từ 2 chữ trong 6 lượt.
// Mỗi chữ (âm tiết) được tách thành 3 phần: âm đầu · vần · thanh. Sau mỗi lượt, từng phần được tô:
//   🟩 'g' đúng phần đó ở đúng chữ · 🟨 'y' có ở chữ còn lại · ⬛ 'x' không có.
// Ví dụ từ bí mật "học sinh", đoán "hát xinh": h🟩 at⬛ sắc⬛ · x⬛ inh🟩 ngang🟩.
import { syllableKey } from './wordchain.js';

export const MAX_GUESSES = 6;
export const WORD_LEN = 2;
export const PARTS = ['onset', 'rhyme', 'tone'];
export const TONE_NAMES = ['ngang', 'huyền', 'sắc', 'ngã', 'hỏi', 'nặng']; // theo số thanh của syllableKey
export const TONE_MARKS = ['', '̀', '́', '̃', '̉', '̣'];

// Âm đầu, xét dài trước ngắn
const ONSETS = ['ngh', 'ng', 'nh', 'ch', 'gh', 'gi', 'kh', 'ph', 'th', 'tr', 'qu',
  'b', 'c', 'd', 'đ', 'g', 'h', 'k', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'x'];
const VOWELS = new Set([...'aăâeêioôơuưy']);

/** Tách âm tiết thành { onset, rhyme, tone } (tone là số 0–5, xem TONE_NAMES). */
export function splitSyllable(s) {
  const key = syllableKey(s); // chữ gốc + số thanh, vd "hoc5"
  const tone = Number(key.slice(-1));
  const base = key.slice(0, -1);
  let onset = ONSETS.find((o) => base.startsWith(o)) || '';
  // "gi" chỉ là âm đầu khi theo sau là nguyên âm (giữa, gió); "gìn", "gíp" là g + in/ip
  if (onset === 'gi' && !VOWELS.has(base[2])) onset = base.length === 2 ? 'gi' : 'g';
  let rhyme = base.slice(onset.length);
  if (!rhyme && onset === 'gi') rhyme = 'i'; // "gì" = gi + i
  return { onset, rhyme, tone };
}

/** Tách một từ thành mảng các âm tiết đã phân tích. */
export const splitWord = (text) => String(text).normalize('NFC').toLowerCase().trim().split(/\s+/).map(splitSyllable);

/**
 * Chấm một lượt đoán so với từ bí mật.
 * @returns mảng 2 phần tử (mỗi chữ), mỗi phần tử { onset, rhyme, tone } với giá trị 'g' | 'y' | 'x'
 */
export function scoreGuess(secret, guess) {
  const S = splitWord(secret), G = splitWord(guess);
  const res = G.map(() => ({}));
  for (const part of PARTS) {
    // Đếm các phần chưa khớp đúng vị trí của từ bí mật (xử lý trùng lặp như Wordle)
    const left = new Map();
    G.forEach((g, i) => {
      if (S[i] && g[part] === S[i][part]) res[i][part] = 'g';
      else if (S[i]) left.set(S[i][part], (left.get(S[i][part]) || 0) + 1);
    });
    G.forEach((g, i) => {
      if (res[i][part]) return;
      const n = left.get(g[part]) || 0;
      if (n > 0) { res[i][part] = 'y'; left.set(g[part], n - 1); } else res[i][part] = 'x';
    });
  }
  return res;
}

export const isSolved = (marks) => marks.every((m) => PARTS.every((p) => m[p] === 'g'));

/** Hiển thị phần âm đầu / vần / thanh cho người đọc. */
export function partLabel(part, value) {
  if (part === 'tone') return TONE_NAMES[value] ?? '?';
  if (part === 'onset') return value || '∅';
  return value;
}

/** Chọn từ theo ngày (giờ Việt Nam) — mọi người cùng một từ mỗi ngày. */
export function dailyIndex(n, date = new Date()) {
  const vn = new Date(date.getTime() + 7 * 3600_000);
  const day = Math.floor(vn.getTime() / 86400_000);
  // Xáo cố định theo ngày để thứ tự không lộ theo danh sách
  let h = day * 2654435761 >>> 0;
  h ^= h >>> 16; h = Math.imul(h, 2246822507) >>> 0; h ^= h >>> 13;
  return h % n;
}

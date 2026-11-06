// Engine trò Đố vui (kiểu Kahoot): câu hỏi trắc nghiệm có giờ, trả lời càng nhanh càng nhiều điểm.
//  - Điểm câu đúng = 1000 × (1 − (thời gian trả lời / thời gian câu hỏi) / 2), trả lời trong 0,5 giây được trọn 1000.
//  - Trả lời đúng liên tiếp được thưởng chuỗi: đúng 2 câu liền +100, 3 câu +200 … tối đa +500. Sai / bỏ qua là mất chuỗi.
//  - Bộ câu hỏi tự soạn viết dạng văn bản đơn giản (xem parseQuizText).

export const MAX_POINTS = 1000;
/** Chủ đề của bộ câu hỏi có sẵn (server/src/data/quiz-vi.json). */
export const QUIZ_CATEGORIES = [
  'Địa lý', 'Thế giới', 'Lịch sử', 'Di sản & Danh thắng', 'Văn hóa & Ẩm thực', 'Tiếng Việt & Văn học', 'Ca dao & Thành ngữ',
  'Khoa học', 'Vũ trụ', 'Động vật & Thiên nhiên', 'Sức khỏe & Cơ thể', 'Phát minh & Nhân vật', 'Công nghệ',
  'Âm nhạc & Điện ảnh', 'Thể thao', 'Đời sống & An toàn', 'Toán & Đố mẹo',
];

/** Mẫu gợi ý khi soạn bộ câu hỏi mới. */
export const QUIZ_TEMPLATE = `# Tên bộ câu hỏi của bạn

? Thủ đô của Việt Nam là gì?
* Hà Nội
- Huế
- Đà Nẵng
- Cần Thơ

? Mèo có mấy chân?
- 2
* 4
- 6

? Mặt Trời mọc ở hướng Đông. Đúng hay sai?
* Đúng
- Sai
`;
export const LIMITS = { questions: 50, question: 200, choice: 80, title: 60, minChoices: 2, maxChoices: 4 };

/** Điểm của một câu trả lời. */
export function scoreAnswer(correct, elapsedMs, totalMs) {
  if (!correct) return 0;
  if (elapsedMs <= 500) return MAX_POINTS;
  const r = Math.min(1, Math.max(0, elapsedMs / totalMs));
  return Math.round(MAX_POINTS * (1 - r / 2));
}

/** Điểm thưởng chuỗi khi vừa đạt chuỗi `streak` câu đúng liên tiếp. */
export const streakBonus = (streak) => (streak >= 2 ? Math.min(500, (streak - 1) * 100) : 0);

/**
 * Đọc bộ câu hỏi tự soạn. Mẫu:
 *
 *   # Tên bộ câu hỏi            (tùy chọn)
 *   ? Thủ đô của Việt Nam là gì?
 *   * Hà Nội                    (dấu * = đáp án đúng, đúng một đáp án)
 *   - Huế
 *   - Đà Nẵng
 *
 * Mỗi câu 2–4 đáp án. Trả về { title, questions: [{ q, choices, answer }] } hoặc ném lỗi kèm số dòng.
 */
export function parseQuizText(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  let title = '';
  const questions = [];
  let cur = null;
  const fail = (n, msg) => { throw new Error(`Dòng ${n}: ${msg}`); };
  const finish = (n) => {
    if (!cur) return;
    if (cur.choices.length < LIMITS.minChoices) fail(n, `câu "${short(cur.q)}" cần ít nhất ${LIMITS.minChoices} đáp án`);
    const right = cur.marks.filter(Boolean).length;
    if (right !== 1) fail(n, `câu "${short(cur.q)}" phải có đúng 1 đáp án đúng (đánh dấu *), đang có ${right}`);
    questions.push({ q: cur.q, choices: cur.choices, answer: cur.marks.indexOf(true) });
    cur = null;
  };
  lines.forEach((raw, k) => {
    const n = k + 1;
    const line = raw.trim();
    if (!line) return;
    const mark = line[0];
    const body = line.slice(1).trim();
    if (mark === '#') {
      if (!title && !questions.length && !cur) title = body.slice(0, LIMITS.title);
      return;
    }
    if (mark === '?') {
      finish(n);
      if (!body) fail(n, 'câu hỏi đang trống');
      if (body.length > LIMITS.question) fail(n, `câu hỏi dài quá ${LIMITS.question} ký tự`);
      if (questions.length >= LIMITS.questions) fail(n, `tối đa ${LIMITS.questions} câu hỏi`);
      cur = { q: body, choices: [], marks: [], line: n };
      return;
    }
    if (mark === '*' || mark === '-') {
      if (!cur) fail(n, 'đáp án phải nằm sau một câu hỏi (dòng bắt đầu bằng ?)');
      if (!body) fail(n, 'đáp án đang trống');
      if (body.length > LIMITS.choice) fail(n, `đáp án dài quá ${LIMITS.choice} ký tự`);
      if (cur.choices.length >= LIMITS.maxChoices) fail(n, `mỗi câu tối đa ${LIMITS.maxChoices} đáp án`);
      if (cur.choices.some((c) => c.toLowerCase() === body.toLowerCase())) fail(n, `đáp án "${short(body)}" bị trùng`);
      cur.choices.push(body);
      cur.marks.push(mark === '*');
      return;
    }
    fail(n, 'dòng phải bắt đầu bằng ? (câu hỏi), * (đáp án đúng), - (đáp án sai) hoặc # (tên bộ)');
  });
  finish(lines.length);
  if (!questions.length) throw new Error('Chưa có câu hỏi nào');
  return { title, questions };
}

/** Viết lại bộ câu hỏi ra dạng văn bản (để sửa tiếp). */
export function quizToText({ title, questions }) {
  const parts = title ? [`# ${title}`, ''] : [];
  for (const q of questions) {
    parts.push(`? ${q.q}`, ...q.choices.map((c, i) => `${i === q.answer ? '*' : '-'} ${c}`), '');
  }
  return parts.join('\n').trim() + '\n';
}

const short = (s) => (s.length > 30 ? s.slice(0, 30) + '…' : s);

/** Xáo trộn tại chỗ (Fisher–Yates). */
export function shuffle(arr, rng = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Xáo thứ tự đáp án của một câu, giữ đúng chỉ số đáp án đúng. */
export function shuffleChoices({ q, choices, answer, ...rest }, rng = Math.random) {
  const order = shuffle(choices.map((_, i) => i), rng);
  return { ...rest, q, choices: order.map((i) => choices[i]), answer: order.indexOf(answer) };
}

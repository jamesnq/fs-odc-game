import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuizText, quizToText, scoreAnswer, streakBonus, shuffleChoices } from '../src/quiz.js';

const SAMPLE = `# Đố vui gia đình

? Thủ đô của Việt Nam là gì?
* Hà Nội
- Huế
- Đà Nẵng

? Mèo có mấy chân?
- 2
* 4
`;

test('Đọc bộ câu hỏi tự soạn', () => {
  const r = parseQuizText(SAMPLE);
  assert.equal(r.title, 'Đố vui gia đình');
  assert.equal(r.questions.length, 2);
  assert.deepEqual(r.questions[0], { q: 'Thủ đô của Việt Nam là gì?', choices: ['Hà Nội', 'Huế', 'Đà Nẵng'], answer: 0 });
  assert.equal(r.questions[1].answer, 1);
  assert.deepEqual(parseQuizText(quizToText(r)), r, 'viết ra rồi đọc lại không đổi');
});

test('Báo lỗi rõ ràng kèm số dòng', () => {
  assert.throws(() => parseQuizText(''), /Chưa có câu hỏi/);
  assert.throws(() => parseQuizText('? Hỏi\n- a\n- b'), /đúng 1 đáp án đúng/);
  assert.throws(() => parseQuizText('? Hỏi\n* a\n* b'), /đang có 2/);
  assert.throws(() => parseQuizText('? Hỏi\n* a'), /ít nhất 2/);
  assert.throws(() => parseQuizText('* a'), /Dòng 1: đáp án phải nằm sau/);
  assert.throws(() => parseQuizText('? Hỏi\n* a\n- b\n- c\n- d\n- e'), /Dòng 6: mỗi câu tối đa 4/);
  assert.throws(() => parseQuizText('? Hỏi\n* a\n- A'), /bị trùng/);
  assert.throws(() => parseQuizText('Hỏi gì đó'), /Dòng 1: dòng phải bắt đầu/);
});

test('Điểm theo tốc độ và thưởng chuỗi', () => {
  assert.equal(scoreAnswer(false, 100, 20000), 0);
  assert.equal(scoreAnswer(true, 400, 20000), 1000);
  assert.equal(scoreAnswer(true, 10000, 20000), 750);
  assert.equal(scoreAnswer(true, 20000, 20000), 500);
  assert.equal(scoreAnswer(true, 2000, 30000), 967);
  assert.deepEqual([1, 2, 3, 6, 10].map(streakBonus), [0, 100, 200, 500, 500]);
});

test('Xáo đáp án giữ đúng đáp án đúng', () => {
  for (let k = 0; k < 20; k++) {
    const q = shuffleChoices({ q: 'x', choices: ['a', 'b', 'c', 'd'], answer: 2 });
    assert.equal(q.choices[q.answer], 'c');
  }
});

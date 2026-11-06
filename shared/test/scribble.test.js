import test from 'node:test';
import assert from 'node:assert/strict';
import { checkGuess, revealsWord, maskWord, hintCount, guessPoints, cleanOps, parseCustomWords, CANVAS_W } from '../src/scribble.js';

test('đoán đúng không cần dấu, gần đúng khi sai 1 chữ cái', () => {
  assert.equal(checkGuess('con mèo', 'con mèo'), 'correct');
  assert.equal(checkGuess('  Con MEO! ', 'con mèo'), 'correct');
  assert.equal(checkGuess('con meo', 'con mèo'), 'correct');
  assert.equal(checkGuess('con mè', 'con mèo'), 'close');
  assert.equal(checkGuess('con chó', 'con mèo'), 'wrong');
  assert.equal(checkGuess('', 'con mèo'), 'wrong');
  assert.equal(checkGuess('ca', 'cá'), 'correct');
  assert.equal(checkGuess('cb', 'cá'), 'wrong'); // từ ngắn không báo gần đúng
});

test('chặn lộ đáp án trong chat theo nguyên từ', () => {
  assert.ok(revealsWord('đáp án là con mèo nhé', 'con mèo'));
  assert.ok(revealsWord('CON MEO', 'con mèo'));
  assert.ok(!revealsWord('con mèo con', 'mèo con con'));
  assert.ok(!revealsWord('cá mập', 'cá'.repeat(1) + ' voi'));
});

test('mặt nạ gợi ý và số chữ gợi ý', () => {
  assert.equal(maskWord('con mèo'), '___ ___');
  assert.equal(maskWord('con mèo', new Set([0, 5])), 'c__ _è_');
  assert.equal(hintCount('cá'), 1);
  assert.equal(hintCount('con mèo'), 2);
  assert.equal(hintCount('người ngoài hành tinh'), 4);
});

test('điểm: đoán sớm và đoán trước được nhiều hơn', () => {
  assert.ok(guessPoints(80000, 80000, 0) > guessPoints(40000, 80000, 0));
  assert.ok(guessPoints(40000, 80000, 0) > guessPoints(40000, 80000, 3));
  assert.ok(guessPoints(0, 80000, 5) >= 50);
});

test('làm sạch nét vẽ', () => {
  const ops = cleanOps([
    { k: 'l', id: 1, c: 1, w: 6, p: [0, 0, 10, 10, 99999, 5] },
    { k: 'l', id: 2, c: 99, w: 6, p: [0, 0] },
    { k: 'f', id: 3, c: 4, p: [5000, -3] },
    { k: 'u', id: 1 },
    { k: 'c' },
    { k: 'x' },
    null,
  ]);
  assert.deepEqual(ops, [
    { k: 'l', id: 1, c: 1, w: 6, p: [0, 0, 10, 10, CANVAS_W + 20, 5] },
    { k: 'f', id: 3, c: 4, p: [CANVAS_W - 1, 0] },
    { k: 'u', id: 1 },
    { k: 'c' },
  ]);
  assert.deepEqual(cleanOps('x'), []);
});

test('từ tự thêm: tách theo dấu phẩy / xuống dòng, bỏ trùng', () => {
  assert.deepEqual(parseCustomWords('Con Mèo, con meo\nbánh mì;; '), ['con mèo', 'bánh mì']);
});

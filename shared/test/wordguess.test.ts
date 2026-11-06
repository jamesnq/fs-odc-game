import test from 'node:test';
import assert from 'node:assert/strict';
import { splitSyllable, scoreGuess, isSolved, dailyIndex } from '../src/wordguess.js';

test('Tách âm đầu, vần, thanh', () => {
  assert.deepEqual(splitSyllable('học'), { onset: 'h', rhyme: 'oc', tone: 5 });
  assert.deepEqual(splitSyllable('nghiêng'), { onset: 'ngh', rhyme: 'iêng', tone: 0 });
  assert.deepEqual(splitSyllable('giữa'), { onset: 'gi', rhyme: 'ưa', tone: 3 });
  assert.deepEqual(splitSyllable('gì'), { onset: 'gi', rhyme: 'i', tone: 1 });
  assert.deepEqual(splitSyllable('gìn'), { onset: 'g', rhyme: 'in', tone: 1 });
  assert.deepEqual(splitSyllable('ăn'), { onset: '', rhyme: 'ăn', tone: 0 });
  assert.deepEqual(splitSyllable('quả'), { onset: 'qu', rhyme: 'a', tone: 4 });
  assert.deepEqual(splitSyllable('đường'), { onset: 'đ', rhyme: 'ương', tone: 1 });
  assert.deepEqual(splitSyllable('hoà'), splitSyllable('hòa'), 'không phụ thuộc vị trí bỏ dấu');
});

test('Chấm xanh / vàng / xám', () => {
  const r = scoreGuess('học sinh', 'hát xinh');
  assert.deepEqual(r, [{ onset: 'g', rhyme: 'x', tone: 'x' }, { onset: 'x', rhyme: 'g', tone: 'g' }]);
  // đảo chữ: mọi phần đều có nhưng ở chữ kia
  assert.deepEqual(scoreGuess('học sinh', 'sinh học'), [{ onset: 'y', rhyme: 'y', tone: 'y' }, { onset: 'y', rhyme: 'y', tone: 'y' }]);
  assert.ok(isSolved(scoreGuess('học sinh', 'Học Sinh')));
});

test('Trùng lặp: phần đã khớp xanh không được tính vàng lần nữa', () => {
  // bí mật "con cá": âm đầu c, c. Đoán "cờ đỏ": c xanh, đ xám
  assert.deepEqual(scoreGuess('con cá', 'cờ đỏ').map((m: any) => m.onset), ['g', 'x']);
  // bí mật "bàn tay" (thanh huyền, ngang); đoán "là cà" (huyền, huyền) → xanh, xám
  assert.deepEqual(scoreGuess('bàn tay', 'là cà').map((m: any) => m.tone), ['g', 'x']);
  // bí mật "tay bàn" chỉ có một thanh huyền, đã khớp xanh ở chữ 2 → chữ 1 xám
  assert.deepEqual(scoreGuess('tay bàn', 'cà là').map((m: any) => m.tone), ['x', 'g']);
  // bí mật "tay bàn"; đoán "bàn tay" → huyền ở chữ 1 vàng (có ở chữ 2), ngang ở chữ 2 vàng
  assert.deepEqual(scoreGuess('tay bàn', 'bàn tay').map((m: any) => m.tone), ['y', 'y']);
});

test('Từ của ngày ổn định trong ngày, đổi qua ngày', () => {
  const d = new Date('2026-11-06T05:00:00Z');
  assert.equal(dailyIndex(500, d), dailyIndex(500, new Date('2026-11-06T15:00:00Z')));
  assert.notEqual(dailyIndex(500, d), dailyIndex(500, new Date('2026-11-07T05:00:00Z')));
});

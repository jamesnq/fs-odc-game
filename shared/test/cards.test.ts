import test from 'node:test';
import assert from 'node:assert/strict';
import { shuffle, randInt, newDeck } from '../src/cards.js';

test('randInt: luôn trong [0, n) và báo lỗi khi n sai', () => {
  for (let i = 0; i < 1000; i++) {
    const v = randInt(7);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 7);
  }
  assert.throws(() => randInt(0));
  assert.throws(() => randInt(1.5));
});

test('shuffle: giữ nguyên các lá, không sửa mảng gốc', () => {
  const d = newDeck();
  const s = shuffle(d);
  assert.equal(s.length, 52);
  assert.deepEqual([...s].sort(), [...d].sort());
  assert.deepEqual(d, newDeck());
});

test('shuffle: mọi hoán vị có xác suất như nhau (kiểm định chi bình phương)', () => {
  const N = 60000;
  const counts = new Map();
  for (let i = 0; i < N; i++) {
    const k = shuffle(['a', 'b', 'c', 'd']).join('');
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  assert.equal(counts.size, 24);
  const expected = N / 24;
  const chi2 = [...counts.values()].reduce((a: any, c: any) => a + (c - expected) ** 2 / expected, 0);
  // 23 bậc tự do: ngưỡng p = 0.001 là 49.7 → xác suất test lỗi oan ≈ 0.1%
  assert.ok(chi2 < 49.7, `chi2 = ${chi2.toFixed(1)}`);
});

test('shuffle: mỗi lá có xác suất như nhau ở vị trí chia đầu tiên', () => {
  const N = 52 * 2000;
  const counts = new Map();
  for (let i = 0; i < N; i++) {
    const c = shuffle(newDeck()).at(-1);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  assert.equal(counts.size, 52);
  const expected = N / 52;
  const chi2 = [...counts.values()].reduce((a: any, c: any) => a + (c - expected) ** 2 / expected, 0);
  // 51 bậc tự do: ngưỡng p = 0.001 là 87.0
  assert.ok(chi2 < 87, `chi2 = ${chi2.toFixed(1)}`);
});

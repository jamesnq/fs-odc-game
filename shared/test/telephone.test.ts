import test from 'node:test';
import assert from 'node:assert/strict';
import { chainOf, stepKind, cleanText } from '../src/telephone.js';

test('mỗi câu chuyện đi qua mọi người đúng một lần, mỗi bước mỗi người một câu chuyện', () => {
  for (const n of [3, 4, 5, 8]) {
    for (let k = 0; k < n; k++) {
      const chains = Array.from({ length: n }, (_, i) => chainOf(i, k, n));
      assert.equal(new Set(chains).size, n, `bước ${k}: không ai trùng câu chuyện`);
    }
    for (let c = 0; c < n; c++) {
      const people = Array.from({ length: n }, (_, k) => [...Array(n).keys()].find((i) => chainOf(i, k, n) === c));
      assert.equal(new Set(people).size, n, `câu chuyện ${c} qua đủ ${n} người`);
      assert.equal(people[0], c, 'người mở đầu là chủ câu chuyện');
    }
  }
});

test('xen kẽ viết / vẽ; làm sạch câu chữ', () => {
  assert.deepEqual([0, 1, 2, 3].map(stepKind), ['text', 'draw', 'text', 'draw']);
  assert.equal(cleanText('  con\n\tmèo   béo '), 'con mèo béo');
  assert.equal(cleanText('x'.repeat(200)).length, 80);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { isMeld, enumerateMelds, bestArrangement, sortByMeld, TalaGame } from '../src/tala.js';

test('xếp theo phỏm: giải quyết phỏm chồng nhau, bài rác ở cuối, không sửa bài gốc', () => {
  const hand = ['5H', 'KC', '7S', '2C', '5D', 'KH', '6S', 'KD', '5S'];
  const original = hand.slice();
  const sorted = sortByMeld(hand);
  assert.ok(isMeld(sorted.slice(0, 3)));
  assert.ok(isMeld(sorted.slice(3, 6)));
  assert.ok([sorted.slice(0, 3), sorted.slice(3, 6)].some((m) => m.join(',') === '5S,6S,7S'));
  assert.deepEqual(sorted.slice(6), ['2C', '5D', '5H']);
  assert.deepEqual(hand, original);
  assert.deepEqual([...sorted].sort(), [...hand].sort());
  assert.deepEqual(sortByMeld(hand.slice().reverse()), sorted);
});

test('xếp theo phỏm: giữ lá ăn trong phỏm và xử lý tay bài không có phỏm', () => {
  const hand = ['5S', '5D', '5H', '6S', '7S', '2C'];
  const sorted = sortByMeld(hand, ['5D']);
  assert.ok(isMeld(sorted.slice(0, 3)));
  assert.ok(sorted.slice(0, 3).includes('5D'));
  assert.deepEqual(sortByMeld(['KH', '2C', 'AS']), ['AS', '2C', 'KH']);
  assert.deepEqual(sortByMeld([]), []);
});

test('phỏm hợp lệ', () => {
  assert.ok(isMeld(['5S', '5D', '5H']));
  assert.ok(isMeld(['AS', '2S', '3S']));
  assert.ok(!isMeld(['QS', 'KS', 'AS']));
  assert.ok(!isMeld(['5S', '6D', '7S']));
  assert.ok(!isMeld(['5S', '5D']));
});

test('tìm cách xếp tốt nhất', () => {
  const hand = ['5S', '5D', '5H', '6S', '7S', 'KD', 'KC', 'KH', '2C'];
  const best = bestArrangement(hand);
  assert.equal(best!.points, 5 + 6 + 7 + 13 * 3);
  const withLock = bestArrangement(hand, ['6S']);
  assert.ok(withLock!.melds.some((m) => m.includes('6S') && m.includes('5S')));
  assert.equal(enumerateMelds(['2H', '3H', '4H', '5H']).length, 3);
  // 2 lá ăn không được cùng 1 phỏm
  assert.equal(bestArrangement(['5S', '5D', '5H'], ['5S', '5D']), null);
});

test('mô phỏng ván tự động kết thúc, tổng điểm bằng 0', () => {
  for (let k = 0; k < 300; k++) {
    const n = 2 + (k % 3);
    const ps = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i }));
    const g = new TalaGame(ps, k % n);
    let guard = 0;
    while (!g.result && guard++ < 100) {
      const i = g.turn;
      const id = g.players[i].id;
      if (g.canU(i)) { g.declareU(id); break; }
      if (g.phase === 'draw' && g.canEat(i) && Math.random() < 0.7) {
        g.eat(id);
        if (g.canU(i)) { g.declareU(id); break; }
        if (String(g.phase) === 'lay') g.autoLay(id);
        g.discard(id, g.suggestDiscard(i));
      } else {
        g.autoPlay(id);
      }
    }
    assert.ok(g.result, 'ván phải kết thúc');
    assert.equal(g.scores.reduce((a, b) => a + b, 0), 0);
    if (g.result.type === 'normal') assert.ok(g.discardCount.every((d) => d === 4));
  }
});

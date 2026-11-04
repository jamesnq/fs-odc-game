import test from 'node:test';
import assert from 'node:assert/strict';
import { isMeld, enumerateMelds, bestArrangement, TalaGame } from '../src/tala.js';

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
  assert.equal(best.points, 5 + 6 + 7 + 13 * 3);
  const withLock = bestArrangement(hand, ['6S']);
  assert.ok(withLock.melds.some((m) => m.includes('6S') && m.includes('5S')));
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
        if (g.phase === 'lay') g.autoLay(id);
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

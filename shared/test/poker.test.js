import test from 'node:test';
import assert from 'node:assert/strict';
import { bestHand, score5, PokerGame } from '../src/poker.js';

test('xếp hạng bài', () => {
  assert.equal(bestHand(['AS', 'KS', 'QS', 'JS', 'TS', '2D', '3C']).name, 'Thùng phá sảnh');
  assert.equal(bestHand(['AS', '2D', '3C', '4H', '5S', 'KD', 'KC']).name, 'Sảnh');
  assert.equal(bestHand(['AS', 'AD', 'AC', 'KH', 'KS', '2D', '3C']).name, 'Cù lũ');
  assert.ok(score5(['6S', '2D', '3C', '4H', '5S']) > score5(['AS', '2D', '3C', '4H', '5S']));
  assert.ok(score5(['AS', 'AD', 'KC', 'KH', '2S']) > score5(['AS', 'AD', 'QC', 'QH', 'KS']));
});

function table(chips = [1000, 1000, 1000]) {
  const g = new PokerGame({ smallBlind: 10, bigBlind: 20, maxSeats: 6 });
  chips.forEach((c, i) => g.sit(i, 'p' + i, 'P' + i, c));
  return g;
}

test('fold về 1 người thì thắng pot', () => {
  const g = table();
  g.startHand();
  const h = g.hand;
  assert.equal(h.dealer, 0); assert.equal(h.sb, 1); assert.equal(h.bb, 2);
  assert.equal(h.toAct, 0);
  g.act('p0', 'fold');
  g.act('p1', 'fold');
  assert.equal(g.hand.street, 'done');
  assert.equal(g.seats[2].chips, 1010);
  assert.equal(g.seats[1].chips, 990);
});

test('BB được quyền check/raise khi mọi người chỉ theo', () => {
  const g = table();
  g.startHand();
  g.act('p0', 'call');
  g.act('p1', 'call');
  assert.equal(g.hand.toAct, 2);
  assert.ok(g.options(2).canCheck && g.options(2).canRaise);
  g.act('p2', 'check');
  assert.equal(g.hand.street, 'flop');
  assert.equal(g.hand.toAct, 1);
});

test('raise tối thiểu, all-in, side pot, bảo toàn chip', () => {
  const g = table([100, 500, 1000]);
  g.startHand();
  assert.throws(() => g.act('p0', 'raise', 30));
  g.act('p0', 'allin');
  g.act('p1', 'raise', 400);
  g.act('p2', 'call');
  while (g.inHand) {
    const seat = g.hand.toAct;
    g.act(g.seats[seat].id, 'call');
  }
  const total = g.seats.filter(Boolean).reduce((a, s) => a + s.chips, 0);
  assert.equal(total, 1600);
});

test('all-in không đủ mức raise không mở lại quyền raise', () => {
  const g = table([1000, 1000, 130]);
  g.startHand(); // dealer 0, sb 1, bb 2 (bb còn 110)
  g.act('p0', 'raise', 100); // raise 80
  g.act('p1', 'call');
  g.act('p2', 'allin'); // to 130: raise 30 < 80 => không đầy đủ
  const o = g.options(0);
  assert.ok(o.canCall && !o.canRaise);
});

test('heads-up: dealer là SB và đi trước preflop', () => {
  const g = table([1000, 1000]);
  g.startHand();
  assert.equal(g.hand.sb, g.hand.dealer);
  assert.equal(g.hand.toAct, g.hand.dealer);
  g.act('p' + g.hand.dealer, 'call');
  g.act('p' + g.hand.bb, 'check');
  assert.equal(g.hand.toAct, g.hand.bb);
});

test('mô phỏng ngẫu nhiên giữ bảo toàn chip', () => {
  for (let k = 0; k < 300; k++) {
    const g = table([300, 700, 1000, 50]);
    for (let hnd = 0; hnd < 5 && g.canStart(); hnd++) {
      g.startHand();
      let guard = 0;
      while (g.inHand && guard++ < 200) {
        const seat = g.hand.toAct;
        const o = g.options(seat);
        const r = Math.random();
        const id = g.seats[seat].id;
        if (r < 0.15) g.act(id, 'fold');
        else if (r < 0.3 && (o.canRaise || o.canBet)) g.act(id, o.canBet ? 'bet' : 'raise', o.minTo);
        else if (r < 0.35) { try { g.act(id, 'allin'); } catch { g.act(id, 'call'); } }
        else g.act(id, 'call');
      }
      assert.ok(!g.inHand);
      const total = g.seats.filter(Boolean).reduce((a, s) => a + s.chips, 0);
      assert.equal(total, 2050);
    }
  }
});

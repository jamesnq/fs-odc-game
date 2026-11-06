import test from 'node:test';
import assert from 'node:assert/strict';
import { bestHand, score5, describeHand, PokerGame } from '../src/poker.js';

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

test('Hands log: ghi hành động, lời/lỗ và ẩn bài đã bỏ', () => {
  const g = new PokerGame({ smallBlind: 10, bigBlind: 20, maxSeats: 3 });
  g.sit(0, 'a', 'A', 1000);
  g.sit(1, 'b', 'B', 1000);
  g.sit(2, 'c', 'C', 1000);
  g.startHand();
  // Ai tới lượt: lần lượt raise, rồi các người còn lại bỏ bài
  const who = () => g.seats[g.hand.toAct].id;
  const raiser = who();
  g.act(raiser, 'raise', 60);
  g.act(who(), 'fold');
  g.act(who(), 'fold');
  assert.equal(g.inHand, false);
  assert.equal(g.history.length, 1);
  const e = g.history[0];
  assert.equal(e.no, 1);
  assert.equal(e.showdown, false);
  assert.deepEqual(e.actions.map((x) => x.type), ['sb', 'bb', 'raise', 'fold', 'fold']);
  assert.equal(e.actions[2].to, 60);
  assert.equal(e.players.reduce((s, p) => s + p.net, 0), 0, 'tổng lời/lỗ = 0');
  assert.ok(e.players.find((p) => p.id === raiser).net > 0);

  // Người xem chỉ thấy bài của mình; không có showdown nên không lộ bài ai khác
  const v = g.historyView('b')[0];
  for (const p of v.players) {
    if (p.id === 'b') assert.equal(p.hole.length, 2);
    else assert.equal(p.hole, null);
  }
  assert.ok(g.historyView('zzz')[0].players.every((p) => p.hole === null), 'người ngoài không thấy bài nào');
});

test('Hands log: showdown lộ bài người lật, giới hạn số ván', () => {
  const g = new PokerGame({ smallBlind: 1, bigBlind: 2, maxSeats: 2 });
  g.historyMax = 3;
  g.sit(0, 'a', 'A', 100000);
  g.sit(1, 'b', 'B', 100000);
  for (let k = 0; k < 5; k++) {
    g.startHand();
    while (g.inHand) g.act(g.seats[g.hand.toAct].id, 'call'); // check/call tới showdown
  }
  assert.equal(g.history.length, 3);
  assert.deepEqual(g.historyView('a').map((e) => e.no), [5, 4, 3], 'mới nhất trước');
  const e = g.historyView('zzz')[0];
  assert.equal(e.showdown, true);
  assert.equal(e.board.length, 5);
  assert.ok(e.players.every((p) => p.hole && p.hole.length === 2), 'showdown: thấy bài cả hai');
  assert.deepEqual([...new Set(e.actions.map((x) => x.street))], ['preflop', 'flop', 'turn', 'river']);
});

test('Đổi blind: áp dụng ngay khi chưa chơi, chờ ván sau khi đang chơi', () => {
  const g = new PokerGame({ smallBlind: 10, bigBlind: 20, maxSeats: 2 });
  assert.equal(g.setBlinds(5, 15), true);
  assert.deepEqual([g.smallBlind, g.bigBlind], [5, 15]);
  assert.throws(() => g.setBlinds(30, 20), /lớn hơn/);
  assert.throws(() => g.setBlinds(0, 20), /không hợp lệ/);
  g.sit(0, 'a', 'A', 1000);
  g.sit(1, 'b', 'B', 1000);
  g.startHand();
  const posted = () => Object.values(g.hand.players).map((p) => p.bet).sort((x, y) => x - y);
  assert.deepEqual(posted(), [5, 15]);
  assert.equal(g.setBlinds(25, 50), false, 'đang giữa ván thì chờ');
  assert.deepEqual([g.smallBlind, g.bigBlind], [5, 15], 'ván hiện tại giữ blind cũ');
  assert.deepEqual(g.nextBlinds, { smallBlind: 25, bigBlind: 50 });
  g.act(g.seats[g.hand.toAct].id, 'fold');
  assert.equal(g.history[0].bigBlind, 15, 'Hands log ghi blind của ván đó');
  g.startHand();
  assert.deepEqual(posted(), [25, 50]);
  assert.equal(g.nextBlinds, null);
  assert.equal(g.options(g.hand.toAct).minTo, 100, 'raise tối thiểu theo big blind mới');
});

test('Rabbit hunt: lật đúng các lá lẽ ra sẽ chia (có đốt bài)', () => {
  const play = (foldAt) => {
    const g = new PokerGame({ smallBlind: 1, bigBlind: 2, maxSeats: 2 });
    g.sit(0, 'a', 'A', 1000);
    g.sit(1, 'b', 'B', 1000);
    g.startHand();
    const deckBefore = g.hand.deck.slice();
    // check/call tới vòng foldAt rồi bỏ bài
    while (g.inHand && g.hand.street !== foldAt) g.act(g.seats[g.hand.toAct].id, 'call');
    const board = g.hand.board.slice();
    if (g.inHand) g.act(g.seats[g.hand.toAct].id, 'fold');
    return { g, deckBefore, board };
  };

  // Bỏ bài preflop: rabbit = flop + turn + river theo đúng thứ tự chia (burn, 3, burn, 1, burn, 1)
  const { g, deckBefore } = play('preflop');
  assert.equal(g.canRabbit('zzz'), false, 'người ngoài ván không được xem');
  assert.equal(g.canRabbit('a'), true);
  assert.equal(g.view('a').hand.rabbit, null, 'chưa lật thì không gửi bài');
  const d = deckBefore.slice();
  const expect = [];
  d.pop(); expect.push(d.pop(), d.pop(), d.pop()); d.pop(); expect.push(d.pop()); d.pop(); expect.push(d.pop());
  assert.deepEqual(g.rabbitHunt('b'), expect);
  assert.deepEqual(g.view('zzz').hand.rabbit, expect, 'đã lật thì mọi người cùng thấy');
  assert.deepEqual(g.history[0].rabbit, expect, 'Hands log ghi rabbit');
  assert.throws(() => g.rabbitHunt('a'), /rồi/);
  assert.equal(g.canRabbit('a'), false);

  // Bỏ bài ở turn: chỉ còn lá river
  const t = play('turn');
  assert.equal(t.board.length, 4);
  assert.equal(t.g.rabbitHunt('a').length, 1);

  // Ra đủ 5 lá (showdown) thì không có rabbit
  const s = play('none');
  assert.equal(s.g.canRabbit('a'), false);
  assert.throws(() => s.g.rabbitHunt('a'), /đủ 5 lá/);
  assert.throws(() => new PokerGame().rabbitHunt('a'), /kết thúc/);
});

test('all-in khi đối thủ ít tiền hơn: chỉ đặt đúng phần cần theo, không báo lỗi', () => {
  const g = table([1000, 300]); // heads-up: p0 là dealer/SB
  g.startHand();
  g.act('p0', 'call');
  g.act('p1', 'allin'); // p1 all-in tới 300
  const o = g.options(0);
  assert.ok(!o.canRaise);
  assert.equal(o.allInTo, 300);
  g.act('p0', 'allin'); // trước đây: "Bạn không được tố thêm lúc này"
  const total = g.seats.filter(Boolean).reduce((a, s) => a + s.chips, 0);
  assert.equal(total, 1300);
  assert.ok(g.seats[0].chips >= 700); // p0 chỉ mất tối đa 300
});

test('all-in bị giới hạn ở mức đối thủ còn theo được', () => {
  const g = table([1000, 250]);
  g.startHand();
  const o = g.options(0); // p0 (SB) đi trước, p1 còn 230 sau BB
  assert.equal(o.allInTo, 250);
  g.act('p0', 'allin');
  assert.equal(g.hand.players[0].bet, 250);
});

test('Show bài: người bỏ bài / thắng không lật được chủ động show sau khi ván kết thúc', () => {
  const g = table();
  g.startHand();
  assert.equal(g.canShow('p0'), false, 'đang chơi thì chưa được show');
  assert.throws(() => g.showCards('p0'), /kết thúc/);
  const hole0 = g.hand.players[0].hole.slice();
  const hole2 = g.hand.players[2].hole.slice();
  g.act('p0', 'fold');
  g.act('p1', 'fold');
  assert.equal(g.hand.street, 'done');
  assert.deepEqual(g.view('p1').seats[0].hole, [], 'bài đã bỏ bị ẩn trước khi show');
  assert.equal(g.canShow('p0'), true);
  assert.equal(g.canShow('zzz'), false, 'người xem không show được');
  assert.deepEqual(g.showCards('p0'), hole0);
  assert.deepEqual(g.view('p1').seats[0].hole, hole0, 'show xong mọi người cùng thấy');
  assert.equal(g.view('p1').hand.result.shown[0].voluntary, true);
  assert.equal(g.canShow('p0'), false);
  assert.throws(() => g.showCards('p0'), /rồi/);
  // Người thắng (không bị lật) cũng show được, chip không đổi
  const before = g.seats.map((s) => s && s.chips);
  g.showCards('p2');
  assert.deepEqual(g.seats.map((s) => s && s.chips), before);
  // Hands log lộ bài đã show
  const e = g.historyView('p1')[0];
  assert.deepEqual(e.players.find((p) => p.seat === 2).hole, hole2);
  assert.equal(e.players.find((p) => p.seat === 1).hole.length, 2, 'bài của chính mình');
});

test('describeHand: combo 5 lá mạnh nhất, lá tạo bộ và bài chờ', () => {
  let d = describeHand(['AS', 'AD'], []);
  assert.equal(d.name, 'Một đôi');
  assert.deepEqual(d.cards.length, 2);
  d = describeHand(['AS', 'KD'], []);
  assert.equal(d.name, 'Mậu thầu');
  d = describeHand(['KS', 'KD'], ['KC', '7H', '7S', '2D', '3C']);
  assert.equal(d.name, 'Cù lũ');
  assert.deepEqual(d.cards, ['KS', 'KD', 'KC', '7H', '7S']);
  assert.equal(d.used.length, 5);
  d = describeHand(['QS', 'QH'], ['9C', '6D', '2S']);
  assert.deepEqual(d.used.sort(), ['QH', 'QS']);
  assert.equal(d.cards.length, 5);
  d = describeHand(['AH', '2H'], ['3S', '4H', '5C']);
  assert.equal(d.name, 'Sảnh');
  assert.equal(d.cards[0][0], '5', 'sảnh A-5: lá 5 là cao nhất');
  d = describeHand(['AH', 'KH'], ['2H', '7H', '9C']);
  assert.ok(d.draws.includes('Chờ thùng'));
  d = describeHand(['8S', '7D'], ['6C', '5H', '2S']);
  assert.ok(d.draws.includes('Chờ sảnh 2 đầu'));
  d = describeHand(['8S', '7D'], ['6C', '4H', '2S']);
  assert.ok(d.draws.includes('Chờ sảnh'));
  assert.deepEqual(describeHand(['8S', '7D'], ['6C', '5H', '2S', 'KD', 'QC']).draws, [], 'hết bài chung thì không còn chờ');
});

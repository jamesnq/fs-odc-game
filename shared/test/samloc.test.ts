import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, beats, instantWin, SamLocGame, SAM_RULES, valueOf } from '../src/samloc.js';

const t = (s: string) => s.split(' ');
const C = (s: string) => classify(t(s));

test('phân loại bộ bài', () => {
  assert.equal(C('2S')!.top, 15);
  assert.equal(C('AS')!.top, 14);
  assert.equal(C('7S 7H')!.type, 'pair');
  assert.equal(C('7S 7H 7D')!.type, 'triple');
  assert.equal(C('7S 7H 7D 7C')!.type, 'four');
  assert.equal(C('7S 8H'), null, 'hai lá khác số: không hợp lệ');
  assert.deepEqual([C('3S 4H 5D')!.type, C('3S 4H 5D')!.top], ['straight', 5]);
  assert.equal(C('QS KH AD')!.top, 14, 'Q-K-A');
  assert.equal(C('AS 2H 3D')!.top, 3, 'A-2-3: A đứng đầu');
  assert.equal(C('AS 2H 3D 4C 5S')!.top, 5);
  assert.equal(C('2S 3H 4D'), null, 'heo chỉ trong sảnh bắt đầu bằng A');
  assert.equal(C('KS AH 2D'), null, 'không vòng K-A-2');
  assert.equal(C('3S 4H 6D'), null);
  assert.equal(C('3S 3H 4D'), null);
});

test('chặn bài, không xét chất, tứ quý chặt heo', () => {
  assert.equal(beats(C('8S'), C('7H')), true);
  assert.equal(beats(C('7S'), C('7H')), false, 'cùng số không chặn được (không xét chất)');
  assert.equal(beats(C('2S'), C('AH')), true);
  assert.equal(beats(C('9S 9H'), C('8S 8H')), true);
  assert.equal(beats(C('9S'), C('8S 8H')), false);
  assert.equal(beats(C('4S 5H 6D'), C('3S 4H 5D')), true);
  assert.equal(beats(C('4S 5H 6D 7C'), C('3S 4H 5D')), false, 'sảnh phải cùng độ dài');
  assert.equal(beats(C('3S 4H 5D'), C('AS 2H 3D')), true, 'A-2-3 là sảnh nhỏ nhất');
  assert.equal(beats(C('3S 3H 3D 3C'), C('2S')), true, 'tứ quý chặt heo');
  assert.equal(beats(C('3S 3H 3D 3C'), C('AS')), false);
  assert.equal(beats(C('3S 3H 3D 3C'), C('2S 2H')), false, 'tứ quý không chặt đôi heo');
  assert.equal(beats(C('4S 4H 4D 4C'), C('3S 3H 3D 3C')), true);
});

test('tới trắng', () => {
  assert.equal(instantWin(t('2S 2H 2D 2C 3S 5H 7D 9C JS KH')), 'Tứ quý heo');
  assert.equal(instantWin(t('3S 4H 5D 6C 7S 8H 9D TC JS QH')), 'Sảnh rồng');
  assert.equal(instantWin(t('3S 3H 5D 5C 7S 7H 9D 9C JS JH')), '5 đôi');
  assert.equal(instantWin(t('3S 3H 3D 5C 5S 5H 9D 9C 9S JH')), '3 sám');
  assert.equal(instantWin(t('3S 4C 6S 8C 9S TC JS QC KS AC')), 'Đồng màu');
  assert.equal(instantWin(t('3S 4H 6S 8C 9S TC JS QC KS AC')), null);
});

/** Tạo ván với bài chỉ định: hands[i] là 10 lá của người i, phần còn lại của bộ bài bỏ vào cuối. */
function rigged(hands: string[], leader = 0) {
  const all = hands.flatMap(t);
  const deck = [...all];
  for (const s of 'SCDH') for (const r of 'A23456789TJQK') if (!all.includes(r + s)) deck.push(r + s);
  const players = hands.map((_, i) => ({ id: 'p' + i, name: 'P' + i }));
  return new SamLocGame(players, leader, deck);
}

test('vòng đánh: chặn, bỏ lượt, người đánh cuối đi vòng mới, báo 1', () => {
  const g = rigged([
    '3S 4S 5S 7H 8H 9D JD QS KC AH',
    '3H 4D 6S 7S 8C TD JH QH KH AS',
  ]);
  assert.equal(g.phase, 'sam');
  g.declareSam('p0', false);
  g.declareSam('p1', false);
  assert.equal(g.phase, 'play');
  assert.throws(() => g.play('p1', ['3H']), /lượt/);
  assert.throws(() => g.pass('p0'), /đi đầu/);
  g.play('p0', ['3S']);
  assert.throws(() => g.play('p1', ['3H']), /Không chặn được/, 'cùng số không chặn được');
  g.play('p1', ['4D']);
  g.pass('p0');
  assert.equal(g.turn, 1, 'p1 đi vòng mới');
  assert.equal(g.lastPlay, null);
  g.play('p1', t('6S 7S 8C'));
  assert.throws(() => g.play('p0', t('7H 8H 9D').slice(0, 2)), /không hợp lệ|Không chặn/);
  g.play('p0', t('7H 8H 9D'));
  assert.equal(valueOf('9D'), 9);
});

test('báo 1: phải đánh lá lớn nhất', () => {
  const g = rigged(['3S 4S 5S 6H 8H 9D JD QS KC AH', '3H 4D 6S 7S 8C TD JH QH KH AS']);
  g.endSamPhase();
  g.players[1].hand = ['3H'];
  assert.throws(() => g.play('p0', ['3S']), /lớn nhất/);
  g.play('p0', t('3S 4S 5S')); // đánh sảnh thì được
  g.pass('p1');
  assert.throws(() => g.play('p0', ['6H']), /lớn nhất/);
  g.play('p0', ['AH']);
});

test('kết thúc thường: trả theo số lá, cóng, thối heo, chặt heo', () => {
  const g = rigged([
    '3S 3H 3D 3C 4S 5H 6D 7C 8S 9H',
    '2S 4C 6S 8C TS QC KS AC 5S 7D',
    '2D 2H 4D 6H 8D TH JD QH KD AS',
  ]);
  assert.equal(g.result, null, 'không ai tới trắng');
  g.endSamPhase();
  g.play('p0', ['4S']);
  g.play('p1', ['2S']);
  assert.throws(() => g.play('p2', ['2D']), /Không chặn/, 'heo không chặn được heo');
  g.pass('p2');
  g.play('p0', t('3S 3H 3D 3C')); // chặt heo
  g.pass('p1');
  assert.equal(g.turn, 0, 'p2 đã bỏ vòng này → p0 đi vòng mới');
  g.play('p0', t('5H 6D 7C 8S 9H'));
  const r = (g as SamLocGame).result;
  assert.equal(r!.winner, 0);
  assert.equal(r!.type, 'normal');
  // p1: 9 lá + bị chặt heo 10 = 19; p2: cóng 20 + thối 2 heo × 5 = 30
  assert.deepEqual(r!.scores, [49, -19, -30]);
  assert.equal(r!.scores.reduce((a, b) => a + b, 0), 0);
  assert.ok(g.view('p2').players[0].hand, 'kết thúc thì lật bài mọi người');
});

test('báo Sâm: thành công và bị chặn', () => {
  // Thành công: p0 đánh hết, p1 không chặn được
  const ok = rigged(['TS JS QS KS AS 9H 9D 9C 2S 2H', '3S 4H 5D 6C 7S 8H 3D 4C 5H 6D']);
  ok.declareSam('p1', false);
  ok.declareSam('p0', true);
  assert.equal(ok.turn, 0);
  assert.equal(ok.view('p1').players[1].hand!.length, 10);
  assert.equal(ok.view('p1').players[0].hand, null, 'không lộ bài người khác');
  ok.play('p0', t('TS JS QS KS AS'));
  ok.pass('p1');
  ok.play('p0', t('9H 9D 9C'));
  ok.pass('p1');
  ok.play('p0', t('2S 2H'));
  assert.equal(ok.result!.type, 'sam');
  assert.deepEqual(ok.result!.scores, [SAM_RULES.sam, -SAM_RULES.sam]);

  // Bị chặn: người báo Sâm đền mỗi nhà
  const bad = rigged(['3S 4S 5S 6H 8H 9D JD QS KC AH', '3H 4D 6S 7S 8C TD JH QH KH AS', '2S 2H 5H 5D 7D 7C 9S 9C TS KD']);
  bad.declareSam('p1', true);
  assert.throws(() => bad.declareSam('p0', true), /hết thời gian/);
  bad.play('p1', ['3H']);
  bad.play('p2', ['2S']);
  assert.equal(bad.result!.type, 'samFail');
  assert.deepEqual(bad.result!.scores, [SAM_RULES.sam, -2 * SAM_RULES.sam, SAM_RULES.sam]);
});

test('tới trắng ngay khi chia, tự động đánh khi hết giờ', () => {
  const g = rigged(['3S 4S 5S 6H 8H 9D JD QS KC AH', '2S 2H 2D 2C 4D 6S 7S 8C TD JH']);
  assert.equal(g.result!.type, 'toiTrang');
  assert.equal(g.result!.winner, 1);
  assert.deepEqual(g.result!.scores, [-SAM_RULES.toiTrang, SAM_RULES.toiTrang]);

  const h = rigged(['3S 4S 5S 6H 8H 9D JD QS KC AH', '3H 4D 6S 7S 8C TD JH QH KH AS']);
  h.autoPlay('p0'); h.autoPlay('p1'); // hết giờ báo Sâm
  assert.equal(h.phase, 'play');
  h.autoPlay('p0'); // đi đầu → đánh lá nhỏ nhất
  assert.deepEqual(h.lastPlay!.combo.cards, ['3S']);
  h.autoPlay('p1'); // phải chặn hoặc bỏ → bỏ
  assert.equal(h.turn, 0);
});

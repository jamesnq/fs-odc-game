import test from 'node:test';
import assert from 'node:assert/strict';
import { WordChainGame, parseWord, syllableKey, makeSyllableChecker, makeWordChecker, makeDictionary } from '../src/wordchain.js';

const P = [{ id: 'a', name: 'An' }, { id: 'b', name: 'Bình' }, { id: 'c', name: 'Chi' }];

test('chuẩn hóa: vị trí dấu và Unicode tổ hợp không ảnh hưởng', () => {
  assert.equal(syllableKey('hòa'), syllableKey('hoà'));
  assert.equal(syllableKey('thủy'), syllableKey('thuỷ'));
  assert.equal(syllableKey('Mèo'), syllableKey('mèo'));
  assert.notEqual(syllableKey('ma'), syllableKey('má'));
  assert.notEqual(syllableKey('đa'), syllableKey('da'));
  assert.notEqual(syllableKey('ơ'), syllableKey('ô'));
  assert.deepEqual(parseWord('  Con   MÈO ').syllables, ['con', 'mèo']);
  assert.throws(() => parseWord('mèo'), /đúng 2 chữ/);
  assert.throws(() => parseWord('con mèo con'), /đúng 2 chữ/);
  assert.throws(() => parseWord('con m3o'), /không phải chữ/);
});

test('nối từ theo lượt, đúng âm tiết, không lặp', () => {
  const g = new WordChainGame(P);
  assert.throws(() => g.submit('b', 'con mèo'), /lượt/);
  g.submit('a', 'con mèo');
  assert.equal(g.current.id, 'b');
  assert.equal(g.required, 'mèo');
  assert.throws(() => g.submit('b', 'con chó'), /bắt đầu bằng "mèo"/);
  g.submit('b', 'mèo con');
  assert.throws(() => g.submit('c', 'con mèo'), /đã được dùng/);
  g.submit('c', 'con đường');
  assert.equal(g.current.id, 'a');
  // Nối được dù khác vị trí bỏ dấu
  const h = new WordChainGame(P);
  h.submit('a', 'hòa bình');
  h.submit('b', 'bình hoà'); // khác từ đầu (bình hoà ≠ hoà bình)
  h.submit('c', 'hòa nhạc');
  assert.equal(h.chain.length, 3);
});

test('kiểm tra từ điển âm tiết', () => {
  const ok = makeSyllableChecker(['con', 'mèo', 'hoà', 'bình']);
  const g = new WordChainGame(P, { isValidSyllable: ok });
  assert.throws(() => g.submit('a', 'con xyz'), /"xyz" không có trong từ điển/);
  g.submit('a', 'hòa bình'); // "hòa" khớp "hoà" trong từ điển
});

test('hết giờ mất mạng, hết mạng bị loại, người cuối thắng', () => {
  const g = new WordChainGame(P, { lives: 2 });
  g.submit('a', 'con mèo');
  g.timeout(); // b mất 1 mạng, lượt sang c
  assert.equal(g.players[1].lives, 1);
  assert.equal(g.current.id, 'c');
  g.timeout(); // c mất 1 mạng
  g.timeout(); // a mất 1 mạng
  g.timeout(); // b hết mạng → loại
  assert.equal(g.players[1].out, true);
  assert.equal(g.current.id, 'c');
  g.eliminate('a'); // a bỏ cuộc khi không phải lượt mình
  assert.deepEqual(g.result, { winner: 'c', ranking: ['c', 'a', 'b'], reason: 'last' });
  assert.throws(() => g.submit('c', 'mèo con'), /kết thúc/);
});

test('phản đối: quá nửa số người còn lại thì gỡ từ và trả lượt', () => {
  const g = new WordChainGame(P);
  g.submit('a', 'con mèo');
  assert.throws(() => g.object('a'), /chính mình/);
  assert.equal(g.objectionsNeeded(), 2); // b, c → cần 2
  assert.equal(g.object('b'), false);
  assert.equal(g.object('b'), false, 'bấm lại = rút phản đối');
  assert.equal(g.objections.size, 0);
  g.object('b');
  assert.equal(g.object('c'), true);
  assert.equal(g.chain.length, 0);
  assert.equal(g.current.id, 'a', 'trả lượt cho người bị gỡ từ');
  g.submit('a', 'con mèo'); // dùng lại được vì đã gỡ
  // 2 người: chỉ cần 1 phiếu
  const h = new WordChainGame(P.slice(0, 2));
  h.submit('a', 'con mèo');
  assert.equal(h.object('b'), true);
});

test('chọn người ra từ đầu tiên', () => {
  assert.equal(new WordChainGame(P, { first: 2 }).current.id, 'c');
  assert.equal(new WordChainGame(P, { first: 9 }).current.id, 'a', 'chỉ số sai thì về người đầu');
  const g = new WordChainGame(P, { first: 1 });
  g.submit('b', 'con mèo');
  assert.equal(g.current.id, 'c', 'sau đó đi tiếp theo vòng');
});

test('từ điển từ ghép: chế độ chặt chặn từ vô nghĩa, chế độ thoáng chỉ gắn cờ', () => {
  const known = makeWordChecker(['học tập', 'tập tành', 'hoà bình']);
  assert.equal(known(parseWord('Học Tập')), true);
  assert.equal(known(parseWord('hòa bình')), true, 'không phụ thuộc vị trí bỏ dấu');
  assert.equal(known(parseWord('tành mui')), false);
  const strict = new WordChainGame(P, { isKnownWord: known, strict: true });
  strict.submit('a', 'học tập');
  strict.submit('b', 'tập tành');
  assert.throws(() => strict.submit('c', 'tành mui'), /"tành mui" không có trong từ điển/);
  const loose = new WordChainGame(P, { isKnownWord: known, strict: false });
  loose.submit('a', 'học tập');
  loose.submit('b', 'tập tành');
  loose.submit('c', 'tành mui');
  assert.deepEqual(loose.chain.map((w) => w.known), [true, true, false], 'từ lạ được gắn cờ');
});

test('từ điển có chỉ mục: bỏ mục không phải tiếng Việt, đếm từ nối tiếp', () => {
  const ok = makeSyllableChecker(['con', 'mèo', 'đường', 'cá', 'mập']);
  const d = makeDictionary(['con mèo', 'con đường', 'mèo con', 'acid amin', 'cá mập', 'con mèo'], ok);
  assert.equal(d.size, 4);
  assert.equal(d.has(parseWord('acid amin')), false);
  assert.equal(d.countNext(syllableKey('con')), 2);
  assert.equal(d.countNext(syllableKey('con'), new Set(['con0 meo1'])), 1);
  assert.equal(d.countNext(syllableKey('mập')), 0);
});

test('từ mở đầu không được quá khó; nối từ cụt thì thắng luôn', () => {
  // "x y" có nhiều từ nối tiếp, "y z" thì "z" không có từ nào nối tiếp
  const list = ['x y', 'y z', 'y a', 'y b', 'y c', 'a z', 'z'];
  const d = makeDictionary(list);
  const g = new WordChainGame(P, { isKnownWord: d.has, strict: true, countNext: d.countNext, firstMinNext: 3 });
  assert.throws(() => g.submit('a', 'y z'), /quá khó/);
  g.submit('a', 'x y');
  assert.equal(g.result, null);
  g.submit('b', 'y z');
  assert.equal(g.result.winner, 'b');
  assert.equal(g.result.reason, 'deadEnd');
  assert.deepEqual(g.result.ranking, ['b', 'c', 'a']);
  assert.throws(() => g.submit('c', 'z a'), /kết thúc/);
});

test('từ cụt chỉ thắng khi hết từ chưa dùng; từ không có trong từ điển không được thắng luôn', () => {
  const d = makeDictionary(['a b', 'b a', 'b c', 'c b']);
  const g = new WordChainGame(P, { isKnownWord: d.has, countNext: d.countNext, firstMinNext: 1 });
  g.submit('a', 'a b');
  g.submit('b', 'b a'); // còn "a b"? đã dùng → không còn từ nào bắt đầu bằng "a"
  assert.equal(g.result?.winner, 'b');
  const g2 = new WordChainGame(P, { isKnownWord: d.has, countNext: d.countNext, firstMinNext: 1 });
  g2.submit('a', 'c b');
  g2.submit('b', 'b x'); // chế độ thoáng: "b x" lạ, "x" không có từ nối tiếp nhưng không thắng
  assert.equal(g2.result, null);
});

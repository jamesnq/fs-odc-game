import test from 'node:test';
import assert from 'node:assert/strict';
import { WordChainGame } from '../src/wordchain.js';
import { buildWordIndex, chooseWord } from '../src/wordchainBot.js';

const index = buildWordIndex(['con mèo', 'mèo con', 'con đường', 'đường đi', 'đi học', 'học hành', 'hành lá', 'mèo mướp', 'mướp đắng', 'hoà bình', 'bình minh']);
const P = [{ id: 'a', name: 'An' }, { id: 'bot:1', name: 'Máy', bot: 'hard' }];
const opts = (level?: string) => ({ rng: () => 0.5, miss: 0, level });

test('Máy nối đúng chữ, không lặp từ đã dùng', () => {
  const g = new WordChainGame(P, { lives: 1 });
  g.submit('a', 'con mèo');
  for (let k = 0; k < 20; k++) {
    const w = chooseWord(g, 'medium', index, opts());
    assert.ok(w.startsWith('mèo '), w);
  }
  g.used.add('meo0 con0');
  assert.equal(chooseWord(g, 'medium', index, opts()), 'mèo mướp');
});

test('So khớp không phụ thuộc vị trí bỏ dấu', () => {
  const g = new WordChainGame(P, { lives: 1 });
  g.submit('a', 'thái hòa');
  assert.equal(chooseWord(g, 'hard', index, opts()), 'hoà bình');
});

test('Máy bí khi không còn từ nào', () => {
  const g = new WordChainGame(P, { lives: 1 });
  g.submit('a', 'xanh lá');
  assert.equal(chooseWord(g, 'medium', index, opts()), null);
});

test('Mức Khó gài bẫy: chọn từ có chữ cuối khó nối nhất', () => {
  const g = new WordChainGame(P, { lives: 1 });
  g.submit('a', 'con mèo');
  // "mèo con" còn nối được (con đường), "mèo mướp" chỉ còn "mướp đắng" → chọn mèo mướp
  assert.equal(chooseWord(g, 'hard', index, opts()), 'mèo mướp');
});

test('Máy không bỏ phiếu và không tính vào số phiếu cần để gỡ từ', () => {
  const g = new WordChainGame([...P, { id: 'b', name: 'Bình' }], { lives: 1 });
  g.submit(g.current.id === 'bot:1' ? 'bot:1' : g.current.id, 'con mèo');
  const author = g.last.by;
  const voters = g.players.filter((p: any) => !p.bot && p.id !== author).length;
  assert.equal(g.objectionsNeeded(), Math.floor(voters / 2) + 1);
  assert.throws(() => g.object('bot:1'), author === 'bot:1' ? /chính mình/ : /Máy không/);
});

test('Từ cụt (thắng luôn): máy Vừa / Dễ tránh, máy Khó thỉnh thoảng dùng', () => {
  // "hoà bình" → còn "bình minh"; "hoà cụt" → không còn từ nào bắt đầu bằng "cụt"
  const idx = buildWordIndex(['xanh hoà', 'hoà bình', 'bình minh', 'hoà cụt']);
  const g = new WordChainGame(P, { lives: 1 });
  g.submit('a', 'xanh hoà');
  for (const r of [0.1, 0.5, 0.9]) {
    assert.equal(chooseWord(g, 'medium', idx, { rng: () => r, miss: 0 }), 'hoà bình');
    assert.equal(chooseWord(g, 'easy', idx, { rng: () => r, miss: 0 }), 'hoà bình');
  }
  assert.equal(chooseWord(g, 'hard', idx, { rng: () => 0.1, miss: 0 }), 'hoà cụt', 'rng < 35% → dùng từ cụt');
  assert.equal(chooseWord(g, 'hard', idx, { rng: () => 0.9, miss: 0 }), 'hoà bình');
});

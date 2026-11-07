import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, makeMove } from '../src/caro.js';
import { chooseMove } from '../src/caroBot.js';

const play = (g: any, cells: any) => cells.reduce((s: any, [r, c]: any) => makeMove(s, r * s.size + c), g);
// rng cố định để test không ngẫu nhiên
const seeded = (seed: any) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

test('Nước đầu tiên đi gần tâm bàn', () => {
  const g = createGame();
  const i = chooseMove(g, 'hard');
  assert.equal(i, 7 * 15 + 7);
});

test('Thắng ngay khi có 4 quân', () => {
  // X: (7,3..6), O: (8,3..5) + (0,0); tới lượt X
  const g = play(createGame(), [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [0, 0]]);
  for (const lv of ['medium', 'hard']) {
    const i = chooseMove(g, lv);
    assert.ok(i === 7 * 15 + 7 || i === 7 * 15 + 2, `${lv} chọn ${i}`);
  }
});

test('Chặn 4 quân của đối thủ', () => {
  // X: (7,3..6) chặn một đầu bởi O ở (7,2); tới lượt O
  const g = play(createGame(), [[7, 3], [7, 2], [7, 4], [0, 0], [7, 5], [0, 14], [7, 6]]);
  for (const lv of ['medium', 'hard']) assert.equal(chooseMove(g, lv), 7 * 15 + 7, lv);
});

test('Chặn ba mở của đối thủ', () => {
  // X: (7,5),(7,6),(7,7) mở hai đầu; tới lượt O
  const g = play(createGame(), [[7, 5], [0, 0], [7, 6], [0, 14], [7, 7]]);
  const i = chooseMove(g, 'hard');
  assert.ok([7 * 15 + 4, 7 * 15 + 8, 7 * 15 + 3, 7 * 15 + 9].includes(i), `chọn ${i}`);
});

function duel(a: any, b: any, rng: any) {
  let g = createGame();
  const lv = { x: a, o: b };
  while (!g.result) g = makeMove(g, chooseMove(g, (lv as Record<string, any>)[g.turn], rng));
  return g.result.winner;
}

test('Mức Khó thắng mức Dễ', () => {
  const rng = seeded(7);
  let wins = 0;
  for (let k = 0; k < 6; k++) if (duel(k % 2 ? 'hard' : 'easy', k % 2 ? 'easy' : 'hard', rng) === (k % 2 ? 'x' : 'o')) wins++;
  assert.ok(wins >= 5, `Khó thắng ${wins}/6`);
});

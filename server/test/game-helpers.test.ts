import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckCommitments, commitOfLeaves, leafOf } from '../src/games/fairness.js';
import { Scoreboard } from '../src/games/scoreboard.js';

test('deck commitments conceal private cards and preserve the committed deal', () => {
  const fair = new DeckCommitments();
  assert.equal(fair.view(false), null);
  const deck = ['AS', 'KD', 'QC'];
  fair.track(deck);
  const commitment = fair.view(false);
  assert.ok(commitment);
  assert.deepEqual(Object.keys(commitment).sort(), ['commit', 'no']);
  fair.track(deck);
  assert.deepEqual(fair.view(false), commitment, 'same deal keeps its commitment');

  const revealed = fair.view(true, () => new Set(['KD']));
  assert.ok(revealed && 'cards' in revealed);
  assert.deepEqual(revealed.cards.map(({ i, card }) => ({ i, card })), [{ i: 1, card: 'KD' }]);
  assert.equal(commitOfLeaves(revealed.leaves), commitment.commit);
  for (const { i, card, salt } of revealed.cards) assert.equal(leafOf(i, card, salt), revealed.leaves[i]);
  assert.equal(revealed.total, 3);

  deck.pop(); // dealing mutates the source deck, but must not rewrite the committed copy
  const full = fair.view(true);
  assert.ok(full && 'cards' in full);
  assert.equal(full.cards.length, 3);
  fair.track(['2S', '3D']);
  assert.equal(fair.view(false)?.no, 2, 'a new deck reference starts a new commitment');
});

test('scoreboard follows player identity across seats and retains nullable draws', () => {
  const board = new Scoreboard();
  const a = { id: 'a', name: 'An', side: 'w' };
  const b = { id: 'b', name: 'Binh', side: 'b' };
  board.record([a, null], 'a', 'win', 3);
  assert.equal(board.gameNo, 0, 'incomplete games are ignored');
  board.record([a, b], 'a', 'checkmate', 10);
  board.record([{ ...b, side: 'w' }, { ...a, side: 'b' }], null, 'draw', 20);
  board.rename('a', 'Anh');
  const view = board.view();
  assert.equal(view.gameNo, 2);
  assert.deepEqual(view.rows.map(({ id, name, points, games, wins, draws, losses }) =>
    ({ id, name, points, games, wins, draws, losses })), [
    { id: 'a', name: 'Anh', points: 1.5, games: 2, wins: 1, draws: 1, losses: 0 },
    { id: 'b', name: 'Binh', points: 0.5, games: 2, wins: 0, draws: 1, losses: 1 },
  ]);
  assert.equal(view.history[0].winnerId, null);
  assert.equal(view.history[1].players[0].name, 'An', 'rename does not rewrite history');
  board.reset();
  assert.deepEqual(board.view(), { rows: [], history: [], gameNo: 0 });
});

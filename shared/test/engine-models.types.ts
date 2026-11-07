import { PokerGame } from '../src/poker.js';
import { TalaGame } from '../src/tala.js';
import { SamLocGame } from '../src/samloc.js';
import { WordChainGame } from '../src/wordchain.js';
import { cleanOps } from '../src/scribble.js';

declare const poker: PokerGame;
declare const tala: TalaGame;
declare const sam: SamLocGame;
declare const words: WordChainGame;

// @ts-expect-error a hand is absent before the first deal
poker.hand.board.push('AS');
if (poker.hand) {
  // @ts-expect-error card identities are strings
  poker.hand.board.push(42);
  // @ts-expect-error chip balances are numeric
  poker.hand.players[0].startChips = '100';
}
// @ts-expect-error meld cards cannot contain numeric identifiers
tala.layMeld('player', [42]);
// @ts-expect-error player state must retain a real hand
sam.players[0].hand = false;
// @ts-expect-error dictionary callbacks must return a boolean
new WordChainGame([], { isKnownWord: () => 'yes' });
// @ts-expect-error ranking entries are player IDs
words.result?.ranking.push(42);

for (const op of cleanOps([])) {
  if (op.k === 'l') op.p.push(10);
  if (op.k === 'c') {
    // @ts-expect-error clear operations have no stroke coordinates
    void op.p;
  }
}

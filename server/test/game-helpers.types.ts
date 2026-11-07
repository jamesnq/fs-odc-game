import type { GameSocket } from '../src/socketTypes.js';
import { authGate, issueSession } from '../src/auth.js';
import { ConnectionCounter } from '../src/rateLimit.js';
import { DeckCommitments } from '../src/games/fairness.js';
import { Scoreboard } from '../src/games/scoreboard.js';

declare const socket: GameSocket;
authGate(new ConnectionCounter())(socket, () => {});
// @ts-expect-error signed sessions require the configured binary signing key
issueSession({ id: 'a', name: 'A', password: null, sessionKey: 'secret' });
// @ts-expect-error commitments contain card identities, not numeric indexes
new DeckCommitments().track([1, 2]);
const result = new DeckCommitments().view(true);
if (result && 'cards' in result) {
  // @ts-expect-error revealed card salts are strings
  result.cards[0].salt = 42;
}
// @ts-expect-error match move counts must be numeric
new Scoreboard().record([], null, 'draw', 'ten');

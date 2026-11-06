import { parentPort } from 'node:worker_threads';
import { chooseMove } from '@game/shared/caroBot';
import type { BotRequest } from './botPool.js';

const port = parentPort;
if (!port) throw new Error('Bot worker requires a parent port');
port.on('message', ({ id, state, level }: BotRequest) => {
  try { port.postMessage({ id, move: { cell: chooseMove(state, level) } }); }
  catch (error) { port.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
});

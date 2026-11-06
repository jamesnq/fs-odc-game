import { parentPort } from 'node:worker_threads';
import { chooseMove } from '@game/shared/caroBot';

parentPort.on('message', ({ id, state, level }) => {
  try { parentPort.postMessage({ id, move: { cell: chooseMove(state, level) } }); }
  catch (error) { parentPort.postMessage({ id, error: error.message }); }
});

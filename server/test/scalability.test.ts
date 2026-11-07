import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { Lobby } from '../src/lobby.js';
import { BotPool } from '../src/botPool.js';
import { createGame, makeMove } from '@game/shared/caro';
import { LIMITS } from '../src/config.js';

function setup(t: import('node:test').TestContext) {
  const events: any[] = [];
  const io = { to: (target: any) => ({ emit: (event: any, data: any) => events.push({ target, event, data }) }) };
  const lobby = new Lobby(io as unknown as ConstructorParameters<typeof Lobby>[0]);
  const owner = lobby.createUser('Owner', 'default');
  owner.sockets.add('owner-socket');
  const room = lobby.createRoom(owner, { name: 'Caro', game: 'caro', options: {} });
  lobby.join(owner, room, 'play');
  t.after(() => { room.handler.dispose(); });
  return { events, lobby, owner, room };
}

test('gameplay and chat do not rebroadcast unchanged lobby lists; private views stay separate', async (t) => {
  const { events, lobby, room } = setup(t);
  const viewer = lobby.createUser('Viewer', 'default');
  lobby.join(viewer, room, 'watch');
  await wait(130);
  events.length = 0;
  room.addChat({ text: 'hello' });
  room.changed();
  await wait(130);
  assert.equal(events.filter((e) => e.event.startsWith('lobby:')).length, 0);
  const views = events.filter((e) => e.event === 'room:state');
  assert.equal(views.length, 2);
  assert.equal(views[0].data.state.myColor, 'x');
  assert.equal(views[1].data.state.myColor, null);
  room.name = 'Renamed';
  room.changed();
  await wait(130);
  assert.ok(events.some((e) => e.event === 'lobby:rooms' && e.data[0].name === 'Renamed'));
  assert.ok(events.some((e) => e.event === 'lobby:online'));
});

test('full room refuses a new spectator without removing their current membership', (t) => {
  const { lobby, owner, room } = setup(t);
  const other = lobby.createRoom(owner, { name: 'Other', game: 'caro', options: {} });
  t.after(() => other.handler.dispose());
  const viewer = lobby.createUser('Viewer', 'default');
  lobby.join(viewer, other, 'watch');
  for (let i = room.members.size; i < room.handler.maxPlayers + LIMITS.spectatorsPerRoom; i++) room.members.add(`v${i}`);
  assert.throws(() => lobby.join(viewer, room, 'watch'), /đủ người xem/);
  assert.equal(viewer.roomId, other.id);
  assert.ok(other.members.has(viewer.id));
  assert.doesNotThrow(() => lobby.join(owner, room, 'watch'));
});

test('bot pool computes legal moves and rejects overflow and shutdown work', async (t) => {
  const pool = new BotPool({ size: 1, maxQueue: 1 });
  t.after(() => pool.close());
  const game = makeMove(createGame(), 112);
  const first = pool.run(game, 'hard');
  const second = pool.run(game, 'medium');
  await assert.rejects(pool.run(game, 'easy'), /quá tải/);
  for (const move of await Promise.all([first, second])) assert.equal(game.board[move.cell!], '.');
  await pool.close();
  await assert.rejects(pool.run(game, 'easy'), /đã đóng/);
});

test('spectator capacity reserves empty seats and rejected play preserves the old room', (t) => {
  const { lobby, room } = setup(t);
  for (let i = 0; i < LIMITS.spectatorsPerRoom; i++) {
    const user = lobby.createUser(`Watcher ${i}`, 'default');
    lobby.join(user, room, 'watch');
  }
  const player = lobby.createUser('Player', 'default');
  lobby.join(player, room, 'play');
  assert.ok(room.handler.playerIds().includes(player.id));
  const other = lobby.createRoom(player, { name: 'Other', game: 'caro', options: {} });
  t.after(() => other.handler.dispose());
  const extra = lobby.createUser('Extra', 'default');
  lobby.join(extra, other, 'play');
  assert.throws(() => lobby.join(extra, room, 'play'), /đủ người xem/);
  assert.equal(extra.roomId, other.id);
  assert.ok(other.handler.playerIds().includes(extra.id));
});

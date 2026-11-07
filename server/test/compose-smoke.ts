import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { request, send } from './socketClient.js';
import type { TestSocket } from './socketClient.js';

const url = process.argv[2] || 'http://127.0.0.1:3001';
const sockets: TestSocket[] = [];
const connect = async (node?: string) => {
  const socket: TestSocket = io(url, { path: node ? `/nodes/${node}/socket.io` : '/socket.io',
    transports: ['websocket'], reconnection: false, auth: { password: process.env.APP_PASSWORD } });
  sockets.push(socket);
  await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
};
try {
  const owner = await connect();
  await request(owner, 'hello', { name: 'Compose owner' });
  const { roomId } = await request(owner, 'room:create', { game: 'caro' });
  assert.ok(roomId);
  const guest = await connect('b');
  const identity = await request(guest, 'hello', { name: 'Compose guest' });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const result = await send(guest, 'room:join', { roomId, mode: 'play' });
  assert.equal(result.redirect?.nodeId, 'a');
  guest.disconnect();
  const player = await connect('a');
  await request(player, 'hello', { token: identity.token });
  await request(player, 'room:join', { roomId, mode: 'play' });
  await request(player, 'game:action', { type: 'ready' });
  await request(owner, 'game:action', { type: 'start' });
  await request(owner, 'game:action', { type: 'move', cell: 112 });
  console.log('Compose/Nginx: default route, both shard routes, identity transfer and gameplay passed');
} finally { for (const socket of sockets) socket.disconnect(); }

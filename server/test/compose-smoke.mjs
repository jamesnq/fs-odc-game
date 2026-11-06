import assert from 'node:assert/strict';
import { io } from 'socket.io-client';

const url = process.argv[2] || 'http://127.0.0.1:3001';
const sockets = [];
const connect = async (node) => {
  const socket = io(url, { path: node ? `/nodes/${node}/socket.io` : '/socket.io',
    transports: ['websocket'], reconnection: false, auth: { password: process.env.APP_PASSWORD } });
  sockets.push(socket);
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
  return socket;
};
const request = (socket, event, payload = {}) => new Promise((resolve, reject) => {
  socket.timeout(5000).emit(event, payload, (error, result) => error || !result?.ok ? reject(error || new Error(result?.error)) : resolve(result));
});
try {
  const owner = await connect();
  await request(owner, 'hello', { name: 'Compose owner' });
  const { roomId } = await request(owner, 'room:create', { game: 'caro' });
  assert.ok(roomId);
  const guest = await connect('b');
  const identity = await request(guest, 'hello', { name: 'Compose guest' });
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const result = await request(guest, 'room:join', { roomId, mode: 'play' });
  assert.equal(result.redirect.nodeId, 'a');
  guest.disconnect();
  const player = await connect('a');
  await request(player, 'hello', { token: identity.token });
  await request(player, 'room:join', { roomId, mode: 'play' });
  await request(player, 'game:action', { type: 'ready' });
  await request(owner, 'game:action', { type: 'start' });
  await request(owner, 'game:action', { type: 'move', cell: 112 });
  console.log('Compose/Nginx: default route, both shard routes, identity transfer and gameplay passed');
} finally { for (const socket of sockets) socket.disconnect(); }

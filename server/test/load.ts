// Run only against a disposable local/staging instance: creates users and rooms.
import { io } from 'socket.io-client';
import { performance } from 'node:perf_hooks';

const url = process.argv[2] || 'http://localhost:3001';
const count = Number(process.env.LOAD_CLIENTS || 16);
const rounds = Number(process.env.LOAD_ROUNDS || 10);
const sockets: import('socket.io-client').Socket[] & {roomId?: string} = [];
const durations: number[] = [];
const request = (socket: import('socket.io-client').Socket, event: string, payload = {}) => new Promise<Record<string, any>>((resolve, reject) => {
  const start = performance.now();
  socket.timeout(10_000).emit(event, payload, (error: any, result: any) => {
    durations.push(performance.now() - start);
    if (error || !result?.ok) reject(error || new Error(result?.error));
    else resolve(result);
  });
});
try {
  for (let i = 0; i < count; i++) {
    const socket = io(url, { transports: ['websocket'], reconnection: false, auth: { password: process.env.APP_PASSWORD || '' } });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    await request(socket, 'hello', { name: `Load ${i}` });
    if (!i) {
      const room = await request(socket, 'room:create', { game: 'caro', options: { bot: 'hard' } });
      sockets.roomId = room.roomId;
      await request(socket, 'game:action', { type: 'start' });
      await request(socket, 'game:action', { type: 'move', cell: 112 });
    } else await request(socket, 'room:join', { roomId: sockets.roomId, mode: 'watch' });
  }
  for (let n = 0; n < rounds; n++) {
    await Promise.all(sockets.map((socket) => request(socket, 'lobby:list')));
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  durations.sort((a, b) => a - b);
  const percentile = (p: any) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))];
  console.log(JSON.stringify({ clients: count, requests: durations.length, ackMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) } }));
} finally { for (const socket of sockets) socket.disconnect(); }

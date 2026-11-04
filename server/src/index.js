import express from 'express';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import { XiangqiHandler } from './games/xiangqi.js';
import { PokerHandler } from './games/poker.js';
import { TalaHandler } from './games/tala.js';
import { CaroHandler } from './games/caro.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RECONNECT_GRACE_MS = 60_000;
// Mật khẩu vào app. Để trống = không yêu cầu mật khẩu.
const APP_PASSWORD = process.env.APP_PASSWORD || '';
// Đặt TRUST_PROXY=1 khi chạy sau reverse proxy (Render, Nginx…) để lấy IP thật từ X-Forwarded-For.
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');
const AUTH_MAX_FAILS = 10;
const AUTH_WINDOW_MS = 10 * 60_000;

const GAMES = {
  xiangqi: { name: 'Cờ tướng', Handler: XiangqiHandler },
  poker: { name: 'Poker', Handler: PokerHandler },
  tala: { name: 'Tá lả', Handler: TalaHandler },
  caro: { name: 'Cờ caro', Handler: CaroHandler },
};

const app = express();
app.get('/health', (_req, res) => res.json(APP_PASSWORD ? { ok: true } : { ok: true, rooms: rooms.size, users: users.size }));
if (fs.existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(path.join(CLIENT_DIST, 'index.html')));
} else {
  app.get('/', (_req, res) => res.send('Game server đang chạy. Client chạy riêng bằng Vite (npm run dev).'));
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

// ---------- Auth gate: kiểm tra mật khẩu ngay khi kết nối socket ----------
const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const PASSWORD_HASH = APP_PASSWORD ? sha(APP_PASSWORD) : null;
const authFails = new Map(); // ip -> { count, until }

function clientIp(socket) {
  const xff = socket.handshake.headers['x-forwarded-for'];
  if (TRUST_PROXY && xff) return String(xff).split(',')[0].trim();
  return socket.handshake.address;
}

io.use((socket, next) => {
  if (!PASSWORD_HASH) return next();
  const ip = clientIp(socket);
  const now = Date.now();
  const rec = authFails.get(ip);
  if (rec && rec.until < now) authFails.delete(ip);
  else if (rec && rec.count >= AUTH_MAX_FAILS) return next(new Error('AUTH_LOCKED'));
  const pw = socket.handshake.auth?.password;
  if (typeof pw !== 'string' || !pw) return next(new Error('AUTH_REQUIRED'));
  if (crypto.timingSafeEqual(sha(pw), PASSWORD_HASH)) {
    authFails.delete(ip);
    return next();
  }
  const r = authFails.get(ip) || { count: 0, until: now + AUTH_WINDOW_MS };
  r.count++;
  authFails.set(ip, r);
  next(new Error(r.count >= AUTH_MAX_FAILS ? 'AUTH_LOCKED' : 'AUTH_FAILED'));
});
setInterval(() => {
  const now = Date.now();
  for (const [ip, r] of authFails) if (r.until < now) authFails.delete(ip);
}, AUTH_WINDOW_MS).unref();

/** @type {Map<string, {id:string, token:string, name:string, sockets:Set<string>, roomId:string|null, graceTimer:any}>} */
const users = new Map(); // theo id
const byToken = new Map();
/** @type {Map<string, Room>} */
const rooms = new Map();

const newId = (n = 8) => crypto.randomBytes(n).toString('base64url').slice(0, n);
const cleanName = (s, max = 24) => String(s || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, max);
const isOnline = (id) => (users.get(id)?.sockets.size || 0) > 0;

class Room {
  constructor({ name, game, owner, options }) {
    this.id = newId(6);
    this.name = name;
    this.game = game;
    this.ownerId = owner.id;
    this.createdAt = Date.now();
    this.members = new Set();
    this.chat = [];
    this.handler = new GAMES[game].Handler(this, options || {});
    this._pending = false;
  }

  isOnline(id) { return isOnline(id); }

  system(text) { this._pushChat({ system: true, text }); }

  _pushChat(m) {
    this.chat.push({ ...m, ts: Date.now(), id: newId(6) });
    if (this.chat.length > 100) this.chat.shift();
  }

  /** Gộp các thay đổi trong cùng tick rồi phát trạng thái. */
  changed() {
    if (this._pending) return;
    this._pending = true;
    queueMicrotask(() => {
      this._pending = false;
      if (!rooms.has(this.id)) return;
      for (const uid of this.members) io.to('u:' + uid).emit('room:state', this.viewFor(uid));
      broadcastLobby();
    });
  }

  viewFor(uid) {
    const players = new Set(this.handler.playerIds());
    return {
      id: this.id,
      name: this.name,
      game: this.game,
      ownerId: this.ownerId,
      members: [...this.members].map((id) => ({
        id,
        name: users.get(id)?.name || '?',
        role: players.has(id) ? 'player' : 'spectator',
        online: isOnline(id),
      })),
      chat: this.chat.slice(-60),
      state: this.handler.view(uid),
      serverTime: Date.now(),
    };
  }

  summary() {
    const players = this.handler.playerIds();
    return {
      id: this.id,
      name: this.name,
      game: this.game,
      gameName: GAMES[this.game].name,
      ownerId: this.ownerId,
      ownerName: users.get(this.ownerId)?.name || '?',
      players: players.length,
      playerNames: players.map((id) => users.get(id)?.name || '?'),
      maxPlayers: this.handler.maxPlayers,
      spectators: this.members.size - players.length,
      playing: this.handler.isPlaying(),
      options: this.handler.options,
      createdAt: this.createdAt,
    };
  }
}

let lobbyPending = false;
function broadcastLobby() {
  if (lobbyPending) return;
  lobbyPending = true;
  setTimeout(() => {
    lobbyPending = false;
    io.to('lobby').emit('lobby:rooms', lobbyList());
  }, 100);
}
const lobbyList = () => [...rooms.values()].map((r) => r.summary()).sort((a, b) => b.createdAt - a.createdAt);

function deleteRoom(room, reason) {
  room.handler.dispose();
  rooms.delete(room.id);
  for (const uid of room.members) {
    const u = users.get(uid);
    if (u && u.roomId === room.id) u.roomId = null;
    io.to('u:' + uid).emit('room:closed', { roomId: room.id, reason });
  }
  room.members.clear();
  broadcastLobby();
}

function leaveRoom(user) {
  const room = user.roomId && rooms.get(user.roomId);
  user.roomId = null;
  if (!room) return;
  room.handler.onLeave(user.id);
  room.members.delete(user.id);
  io.to('u:' + user.id).emit('room:left', { roomId: room.id });
  if (!room.members.size) return deleteRoom(room, 'Phòng trống');
  room.system(`${user.name} đã rời phòng`);
  if (room.ownerId === user.id) {
    const next = room.handler.playerIds().find((id) => room.members.has(id)) || [...room.members][0];
    room.ownerId = next;
    room.system(`${users.get(next)?.name} trở thành chủ phòng`);
  }
  room.changed();
}

function joinRoom(user, room, mode) {
  if (user.roomId && user.roomId !== room.id) leaveRoom(user);
  const isNew = !room.members.has(user.id);
  room.members.add(user.id);
  user.roomId = room.id;
  if (isNew) room.system(`${user.name} vào phòng${mode === 'watch' ? ' (xem)' : ''}`);
  let warning = null;
  if (mode === 'play' && !room.handler.playerIds().includes(user.id)) {
    try {
      room.handler.sit(user);
    } catch (e) {
      warning = e.message + ' — bạn đang ở chế độ xem';
    }
  }
  room.changed();
  return warning;
}

io.on('connection', (socket) => {
  let user = null;

  // Bọc handler: bắt lỗi và trả về qua ack
  const on = (event, fn, needUser = true) => {
    socket.on(event, async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        if (needUser && !user) throw new Error('Chưa đăng nhập');
        const res = await fn(payload || {});
        reply({ ok: true, ...(res || {}) });
      } catch (e) {
        reply({ ok: false, error: e.message || 'Lỗi' });
      }
    });
  };

  on('hello', ({ token, name }) => {
    let u = token && byToken.get(token);
    const nm = cleanName(name);
    if (!u) {
      if (!nm) throw new Error('Hãy nhập tên');
      u = { id: newId(10), token: crypto.randomBytes(18).toString('base64url'), name: nm, sockets: new Set(), roomId: null, graceTimer: null };
      users.set(u.id, u);
      byToken.set(u.token, u);
    }
    clearTimeout(u.graceTimer);
    u.sockets.add(socket.id);
    user = u;
    socket.join('u:' + u.id);
    socket.join('lobby');
    const room = u.roomId && rooms.get(u.roomId);
    if (room) room.changed();
    return { user: { id: u.id, name: u.name }, token: u.token, roomId: room ? room.id : null, rooms: lobbyList() };
  }, false);

  on('user:rename', ({ name }) => {
    const nm = cleanName(name);
    if (!nm) throw new Error('Tên không hợp lệ');
    const old = user.name;
    user.name = nm;
    const room = user.roomId && rooms.get(user.roomId);
    if (room) {
      room.handler.rename(user.id, nm);
      room.system(`${old} đổi tên thành ${nm}`);
      room.changed();
    }
    broadcastLobby();
    return { user: { id: user.id, name: nm } };
  });

  on('lobby:list', () => ({ rooms: lobbyList() }));

  on('room:create', ({ name, game, options }) => {
    if (!GAMES[game]) throw new Error('Trò chơi không hợp lệ');
    const nm = cleanName(name, 40) || `Bàn ${GAMES[game].name} của ${user.name}`;
    if ([...rooms.values()].filter((r) => r.ownerId === user.id).length >= 5) throw new Error('Bạn chỉ được tạo tối đa 5 phòng');
    const room = new Room({ name: nm, game, owner: user, options });
    rooms.set(room.id, room);
    room.system(`${user.name} tạo phòng "${nm}"`);
    const warning = joinRoom(user, room, 'play');
    return { roomId: room.id, warning };
  });

  on('room:join', ({ roomId, mode }) => {
    const room = rooms.get(roomId);
    if (!room) throw new Error('Phòng không tồn tại');
    const warning = joinRoom(user, room, mode === 'watch' ? 'watch' : 'play');
    return { roomId: room.id, warning };
  });

  on('room:leave', () => { leaveRoom(user); });

  on('room:delete', ({ roomId }) => {
    const room = rooms.get(roomId || user.roomId);
    if (!room) throw new Error('Phòng không tồn tại');
    if (room.ownerId !== user.id) throw new Error('Chỉ chủ phòng mới được xóa');
    deleteRoom(room, `Chủ phòng ${user.name} đã xóa phòng`);
  });

  on('room:rename', ({ name }) => {
    const room = rooms.get(user.roomId);
    if (!room) throw new Error('Bạn chưa vào phòng');
    if (room.ownerId !== user.id) throw new Error('Chỉ chủ phòng mới được đổi tên');
    const nm = cleanName(name, 40);
    if (!nm) throw new Error('Tên phòng không hợp lệ');
    room.name = nm;
    room.system(`Phòng được đổi tên thành "${nm}"`);
    room.changed();
  });

  on('room:sit', ({ seat }) => {
    const room = rooms.get(user.roomId);
    if (!room) throw new Error('Bạn chưa vào phòng');
    room.handler.sit(user, seat);
    room.system(`${user.name} ngồi vào bàn`);
    room.changed();
  });

  on('room:stand', () => {
    const room = rooms.get(user.roomId);
    if (!room) throw new Error('Bạn chưa vào phòng');
    room.handler.stand(user.id);
    room.system(`${user.name} đứng dậy xem`);
    room.changed();
  });

  on('room:kick', ({ userId }) => {
    const room = rooms.get(user.roomId);
    if (!room || room.ownerId !== user.id) throw new Error('Chỉ chủ phòng mới được mời ra');
    const target = users.get(userId);
    if (!target || target.roomId !== room.id || target.id === user.id) throw new Error('Không tìm thấy người chơi');
    io.to('u:' + target.id).emit('room:closed', { roomId: room.id, reason: 'Bạn bị chủ phòng mời ra' });
    leaveRoom(target);
  });

  on('room:chat', ({ text }) => {
    const room = rooms.get(user.roomId);
    if (!room) throw new Error('Bạn chưa vào phòng');
    const t = String(text || '').trim().slice(0, 300);
    if (!t) return;
    room._pushChat({ from: user.id, name: user.name, text: t });
    room.changed();
  });

  on('game:action', (a) => {
    const room = rooms.get(user.roomId);
    if (!room) throw new Error('Bạn chưa vào phòng');
    try {
      room.handler.action(user.id, a);
    } finally {
      room.changed();
    }
  });

  socket.on('disconnect', () => {
    if (!user) return;
    const u = user;
    u.sockets.delete(socket.id);
    if (u.sockets.size) return;
    const room = u.roomId && rooms.get(u.roomId);
    if (room) room.changed();
    clearTimeout(u.graceTimer);
    u.graceTimer = setTimeout(() => {
      if (u.sockets.size) return;
      leaveRoom(u);
      // Giữ user (token) để lần sau vào lại vẫn giữ tên
    }, RECONNECT_GRACE_MS);
  });
});

server.listen(PORT, () => {
  console.log(`Game server: http://localhost:${PORT}`);
  console.log(APP_PASSWORD ? 'Auth gate: BẬT (APP_PASSWORD)' : 'Auth gate: TẮT — đặt APP_PASSWORD để yêu cầu mật khẩu');
  if (fs.existsSync(CLIENT_DIST)) console.log(`Phục vụ client từ ${CLIENT_DIST}`);
});

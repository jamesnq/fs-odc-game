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
import { SamLocHandler } from './games/samloc.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3001;
const CLIENT_DIST = process.env.CLIENT_DIST || path.resolve(__dirname, '../../client/dist');
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const RECONNECT_GRACE_MS = 60_000;
// Chia app thành nhiều server (sảnh riêng), mỗi server một mật khẩu. Mật khẩu quyết định vào server nào.
//   APP_SERVERS={"Bên A":"mat-khau-A","Bên B":"mat-khau-B"}
// Chỉ một server: APP_PASSWORD=mat-khau. Không đặt gì = một server mở, không cần mật khẩu.
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const SERVERS = loadServers();
const GATED = SERVERS.some((s) => s.password);
// Đặt TRUST_PROXY=1 khi chạy sau reverse proxy (Render, Nginx…) để lấy IP thật từ X-Forwarded-For.
const TRUST_PROXY = /^(1|true|yes)$/i.test(process.env.TRUST_PROXY || '');
const AUTH_MAX_FAILS = 10;
const AUTH_WINDOW_MS = 10 * 60_000;

const GAMES = {
  xiangqi: { name: 'Cờ tướng', Handler: XiangqiHandler },
  poker: { name: 'Poker', Handler: PokerHandler },
  tala: { name: 'Tá lả', Handler: TalaHandler },
  caro: { name: 'Cờ caro', Handler: CaroHandler },
  samloc: { name: 'Sâm lốc', Handler: SamLocHandler },
};

// Phiên bản client đang được phục vụ (do Vite ghi ra lúc build). Gửi cho trình duyệt khi kết nối
// để báo người dùng tải lại nếu họ đang chạy bản cũ.
let APP_VERSION = null;
try {
  APP_VERSION = JSON.parse(fs.readFileSync(path.join(CLIENT_DIST, 'version.json'), 'utf8')).version || null;
} catch {
  // Chưa build client (chạy dev) → không có phiên bản
}

/** Đọc cấu hình server từ biến môi trường. Sai cấu hình thì dừng hẳn, tránh vô tình mở app không mật khẩu. */
function loadServers() {
  const raw = (process.env.APP_SERVERS || '').trim();
  const idOf = (name) => 's' + crypto.createHash('sha256').update(name).digest('hex').slice(0, 10);
  if (!raw) return [{ id: 'default', name: null, password: APP_PASSWORD || null }];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('APP_SERVERS không phải JSON hợp lệ. Ví dụ: {"Bên A":"mat-khau-A","Bên B":"mat-khau-B"}');
  }
  const list = Array.isArray(parsed)
    ? parsed.map((x) => [x?.name, x?.password])
    : Object.entries(parsed || {});
  const servers = list.map(([name, password]) => {
    const n = String(name ?? '').trim().slice(0, 40);
    const pw = typeof password === 'string' ? password : '';
    if (!n) throw new Error('APP_SERVERS: mỗi server cần có tên');
    if (!pw) throw new Error(`APP_SERVERS: server "${n}" chưa có mật khẩu`);
    return { id: idOf(n), name: n, password: pw };
  });
  if (!servers.length) throw new Error('APP_SERVERS rỗng');
  if (new Set(servers.map((s) => s.name)).size !== servers.length) throw new Error('APP_SERVERS: tên server bị trùng');
  if (new Set(servers.map((s) => s.password)).size !== servers.length) throw new Error('APP_SERVERS: hai server không được trùng mật khẩu');
  return servers;
}

const app = express();
app.get('/health', (_req, res) => res.json(GATED ? { ok: true, version: APP_VERSION } : { ok: true, version: APP_VERSION, rooms: rooms.size, users: users.size }));
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
for (const s of SERVERS) s.hash = s.password ? sha(s.password) : null;
const authFails = new Map(); // ip -> { count, until }

function clientIp(socket) {
  const xff = socket.handshake.headers['x-forwarded-for'];
  if (TRUST_PROXY && xff) return String(xff).split(',')[0].trim();
  return socket.handshake.address;
}

io.use((socket, next) => {
  if (!GATED) {
    socket.data.server = SERVERS[0];
    return next();
  }
  const ip = clientIp(socket);
  const now = Date.now();
  const rec = authFails.get(ip);
  if (rec && rec.until < now) authFails.delete(ip);
  else if (rec && rec.count >= AUTH_MAX_FAILS) return next(new Error('AUTH_LOCKED'));
  const pw = socket.handshake.auth?.password;
  if (typeof pw !== 'string' || !pw) return next(new Error('AUTH_REQUIRED'));
  // So với mọi server (không dừng sớm) để thời gian phản hồi không lộ thông tin
  const h = sha(pw);
  let match = null;
  for (const s of SERVERS) if (crypto.timingSafeEqual(h, s.hash) && !match) match = s;
  if (match) {
    authFails.delete(ip);
    socket.data.server = match;
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
    this.server = owner.server; // phòng thuộc server của người tạo
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
      broadcastLobby(this.server);
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

// Mỗi server có sảnh riêng: chỉ thấy phòng của server mình
const lobbyPending = new Set();
function broadcastLobby(serverId) {
  if (lobbyPending.has(serverId)) return;
  lobbyPending.add(serverId);
  setTimeout(() => {
    lobbyPending.delete(serverId);
    io.to('lobby:' + serverId).emit('lobby:rooms', lobbyList(serverId));
  }, 100);
}
const lobbyList = (serverId) => [...rooms.values()]
  .filter((r) => r.server === serverId)
  .map((r) => r.summary())
  .sort((a, b) => b.createdAt - a.createdAt);
/** Phòng theo id, chỉ khi cùng server với người dùng. */
const roomFor = (user, id) => {
  const r = id && rooms.get(id);
  return r && r.server === user.server ? r : null;
};

function deleteRoom(room, reason) {
  room.handler.dispose();
  rooms.delete(room.id);
  for (const uid of room.members) {
    const u = users.get(uid);
    if (u && u.roomId === room.id) u.roomId = null;
    io.to('u:' + uid).emit('room:closed', { roomId: room.id, reason });
  }
  room.members.clear();
  broadcastLobby(room.server);
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
  const srv = socket.data.server;
  socket.emit('app:version', { version: APP_VERSION });

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

  on('hello', ({ token, tokens, name }) => {
    // Mỗi server một danh tính riêng: tokens = { [serverId]: token }
    const t = (tokens && typeof tokens === 'object' && tokens[srv.id]) || token;
    let u = typeof t === 'string' && byToken.get(t);
    if (u && u.server !== srv.id) u = null;
    const nm = cleanName(name);
    if (!u) {
      if (!nm) throw new Error('Hãy nhập tên');
      u = { id: newId(10), token: crypto.randomBytes(18).toString('base64url'), name: nm, server: srv.id, sockets: new Set(), roomId: null, graceTimer: null };
      users.set(u.id, u);
      byToken.set(u.token, u);
    }
    clearTimeout(u.graceTimer);
    u.sockets.add(socket.id);
    user = u;
    socket.join('u:' + u.id);
    socket.join('lobby:' + srv.id);
    const room = u.roomId && rooms.get(u.roomId);
    if (room) room.changed();
    return {
      user: { id: u.id, name: u.name }, token: u.token, roomId: room ? room.id : null, rooms: lobbyList(srv.id),
      server: { id: srv.id, name: srv.name, gated: GATED },
    };
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
    broadcastLobby(user.server);
    return { user: { id: user.id, name: nm } };
  });

  on('lobby:list', () => ({ rooms: lobbyList(user.server) }));

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
    const room = roomFor(user, roomId);
    if (!room) throw new Error('Phòng không tồn tại');
    const warning = joinRoom(user, room, mode === 'watch' ? 'watch' : 'play');
    return { roomId: room.id, warning };
  });

  on('room:leave', () => { leaveRoom(user); });

  on('room:delete', ({ roomId }) => {
    const room = roomFor(user, roomId || user.roomId);
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

  // Truy vấn dữ liệu lớn của game theo yêu cầu (vd: Hands log của Poker) thay vì gửi kèm mỗi lần cập nhật
  on('game:query', (q) => {
    const room = rooms.get(user.roomId);
    if (!room) throw new Error('Bạn chưa vào phòng');
    if (typeof room.handler.query !== 'function') throw new Error('Trò chơi không hỗ trợ');
    return { data: room.handler.query(user.id, q) };
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
  if (!GATED) console.log('Auth gate: TẮT — đặt APP_PASSWORD hoặc APP_SERVERS để yêu cầu mật khẩu');
  else if (SERVERS[0].name) console.log(`Auth gate: BẬT — ${SERVERS.length} server: ${SERVERS.map((s) => s.name).join(', ')}`);
  else console.log('Auth gate: BẬT (APP_PASSWORD)');
  if (fs.existsSync(CLIENT_DIST)) console.log(`Phục vụ client từ ${CLIENT_DIST} (phiên bản ${APP_VERSION || 'không rõ'})`);
});

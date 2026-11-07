// Cổng xác thực: kiểm tra mật khẩu / phiên đăng nhập ngay khi socket kết nối.
import crypto from 'node:crypto';
import { AUTH, DEBUG_IP, GATED, LIMITS, SERVERS, TRUST_PROXY } from './config.js';
import type { ServerConfig } from './config.js';
import type { GameSocket } from './socketTypes.js';
import type { ConnectionCounter } from './rateLimit.js';
import { WindowCounter } from './rateLimit.js';

const sha = (s: unknown) => crypto.createHash('sha256').update(String(s)).digest();
const hmac = (key: string | Buffer, data: string) => crypto.createHmac('sha256', key).update(data).digest();

for (const s of SERVERS) {
  s.hash = s.password ? sha(s.password) : null;
  // Khóa ký phiên suy ra từ mật khẩu: đổi mật khẩu là mọi phiên cũ hết hiệu lực
  s.sessionKey = s.password ? hmac('game-lobby/session/v1', s.password) : null;
}

const failsByIp = new WindowCounter(AUTH.windowMs, 50_000);
const globalFails = new WindowCounter(AUTH.globalWindowMs);

/** IP thật của client: phần tử thứ TRUST_PROXY tính từ CUỐI X-Forwarded-For (phần đầu do client tự điền). */
function clientIp(socket: GameSocket) {
  const direct = socket.handshake.address;
  if (!TRUST_PROXY) return direct;
  const xff = String(socket.handshake.headers['x-forwarded-for'] || '');
  const ips = xff.split(',').map((s) => s.trim()).filter(Boolean);
  return ips[ips.length - TRUST_PROXY] || ips[0] || direct;
}

/** Phiên đăng nhập ký HMAC: "<serverId>.<hết hạn>.<chữ ký>" — không cần lưu mật khẩu ở trình duyệt. */
export function issueSession(srv: ServerConfig) {
  if (!srv.sessionKey) return null;
  const body = `${srv.id}.${Date.now() + AUTH.sessionTtlMs}`;
  return `${body}.${hmac(srv.sessionKey, body).toString('base64url')}`;
}

function verifySession(token: unknown) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const [id, exp, sig] = token.split('.');
  const srv = SERVERS.find((s) => s.id === id);
  if (!srv?.sessionKey || !sig || !(Number(exp) > Date.now())) return null;
  const want = hmac(srv.sessionKey, `${id}.${exp}`);
  const got = Buffer.from(sig, 'base64url');
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? srv : null;
}

/** So mật khẩu với mọi server (không dừng sớm) để thời gian phản hồi không lộ thông tin. */
function serverByPassword(pw: string) {
  const h = sha(pw);
  let match: ServerConfig | null = null;
  for (const s of SERVERS) if (crypto.timingSafeEqual(h, s.hash!) && !match) match = s;
  return match;
}

/**
 * Middleware socket.io: gắn `socket.data.ip` và `socket.data.server` (sảnh người dùng được vào).
 * @param {import('./rateLimit.js').ConnectionCounter} connections số kết nối hiện có theo IP
 */
export function authGate(connections: ConnectionCounter) {
  return (socket: GameSocket, next: (error?: Error) => void) => {
    const ip = clientIp(socket);
    socket.data.ip = ip;
    if (DEBUG_IP) console.log('[ip]', ip, 'xff=', socket.handshake.headers['x-forwarded-for'] || '-', 'addr=', socket.handshake.address);
    if (connections.get(ip) >= LIMITS.connPerIp) return next(new Error('TOO_MANY_CONNECTIONS'));
    if (!GATED) {
      socket.data.server = SERVERS[0];
      return next();
    }
    // 1) Phiên đăng nhập còn hạn → vào luôn, không cần mật khẩu
    const credentials: { session?: unknown; password?: unknown } | undefined = socket.handshake.auth;
    const bySession = verifySession(credentials?.session);
    if (bySession) {
      socket.data.server = bySession;
      return next();
    }
    // 2) Mật khẩu
    if (failsByIp.count(ip) >= AUTH.maxFails) return next(new Error('AUTH_LOCKED'));
    const pw = credentials?.password;
    if (typeof pw !== 'string' || !pw || pw.length > 256) return next(new Error('AUTH_REQUIRED'));
    if (globalFails.count('*') >= AUTH.globalMaxFails) return next(new Error('AUTH_BUSY'));
    const match = serverByPassword(pw);
    if (match) {
      failsByIp.reset(ip);
      socket.data.server = match;
      return next();
    }
    globalFails.add('*');
    next(new Error(failsByIp.add(ip) >= AUTH.maxFails ? 'AUTH_LOCKED' : 'AUTH_FAILED'));
  };
}

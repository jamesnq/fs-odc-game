import { io } from 'socket.io-client';

// Khi client và server khác domain (vd: GitHub Pages + server riêng), đặt VITE_SERVER_URL lúc build.
const URL = import.meta.env.VITE_SERVER_URL || undefined;

export const socket = io(URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  // Mật khẩu vào app (auth gate) gửi kèm mỗi lần kết nối
  auth: (cb) => cb({ password: storage.password }),
});

export const AUTH_ERRORS = {
  AUTH_REQUIRED: 'Cần nhập mật khẩu để vào',
  AUTH_FAILED: 'Sai mật khẩu',
  AUTH_LOCKED: 'Nhập sai quá nhiều lần, hãy thử lại sau 10 phút',
};

/** Gửi sự kiện và chờ phản hồi; ném lỗi nếu server trả về lỗi. */
export function request(event, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!socket.connected) return reject(new Error('Mất kết nối tới máy chủ'));
    socket.timeout(10000).emit(event, payload, (err, res) => {
      if (err) return reject(new Error('Máy chủ không phản hồi'));
      if (!res?.ok) return reject(new Error(res?.error || 'Lỗi'));
      resolve(res);
    });
  });
}

export const storage = {
  get token() { return localStorage.getItem('gl_token') || ''; },
  set token(v) { localStorage.setItem('gl_token', v); },
  // Mỗi server một danh tính riêng: { [serverId]: token }
  get tokens() { try { return JSON.parse(localStorage.getItem('gl_tokens') || '{}') || {}; } catch { return {}; } },
  setServerToken(serverId, token) {
    try { localStorage.setItem('gl_tokens', JSON.stringify({ ...this.tokens, [serverId]: token })); } catch {}
  },
  get password() { try { return localStorage.getItem('gl_pw') || ''; } catch { return ''; } },
  set password(v) { try { v ? localStorage.setItem('gl_pw', v) : localStorage.removeItem('gl_pw'); } catch {} },
  get name() { return localStorage.getItem('gl_name') || ''; },
  set name(v) { localStorage.setItem('gl_name', v); },
};

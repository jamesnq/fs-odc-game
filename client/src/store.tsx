import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { socket, request, send, storage, AUTH_ERRORS } from './socket.js';
import type { GameAction, Identity, RequestEvent, Requests, Response, RoomSummary, RoomState, OnlineUser, ServerInfo, VoiceStatus } from '@game/shared/contracts';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
interface Toast { id: string; text: string; type: string }

/** Trạng thái phòng kèm thời điểm nhận (performance.now()) để tính đồng hồ đếm ngược. */
export type ClientRoom = RoomState & { receivedAt: number };
/** Gọi server, tự hiện lỗi dạng toast; lỗi thì trả về null. */
export type Call = <E extends RequestEvent>(event: E, payload: Requests[E]) => Promise<Response<E> | null>;

export interface AppContextValue {
  connected: boolean;
  user: Identity | null;
  setUser: Dispatch<SetStateAction<Identity | null>>;
  rooms: RoomSummary[];
  online: OnlineUser[];
  room: ClientRoom | null;
  toast: (text: string, type?: string) => void;
  phase: string;
  hello: (name?: string) => Promise<Response<'hello'>>;
  call: Call;
  act: (payload: GameAction) => Promise<Response<'game:action'> | null>;
  authError: string | null;
  login: (password: string) => void;
  newVersion: string | null;
  server: ServerInfo | null;
  switchServer: () => Promise<void>;
  voiceStatus: VoiceStatus | null;
}

const AUTH_MESSAGES: Record<string, string> = AUTH_ERRORS;
const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Thao tác chờ chuyển máy chủ, lưu trước khi tải lại trang. */
const isPendingRoute = (v: unknown): v is { event: 'room:create'; payload: Requests['room:create'] } | { event: 'room:join'; payload: Requests['room:join'] } =>
  !!v && typeof v === 'object' && 'event' in v && (v.event === 'room:create' || v.event === 'room:join')
  && 'payload' in v && !!v.payload && typeof v.payload === 'object';

const Ctx = createContext<AppContextValue | null>(null);
export const useApp = () => {
  const value = useContext(Ctx);
  if (!value) throw new Error('useApp() cần nằm trong <AppProvider>');
  return value;
};
// Dữ liệu đổi liên tục (số yêu cầu đang chờ, danh sách toast) để ở context riêng:
// chỉ thanh tiến trình / khung toast vẽ lại, không kéo cả app vẽ lại mỗi lần bấm nút.
const BusyCtx = createContext(0);
const ToastCtx = createContext<Toast[]>([]);
export const useBusy = () => useContext(BusyCtx);
export const useToasts = () => useContext(ToastCtx);

const roomFromHash = () => {
  const m = location.hash.match(/^#\/room\/([\w-]+)/);
  return m ? m[1] : null;
};

export function AppProvider({ children }: {children: ReactNode}) {
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState<Identity | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [online, setOnline] = useState<OnlineUser[]>([]); // người đang kết nối cùng server
  const [room, setRoom] = useState<ClientRoom | null>(null); // trạng thái phòng hiện tại
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Luồng vào app — một trạng thái duy nhất để các màn hình không giành nhau (tránh nhấp nháy):
  //   connecting → (auth → checking) → (name | entering) → ready
  const [phase, setPhase] = useState('connecting');
  const [busy, setBusy] = useState(0); // số yêu cầu đang chờ server trả lời
  const [server, setServer] = useState<ServerInfo | null>(null); // { id, name, gated } — server (sảnh) đang vào
  const [newVersion, setNewVersion] = useState<string | null>(null); // phiên bản mới trên server, khác bản đang chạy
  const [authError, setAuthError] = useState<string | null>(null); // null = chưa bị chặn; chuỗi = cần nhập mật khẩu
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null); // { enabled, reason, maxPerRoom, relay } — voice chat có bật trên server không
  const receivedAt = useRef(0);

  const toast = useCallback((text: string, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-4), { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 4000 : 2500);
  }, []);

  const hello = useCallback(async (name?: string) => {
    const res = await request('hello', { token: storage.token, tokens: storage.tokens, name: name || storage.name });
    storage.setServerToken(res.server.id, res.token);
    if (res.session) storage.session = res.session;
    storage.password = '';
    setServer(res.server);
    setVoiceStatus(res.voice || null);
    storage.name = res.user.name;
    setUser(res.user);
    setRooms(res.rooms);
    setOnline(res.online || []);
    setPhase('ready');
    // Resume the one operation that caused a shard redirect after authentication.
    let pending: unknown = null;
    try {
      pending = JSON.parse(sessionStorage.getItem('gl_pending_route') || 'null');
      sessionStorage.removeItem('gl_pending_route');
    } catch {}
    if (isPendingRoute(pending)) {
      const result = pending.event === 'room:create' ? await request('room:create', pending.payload) : await request('room:join', pending.payload);
      if (result.warning) toast(result.warning);
      return res;
    }
    // A restart loses in-memory rooms. Clear the previous room before trying the
    // URL again; otherwise a failed join leaves an unusable game on screen.
    if (!res.roomId) setRoom(null);
    const wanted = roomFromHash();
    if (!res.roomId && wanted) {
      try {
        const r = await request('room:join', { roomId: wanted, mode: 'watch' });
        if (r.warning) toast(r.warning);
      } catch (e) {
        toast(errorMessage(e), 'error');
        location.hash = '';
      }
    }
    return res;
  }, [toast]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      setAuthError(null);
      if (storage.name) {
        setPhase((ph) => (ph === 'ready' ? ph : 'entering'));
        hello().catch((e) => { toast(e.message, 'error'); setPhase('name'); });
      } else {
        setPhase('name');
      }
    };
    const onDisconnect = () => setConnected(false);
    // Middleware auth từ chối: socket.io không tự thử lại, phải nhập mật khẩu rồi connect lại
    const onConnectError = (err: Error) => {
      if (!AUTH_MESSAGES[err.message]) return;
      if (err.message === 'TOO_MANY_CONNECTIONS') return toast(AUTH_MESSAGES[err.message], 'error');
      storage.session = ''; // phiên hết hạn / đổi mật khẩu → phải nhập lại
      if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_FAILED') storage.password = '';
      setAuthError(err.message);
      setPhase('auth');
    };
    const onRooms = (list: RoomSummary[]) => setRooms(list);
    const onState = (s: RoomState) => {
      receivedAt.current = performance.now();
      setRoom({ ...s, receivedAt: receivedAt.current });
      if (roomFromHash() !== s.id) location.hash = `#/room/${s.id}`;
    };
    const onClosed = ({ reason }: { reason: string }) => {
      setRoom(null);
      location.hash = '';
      if (reason) toast(reason, 'error');
    };
    const onLeft = () => { setRoom(null); location.hash = ''; };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    // Server báo phiên bản client nó đang phục vụ; khác bản đang chạy → có bản deploy mới
    const onVersion = ({ version }: { version: string | null }) => {
      if (version && __APP_VERSION__ && version !== __APP_VERSION__) setNewVersion(version);
    };
    socket.on('app:version', onVersion);
    socket.on('voice:status', setVoiceStatus);
    socket.on('lobby:rooms', onRooms);
    socket.on('lobby:online', setOnline);
    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('room:left', onLeft);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('app:version', onVersion);
      socket.off('voice:status', setVoiceStatus);
      socket.off('lobby:rooms', onRooms);
      socket.off('lobby:online', setOnline);
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
      socket.off('room:left', onLeft);
      socket.disconnect();
    };
  }, [hello, toast]);

  // Điều hướng bằng nút back của trình duyệt
  useEffect(() => {
    const onHash = () => {
      if (!roomFromHash() && room) request('room:leave').catch(() => {});
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [room]);

  /**
   * Gọi server, tự hiện lỗi dạng toast.
   * Bấm lặp lại cùng một hành động khi yêu cầu trước chưa xong thì dùng chung kết quả (chống bấm đúp).
   */
  const inflight = useRef(new Map<string, Promise<unknown>>());
  const call: Call = useCallback(<E extends RequestEvent>(event: E, payload: Requests[E]) => {
    const key = event + JSON.stringify(payload ?? null);
    // Cùng khóa = cùng sự kiện và payload, nên kết quả đang chờ có đúng kiểu của E.
    const running = inflight.current.get(key) as Promise<Response<E> | null> | undefined;
    if (running) return running;
    setBusy((n) => n + 1);
    const p = send(event, payload)
      .then((res) => {
        if (res.warning) toast(res.warning);
        return res;
      })
      .catch((e: unknown) => {
        toast(errorMessage(e), 'error');
        return null;
      })
      .finally(() => {
        inflight.current.delete(key);
        setBusy((n) => n - 1);
      });
    inflight.current.set(key, p);
    return p;
  }, [toast]);

  const act = useCallback((payload: GameAction) => call('game:action', payload), [call]);

  const login = useCallback((password: string) => {
    storage.password = password;
    setPhase('checking');
    socket.connect();
  }, []);

  /** Rời server hiện tại để nhập mật khẩu của server khác. */
  const switchServer = useCallback(async () => {
    if (room) await request('room:leave').catch(() => {});
    storage.password = '';
    storage.session = '';
    location.hash = '';
    socket.disconnect();
    setRoom(null);
    setUser(null);
    setRooms([]);
    setOnline([]);
    setServer(null);
    setAuthError('AUTH_REQUIRED');
    setPhase('auth');
  }, [room]);

  const value = useMemo((): AppContextValue => ({
    connected, user, setUser, rooms, online, room, toast, phase, hello, call, act, authError, login, newVersion, server, switchServer, voiceStatus,
  }), [newVersion, server, switchServer, connected, user, rooms, online, room, toast, phase, hello, call, act, authError, login, voiceStatus]);

  return (
    <Ctx.Provider value={value}>
      <BusyCtx.Provider value={busy}>
        <ToastCtx.Provider value={toasts}>{children}</ToastCtx.Provider>
      </BusyCtx.Provider>
    </Ctx.Provider>
  );
}

/** Dùng trong cây phòng chơi (RoomView chỉ hiện khi đã có phòng và người dùng). */
export function useRoomApp() {
  const app = useApp();
  const { room, user } = app;
  if (!room || !user) throw new Error('useRoomApp() chỉ dùng khi đang ở trong phòng');
  return { ...app, room, user };
}

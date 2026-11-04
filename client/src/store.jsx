import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { socket, request, storage } from './socket.js';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const roomFromHash = () => {
  const m = location.hash.match(/^#\/room\/([\w-]+)/);
  return m ? m[1] : null;
};

export function AppProvider({ children }) {
  const [connected, setConnected] = useState(false);
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [room, setRoom] = useState(null); // trạng thái phòng hiện tại
  const [toasts, setToasts] = useState([]);
  const [needName, setNeedName] = useState(!storage.name);
  const receivedAt = useRef(0);

  const toast = useCallback((text, type = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-4), { id, text, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), type === 'error' ? 4000 : 2500);
  }, []);

  const hello = useCallback(async (name) => {
    const res = await request('hello', { token: storage.token, name: name || storage.name });
    storage.token = res.token;
    storage.name = res.user.name;
    setUser(res.user);
    setRooms(res.rooms);
    setNeedName(false);
    const wanted = roomFromHash();
    if (!res.roomId && wanted) {
      try {
        const r = await request('room:join', { roomId: wanted, mode: 'watch' });
        if (r.warning) toast(r.warning);
      } catch (e) {
        toast(e.message, 'error');
        location.hash = '';
      }
    }
    if (!res.roomId && !wanted) setRoom(null);
    return res;
  }, [toast]);

  useEffect(() => {
    const onConnect = () => {
      setConnected(true);
      if (storage.name) hello().catch((e) => { toast(e.message, 'error'); setNeedName(true); });
    };
    const onDisconnect = () => setConnected(false);
    const onRooms = (list) => setRooms(list);
    const onState = (s) => {
      receivedAt.current = performance.now();
      setRoom({ ...s, receivedAt: receivedAt.current });
      if (roomFromHash() !== s.id) location.hash = `#/room/${s.id}`;
    };
    const onClosed = ({ reason }) => {
      setRoom(null);
      location.hash = '';
      if (reason) toast(reason, 'error');
    };
    const onLeft = () => { setRoom(null); location.hash = ''; };
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lobby:rooms', onRooms);
    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);
    socket.on('room:left', onLeft);
    socket.connect();
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('lobby:rooms', onRooms);
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

  /** Gọi server, tự hiện lỗi dạng toast. */
  const call = useCallback(async (event, payload) => {
    try {
      const res = await request(event, payload);
      if (res.warning) toast(res.warning);
      return res;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  }, [toast]);

  const act = useCallback((payload) => call('game:action', payload), [call]);

  const value = useMemo(() => ({
    connected, user, setUser, rooms, room, toasts, toast, needName, setNeedName, hello, call, act,
  }), [connected, user, rooms, room, toasts, toast, needName, hello, call, act]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

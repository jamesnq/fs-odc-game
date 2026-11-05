import { useState } from 'react';
import { useApp } from './store.jsx';
import Lobby from './components/Lobby.jsx';
import RoomView from './components/RoomView.jsx';
import NameDialog from './components/NameDialog.jsx';
import Toasts from './components/Toasts.jsx';
import PasswordGate from './components/PasswordGate.jsx';
import UpdateBanner from './components/UpdateBanner.jsx';

export default function App() {
  const { connected, user, room, needName, authError, server, switchServer } = useApp();
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); if (room) location.hash = ''; }}>
          🎲 <span>Sảnh Trò Chơi</span>
        </a>
        {server?.name && <span className="server-badge" title="Server đang vào">🏷 {server.name}</span>}
        <div className="topbar-right">
          <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? 'Đã kết nối' : 'Mất kết nối'} />
          {user && server?.gated && (
            <button className="btn ghost sm" title="Vào server khác bằng mật khẩu khác"
              onClick={() => (!room || confirm('Rời phòng và đổi sang server khác?')) && switchServer()}>
              ⇄ <span className="hide-sm">Đổi server</span>
            </button>
          )}
          {user && (
            <button className="btn ghost" onClick={() => setRenaming(true)} title="Đổi tên">
              👤 {user.name} ✎
            </button>
          )}
        </div>
      </header>
      <main className="main">
        {authError ? (
          <PasswordGate />
        ) : !connected && !user ? (
          <div className="center muted">Đang kết nối tới máy chủ…</div>
        ) : room ? (
          <RoomView />
        ) : user ? (
          <Lobby />
        ) : null}
      </main>
      {!authError && (needName || renaming) && <NameDialog rename={renaming && !!user} onClose={() => setRenaming(false)} />}
      <Toasts />
      <UpdateBanner />
      {!connected && user && !authError && <div className="reconnect">Mất kết nối, đang thử lại…</div>}
    </div>
  );
}

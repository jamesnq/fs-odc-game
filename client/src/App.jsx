import { useState } from 'react';
import { useApp } from './store.jsx';
import Lobby from './components/Lobby.jsx';
import RoomView from './components/RoomView.jsx';
import NameDialog from './components/NameDialog.jsx';
import Toasts from './components/Toasts.jsx';
import PasswordGate from './components/PasswordGate.jsx';

export default function App() {
  const { connected, user, room, needName, authError } = useApp();
  const [renaming, setRenaming] = useState(false);

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#" onClick={(e) => { e.preventDefault(); if (room) location.hash = ''; }}>
          🎲 <span>Sảnh Trò Chơi</span>
        </a>
        <div className="topbar-right">
          <span className={`dot ${connected ? 'on' : 'off'}`} title={connected ? 'Đã kết nối' : 'Mất kết nối'} />
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
      {!connected && user && !authError && <div className="reconnect">Mất kết nối, đang thử lại…</div>}
    </div>
  );
}

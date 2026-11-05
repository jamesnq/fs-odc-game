import { useState } from 'react';
import { useApp } from '../store.jsx';
import { AUTH_ERRORS } from '../socket.js';

export default function PasswordGate() {
  const { authError, login } = useApp();
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = authError === 'AUTH_LOCKED';

  const submit = (e) => {
    e.preventDefault();
    if (!pw) return;
    setBusy(true);
    login(pw);
  };

  return (
    <div className="gate">
      <form className="gate-box form" onSubmit={submit}>
        <div className="gate-icon">🔒</div>
        <h2>Nhập mật khẩu</h2>
        <p className="muted small">Nhập mật khẩu của server bạn muốn vào. Mỗi server có sảnh và phòng chơi riêng.</p>
        {authError !== 'AUTH_REQUIRED' && <div className="gate-error">{AUTH_ERRORS[authError]}</div>}
        <input type="password" autoFocus autoComplete="current-password" value={pw}
          onChange={(e) => setPw(e.target.value)} placeholder="Mật khẩu" disabled={busy && !authError} />
        <button className="btn primary" disabled={!pw || locked}>Vào sảnh</button>
      </form>
    </div>
  );
}

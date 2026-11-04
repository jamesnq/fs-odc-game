import { useState } from 'react';
import { useApp } from '../store.jsx';
import { storage } from '../socket.js';
import Modal from './Modal.jsx';

export default function NameDialog({ rename, onClose }) {
  const { hello, call, setUser, toast, connected } = useApp();
  const [name, setName] = useState(storage.name);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const nm = name.trim();
    if (!nm) return;
    setBusy(true);
    try {
      if (rename) {
        const res = await call('user:rename', { name: nm });
        if (res) { storage.name = res.user.name; setUser(res.user); onClose(); }
      } else {
        storage.name = nm;
        await hello(nm);
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={rename ? 'Đổi tên' : 'Chào mừng! Bạn tên gì?'} onClose={rename ? onClose : undefined}>
      <form onSubmit={submit} className="form">
        <input autoFocus maxLength={24} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên hiển thị" />
        <div className="row end">
          {rename && <button type="button" className="btn ghost" onClick={onClose}>Hủy</button>}
          <button className="btn primary" disabled={busy || !name.trim() || !connected}>
            {rename ? 'Lưu' : 'Vào sảnh'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

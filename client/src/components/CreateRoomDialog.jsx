import { useState } from 'react';
import { useApp } from '../store.jsx';
import Modal from './Modal.jsx';
import { GAME_META } from './Lobby.jsx';

const DEFAULTS = {
  xiangqi: { minutes: 8 },
  poker: { bigBlind: 20, buyIn: 2000, maxSeats: 6, turnSeconds: 30 },
  tala: { maxSeats: 4, unit: 10, turnSeconds: 30 },
};

const FIELDS = {
  xiangqi: [['minutes', 'Thời gian mỗi bên (phút)', 1, 60]],
  poker: [
    ['bigBlind', 'Big blind (small blind = ½)', 2, 100000],
    ['buyIn', 'Số chip mua vào', 20, 10000000],
    ['maxSeats', 'Số ghế', 2, 9],
    ['turnSeconds', 'Thời gian mỗi lượt (giây)', 10, 120],
  ],
  tala: [
    ['maxSeats', 'Số người chơi tối đa', 2, 4],
    ['unit', 'Mức cược / đơn vị', 1, 1000000],
    ['turnSeconds', 'Thời gian mỗi lượt (giây)', 10, 120],
  ],
};

export default function CreateRoomDialog({ game: initialGame, onClose }) {
  const { call, user } = useApp();
  const [game, setGame] = useState(initialGame);
  const [name, setName] = useState('');
  const [opts, setOpts] = useState(DEFAULTS);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    const res = await call('room:create', { name, game, options: opts[game] });
    setBusy(false);
    if (res) onClose();
  };

  return (
    <Modal title="Tạo bàn mới" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <label>Trò chơi</label>
        <div className="seg">
          {Object.entries(GAME_META).map(([k, g]) => (
            <button type="button" key={k} className={game === k ? 'active' : ''} onClick={() => setGame(k)}>
              {g.icon} {g.name}
            </button>
          ))}
        </div>
        <label>Tên phòng</label>
        <input autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
          placeholder={`Bàn ${GAME_META[game].name} của ${user.name}`} />
        {FIELDS[game].map(([key, label, min, max]) => (
          <div key={key}>
            <label>{label}</label>
            <input type="number" min={min} max={max} value={opts[game][key]}
              onChange={(e) => setOpts({ ...opts, [game]: { ...opts[game], [key]: e.target.value } })} />
          </div>
        ))}
        <div className="row end">
          <button type="button" className="btn ghost" onClick={onClose}>Hủy</button>
          <button className="btn primary" disabled={busy}>Tạo và vào bàn</button>
        </div>
      </form>
    </Modal>
  );
}

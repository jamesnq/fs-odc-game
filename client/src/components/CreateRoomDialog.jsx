import { useState } from 'react';
import { useApp } from '../store.jsx';
import Modal from './Modal.jsx';
import { GAME_META, GameIcon } from './Lobby.jsx';
import { QUIZ_CATEGORIES } from '@game/shared/quiz';

const DEFAULTS = {
  xiangqi: { minutes: 8 },
  caro: { size: 15, minutes: 10, blockTwoEnds: true, bot: '' },
  wordchain: { maxSeats: 6, turnSeconds: 20, lives: 1, dictionary: true, strict: true, bot: '', bots: 1 },
  poker: { smallBlind: 10, bigBlind: 20, buyIn: 2000, maxSeats: 6, turnSeconds: 30, rabbitHunt: true },
  tala: { maxSeats: 4, unit: 10, turnSeconds: 30 },
  quiz: { category: 'all', questions: 10, seconds: 20, maxSeats: 20 },
  wordguess: { mode: 'race', minutes: 5, maxSeats: 6, daily: false, strict: true },
  samloc: { maxSeats: 4, unit: 10, turnSeconds: 25 },
};

// Tạo bàn kèm máy (Cờ caro / Nối từ)
const BOT_OPTIONS = [['', 'Không — chơi với người'], ['easy', 'Máy Dễ'], ['medium', 'Máy Vừa'], ['hard', 'Máy Khó']];

// [khóa, nhãn, min, max] · [khóa, nhãn, 'bool'] · [khóa, nhãn, 'select', các lựa chọn]
const FIELDS = {
  quiz: [
    ['category', 'Chủ đề (bộ câu hỏi có sẵn)', 'select', [['all', 'Tất cả chủ đề'], ...QUIZ_CATEGORIES.map((c) => [c, c])]],
    ['questions', 'Số câu mỗi ván', 3, 30],
    ['seconds', 'Thời gian mỗi câu (giây)', 5, 60],
    ['maxSeats', 'Số người chơi tối đa', 1, 30],
  ],
  wordguess: [
    ['mode', 'Chế độ', 'select', [['race', 'Đua — mỗi người một bàn, cùng một từ'], ['coop', 'Cùng đoán — cả phòng chung một bàn']]],
    ['daily', 'Từ của ngày (mọi người cùng một từ, mỗi ngày đổi)', 'bool'],
    ['minutes', 'Thời gian mỗi ván (phút)', 1, 15],
    ['maxSeats', 'Số người chơi tối đa', 1, 10],
  ],
  xiangqi: [['minutes', 'Thời gian mỗi bên (phút)', 1, 60]],
  wordchain: [
    ['maxSeats', 'Số người chơi tối đa', 2, 8],
    ['turnSeconds', 'Thời gian mỗi lượt (giây)', 10, 60],
    ['lives', 'Số mạng mỗi người', 1, 3],
    ['dictionary', 'Kiểm tra từ điển (mỗi chữ phải là tiếng Việt)', 'bool'],
    ['strict', 'Chặt: cả từ phải có trong từ điển (~62.000 từ). Tắt = thoáng, từ lạ chỉ bị gắn cờ', 'bool'],
    ['bot', 'Chơi với máy', 'select', BOT_OPTIONS],
    ['bots', 'Số máy', 1, 3],
  ],
  caro: [
    ['size', 'Kích thước bàn (ô mỗi cạnh)', 10, 20],
    ['minutes', 'Thời gian mỗi bên (phút)', 1, 60],
    ['blockTwoEnds', 'Chặn hai đầu thì không tính thắng', 'bool'],
    ['bot', 'Chơi với máy (bạn cầm X, đi trước)', 'select', BOT_OPTIONS],
  ],
  poker: [
    ['smallBlind', 'Small blind', 1, 100000],
    ['bigBlind', 'Big blind', 2, 100000],
    ['buyIn', 'Số chip mua vào', 20, 10000000],
    ['maxSeats', 'Số ghế', 2, 9],
    ['turnSeconds', 'Thời gian mỗi lượt (giây)', 10, 120],
    ['rabbitHunt', 'Cho xem rabbit hunt (lật bài chung còn lại khi ván kết thúc sớm)', 'bool'],
  ],
  samloc: [
    ['maxSeats', 'Số người chơi tối đa', 2, 5],
    ['unit', 'Mức cược / đơn vị', 1, 1000000],
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
              <GameIcon game={k} size={16} /> {g.name}
            </button>
          ))}
        </div>
        <label>Tên phòng</label>
        <input autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)}
          placeholder={`Bàn ${GAME_META[game].name} của ${user.name}`} />
        {FIELDS[game].filter(([key]) => key !== 'bots' || opts[game].bot).map(([key, label, min, max]) => min === 'select' ? (
          <div key={key}>
            <label htmlFor={`opt-${key}`}>{label}</label>
            <select id={`opt-${key}`} value={opts[game][key]}
              onChange={(e) => setOpts({ ...opts, [game]: { ...opts[game], [key]: e.target.value } })}>
              {max.map(([v, name]) => <option key={v} value={v}>{name}</option>)}
            </select>
          </div>
        ) : min === 'bool' ? (
          <label key={key} className="check">
            <input type="checkbox" checked={!!opts[game][key]}
              onChange={(e) => setOpts({ ...opts, [game]: { ...opts[game], [key]: e.target.checked } })} />
            {label}
          </label>
        ) : (
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

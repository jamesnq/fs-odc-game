import { useState } from 'react';
import { useApp } from '../store.jsx';
import CreateRoomDialog from './CreateRoomDialog.jsx';

export const GAME_META = {
  tala: { name: 'Tá lả', icon: '🃏', desc: 'Phỏm 2–4 người, ăn – hạ – gửi – Ù' },
  samloc: { name: 'Sâm lốc', icon: '🎴', desc: '2–5 người, 10 lá, báo Sâm – chặt heo' },
  poker: { name: 'Poker', icon: '♠️', desc: "Texas Hold'em No-Limit, 2–9 người" },
  xiangqi: { name: 'Cờ tướng', icon: '🀄', desc: '2 người, mỗi bên 8 phút, có chế độ xem' },
  caro: { name: 'Cờ caro', icon: '⭕', desc: '2 người, 5 quân liên tiếp là thắng' },
  wordchain: { name: 'Nối từ', icon: '🔤', desc: '2–8 người, nối từ tiếng Việt theo lượt' },
};

export default function Lobby() {
  const { rooms, user, call } = useApp();
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(null);
  const [q, setQ] = useState('');

  const list = rooms.filter((r) => (filter === 'all' || r.game === filter) && (!q || r.name.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="lobby">
      <section className="game-cards">
        {Object.entries(GAME_META).map(([k, g]) => (
          <div key={k} className={`game-card g-${k}`}>
            <div className="gc-icon">{g.icon}</div>
            <div className="gc-body">
              <h3>{g.name}</h3>
              <p>{g.desc}</p>
              <div className="muted small">{rooms.filter((r) => r.game === k).length} phòng đang mở</div>
            </div>
            <button className="btn primary" onClick={() => setCreating(k)}>+ Tạo bàn</button>
          </div>
        ))}
      </section>

      <section className="room-list">
        <div className="room-list-head">
          <div className="tabs">
            {[['all', 'Tất cả'], ...Object.entries(GAME_META).map(([k, g]) => [k, g.name])].map(([k, label]) => (
              <button key={k} className={`tab ${filter === k ? 'active' : ''}`} onClick={() => setFilter(k)}>{label}</button>
            ))}
          </div>
          <input className="search" placeholder="Tìm phòng…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        {list.length === 0 ? (
          <div className="empty">Chưa có phòng nào. Hãy tạo bàn mới!</div>
        ) : (
          <div className="rooms">
            {list.map((r) => {
              const full = r.players >= r.maxPlayers;
              return (
                <div key={r.id} className="room-item">
                  <div className="ri-icon">{GAME_META[r.game]?.icon}</div>
                  <div className="ri-body">
                    <div className="ri-title">
                      <b>{r.name}</b>
                      <span className={`badge ${r.playing ? 'playing' : 'waiting'}`}>{r.playing ? 'Đang chơi' : 'Đang chờ'}</span>
                    </div>
                    <div className="muted small">
                      {r.gameName} · Chủ phòng: {r.ownerName} · {describeOptions(r)}
                    </div>
                    <div className="small">
                      👥 {r.players}/{r.maxPlayers} {r.playerNames.length > 0 && <span className="muted">({r.playerNames.join(', ')})</span>}
                      {r.spectators > 0 && <> · 👁 {r.spectators} người xem</>}
                    </div>
                  </div>
                  <div className="ri-actions">
                    <button className="btn primary" disabled={full} onClick={() => call('room:join', { roomId: r.id, mode: 'play' })}>
                      {full ? 'Đủ người' : 'Vào chơi'}
                    </button>
                    <button className="btn" onClick={() => call('room:join', { roomId: r.id, mode: 'watch' })}>👁 Xem</button>
                    {r.ownerId === user.id && (
                      <button className="btn danger" onClick={() => confirm(`Xóa phòng "${r.name}"?`) && call('room:delete', { roomId: r.id })}>Xóa</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      {creating && <CreateRoomDialog game={creating} onClose={() => setCreating(null)} />}
    </div>
  );
}

function describeOptions(r) {
  const o = r.options || {};
  if (r.game === 'xiangqi') return `${o.minutes} phút/bên`;
  if (r.game === 'caro') return `${o.size}×${o.size} · ${o.minutes} phút/bên${o.blockTwoEnds ? ' · chặn 2 đầu' : ''}`;
  if (r.game === 'wordchain') return `${o.turnSeconds} giây/lượt · ${o.lives} mạng${o.dictionary ? ' · có từ điển' : ''}`;
  if (r.game === 'poker') return `Blind ${o.smallBlind}/${o.bigBlind} · Buy-in ${o.buyIn}`;
  if (r.game === 'samloc') return `Cược ${o.unit}/đơn vị · ${o.turnSeconds} giây/lượt`;
  if (r.game === 'tala') return `Cược ${o.unit}/đơn vị`;
  return '';
}

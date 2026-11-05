import { useState } from 'react';
import { useApp } from '../store.jsx';

const fmtPts = (n) => (Number.isInteger(n) ? String(n) : `${Math.floor(n) || ''}½`);
const fmtTime = (ts) => new Date(ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/**
 * Bảng điểm cho game 2 người. `sides` = { r: { label, cls }, b: {...} } để hiển thị màu quân trong lịch sử.
 */
export default function Scoreboard({ room, score, sides, playing }) {
  const { user, act } = useApp();
  const [tab, setTab] = useState('table');
  const isOwner = room.ownerId === user.id;
  const { rows, history } = score;

  return (
    <div className="panel scoreboard">
      <div className="sb-head">
        <h4>Bảng điểm {score.gameNo > 0 && <span className="muted">({score.gameNo} ván)</span>}</h4>
        <div className="tabs sm">
          <button className={`tab ${tab === 'table' ? 'active' : ''}`} onClick={() => setTab('table')}>Tỉ số</button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>Lịch sử</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="muted small">Chưa có ván nào kết thúc. Thắng +1 điểm, hòa +½, thua 0.</div>
      ) : tab === 'table' ? (
        <table className="sb-table">
          <thead>
            <tr><th>#</th><th>Người chơi</th><th title="Số ván">V</th><th title="Thắng">T</th><th title="Hòa">H</th><th title="Thua">B</th><th>Điểm</th></tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className={r.id === user.id ? 'me' : ''}>
                <td>{i === 0 && r.points > 0 ? '🏆' : i + 1}</td>
                <td className="sb-name">{r.name}</td>
                <td>{r.games}</td>
                <td className="pos">{r.wins}</td>
                <td>{r.draws}</td>
                <td className="neg">{r.losses}</td>
                <td><b>{fmtPts(r.points)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="sb-history">
          {history.map((h) => {
            const winner = h.players.find((p) => p.id === h.winnerId);
            return (
              <li key={h.no}>
                <span className="muted">#{h.no} · {fmtTime(h.ts)}</span>
                <div>
                  {h.players.map((p, k) => (
                    <span key={p.id}>
                      {k > 0 && <span className="muted"> vs </span>}
                      <span className={sides[p.side]?.cls}>{p.name}</span>
                    </span>
                  ))}
                </div>
                <div className="small">
                  {winner ? <><b>{winner.name}</b> ({sides[winner.side]?.label}) thắng</> : <b>Hòa</b>}
                  <span className="muted"> — {h.reason}{h.moves ? ` · ${h.moves} nước` : ''}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isOwner && rows.length > 0 && (
        <button className="btn ghost sm" disabled={playing}
          onClick={() => confirm('Đặt lại toàn bộ bảng điểm của phòng?') && act({ type: 'resetScore' })}>
          ↺ Đặt lại bảng điểm
        </button>
      )}
    </div>
  );
}

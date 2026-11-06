// Phần giao diện dùng chung của game cờ 2 người có đồng hồ (Cờ tướng, Cờ caro).
import { useEffect, useRef } from 'react';
import { useApp } from '../store.jsx';
import { useCountdown, fmtClock } from '../hooks.js';
import { pointsOf, fmtPts } from './Scoreboard.jsx';

/** Thanh người chơi một bên: tên, điểm trong phòng, trạng thái, đồng hồ; ghế trống thì có nút ngồi. */
export function PlayerBar({ side, s, room, chip, sitLabel }) {
  const { call, user } = useApp();
  const seat = s.seats[side];
  const running = s.running && s.turn === side;
  const ms = useCountdown(s.clocks[side], room.receivedAt, running);
  const member = seat && room.members.find((m) => m.id === seat.id);
  return (
    <div className={`xq-player ${running ? 'active' : ''}`}>
      {chip}
      {seat ? (
        <span className="pname">
          {seat.name}{seat.id === user.id && ' (bạn)'}
          {s.score?.gameNo > 0 && (
            <span className="score-chip" title="Điểm trong phòng: thắng 1, hòa ½, thua 0">{fmtPts(pointsOf(s.score, seat.id) ?? 0)} điểm</span>
          )}
          {member && !member.online && <span className="muted"> (mất kết nối)</span>}
          {s.status !== 'playing' && seat.id === room.ownerId && <span className="ready owner" title="Chủ phòng — bấm Bắt đầu"> 👑</span>}
          {s.status === 'waiting' && s.ready[side] && <span className="ready"> ✔ sẵn sàng</span>}
          {s.status === 'over' && s.ready[side] && <span className="ready"> ↻ muốn chơi lại</span>}
        </span>
      ) : (
        <span className="pname muted">
          Ghế trống {!s.myColor && s.status !== 'playing' && (
            <button className="btn primary sm" onClick={() => call('room:sit', { seat: side })}>{sitLabel}</button>
          )}
        </span>
      )}
      <span className={`clock ${running ? 'running' : ''} ${ms < 60000 && running ? 'low' : ''}`}>{fmtClock(ms)}</span>
    </div>
  );
}

/** Biên bản ván cờ, mỗi dòng một cặp nước; `sides` = [bên đi trước, bên đi sau] để tô màu. */
export function MoveList({ moves, sides }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }, [moves.length]);
  const rows = [];
  for (let i = 0; i < moves.length; i += 2) rows.push([i / 2 + 1, moves[i], moves[i + 1]]);
  return (
    <div className="panel moves">
      <h4>Biên bản ({moves.length} nước)</h4>
      <div className="move-list" ref={ref}>
        {rows.length === 0 && <div className="muted small">Chưa có nước đi</div>}
        {rows.map(([n, a, b]) => (
          <div key={n} className="move-row">
            <span className="muted">{n}.</span>
            <span className={`c-${sides[0]}`}>{a?.san}</span>
            <span className={`c-${sides[1]}`}>{b?.san || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

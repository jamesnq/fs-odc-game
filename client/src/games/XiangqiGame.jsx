import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Undo2, Handshake, Flag, RotateCcw, ArrowUpDown } from 'lucide-react';
import { legalMovesFrom, colorOf, typeOf, PIECE_CHAR, rowOf, colOf, idx } from '@game/shared/xiangqi';
import { useApp } from '../store.jsx';
import { useCountdown, useHotkeys, fmtClock } from '../hooks.js';
import Scoreboard, { ScoreLine, pointsOf, fmtPts } from '../components/Scoreboard.jsx';

const CELL = 56;
const PAD = 50; // chừa chỗ cho số cột hai bên
const W = CELL * 8 + PAD * 2;
const H = CELL * 9 + PAD * 2;
const COLOR_NAME = { r: 'Đỏ', b: 'Đen' };

export default function XiangqiGame({ room, state: s }) {
  const { act, call, user } = useApp();
  const [sel, setSel] = useState(null);
  const [manualFlip, setManualFlip] = useState(false);
  const my = s.myColor;
  const flipped = (my === 'b') !== manualFlip;
  const myTurn = s.status === 'playing' && my && s.turn === my;

  useEffect(() => { setSel(null); }, [s.moves.length, s.status]);

  const targets = useMemo(() => {
    if (sel === null || !myTurn) return [];
    return legalMovesFrom({ board: s.board, turn: s.turn, history: [] }, sel);
  }, [sel, myTurn, s.board, s.turn]);

  useHotkeys({ Escape: () => setSel(null), f: () => setManualFlip((f) => !f) });

  const clickPoint = (i) => {
    if (!myTurn) return;
    const p = s.board[i];
    if (sel !== null && targets.includes(i)) {
      act({ type: 'move', from: sel, to: i });
      setSel(null);
    } else if (p !== '.' && colorOf(p) === my) {
      setSel(i === sel ? null : i);
    } else {
      setSel(null);
    }
  };

  const pos = (i) => {
    let r = rowOf(i), c = colOf(i);
    if (flipped) { r = 9 - r; c = 8 - c; }
    return [PAD + c * CELL, PAD + r * CELL];
  };

  const topColor = flipped ? 'r' : 'b';
  const bottomColor = flipped ? 'b' : 'r';
  const opp = my === 'r' ? 'b' : 'r';
  const pending = s.pending;
  const checkedKing = s.inCheck ? s.board.indexOf(s.turn === 'r' ? 'K' : 'k') : -1;

  return (
    <div className="xq">
      <div className="xq-main">
        <PlayerBar color={topColor} s={s} room={room} />
        <svg className="xq-board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Bàn cờ tướng">
          <BoardDefs />
          <rect x="0" y="0" width={W} height={H} rx="16" fill="url(#xq-frame)" />
          <rect x="7" y="7" width={W - 14} height={H - 14} rx="11" fill="url(#xq-wood)" className="xq-bg" />
          <rect x="7" y="7" width={W - 14} height={H - 14} rx="11" filter="url(#xq-grain)" className="xq-grain" />
          <rect x={PAD} y={PAD + 4 * CELL} width={CELL * 8} height={CELL} className="xq-river-band" />
          <BoardLines />
          <FileLabels flipped={flipped} />
          {s.lastMove && (() => {
            const [fx, fy] = pos(s.lastMove.from);
            const [tx, ty] = pos(s.lastMove.to);
            const c = 27, l = 9; // khung 4 góc quanh ô vừa đến
            return (
              <g className="xq-last" aria-hidden>
                <circle cx={fx} cy={fy} r="7" className="from" />
                {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy]) => (
                  <polyline key={`${sx}${sy}`} points={`${tx + sx * c},${ty + sy * (c - l)} ${tx + sx * c},${ty + sy * c} ${tx + sx * (c - l)},${ty + sy * c}`} />
                ))}
              </g>
            );
          })()}
          {s.board.map((p, i) => {
            const [x, y] = pos(i);
            const isTarget = targets.includes(i);
            return (
              <g key={i} onClick={() => clickPoint(i)} className={myTurn ? 'xq-pt active' : 'xq-pt'}>
                <rect x={x - CELL / 2} y={y - CELL / 2} width={CELL} height={CELL} fill="transparent" />
                {p !== '.' && (
                  <g className={`xq-piece ${colorOf(p)} ${sel === i ? 'sel' : ''} ${checkedKing === i ? 'check' : ''}`}
                    transform={sel === i ? 'translate(0 -3)' : undefined} filter={sel === i ? 'url(#xq-lift)' : 'url(#xq-shadow)'}>
                    <circle cx={x} cy={y} r="25" className="rim" fill="url(#xq-rim)" />
                    <circle cx={x} cy={y} r="21.5" className="disc" fill="url(#xq-disc)" />
                    <circle cx={x} cy={y} r="18.5" className="inner" />
                    <path d={`M ${x - 21} ${y - 4} A 21.5 21.5 0 0 1 ${x + 21} ${y - 4}`} className="bevel" />
                    <text x={x} y={y + 8} textAnchor="middle">{PIECE_CHAR[colorOf(p)][typeOf(p)]}</text>
                  </g>
                )}
                {isTarget && (p === '.'
                  ? <circle cx={x} cy={y} r="7" className="xq-dot" />
                  : <circle cx={x} cy={y} r="27" className="xq-cap" />)}
              </g>
            );
          })}
        </svg>
        <PlayerBar color={bottomColor} s={s} room={room} />
      </div>

      <div className="xq-side">
        <div className="panel">
          {s.status === 'waiting' && (
            <div className="xq-status" role="status" aria-live="polite">
              {s.seats.r && s.seats.b ? 'Chờ hai bên sẵn sàng…' : 'Đang chờ người chơi…'}
            </div>
          )}
          {s.status === 'playing' && (
            <div className="xq-status" role="status" aria-live="polite">
              Lượt: <b className={`c-${s.turn}`}>{COLOR_NAME[s.turn]}</b>
              {s.inCheck && <span className="check-badge">CHIẾU!</span>}
              {myTurn && <span className="your-turn"> — tới lượt bạn</span>}
            </div>
          )}
          {s.status === 'over' && s.result && (
            <div className="xq-result">
              <div className="big">
                {s.result.winner ? <>{COLOR_NAME[s.result.winner]} thắng{my && (s.result.winner === my ? ' 🎉' : '')}</> : 'Hòa'}
              </div>
              <div className="muted">{s.result.text}</div>
              <ScoreLine score={s.score} a={s.seats.r} b={s.seats.b} />
            </div>
          )}

          {pending && my && pending.from === opp && (
            <div className="request">
              <b>{s.seats[opp]?.name}</b> {pending.type === 'draw' ? 'xin cầu hòa' : 'xin đi lại'}.
              <div className="row">
                <button className="btn primary sm" onClick={() => act({ type: 'respond', accept: true })}>Đồng ý</button>
                <button className="btn sm" onClick={() => act({ type: 'respond', accept: false })}>Từ chối</button>
              </div>
            </div>
          )}
          {pending && my && pending.from === my && (
            <div className="request mine">
              Đang chờ đối thủ trả lời {pending.type === 'draw' ? 'cầu hòa' : 'xin đi lại'}…
              <button className="btn sm" onClick={() => act({ type: 'cancelRequest' })}>Hủy</button>
            </div>
          )}
          {pending && !my && <div className="muted small">{COLOR_NAME[pending.from]} đang {pending.type === 'draw' ? 'cầu hòa' : 'xin đi lại'}…</div>}

          {my && (
            <div className="xq-actions">
              {s.status === 'waiting' && (
                <button className={`btn ${s.ready[my] ? '' : 'cta'}`} onClick={() => act({ type: 'ready' })} disabled={!s.seats[opp]}>
                  {s.ready[my] ? 'Hủy sẵn sàng' : <><Check size={16} aria-hidden /> Sẵn sàng</>}
                </button>
              )}
              {s.status === 'playing' && (
                <>
                  <button className="btn" disabled={!!pending} onClick={() => act({ type: 'requestUndo' })}><Undo2 size={16} aria-hidden /> Xin đi lại</button>
                  <button className="btn" disabled={!!pending} onClick={() => act({ type: 'offerDraw' })}><Handshake size={16} aria-hidden /> Cầu hòa</button>
                  <button className="btn danger" onClick={() => confirm('Bạn chắc chắn muốn xin thua?') && act({ type: 'resign' })}><Flag size={16} aria-hidden /> Xin thua</button>
                </>
              )}
              {s.status === 'over' && (
                <button className="btn primary" disabled={s.rematch[my] || !s.seats[opp]} onClick={() => act({ type: 'rematch' })}>
                  {s.rematch[my] ? 'Đang chờ đối thủ…' : s.rematch[opp] ? <><RotateCcw size={16} aria-hidden /> Đồng ý chơi lại</> : <><RotateCcw size={16} aria-hidden /> Chơi lại (đổi màu)</>}
                </button>
              )}
              {s.status !== 'playing' && <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy xem</button>}
            </div>
          )}
          {!my && <div className="muted small">Bạn đang xem. Ngồi vào ghế trống để chơi.</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn ghost sm" onClick={() => setManualFlip((f) => !f)}><ArrowUpDown size={16} aria-hidden /> Lật bàn <kbd>F</kbd></button>
          </div>
        </div>
        <Scoreboard room={room} score={s.score} playing={s.status === 'playing'}
          sides={{ r: { label: 'Đỏ', cls: 'c-r' }, b: { label: 'Đen', cls: 'c-b' } }} />
        <MoveList moves={s.moves} />
        <div className="muted small">Thời gian: {s.options.minutes} phút mỗi bên. Hết giờ là thua.</div>
      </div>
    </div>
  );

}

function PlayerBar({ color, s, room }) {
  const { call, user } = useApp();
  const my = s.myColor;
  const seat = s.seats[color];
  const running = s.running && s.turn === color;
  const ms = useCountdown(s.clocks[color], room.receivedAt, running);
  const low = ms < 60000;
  const member = seat && room.members.find((m) => m.id === seat.id);
  return (
    <div className={`xq-player ${running ? 'active' : ''}`}>
      <span className={`xq-chip ${color}`}>{PIECE_CHAR[color].K}</span>
      {seat ? (
        <span className="pname">
          {seat.name}{seat.id === user.id && ' (bạn)'}
          {s.score?.gameNo > 0 && (
            <span className="score-chip" title="Điểm trong phòng: thắng 1, hòa ½, thua 0">{fmtPts(pointsOf(s.score, seat.id) ?? 0)} điểm</span>
          )}
          {member && !member.online && <span className="muted"> (mất kết nối)</span>}
          {s.status === 'waiting' && s.ready[color] && <span className="ready"> ✔ sẵn sàng</span>}
          {s.status === 'over' && s.rematch[color] && <span className="ready"> ↻ muốn chơi lại</span>}
        </span>
      ) : (
        <span className="pname muted">
          Ghế trống {!my && s.status !== 'playing' && (
            <button className="btn primary sm" onClick={() => call('room:sit', { seat: color })}>Ngồi {COLOR_NAME[color]}</button>
          )}
        </span>
      )}
      <span className={`clock ${running ? 'running' : ''} ${low && running ? 'low' : ''}`}>{fmtClock(ms)}</span>
    </div>
  );
}

function MoveList({ moves }) {
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
            <span className="c-r">{a?.san}</span>
            <span className="c-b">{b?.san || ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Gradient gỗ, mặt quân và bóng đổ (có độ lệch) cho bàn cờ. */
function BoardDefs() {
  return (
    <defs>
      {/* Mặt gỗ sáng, khung gỗ sẫm */}
      <linearGradient id="xq-wood" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#f3d8a2" />
        <stop offset=".5" stopColor="#e7c083" />
        <stop offset="1" stopColor="#d9a964" />
      </linearGradient>
      <linearGradient id="xq-frame" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7a4a1f" />
        <stop offset="1" stopColor="#4e2c10" />
      </linearGradient>
      {/* Vân gỗ: nhiễu kéo dài theo chiều ngang, phủ rất nhẹ */}
      <filter id="xq-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.006 0.14" numOctaves="3" seed="7" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.24  0 0 0 0 0.08  0 0 0 0.55 -0.12" />
      </filter>
      {/* Quân: vành gỗ + mặt ngà */}
      <radialGradient id="xq-rim" cx=".4" cy=".3" r=".8">
        <stop offset="0" stopColor="#c58a4a" />
        <stop offset="1" stopColor="#7a4a1c" />
      </radialGradient>
      <radialGradient id="xq-disc" cx=".4" cy=".32" r=".8">
        <stop offset="0" stopColor="#fffaf0" />
        <stop offset=".7" stopColor="#f4e4c3" />
        <stop offset="1" stopColor="#e3c792" />
      </radialGradient>
      <filter id="xq-shadow" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="2.5" stdDeviation="1.6" floodColor="#3b2208" floodOpacity=".5" />
      </filter>
      <filter id="xq-lift" x="-40%" y="-40%" width="180%" height="190%">
        <feDropShadow dx="0" dy="7" stdDeviation="3.5" floodColor="#3b2208" floodOpacity=".45" />
      </filter>
    </defs>
  );
}

/** Số cột 1–9 kiểu Việt Nam: mỗi bên đếm từ tay phải của mình. */
function FileLabels({ flipped }) {
  const x = (c) => PAD + c * CELL;
  // Cột trên màn hình (trái → phải) ứng với cột trên bàn khi lật
  const boardCol = (c) => (flipped ? 8 - c : c);
  return (
    <g className="xq-files" aria-hidden>
      {Array.from({ length: 9 }, (_, c) => (
        <g key={c}>
          <text x={x(c)} y={PAD - 30} textAnchor="middle" className={flipped ? 'r' : 'b'}>{boardCol(c) + 1}</text>
          <text x={x(c)} y={PAD + CELL * 9 + 40} textAnchor="middle" className={flipped ? 'b' : 'r'}>{9 - boardCol(c)}</text>
        </g>
      ))}
    </g>
  );
}

function BoardLines() {
  const L = [];
  const x = (c) => PAD + c * CELL;
  const y = (r) => PAD + r * CELL;
  for (let r = 0; r < 10; r++) L.push(<line key={'h' + r} x1={x(0)} y1={y(r)} x2={x(8)} y2={y(r)} />);
  for (let c = 0; c < 9; c++) {
    if (c === 0 || c === 8) L.push(<line key={'v' + c} x1={x(c)} y1={y(0)} x2={x(c)} y2={y(9)} />);
    else {
      L.push(<line key={'v' + c + 'a'} x1={x(c)} y1={y(0)} x2={x(c)} y2={y(4)} />);
      L.push(<line key={'v' + c + 'b'} x1={x(c)} y1={y(5)} x2={x(c)} y2={y(9)} />);
    }
  }
  // Cung tướng
  L.push(<line key="p1" x1={x(3)} y1={y(0)} x2={x(5)} y2={y(2)} />, <line key="p2" x1={x(5)} y1={y(0)} x2={x(3)} y2={y(2)} />);
  L.push(<line key="p3" x1={x(3)} y1={y(7)} x2={x(5)} y2={y(9)} />, <line key="p4" x1={x(5)} y1={y(7)} x2={x(3)} y2={y(9)} />);
  // Dấu vị trí pháo / tốt
  const marks = [[2, 1], [2, 7], [7, 1], [7, 7], [3, 0], [3, 2], [3, 4], [3, 6], [3, 8], [6, 0], [6, 2], [6, 4], [6, 6], [6, 8]];
  for (const [r, c] of marks) {
    const d = 5, l = 10;
    for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      if ((c === 0 && sx < 0) || (c === 8 && sx > 0)) continue;
      const cx = x(c) + sx * d, cy = y(r) + sy * d;
      L.push(<polyline key={`m${r}${c}${sx}${sy}`} points={`${cx},${cy + sy * l} ${cx},${cy} ${cx + sx * l},${cy}`} fill="none" />);
    }
  }
  return (
    <g className="xq-lines">
      <rect x={x(0) - 8} y={y(0) - 8} width={CELL * 8 + 16} height={CELL * 9 + 16} fill="none" className="frame" />
      <rect x={x(0)} y={y(0)} width={CELL * 8} height={CELL * 9} fill="none" className="edge" />
      {L}
      <text x={x(2)} y={y(4.5) + 9} textAnchor="middle" className="river">楚 河</text>
      <text x={x(6)} y={y(4.5) + 9} textAnchor="middle" className="river">漢 界</text>
    </g>
  );
}

export { idx };

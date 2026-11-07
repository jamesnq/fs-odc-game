import { useRef } from 'react';
import { ArrowDown, ArrowDownToLine, ArrowLeft, ArrowRight, RotateCcw, RotateCw } from 'lucide-react';
import { HEIGHT, INPUT_INTERVAL, WIDTH, pieceCells } from '@game/shared/tetris';
import { useApp } from '../store.jsx';
import { useCountdown, useHotkeys } from '../hooks.js';

const CONTROLS = [
  ['left', 'ArrowLeft', ArrowLeft, 'Sang trái'],
  ['right', 'ArrowRight', ArrowRight, 'Sang phải'],
  ['down', 'ArrowDown', ArrowDown, 'Hạ một ô'],
  ['counterclockwise', 'z', RotateCcw, 'Xoay trái'],
  ['clockwise', 'ArrowUp', RotateCw, 'Xoay phải'],
  ['drop', ' ', ArrowDownToLine, 'Thả ngay'],
];

const GRID_LINES = [
  ...Array.from({ length: WIDTH - 1 }, (_, i) => `M${i + 1} 0v${HEIGHT}`),
  ...Array.from({ length: HEIGHT - 1 }, (_, i) => `M0 ${i + 1}h${WIDTH}`),
].join(' ');

export default function TetrisGame({ room, state: s }) {
  const { act, call, connected, user } = useApp();
  const lastInput = useRef(-Infinity);
  const playing = s.status === 'playing';
  const seated = s.mySeat !== -1;
  const remaining = Math.max(0, s.startsAt - room.serverTime);
  const countdown = useCountdown(remaining, room.receivedAt, playing && remaining > 0);
  const seconds = playing ? Math.ceil(Math.min(remaining, countdown) / 1000) : 0;
  const canMove = playing && seconds === 0 && seated && connected;
  const isOwner = room.ownerId === user.id;
  const bothOnline = s.seats.every((seat) => seat && room.members.some((m) => m.id === seat.id && m.online));
  const canStart = connected && bothOnline && s.waitingFor.length === 0;
  const target = s.options.targetLines;

  const send = (input) => {
    const now = performance.now();
    if (!canMove || now - lastInput.current < INPUT_INTERVAL + 15) return;
    lastInput.current = now;
    act({ type: 'input', input, round: s.round });
  };

  useHotkeys(Object.fromEntries(CONTROLS.map(([input, key]) => [key, (event) => {
    if (event.repeat && (input === 'drop' || input === 'clockwise' || input === 'counterclockwise')) return;
    send(input);
  }])), canMove);

  return (
    <div className="tetris">
      <header className="tetris-header">
        <strong>Đua xóa {target} hàng</strong>
        <span role="status">
          {s.result
            ? <><b>{s.result.winnerName ? `${s.result.winnerName} thắng` : 'Hòa'}</b> · {s.result.reason}</>
            : playing
              ? (seconds > 0 ? `Bắt đầu sau ${seconds}…` : 'Đang thi đấu')
              : (bothOnline ? (s.waitingFor.length ? 'Đang chờ người chơi sẵn sàng' : 'Chờ chủ phòng bắt đầu') : 'Đang chờ đủ hai người chơi')}
        </span>
        {!playing && (
          <div className="row tetris-actions">
            {isOwner ? (
              <button className="btn primary" disabled={!canStart} onClick={() => act({ type: 'start' })}>
                {s.result ? 'Bắt đầu ván mới' : 'Bắt đầu'}
              </button>
            ) : seated && (
              <button className="btn primary" disabled={!connected} onClick={() => act({ type: 'ready' })}>
                {s.ready.includes(user.id) ? 'Hủy sẵn sàng' : s.result ? 'Sẵn sàng chơi lại' : 'Sẵn sàng'}
              </button>
            )}
            {seated ? <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy xem</button>
              : s.seats.includes(null) && <button className="btn" onClick={() => call('room:sit')}>Ngồi vào bàn</button>}
          </div>
        )}
      </header>
      <div className="tetris-boards">
        {(s.mySeat === 1 ? [1, 0] : [0, 1]).map((index) => {
          const seat = s.seats[index];
          const board = s.boards[index];
          const mine = index === s.mySeat;
          const name = seat ? `${seat.name}${mine ? ' (bạn)' : ''}` : 'Ghế trống';
          const offline = seat && room.members.some((m) => m.id === seat.id && !m.online);
          const lines = board?.lines ?? 0;
          return (
            <section className={`tetris-player${mine ? ' mine' : ''}`} key={index}>
              <div className="tetris-player-head">
                <strong title={name}>{name}</strong>
                <span className="muted small">{offline ? 'Mất kết nối' : s.ready.includes(seat?.id) ? 'Sẵn sàng' : ''}</span>
                <span className="tetris-lines">{lines}/{target} hàng</span>
              </div>
              <progress value={lines} max={target} aria-label={`Tiến độ của ${name}`} />
              <Board board={board} name={name} />
              <div className="tetris-next">
                <span>Khối tiếp</span>
                <svg viewBox="0 0 4 2" aria-hidden="true">
                  {board?.next && <Piece piece={{ kind: board.next }} />}
                </svg>
              </div>
            </section>
          );
        })}
      </div>
      {playing && seated && (
        <div className="tetris-controls" role="group" aria-label="Điều khiển Tetris">
          {CONTROLS.map(([input, , Icon, label]) => (
            <button type="button" className="btn sm" disabled={!canMove} key={input}
              onClick={(event) => { if (event.detail > 0) event.currentTarget.blur(); send(input); }}
              aria-label={label} title={label}>
              <Icon size={19} aria-hidden />
            </button>
          ))}
        </div>
      )}
      <div className="muted small tetris-rule">Ai xóa đủ số hàng trước sẽ thắng. Đầy bàn hoặc rời trận sẽ thua.</div>
    </div>
  );
}

function Board({ board, name }) {
  return (
    <svg className="tetris-grid" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Bàn Tetris của ${name}`}>
      <path d={GRID_LINES} fill="none" strokeWidth=".04" />
      {board?.grid.map((row, y) => Array.from(row, (kind, x) => kind !== '.' && (
        <Block kind={kind} x={x} y={y} key={y * WIDTH + x} />
      )))}
      {board?.ghost && <g opacity=".28"><Piece piece={board.ghost} /></g>}
      {board?.piece && <Piece piece={board.piece} />}
    </svg>
  );
}

function Piece({ piece }) {
  return pieceCells(piece).map(([x, y]) => <Block kind={piece.kind} x={x} y={y} key={`${x},${y}`} />);
}

function Block({ kind, x, y }) {
  return <rect className={`tetris-block ${kind}`} x={x + .04} y={y + .04} width=".92" height=".92" rx=".1" />;
}

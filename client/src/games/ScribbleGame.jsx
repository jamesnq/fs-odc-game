import { useEffect, useRef, useState } from 'react';
import { Pencil, Eraser, PaintBucket, Undo2, Trash2, Timer, Check, Trophy, CircleStop } from 'lucide-react';
import { PALETTE, BRUSH_SIZES } from '@game/shared/scribble';
import { useApp } from '../store.jsx';
import GameInfo from '../components/GameInfo.jsx';
import StartBar, { ReadyMark } from '../components/StartBar.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useCountdown, useHotkeys } from '../hooks.js';
import ScribbleCanvas from './ScribbleCanvas.jsx';

const TOOLS = [['pen', 'Bút', Pencil, 'b'], ['eraser', 'Tẩy', Eraser, 'e'], ['fill', 'Đổ màu', PaintBucket, 'f']];

export default function ScribbleGame({ room, state: s }) {
  const { act, call, user } = useApp();
  const playing = s.status === 'playing';
  const me = s.myId;
  const isDrawer = playing && s.drawerId === user.id;
  const canDraw = isDrawer && s.phase === 'draw';
  const isOwner = room.ownerId === user.id;
  const timeLeft = useCountdown(s.phaseLeft, room.receivedAt, playing && !!s.phaseLeft);
  const nameOf = (id) => s.seats.find((x) => x.id === id)?.name || s.scores.find((x) => x.id === id)?.name || '?';
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState(1);
  const [size, setSize] = useState(1);
  const [stop, setStop] = useState(false);
  const canvas = useRef(null);

  useHotkeys({
    b: () => setTool('pen'), e: () => setTool('eraser'), f: () => setTool('fill'), z: () => canvas.current?.undo(),
    1: () => setSize(0), 2: () => setSize(1), 3: () => setSize(2), 4: () => setSize(3), 5: () => setSize(4),
  }, canDraw);

  return (
    <div className="sc">
      <div className="sc-main">
        <div className="panel sc-top">
          <span className="sc-round">{playing ? <>Vòng <b>{s.round}</b>/{s.options.rounds}</> : `Vẽ đoán · ${s.options.rounds} vòng`}</span>
          <WordLine s={s} isDrawer={isDrawer} />
          {playing && s.phaseLeft > 0 && (
            <span className={`sc-time ${s.phase === 'draw' && timeLeft < 10000 ? 'low' : ''}`}><Timer size={14} aria-hidden /> {Math.ceil(timeLeft / 1000)}s</span>
          )}
        </div>

        <div className="sc-board">
          <div className={`sc-stage ${canDraw ? 'my-turn' : ''}`}>
            <ScribbleCanvas ref={canvas} turn={s.turnNo} canDraw={canDraw} tool={tool} color={color} size={BRUSH_SIZES[size]} />
            <StageOverlay s={s} isDrawer={isDrawer} nameOf={nameOf} act={act} />
          </div>
          {canDraw && (
            <div className="sc-tools" role="toolbar" aria-label="Công cụ vẽ">
              <div className="sc-palette">
                {PALETTE.map((c, i) => (
                  <button key={c} className={`sc-color ${color === i && tool !== 'eraser' ? 'on' : ''}`} style={{ background: c }}
                    onClick={() => { setColor(i); if (tool === 'eraser') setTool('pen'); }} aria-label={`Màu ${c}`} aria-pressed={color === i} />
                ))}
              </div>
              <div className="sc-sizes">
                {BRUSH_SIZES.map((w, i) => (
                  <button key={w} className={`sc-size ${size === i ? 'on' : ''}`} onClick={() => setSize(i)} aria-label={`Cỡ nét ${w}`} title={`Cỡ ${i + 1}`}>
                    <span style={{ width: Math.min(24, w), height: Math.min(24, w), background: PALETTE[color] }} />
                  </button>
                ))}
              </div>
              <div className="sc-toolbtns">
                {TOOLS.map(([k, label, Icon, key]) => (
                  <button key={k} className={`btn sm ${tool === k ? 'primary' : 'ghost'}`} onClick={() => setTool(k)} title={`${label} (${key.toUpperCase()})`} aria-pressed={tool === k}>
                    <Icon size={16} aria-hidden /><span className="hide-sm"> {label}</span>
                  </button>
                ))}
                <button className="btn sm ghost" onClick={() => canvas.current?.undo()} title="Hoàn tác (Z)"><Undo2 size={16} aria-hidden /><span className="hide-sm"> Hoàn tác</span></button>
                <button className="btn sm ghost danger-text" onClick={() => canvas.current?.clear()} title="Xóa hết"><Trash2 size={16} aria-hidden /><span className="hide-sm"> Xóa</span></button>
              </div>
            </div>
          )}
        </div>

        <div className="board-actions">
          {!playing && (
            <StartBar players={s.seats} ready={s.ready} waitingFor={s.waitingFor} seated={!!me}
              startLabel={s.status === 'over' ? 'Chơi ván mới' : 'Bắt đầu'} />
          )}
          {me ? <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy</button>
            : s.seats.length < s.options.maxSeats && (
              <button className="btn primary" onClick={() => call('room:sit', {})}>{playing ? 'Vào đoán cùng' : 'Vào chơi'}</button>
            )}
          {playing && isOwner && <button className="btn ghost" onClick={() => setStop(true)}><CircleStop size={14} aria-hidden /> Dừng ván</button>}
        </div>
      </div>

      <div className="sc-side">
        <Players s={s} ownerId={room.ownerId} me={user.id} />
        <Feed s={s} me={me} isDrawer={isDrawer} act={act} />
      </div>

      <GameInfo>
        <Wins wins={s.wins} me={user.id} />
        <div className="panel small muted wc-rules">
          <b>Luật chơi</b>
          <ul>
            <li>Mỗi vòng ai cũng được vẽ một lần. Người vẽ chọn 1 trong 3 từ rồi vẽ trong {s.options.drawSeconds} giây.</li>
            <li>Người khác gõ đoán ở ô <b>Đoán</b> — không cần gõ dấu. Sai 1 chữ cái sẽ được báo “gần đúng”.</li>
            <li>Đoán càng sớm càng nhiều điểm; người đoán trước được thêm. Người vẽ được {60} điểm cho mỗi người đoán đúng.</li>
            {s.options.hints && <li>Hết gần nửa thời gian, gợi ý sẽ lộ dần vài chữ cái.</li>}
            <li>Không được vẽ chữ, không nhắc đáp án trong khung chat. Sau {s.options.rounds} vòng, ai nhiều điểm nhất thắng.</li>
          </ul>
        </div>
      </GameInfo>

      {stop && (
        <ConfirmDialog title="Dừng ván này?" danger okLabel="Dừng ván" onOk={() => act({ type: 'stop' })} onClose={() => setStop(false)}>
          Ván kết thúc ngay và xếp hạng theo điểm hiện tại.
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Từ đang vẽ: người vẽ / người đã đoán đúng thấy cả từ; người khác thấy ô trống và gợi ý. */
function WordLine({ s, isDrawer }) {
  if (s.status !== 'playing' || !s.mask) {
    return <span className="sc-word muted">{s.status === 'playing' && s.phase === 'choose' ? 'Đang chọn từ…' : ''}</span>;
  }
  if (s.word) {
    return <span className="sc-word known" aria-label={`Từ: ${s.word}`}>{isDrawer ? 'Vẽ: ' : ''}<b>{s.word}</b></span>;
  }
  const parts = s.mask.split(' ');
  return (
    <span className="sc-word" aria-label={`Từ gồm ${parts.map((p) => p.length).join(', ')} chữ cái`}>
      {parts.map((p, i) => (
        <span key={i} className="sc-mask-part">
          {[...p].map((ch, j) => <span key={j} className={`sc-letter ${ch === '_' ? '' : 'hint'}`}>{ch === '_' ? '' : ch}</span>)}
          <sub>{p.length}</sub>
        </span>
      ))}
    </span>
  );
}

/** Lớp phủ trên khung vẽ: chờ bắt đầu · chọn từ · đáp án sau lượt · kết quả ván. */
function StageOverlay({ s, isDrawer, nameOf, act }) {
  if (s.status === 'playing' && s.phase === 'draw') return null;
  let body;
  if (s.status === 'playing' && s.phase === 'choose') {
    body = isDrawer && s.choices ? (
      <>
        <div className="sc-ov-title">Chọn một từ để vẽ</div>
        <div className="sc-choices">
          {s.choices.map((w, i) => <button key={w} className="btn cta" onClick={() => act({ type: 'choose', index: i })}>{w}</button>)}
        </div>
      </>
    ) : <div className="sc-ov-title"><Pencil size={18} aria-hidden /> {nameOf(s.drawerId)} đang chọn từ…</div>;
  } else if (s.status === 'playing' && s.phase === 'reveal') {
    const gains = s.turnGains || { drawer: 0, guessers: {} };
    const list = Object.entries(gains.guessers);
    body = (
      <>
        <div className="sc-ov-sub">Đáp án</div>
        <div className="sc-ov-word">{s.word}</div>
        <div className="sc-gains">
          {list.length === 0 ? <span className="muted">Không ai đoán được</span> : list.map(([id, p]) => <span key={id}>{nameOf(id)} <b>+{p}</b></span>)}
          {gains.drawer > 0 && <span>✏️ {nameOf(s.drawerId)} <b>+{gains.drawer}</b></span>}
        </div>
      </>
    );
  } else if (s.status === 'over' && s.last) {
    const top = s.last.ranking.slice(0, 3);
    body = (
      <>
        <div className="sc-ov-title"><Trophy size={20} aria-hidden /> Ván {s.last.no} kết thúc</div>
        <ol className="sc-podium">
          {top.map((r, i) => <li key={r.id} className={`p${i + 1}`}><span>{['🥇', '🥈', '🥉'][i]}</span> {r.name} <b>{r.score}</b></li>)}
        </ol>
      </>
    );
  } else {
    body = (
      <>
        <div className="sc-ov-title">🎨 Vẽ đoán</div>
        <div className="muted small">{s.seats.length < 2 ? 'Cần ít nhất 2 người chơi…' : 'Chờ mọi người sẵn sàng, chủ phòng bấm Bắt đầu'}</div>
      </>
    );
  }
  return <div className="sc-overlay" role="status">{body}</div>;
}

function Players({ s, ownerId, me }) {
  const playing = s.status === 'playing';
  const score = new Map(s.scores.map((x) => [x.id, x.score]));
  const list = [...s.seats].map((x) => ({ ...x, score: score.get(x.id) || 0 }));
  if (playing || s.status === 'over') list.sort((a, b) => b.score - a.score);
  return (
    <ol className="panel sc-players" aria-label="Người chơi">
      {list.map((p, i) => {
        const drawing = playing && p.id === s.drawerId;
        const guessed = s.guessed.includes(p.id);
        return (
          <li key={p.id} className={`${drawing ? 'drawing' : ''} ${guessed ? 'guessed' : ''} ${p.id === me ? 'me' : ''}`}>
            <span className="sc-rank">{s.status === 'waiting' ? '' : `#${i + 1}`}</span>
            <span className="sc-pname">{p.name}{p.id === me && <span className="muted"> (bạn)</span>}
              {!playing && <ReadyMark id={p.id} ready={s.ready} ownerId={ownerId} />}
            </span>
            {drawing && <Pencil size={14} className="sc-pen" aria-label="đang vẽ" />}
            {guessed && <Check size={14} className="sc-ok" aria-label="đã đoán đúng" />}
            {s.status !== 'waiting' && <b className="sc-score">{p.score}</b>}
          </li>
        );
      })}
      {list.length === 0 && <li className="muted small">Chưa có ai ngồi</li>}
    </ol>
  );
}

function Feed({ s, me, isDrawer, act }) {
  const box = useRef(null);
  const input = useRef(null);
  const [text, setText] = useState('');
  const last = s.feed[s.feed.length - 1];
  useEffect(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight; }, [last?.n]);
  const guessed = s.guessed.includes(me);
  const canGuess = s.status === 'playing' && s.phase === 'draw' && !!me && !isDrawer && !guessed;
  useEffect(() => {
    if (canGuess && window.matchMedia?.('(pointer: fine)').matches) input.current?.focus({ preventScroll: true });
  }, [canGuess, s.turnNo]);
  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !canGuess) return;
    setText('');
    act({ type: 'guess', text: t });
  };
  const placeholder = !me ? 'Vào chơi để đoán' : isDrawer ? 'Bạn đang vẽ' : guessed ? 'Bạn đã đoán đúng!' : s.phase === 'draw' ? 'Gõ câu đoán… (Enter)' : 'Chờ lượt vẽ…';
  return (
    <div className="panel sc-feed">
      <div className="sc-feed-box" ref={box} aria-live="polite">
        {s.feed.length === 0 && <div className="muted small">Các câu đoán sẽ hiện ở đây</div>}
        {s.feed.map((f) => (
          <div key={f.n} className={`sc-msg ${f.kind}`}>
            {f.kind === 'guess' ? <><b>{f.name}:</b> {f.text}</> : f.text}
          </div>
        ))}
      </div>
      <form className="sc-guess" onSubmit={submit}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} maxLength={60} disabled={!canGuess}
          placeholder={placeholder} aria-label="Đoán" autoComplete="off" autoCapitalize="off" spellCheck={false} />
        <button className="btn primary" disabled={!canGuess || !text.trim()}>Đoán</button>
      </form>
    </div>
  );
}

function Wins({ wins, me }) {
  if (!wins.length) return null;
  return (
    <div className="panel">
      <h4>Bảng thắng</h4>
      <table className="sb-table">
        <thead><tr><th>#</th><th>Người chơi</th><th>Ván</th><th>Thắng</th></tr></thead>
        <tbody>
          {wins.map((w, i) => (
            <tr key={w.id} className={w.id === me ? 'me' : ''}>
              <td>{i === 0 && w.wins > 0 ? '🏆' : i + 1}</td>
              <td className="sb-name">{w.name}</td>
              <td>{w.games}</td>
              <td><b>{w.wins}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

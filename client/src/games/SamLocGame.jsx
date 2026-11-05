import { useEffect, useMemo, useState } from 'react';
import { classify, beats, valueOf, COMBO_VI, SAM_RULES } from '@game/shared/samloc';
import { useApp } from '../store.jsx';
import Card from '../components/Card.jsx';
import { useCountdown, useHotkeys } from '../hooks.js';

const fmt = (n) => (n > 0 ? '+' : '') + Number(n || 0).toLocaleString('vi-VN');
const comboLabel = (c) => (c ? `${COMBO_VI[c.type]}${c.type === 'straight' ? ` ${c.len} lá` : ''}` : '');

export default function SamLocGame({ room, state: s }) {
  const { act, call } = useApp();
  const g = s.game;
  const timeLeft = useCountdown(s.turnLeft, room.receivedAt, !!s.turnLeft);
  if (!g || (!s.playing && !g.result)) return <Waiting s={s} act={act} call={call} />;
  return (
    <div className="sl">
      <Table s={s} g={g} act={act} timeLeft={timeLeft} />
      {g.result && <Result s={s} g={g} act={act} call={call} />}
    </div>
  );
}

function Waiting({ s, act, call }) {
  const seated = s.seats.filter(Boolean).length;
  useHotkeys({ n: () => s.mySeat >= 0 && seated >= 2 && act({ type: 'start' }) });
  return (
    <div className="tl-wait panel">
      <h3>Bàn Sâm lốc — cược {s.config.unit}/đơn vị</h3>
      <div className="tl-seats">
        {s.seats.map((seat, i) => (
          <div key={i} className={`tl-seat-box ${seat ? '' : 'empty'}`}>
            {seat ? (
              <>
                <b>{seat.name}</b>
                <div className={seat.total >= 0 ? 'pos' : 'neg'}>{fmt(seat.total)}</div>
              </>
            ) : s.mySeat < 0 ? (
              <button className="btn sm" onClick={() => call('room:sit', { seat: i })}>Ngồi đây</button>
            ) : <span className="muted">Trống</span>}
          </div>
        ))}
      </div>
      <div className="row">
        {s.mySeat >= 0 ? (
          <>
            <button className="btn cta" disabled={seated < 2} onClick={() => act({ type: 'start' })}><kbd>N</kbd> Chia bài</button>
            <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy xem</button>
          </>
        ) : <span className="muted">Bạn đang xem. Chọn ghế trống để chơi.</span>}
      </div>
      {seated < 2 && <div className="muted small">Cần ít nhất 2 người để bắt đầu.</div>}
      <Rules />
    </div>
  );
}

function Rules() {
  return (
    <details className="rules">
      <summary>Luật Sâm lốc tóm tắt</summary>
      <ul>
        <li>2–5 người, mỗi người 10 lá. Thứ tự: 3 &lt; 4 &lt; … &lt; K &lt; A &lt; 2 (heo). <b>Không xét chất</b> — cùng số không chặn được nhau.</li>
        <li>Bộ đánh: rác, đôi, sám (3 lá), tứ quý, sảnh (≥3 lá liên tiếp; A-2-3… hoặc …Q-K-A, không vòng K-A-2). Chặn bằng bộ cùng loại, cùng số lá, cao hơn. <b>Tứ quý chặt heo.</b></li>
        <li>Đã bỏ lượt thì nghỉ tới hết vòng. Mọi người bỏ thì người đánh cuối đi vòng mới.</li>
        <li><b>Báo 1:</b> người kế tiếp còn 1 lá thì đánh rác phải đánh lá lớn nhất.</li>
        <li><b>Báo Sâm</b> đầu ván: đi trước và phải đánh hết bài mà không ai chặn. Thành công: mỗi nhà trả {SAM_RULES.sam}. Bị chặn: đền mỗi nhà {SAM_RULES.sam}.</li>
        <li><b>Tới trắng</b> khi chia: tứ quý heo, sảnh rồng 10 lá, 5 đôi, 3 sám, 10 lá đồng màu — mỗi nhà trả {SAM_RULES.toiTrang}.</li>
        <li>Người hết bài đầu tiên thắng. Mỗi nhà trả {SAM_RULES.perCard}/lá còn lại; <b>cóng</b> (chưa đánh lá nào) trả {SAM_RULES.cong}; <b>thối heo</b> +{SAM_RULES.thoiHeo}/con; bị <b>chặt heo</b> trả người chặt {SAM_RULES.chatHeo}.</li>
      </ul>
    </details>
  );
}

function Table({ s, g, act, timeLeft }) {
  const inGame = g.me >= 0;
  const me = inGame ? g.players[g.me] : null;
  const myTurn = inGame && g.phase === 'play' && g.turn === g.me;
  const n = g.players.length;
  const others = Array.from({ length: n - (inGame ? 1 : 0) }, (_, k) => (inGame ? (g.me + 1 + k) % n : k));

  // ----- Bài trên tay & chọn bài -----
  const hand = me?.hand || [];
  const [selected, setSelected] = useState([]);
  const [cursor, setCursor] = useState(0);
  const handKey = hand.join(',');
  useEffect(() => {
    setSelected((sel) => sel.filter((c) => hand.includes(c)));
    setCursor((c) => Math.min(c, Math.max(0, hand.length - 1)));
  }, [handKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (c) => setSelected((sel) => (sel.includes(c) ? sel.filter((x) => x !== c) : [...sel, c]));

  const lastCombo = useMemo(() => (g.lastPlay ? classify(g.lastPlay.cards) : null), [g.lastPlay]);
  const combo = useMemo(() => classify(selected), [selected]);
  const nextHasOne = inGame && g.players[(g.me + 1) % n].count === 1;
  const maxVal = hand.length ? Math.max(...hand.map(valueOf)) : 0;
  const problem = !selected.length ? null
    : !combo ? 'Bộ bài không hợp lệ'
    : lastCombo && !beats(combo, lastCombo) ? `Không chặn được ${comboLabel(lastCombo).toLowerCase()}`
    : combo.type === 'single' && nextHasOne && combo.top < maxVal ? 'Người sau báo 1: phải đánh lá lớn nhất'
    : null;
  const canPlay = myTurn && selected.length > 0 && !problem;

  const doPlay = () => canPlay && act({ type: 'play', cards: selected }).then((r) => r && setSelected([]));
  const doPass = () => myTurn && g.lastPlay && act({ type: 'pass' }).then((r) => r && setSelected([]));
  const samPending = inGame && g.phase === 'sam' && !g.samDecided.includes(g.me);
  const doSam = (yes) => samPending && act({ type: 'sam', yes });

  useHotkeys({
    Enter: doPlay,
    p: doPass,
    ' ': () => hand[cursor] && toggle(hand[cursor]),
    ArrowLeft: () => setCursor((c) => Math.max(0, c - 1)),
    ArrowRight: () => setCursor((c) => Math.min(hand.length - 1, c + 1)),
    ArrowUp: () => hand[cursor] && !selected.includes(hand[cursor]) && toggle(hand[cursor]),
    ArrowDown: () => hand[cursor] && selected.includes(hand[cursor]) && toggle(hand[cursor]),
    Escape: () => setSelected([]),
    y: () => doSam(true),
    k: () => doSam(false),
  }, inGame && !g.result);

  const status = (p, i) => {
    const tags = [];
    if (g.samBy === i) tags.push(<span key="sam" className="badge sam">🔥 Báo Sâm</span>);
    if (!g.result && p.count === 1) tags.push(<span key="one" className="badge danger">Báo 1!</span>);
    if (g.phase === 'play' && p.passed) tags.push(<span key="pass" className="badge">Bỏ lượt</span>);
    if (g.phase === 'sam' && g.samDecided.includes(i) && g.samBy !== i) tags.push(<span key="no" className="badge">Không báo</span>);
    const seat = s.seats[s.gameSeats[i]];
    if (seat?.left) tags.push(<span key="left" className="badge warn">Đã rời</span>);
    else if (seat && !seat.online) tags.push(<span key="off" className="badge warn">Mất kết nối</span>);
    return tags;
  };
  const turnTimer = (i) => !g.result && ((g.phase === 'play' && g.turn === i) || (g.phase === 'sam' && !g.samDecided.includes(i)))
    && <span className="tl-timer">⏱ {Math.ceil(timeLeft / 1000)}s</span>;

  return (
    <div className="sl-table">
      <div className="sl-others">
        {others.map((i) => {
          const p = g.players[i];
          return (
            <div key={p.id} className={`sl-opp ${g.phase === 'play' && g.turn === i ? 'turn' : ''} ${g.lastPlay?.by === i ? 'last' : ''}`}>
              <div className="tl-head">
                <b>{p.name}</b>
                <span className="muted small">{p.count} lá</span>
                {turnTimer(i)}
              </div>
              <div className="row wrap sl-tags">{status(p, i)}</div>
              <div className="tl-hand-back">
                {p.hand ? p.hand.map((c) => <Card key={c} card={c} size="sm" />)
                  : Array.from({ length: p.count }).map((_, j) => <Card key={j} card="??" size="xs" />)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="sl-center">
        {g.phase === 'sam' && !g.result ? (
          <div className="sl-sam">
            <div className="sl-sam-title">🔥 Báo Sâm? <span className="tl-timer">⏱ {Math.ceil(timeLeft / 1000)}s</span></div>
            <div className="muted small">Báo Sâm: đi trước, phải đánh hết bài mà không ai chặn được. Thành công +{SAM_RULES.sam}/nhà, bị chặn đền {SAM_RULES.sam}/nhà.</div>
            {samPending ? (
              <div className="row">
                <button className="btn warn" onClick={() => doSam(true)}><kbd>Y</kbd> Báo Sâm</button>
                <button className="btn" onClick={() => doSam(false)}><kbd>K</kbd> Không báo</button>
              </div>
            ) : <div className="muted small">Đang chờ người khác quyết định…</div>}
          </div>
        ) : g.lastPlay ? (
          <div className="sl-pile">
            <div className="muted small">{g.players[g.lastPlay.by].name} — {comboLabel(lastCombo)}</div>
            <div className="sl-pile-cards">{g.lastPlay.cards.map((c) => <Card key={c} card={c} size="md" />)}</div>
          </div>
        ) : !g.result && (
          <div className="muted">{g.turn >= 0 && <><b>{g.players[g.turn].name}</b> đi vòng mới</>}</div>
        )}
        {!g.result && g.phase === 'play' && (
          <div className="tl-status" role="status" aria-live="polite">Lượt: <b>{g.players[g.turn].name}</b>{g.samBy >= 0 && <span className="muted"> · {g.players[g.samBy].name} đang đi Sâm</span>}</div>
        )}
        <div className="tl-log">{g.log.slice(-3).map((l, i) => <div key={i} className="small muted">{l}</div>)}</div>
      </div>

      {inGame && (
        <div className={`sl-me ${myTurn ? 'turn' : ''}`}>
          <div className="tl-head">
            <b>{me.name} (bạn)</b> <span className="muted small">{me.count} lá</span>
            {status(me, g.me)}
            {turnTimer(g.me)}
          </div>
          <div className="tl-hand">
            {hand.map((c, i) => (
              <Card key={c} card={c} size="lg" selected={selected.includes(c)} focused={i === cursor}
                onClick={() => { setCursor(i); toggle(c); }} />
            ))}
          </div>
          {!g.result && (
            <div className="row wrap tl-actions">
              {myTurn ? <span className="your-turn">Tới lượt bạn{g.lastPlay ? ': chặn hoặc bỏ lượt' : ': đi vòng mới'}</span>
                : <span className="muted">{g.phase === 'sam' ? 'Đang chờ báo Sâm…' : 'Chờ tới lượt…'}</span>}
              {selected.length > 0 && (
                <span className={`sl-sel ${problem ? 'bad' : 'ok'}`}>{problem || `${comboLabel(combo)} ✓`}</span>
              )}
              <button className="btn primary" disabled={!canPlay} onClick={doPlay}><kbd>Enter</kbd> Đánh</button>
              <button className="btn" disabled={!myTurn || !g.lastPlay} onClick={doPass}><kbd>P</kbd> Bỏ lượt</button>
              <button className="btn ghost sm" disabled={!selected.length} onClick={() => setSelected([])}><kbd>Esc</kbd> Bỏ chọn</button>
            </div>
          )}
        </div>
      )}
      {!inGame && <div className="muted small center">Bạn đang xem ván này.</div>}
    </div>
  );
}

function Result({ s, g, act, call }) {
  const r = g.result;
  useHotkeys({ n: () => s.mySeat >= 0 && act({ type: 'start' }) });
  const title = r.type === 'samFail'
    ? `💥 ${g.players[r.samBy].name} bị ${g.players[r.winner].name} chặn Sâm!`
    : `🏆 ${g.players[r.winner].name} — ${r.text}`;
  return (
    <div className="tl-result panel">
      <h3>{title}</h3>
      <table className="result-table">
        <thead><tr><th>Người chơi</th><th>Bài còn lại</th><th>Chi tiết</th><th>Thắng/thua</th></tr></thead>
        <tbody>
          {g.players.map((p, i) => (
            <tr key={p.id}>
              <td>{p.name}{i === r.winner && r.type !== 'samFail' ? ' 🏆' : ''}</td>
              <td>
                {p.hand?.length ? <span className="sl-left-cards">{p.hand.map((c) => <Card key={c} card={c} size="sm" />)}</span> : <span className="muted">Hết bài</span>}
              </td>
              <td className="small sl-lines">
                {r.lines[i].length ? r.lines[i].map((l, k) => (
                  <div key={k}>{l.reason} <span className="muted">({g.players[l.with].name})</span> <span className={l.amount >= 0 ? 'pos' : 'neg'}>{fmt(l.amount * s.config.unit)}</span></div>
                )) : '—'}
              </td>
              <td className={r.scores[i] >= 0 ? 'pos' : 'neg'}><b>{fmt(r.scores[i] * s.config.unit)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        {s.mySeat >= 0 ? (
          <>
            <button className="btn cta" disabled={s.seats.filter(Boolean).length < 2} onClick={() => act({ type: 'start' })}><kbd>N</kbd> Ván mới</button>
            <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy xem</button>
          </>
        ) : s.seats.map((x, i) => !x && (
          <button key={i} className="btn sm" onClick={() => call('room:sit', { seat: i })}>Ngồi ghế {i + 1}</button>
        ))}
      </div>
      <div className="small muted">Tổng điểm: {s.seats.filter(Boolean).map((x) => `${x.name}: ${fmt(x.total)}`).join(' · ')}</div>
    </div>
  );
}

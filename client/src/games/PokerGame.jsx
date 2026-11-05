import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store.jsx';
import Card from '../components/Card.jsx';
import { useCountdown, useHotkeys } from '../hooks.js';
import PokerHandLog from './PokerHandLog.jsx';

const STREET_VI = { preflop: 'Preflop', flop: 'Flop', turn: 'Turn', river: 'River', done: 'Kết thúc' };
const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

export default function PokerGame({ room, state: s }) {
  const { act, call, user } = useApp();
  const h = s.hand;
  const N = s.seats.length;
  const mySeat = s.mySeat;
  const base = mySeat >= 0 ? mySeat : 0;
  const o = s.options;
  const timeLeft = useCountdown(s.turnLeft, room.receivedAt, !!s.turnLeft);
  const nextIn = useCountdown(s.nextHandIn, room.receivedAt, !!s.nextHandIn);

  const winners = useMemo(() => {
    const w = new Set();
    h?.result?.pots.forEach((p) => p.winners.forEach((x) => w.add(x)));
    return w;
  }, [h?.result]);
  const winCards = useMemo(() => {
    const c = new Set();
    for (const w of winners) h?.result?.shown?.[w]?.best?.forEach((x) => c.add(x));
    return c;
  }, [winners, h?.result]);

  return (
    <div className="pk">
      <div className="pk-table">
        <div className="pk-felt">
          <div className="pk-center">
            <div className="pk-board">
              {[0, 1, 2, 3, 4].map((i) => (h?.board[i]
                ? <Card key={i} card={h.board[i]} size="md" highlight={winCards.has(h.board[i])} />
                : <div key={i} className="card-slot" />))}
            </div>
            {h && <div className="pk-pot">Pot: <b>{fmt(h.pot)}</b> <span className="muted">· {STREET_VI[h.street]}</span></div>}
            {h?.result && (
              <div className="pk-result">
                {h.result.pots.map((p, k) => (
                  <div key={k}>🏆 {p.winners.map((w) => s.seats[w]?.name || '?').join(', ')} thắng {fmt(p.amount)}{p.hand ? ` — ${p.hand}` : ''}</div>
                ))}
              </div>
            )}
            {!h?.street || h.street === 'done' ? (
              <div className="muted small">
                {nextIn ? `Ván mới sau ${Math.ceil(nextIn / 1000)} giây…` : s.seats.filter((x) => x && x.chips > 0 && !x.sitOut).length < 2 ? 'Đang chờ ít nhất 2 người chơi…' : ''}
              </div>
            ) : null}
            <div className="muted small">Blind {fmt(s.smallBlind)}/{fmt(s.bigBlind)}</div>
          </div>

          {s.seats.map((seat, i) => {
            const k = (i - base + N) % N;
            const ang = Math.PI / 2 + (k * 2 * Math.PI) / N;
            const x = 50 + 44 * Math.cos(ang);
            const y = 50 + 40 * Math.sin(ang);
            const style = { left: `${x}%`, top: `${y}%` };
            if (!seat) {
              return (
                <div key={i} className="pk-seat empty" style={style}>
                  {mySeat < 0 ? <button className="btn sm" onClick={() => call('room:sit', { seat: i })}>Ngồi đây</button> : <span className="muted small">Trống</span>}
                </div>
              );
            }
            const toAct = h && h.toAct === i && h.street !== 'done';
            const shown = h?.result?.shown?.[i];
            return (
              <div key={i} className={`pk-seat ${toAct ? 'acting' : ''} ${seat.folded ? 'folded' : ''} ${winners.has(i) ? 'winner' : ''} ${i === mySeat ? 'me' : ''}`} style={style}>
                <div className="pk-cards">
                  {seat.hole && seat.hole.map((c, j) => <Card key={j} card={c} size={i === mySeat ? 'md' : 'sm'} highlight={winners.has(i) && winCards.has(c)} />)}
                </div>
                <div className="pk-info">
                  <div className="pk-name">
                    {seat.name}{seat.left && ' (rời)'}{seat.sitOut && ' (nghỉ)'}
                  </div>
                  <div className="pk-chips">💰 {fmt(seat.chips)}</div>
                  {seat.lastAction && <div className="pk-act">{seat.lastAction}</div>}
                  {shown && <div className="pk-hand">{shown.hand}</div>}
                  {toAct && <div className="timebar"><div style={{ width: `${(timeLeft / s.turnTotal) * 100}%` }} /></div>}
                </div>
                {h && h.street !== 'done' && h.dealer === i && <div className="pk-dealer">D</div>}
                {seat.bet > 0 && <div className="pk-bet">{fmt(seat.bet)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {mySeat >= 0 && (
        <ActionBar s={s} o={o} act={act} myTurn={!!o} timeLeft={timeLeft} />
      )}
      {mySeat >= 0 && (
        <div className="row pk-mybar">
          {s.seats[mySeat].chips < s.bigBlind && !(h && h.street !== 'done' && s.seats[mySeat].inHand) && (
            <button className="btn primary" onClick={() => act({ type: 'rebuy' })}>Nạp thêm {fmt(s.config.buyIn)} chip</button>
          )}
          <button className="btn ghost sm" onClick={() => act({ type: 'sitout' })}>{s.seats[mySeat].sitOut ? 'Quay lại chơi' : 'Nghỉ ván sau'}</button>
          <button className="btn ghost sm" onClick={() => call('room:stand')}>Đứng dậy xem</button>
        </div>
      )}
      {mySeat < 0 && <div className="muted center small">Bạn đang xem. Chọn "Ngồi đây" ở ghế trống để chơi.</div>}
      {h && (
        <details className="panel pk-log">
          <summary>Diễn biến ván #{h.no}</summary>
          {h.log.map((l, i) => <div key={i} className="small">{l}</div>)}
        </details>
      )}
      <PokerHandLog s={s} />
    </div>
  );
}

function ActionBar({ s, o, act, myTurn, timeLeft }) {
  const bb = s.bigBlind;
  const [amount, setAmount] = useState(o ? o.minTo : 0);
  const key = o ? `${s.hand?.no}:${o.currentBet}:${o.minTo}` : '';
  useEffect(() => { if (o) setAmount(o.minTo); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const canBR = o && (o.canBet || o.canRaise);
  const clamp = (v) => (o ? Math.max(o.minTo, Math.min(o.maxTo, Math.round(v))) : v);
  const preset = (f) => {
    if (!o) return;
    const toCall = o.currentBet - o.myBet;
    setAmount(clamp(o.currentBet + f * (o.pot + toCall)));
  };

  const doFold = () => o && act({ type: 'act', action: 'fold' });
  const doCall = () => o && act({ type: 'act', action: o.canCheck ? 'check' : 'call' });
  const doCheck = () => o && o.canCheck && act({ type: 'act', action: 'check' });
  const doBR = () => {
    if (!canBR) return;
    act({ type: 'act', action: amount >= o.maxTo ? 'allin' : o.canBet ? 'bet' : 'raise', amount });
  };
  const doAllIn = () => o && act({ type: 'act', action: 'allin' });

  useHotkeys({
    f: doFold,
    c: doCall,
    k: doCheck,
    b: doBR,
    r: doBR,
    a: doAllIn,
    Enter: doBR,
    ArrowUp: (e) => canBR && setAmount((v) => clamp(v + (e.shiftKey ? 10 : 1) * bb)),
    ArrowDown: (e) => canBR && setAmount((v) => clamp(v - (e.shiftKey ? 10 : 1) * bb)),
    1: () => preset(1 / 3),
    2: () => preset(1 / 2),
    3: () => preset(3 / 4),
    4: () => preset(1),
  }, myTurn);

  if (!o) return <div className="pk-actions idle muted">Chờ tới lượt…</div>;
  return (
    <div className="pk-actions">
      <div className="pk-turn">Tới lượt bạn! ⏱ {Math.ceil(timeLeft / 1000)}s</div>
      <div className="row wrap">
        <button className="btn danger" onClick={doFold}><kbd>F</kbd> Bỏ bài</button>
        <button className="btn" onClick={doCall}>
          <kbd>C</kbd> {o.canCheck ? 'Check' : `Theo ${fmt(o.toCall)}`}
        </button>
        {canBR && (
          <button className="btn primary" onClick={doBR}>
            <kbd>{o.canBet ? 'B' : 'R'}</kbd> {amount >= o.maxTo ? 'All-in' : o.canBet ? 'Cược' : 'Tố lên'} {fmt(amount)}
          </button>
        )}
        <button className="btn warn" onClick={doAllIn}><kbd>A</kbd> All-in {fmt(o.maxTo - o.myBet)}</button>
      </div>
      {canBR && (
        <div className="row wrap pk-sizing">
          <input type="range" min={o.minTo} max={o.maxTo} step={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          <input type="number" className="num" min={o.minTo} max={o.maxTo} value={amount}
            onChange={(e) => setAmount(Number(e.target.value))} onBlur={() => setAmount(clamp(amount))}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doBR(); } }} />
          {[['1', '⅓', 1 / 3], ['2', '½', 1 / 2], ['3', '¾', 3 / 4], ['4', 'Pot', 1]].map(([k, l, f]) => (
            <button key={k} className="btn sm" onClick={() => preset(f)}><kbd>{k}</kbd> {l}</button>
          ))}
        </div>
      )}
    </div>
  );
}

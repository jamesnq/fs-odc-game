import { useEffect, useRef } from 'react';
import { Hand, Hourglass, Clock } from 'lucide-react';

/** Ai đang tới lượt, cho từng trò. Trả về null khi chưa có ván đang chơi. */
export function turnInfo(room, userId) {
  const s = room.state;
  if (!s) return null;
  switch (room.game) {
    case 'xiangqi':
    case 'caro':
      if (s.status !== 'playing') return null;
      return { mine: !!s.myColor && s.myColor === s.turn, who: s.seats[s.turn]?.name };
    case 'poker': {
      const h = s.hand;
      if (!h || h.street === 'done' || h.toAct < 0) return null;
      return { mine: !!s.options, who: s.seats[h.toAct]?.name };
    }
    case 'tala': {
      const g = s.game;
      if (!g || g.result || g.turn < 0) return null;
      return { mine: g.turn === g.me, who: g.players[g.turn]?.name };
    }
    case 'samloc': {
      const g = s.game;
      if (!g || g.result) return null;
      if (g.phase === 'sam') {
        const need = g.me >= 0 && !g.samDecided.includes(g.me);
        return need ? { mine: true, text: 'Báo Sâm hay không?' } : { mine: false, text: 'Đang chờ mọi người quyết định báo Sâm' };
      }
      return g.turn >= 0 ? { mine: g.turn === g.me, who: g.players[g.turn]?.name } : null;
    }
    case 'wordchain': {
      const g = s.game;
      if (s.status !== 'playing' || !g) return null;
      return { mine: g.currentId === userId, who: g.players.find((p) => p.id === g.currentId)?.name };
    }
    default:
      return null;
  }
}

/**
 * Thanh báo lượt: luôn giữ chỗ (không nhảy layout), dính dưới header khi cuộn.
 * Tới lượt mình: nền vàng nổi bật + đổi tiêu đề tab + rung nhẹ trên điện thoại (một lần mỗi lượt).
 */
export default function TurnBanner({ info }) {
  const mine = !!info?.mine;
  const prev = useRef(false);
  useEffect(() => {
    const base = 'Sảnh Trò Chơi';
    document.title = mine ? `● Đến lượt bạn — ${base}` : base;
    if (mine && !prev.current) {
      try { navigator.vibrate?.(60); } catch { /* không hỗ trợ */ }
    }
    prev.current = mine;
    return () => { document.title = base; };
  }, [mine]);

  let content;
  if (!info) {
    content = <span className="tb-text"><Clock size={16} aria-hidden /> Chưa có ván đang chơi</span>;
  } else if (mine) {
    content = <span className="tb-text"><Hand size={18} aria-hidden /> <b>{info.text || 'Đến lượt bạn!'}</b></span>;
  } else {
    content = (
      <span className="tb-text">
        {info.who
          ? <><span className="tb-avatar" aria-hidden>{info.who.trim()[0]?.toUpperCase()}</span> Lượt của <b>{info.who}</b></>
          : <><Hourglass size={16} aria-hidden /> {info.text}</>}
      </span>
    );
  }
  return (
    <div className={`turn-banner ${!info ? 'idle' : mine ? 'mine' : 'other'}`} role="status" aria-live="polite">
      {content}
    </div>
  );
}

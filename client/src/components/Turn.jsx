import { useEffect, useRef } from 'react';
import { Hand, Hourglass } from 'lucide-react';

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
    case 'quiz': {
      const g = s.game;
      if (s.status !== 'playing' || !g || g.phase !== 'question' || !g.me) return null;
      return g.myChoice === null ? { mine: true, text: 'Trả lời nhanh!' } : { mine: false, text: `Chờ mọi người (${g.answered}/${g.players})` };
    }
    default:
      return null;
  }
}

/** Hiệu ứng khi tới lượt mình: đổi tiêu đề tab + rung nhẹ trên điện thoại (một lần mỗi lượt). */
export function TurnEffects({ info }) {
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
  return null;
}

/**
 * Báo lượt gọn trong đầu phòng (thay cho thanh riêng chiếm một hàng):
 * nằm ngay dưới tên phòng, cùng chỗ với dòng "Tên trò · #mã" khi chưa có ván.
 * Tới lượt mình: viên thuốc vàng nổi bật + khung bàn chơi phát sáng (CSS .game-area.my-turn).
 */
export function TurnPill({ info, sub }) {
  if (!info) return <span className="muted small room-sub">{sub}</span>;
  const mine = !!info.mine;
  return (
    <span className={`turn-pill ${mine ? 'mine' : 'other'}`} role="status" aria-live="polite">
      {mine ? <Hand size={14} aria-hidden /> : info.who ? <span className="tb-dot" aria-hidden /> : <Hourglass size={13} aria-hidden />}
      <span className="tp-text">
        {mine ? <b>{info.text || 'Đến lượt bạn!'}</b> : info.who ? <>Lượt của <b>{info.who}</b></> : info.text}
      </span>
    </span>
  );
}

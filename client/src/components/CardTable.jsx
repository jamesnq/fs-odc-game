/**
 * Bàn đánh bài hình bầu dục dùng chung cho các trò bài (Tá lả, Sâm lốc…), cùng ngôn ngữ với bàn Poker.
 * - Ghế xếp quanh bàn theo hình elip; người xem luôn ngồi ở dưới (rel = 0).
 * - Giữa bàn là nội dung chung (nọc bài, bài vừa đánh, trạng thái).
 * - Trên điện thoại (≤640px) bàn chuyển sang dạng dọc: đối thủ ở trên, giữa bàn, rồi ghế của mình.
 *
 * seats: [{ key, rel, node, active, me }]  — rel: vị trí tương đối so với người xem (0 = dưới cùng)
 */
export default function CardTable({ seats, center, className = '' }) {
  const n = seats.length;
  return (
    <div className={`ct ${className}`}>
      <div className={`ct-felt n${n}`}>
        <div className="ct-center">{center}</div>
        {seats.map((s) => {
          const ang = Math.PI / 2 + (s.rel * 2 * Math.PI) / n;
          // Bán kính ngang nhỏ hơn bàn Poker vì ghế bài phỏm / sâm chứa nhiều thông tin hơn
          const style = { left: `${50 + 38 * Math.cos(ang)}%`, top: `${50 + 40 * Math.sin(ang)}%` };
          return (
            <div key={s.key} style={style}
              className={`ct-seat ${s.me ? 'me' : ''} ${s.active ? 'active' : ''} ${s.rel === 0 ? 'bottom' : ''}`}>
              {s.node}
            </div>
          );
        })}
      </div>
    </div>
  );
}

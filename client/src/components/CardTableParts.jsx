// Phần giao diện dùng chung của bàn bài đánh theo lượt (Tá lả, Sâm lốc).
import { useApp } from '../store.jsx';
import { useHotkeys } from '../hooks.js';
import { fmtSigned } from '../format.js';

const seatedCount = (s) => s.seats.filter(Boolean).length;

/** Màn chờ trước ván: chọn ghế, bắt đầu ván. */
export function WaitingRoom({ s, title, startLabel, rules }) {
  const { act, call } = useApp();
  const seated = seatedCount(s);
  useHotkeys({ n: () => s.mySeat >= 0 && seated >= 2 && act({ type: 'start' }) });
  return (
    <div className="tl-wait panel">
      <h3>{title} — cược {s.config.unit}/đơn vị</h3>
      <div className="tl-seats">
        {s.seats.map((seat, i) => (
          <div key={i} className={`tl-seat-box ${seat ? '' : 'empty'}`}>
            {seat ? (
              <>
                <b>{seat.name}</b>
                <div className={seat.total >= 0 ? 'pos' : 'neg'}>{fmtSigned(seat.total)}</div>
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
            <button className="btn cta" disabled={seated < 2} onClick={() => act({ type: 'start' })}><kbd>N</kbd> {startLabel}</button>
            <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy</button>
          </>
        ) : <span className="muted">Bạn đang xem. Chọn ghế trống để chơi.</span>}
      </div>
      {seated < 2 && <div className="muted small">Cần ít nhất 2 người để bắt đầu.</div>}
      {rules}
    </div>
  );
}

/** Cuối bảng kết quả: ván mới / đứng dậy / ngồi ghế trống, và tổng điểm tích lũy. */
export function NextGameActions({ s }) {
  const { act, call } = useApp();
  useHotkeys({ n: () => s.mySeat >= 0 && act({ type: 'start' }) });
  return (
    <>
      <div className="row">
        {s.mySeat >= 0 ? (
          <>
            <button className="btn cta" disabled={seatedCount(s) < 2} onClick={() => act({ type: 'start' })}><kbd>N</kbd> Ván mới</button>
            <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy</button>
          </>
        ) : (
          <>
            {s.seats.some((x) => !x) && <span className="muted">Có ghế trống — </span>}
            {s.seats.map((x, i) => !x && (
              <button key={i} className="btn sm" onClick={() => call('room:sit', { seat: i })}>Ngồi ghế {i + 1}</button>
            ))}
          </>
        )}
      </div>
      <div className="small muted">Tổng điểm: {s.seats.filter(Boolean).map((x) => `${x.name}: ${fmtSigned(x.total)}`).join(' · ')}</div>
    </>
  );
}

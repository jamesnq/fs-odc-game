// Phần giao diện dùng chung của bàn bài đánh theo lượt (Tá lả, Sâm lốc).
import { useApp } from '../store.jsx';
import { useHotkeys } from '../hooks.js';
import { fmtSigned } from '../format.js';
import StartBar, { ReadyMark } from './StartBar.jsx';

const seatedList = (s) => s.seats.filter(Boolean);

/** Sẵn sàng (người ngồi bàn) / Bắt đầu (chủ phòng). Phím N: chủ phòng bắt đầu, người khác bật/tắt sẵn sàng. */
function StartRow({ s, startLabel }) {
  const { act, room, user } = useApp();
  const isOwner = room.ownerId === user.id;
  useHotkeys({ n: () => (isOwner ? act({ type: 'start' }) : s.mySeat >= 0 && act({ type: 'ready' })) });
  return (
    <StartBar players={seatedList(s)} ready={s.ready} waitingFor={s.waitingFor} seated={s.mySeat >= 0}
      startLabel={<><kbd>N</kbd> {startLabel}</>} />
  );
}

/** Màn chờ trước ván: chọn ghế, sẵn sàng, chủ phòng bắt đầu. */
export function WaitingRoom({ s, title, startLabel, rules }) {
  const { call, room } = useApp();
  return (
    <div className="tl-wait panel">
      <h3>{title} — cược {s.config.unit}/đơn vị</h3>
      <div className="tl-seats">
        {s.seats.map((seat, i) => (
          <div key={i} className={`tl-seat-box ${seat ? '' : 'empty'}`}>
            {seat ? (
              <>
                <b>{seat.name}<ReadyMark id={seat.id} ready={s.ready} ownerId={room.ownerId} /></b>
                <div className={seat.total >= 0 ? 'pos' : 'neg'}>{fmtSigned(seat.total)}</div>
              </>
            ) : s.mySeat < 0 ? (
              <button className="btn sm" onClick={() => call('room:sit', { seat: i })}>Ngồi đây</button>
            ) : <span className="muted">Trống</span>}
          </div>
        ))}
      </div>
      <div className="row wrap">
        <StartRow s={s} startLabel={startLabel} />
        {s.mySeat >= 0 ? <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy</button>
          : <span className="muted">Bạn đang xem. Chọn ghế trống để chơi.</span>}
      </div>
      {rules}
    </div>
  );
}

/**
 * Trong lúc đang chơi: người ngồi chờ ván sau, và cho người xem ngồi vào ghế trống để chờ.
 * Trả về null nếu không có gì để hiện.
 */
export function WaitingSeats({ s }) {
  const { call, act } = useApp();
  const inGame = new Set(s.gameSeats);
  const waiting = s.seats.map((x, i) => x && !inGame.has(i) && x).filter(Boolean);
  const empty = s.seats.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  const meWaiting = s.mySeat >= 0 && !inGame.has(s.mySeat);
  if (!waiting.length && (s.mySeat >= 0 || !empty.length)) return null;
  return (
    <div className="ct-waiting small" role="status">
      {waiting.length > 0 && <span>Chờ ván sau: <b>{waiting.map((x) => x.name).join(', ')}</b></span>}
      {meWaiting && (
        <>
          <button className={`btn sm ${s.ready.includes(s.seats[s.mySeat].id) ? '' : 'primary'}`} onClick={() => act({ type: 'ready' })}>
            {s.ready.includes(s.seats[s.mySeat].id) ? 'Hủy sẵn sàng' : 'Sẵn sàng ván sau'}
          </button>
          <button className="btn ghost sm" onClick={() => call('room:stand')}>Đứng dậy</button>
        </>
      )}
      {s.mySeat < 0 && empty.length > 0 && (
        <button className="btn sm primary" onClick={() => call('room:sit', { seat: empty[0] })}>Ngồi chờ ván sau</button>
      )}
    </div>
  );
}

/** Cuối bảng kết quả: sẵn sàng / ván mới (chủ phòng) / đứng dậy / ngồi ghế trống, và tổng điểm tích lũy. */
export function NextGameActions({ s }) {
  const { call } = useApp();
  return (
    <>
      <div className="row wrap">
        <StartRow s={s} startLabel="Ván mới" />
        {s.mySeat >= 0 ? (
          <button className="btn ghost" onClick={() => call('room:stand')}>Đứng dậy</button>
        ) : (
          <>
            {s.seats.some((x) => !x) && <span className="muted">Có ghế trống — </span>}
            {s.seats.map((x, i) => !x && (
              <button key={i} className="btn sm" onClick={() => call('room:sit', { seat: i })}>Ngồi ghế {i + 1}</button>
            ))}
          </>
        )}
      </div>
      <div className="small muted">Tổng điểm: {seatedList(s).map((x) => `${x.name}: ${fmtSigned(x.total)}`).join(' · ')}</div>
    </>
  );
}

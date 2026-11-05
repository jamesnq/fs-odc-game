// Định dạng số / thời gian hiển thị theo kiểu Việt Nam.

/** 12345 → "12.345" */
export const fmtNum = (n) => Number(n || 0).toLocaleString('vi-VN');

/** Điểm thắng/thua có dấu: 50 → "+50", -20 → "-20". */
export const fmtSigned = (n) => (n > 0 ? '+' : '') + fmtNum(n);

/** Giờ:phút (thêm giây nếu withSeconds). */
export const fmtTime = (ts, withSeconds = false) => new Date(ts).toLocaleTimeString('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  ...(withSeconds && { second: '2-digit' }),
});

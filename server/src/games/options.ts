// Chuẩn hóa tùy chọn phòng do client gửi lên.

/** Số nguyên trong [min, max]; không phải số thì dùng giá trị mặc định. */
export const clampInt = (v: any, min: any, max: any, def: any) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** Cờ bật/tắt; nhận cả chuỗi 'false' từ form. */
export const bool = (v: any, def: any) => (v === undefined ? def : !!v && v !== 'false');

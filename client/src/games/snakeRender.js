// Hai kiểu vẽ cho Rắn săn mồi (chỉ khác hình thức, luật chơi giống hệt):
//  - classic: màn hình LCD vàng của điện thoại đen trắng — thân rắn hình xích zic-zắc, mồi dấu "+",
//    điểm 4 chữ số ở dưới cùng có vạch kẻ phía trên, thanh đếm lùi con thưởng bên phải.
//  - modern: bàn tối kiểu neon, rắn trượt mượt giữa các ô, thân màu chuyển sắc, mắt nhìn theo hướng đi,
//    mồi phát sáng nhấp nháy, nổ hạt khi ăn.
import { W, H, DIRS, BONUS_TICKS } from '@game/shared/snake';

// ---------------------------------------------------------------- classic
const LW = 98; // 1 + 24×4 + 1 điểm LCD
const LH = 70; // bàn 56 + vạch kẻ + dòng điểm
const FX = 1;
const FY = 1;
const K = 6; // mỗi điểm LCD = 6×6 điểm canvas
const INK = '#26270f';
const LCD = '#c5c640';

const FONT = [ // chữ số 4×7
  ['.XX.', 'X..X', 'X..X', 'X..X', 'X..X', 'X..X', '.XX.'],
  ['..X.', '.XX.', '..X.', '..X.', '..X.', '..X.', '.XXX'],
  ['.XX.', 'X..X', '...X', '..X.', '.X..', 'X...', 'XXXX'],
  ['XXX.', '...X', '...X', '.XX.', '...X', '...X', 'XXX.'],
  ['X..X', 'X..X', 'X..X', 'XXXX', '...X', '...X', '...X'],
  ['XXXX', 'X...', 'XXX.', '...X', '...X', 'X..X', '.XX.'],
  ['.XX.', 'X...', 'X...', 'XXX.', 'X..X', 'X..X', '.XX.'],
  ['XXXX', '...X', '..X.', '..X.', '.X..', '.X..', '.X..'],
  ['.XX.', 'X..X', 'X..X', '.XX.', 'X..X', 'X..X', '.XX.'],
  ['.XX.', 'X..X', 'X..X', '.XXX', '...X', '...X', '.XX.'],
];
// Con thưởng 7×4 điểm (chiếm 2 ô)
const CRITTERS = [
  ['.X...X.', 'XXXXXXX', 'X.XXX.X', '.X...X.'],
  ['..XXX..', '.XXXXXX', 'XXXXX.X', '..X..X.'],
  ['X.....X', '.XXXXX.', 'XX.X.XX', '.X...X.'],
  ['...XX..', '.XXXXXX', 'XXXXXXX', '.X.X.X.'],
];
// Nửa ô của thân rắn theo hướng nối — ghép hai nửa thành đoạn xích zic-zắc
const HALF = {
  left: [[0, 2], [1, 1]],
  right: [[2, 1], [3, 2]],
  up: [[2, 0], [1, 1]],
  down: [[1, 2], [2, 3]],
};

export const SIZE = {
  classic: { w: LW * K, h: LH * K },
  modern: { w: W * 26 * 2, h: (H * 26 + 44) * 2 },
};

const cx = (i) => i % W;
const cy = (i) => Math.floor(i / W);
/** Hướng từ ô a sang ô kề b (null nếu không kề — đi xuyên mép). */
function side(a, b) {
  const dx = cx(b) - cx(a), dy = cy(b) - cy(a);
  if (Math.abs(dx) + Math.abs(dy) !== 1) {
    // xuyên mép: vẫn nối ra phía mép cho liền mạch
    if (dy === 0 && Math.abs(dx) === W - 1) return dx > 0 ? 'left' : 'right';
    if (dx === 0 && Math.abs(dy) === H - 1) return dy > 0 ? 'up' : 'down';
    return null;
  }
  return dx === 1 ? 'right' : dx === -1 ? 'left' : dy === 1 ? 'down' : 'up';
}
const fwd = (i, dir) => {
  const [dx, dy] = DIRS[dir];
  return ((cy(i) + dy + H) % H) * W + ((cx(i) + dx + W) % W);
};

export function drawClassic(cv, st) {
  const g = cv.getContext('2d');
  g.fillStyle = LCD;
  g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = INK;
  const px = (x, y) => g.fillRect(x * K, y * K, K, K);
  const at = (i, ox, oy) => px(FX + cx(i) * 4 + ox, FY + cy(i) * 4 + oy);

  for (const i of st.walls) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) at(i, x, y);
  if (st.food >= 0) { at(st.food, 1, 0); at(st.food, 0, 1); at(st.food, 1, 1); at(st.food, 2, 1); at(st.food, 1, 2); }
  if (st.bonus) {
    const art = CRITTERS[st.bonus.kind % CRITTERS.length];
    art.forEach((row, y) => [...row].forEach((ch, x) => ch === 'X' && at(st.bonus.cells[0], x, y)));
  }

  const s = st.snake;
  for (let n = 0; n < s.length; n++) {
    const i = s[n];
    const toPrev = n > 0 ? side(i, s[n - 1]) : null;
    const toNext = n < s.length - 1 ? side(i, s[n + 1]) : null;
    if (n === 0) {
      // Đầu: khối 2×2 + mũi; há miệng khi mồi ngay trước mặt
      const open = fwd(i, st.dir) === st.food || st.bonus?.cells.includes(fwd(i, st.dir));
      const rot = (x, y) => (st.dir === 'right' ? [x, y] : st.dir === 'left' ? [3 - x, y] : st.dir === 'down' ? [y, x] : [y, 3 - x]);
      const pat = open ? [[1, 1], [1, 2], [2, 1], [2, 2], [3, 0], [3, 3], [0, 1], [0, 2]]
        : [[1, 0], [2, 0], [0, 1], [1, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [1, 3], [2, 3]]; // chừa (2,1) làm mắt
      for (const [x, y] of pat) { const [a, b] = rot(x, y); at(i, a, b); }
    } else {
      for (const d of [toPrev, toNext]) if (d) for (const [x, y] of HALF[d]) at(i, x, y);
      if (!toNext) at(i, 1, 1); // chóp đuôi
    }
  }
  if (st.dead && s.length && st.blink) {
    g.fillStyle = LCD;
    g.fillRect((FX + cx(s[0]) * 4) * K, (FY + cy(s[0]) * 4) * K, 4 * K, 4 * K);
    g.fillStyle = INK;
  }

  // Vạch kẻ + điểm + thanh con thưởng
  const base = FY + H * 4 + 2;
  for (let x = 0; x < LW; x++) px(x, base);
  const score = String(Math.min(9999, st.score)).padStart(4, '0');
  [...score].forEach((ch, n) => FONT[+ch].forEach((row, y) => [...row].forEach((c, x) => c === 'X' && px(2 + n * 5 + x, base + 2 + y))));
  if (st.bonus) {
    const len = Math.max(1, Math.round((st.bonus.ttl / BONUS_TICKS) * 40));
    for (let x = 0; x < len; x++) {
      px(LW - 3 - x, base + 4); px(LW - 3 - x, base + 6);
      if (x % 2 === 0) px(LW - 3 - x, base + 5);
    }
  }
}

// ---------------------------------------------------------------- modern
const C = 26;
const HUD = 44;
const HEAD = [52, 245, 197];
const TAIL = [124, 92, 255];
const mix = (a, b, t) => a.map((v, k) => Math.round(v + (b[k] - v) * t));

function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * @param st { snake, dir, nextDir, food, bonus, score, length, walls, dead, fx: [{i,t0,c}] }
 * @param f  phần bước đã trôi qua (0..1) — rắn trượt dần sang ô kế tiếp
 */
export function drawModern(cv, st, f = 0, now = performance.now()) {
  const g = cv.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);
  const bw = W * C, bh = H * C;
  // Nền
  const bg = g.createLinearGradient(0, 0, bw, bh + HUD);
  bg.addColorStop(0, '#0e1530');
  bg.addColorStop(1, '#090d1d');
  g.fillStyle = bg;
  g.fillRect(0, 0, bw, bh + HUD);
  g.save();
  g.translate(0, HUD);
  g.fillStyle = 'rgba(148, 163, 255, 0.09)';
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) g.fillRect(x * C + C / 2 - 1, y * C + C / 2 - 1, 2, 2);
  // Tường
  for (const i of st.walls) {
    round(g, cx(i) * C + 1.5, cy(i) * C + 1.5, C - 3, C - 3, 6);
    g.fillStyle = '#1f2a4d';
    g.fill();
    g.strokeStyle = 'rgba(129, 140, 248, 0.35)';
    g.lineWidth = 1;
    g.stroke();
  }
  const center = (i) => [cx(i) * C + C / 2, cy(i) * C + C / 2];
  // Mồi
  if (st.food >= 0) {
    const [x, y] = center(st.food);
    const r = C * 0.26 + Math.sin(now / 180) * 1.6;
    g.shadowColor = '#ff4d8d';
    g.shadowBlur = 18;
    const fg = g.createRadialGradient(x - 2, y - 2, 1, x, y, r);
    fg.addColorStop(0, '#ffd1e3');
    fg.addColorStop(1, '#ff3d7f');
    g.fillStyle = fg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
  }
  // Con thưởng: viên ngọc vàng + vòng đếm lùi
  if (st.bonus) {
    const [a, b] = st.bonus.cells.map(center);
    const x = (a[0] + b[0]) / 2, y = (a[1] + b[1]) / 2;
    g.shadowColor = '#fbbf24';
    g.shadowBlur = 20;
    g.fillStyle = '#fbbf24';
    g.beginPath();
    for (let k = 0; k < 10; k++) {
      const rr = k % 2 ? C * 0.22 : C * 0.5;
      const ang = -Math.PI / 2 + (k * Math.PI) / 5 + now / 900;
      g.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
    }
    g.closePath(); g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = 'rgba(251, 191, 36, 0.8)';
    g.lineWidth = 2.5;
    g.beginPath(); g.arc(x, y, C * 0.75, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * st.bonus.ttl) / BONUS_TICKS); g.stroke();
  }
  // Rắn: mỗi đốt trượt từ ô hiện tại tới ô đốt trước đó đang đứng (đầu thì tới ô phía trước)
  const s = st.snake;
  if (s.length) {
    const lead = st.dead ? s[0] : fwd(s[0], st.nextDir || st.dir);
    const pts = s.map((i, n) => {
      const to = n === 0 ? lead : s[n - 1];
      const [x0, y0] = center(i);
      const [x1, y1] = center(to);
      const jump = Math.abs(x1 - x0) > C * 1.5 || Math.abs(y1 - y0) > C * 1.5; // xuyên mép: không trượt
      const t = st.dead || jump ? 0 : f;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    });
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const n = pts.length;
    for (let k = n - 1; k > 0; k--) {
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[k - 1];
      if (Math.abs(x1 - x0) > C * 1.5 || Math.abs(y1 - y0) > C * 1.5) continue;
      const col = st.dead ? [100, 116, 139] : mix(HEAD, TAIL, k / Math.max(1, n - 1));
      g.strokeStyle = `rgb(${col.join(',')})`;
      g.lineWidth = C * (0.5 + 0.22 * (1 - k / n));
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    }
    // Đầu + mắt
    const [hx, hy] = pts[0];
    const [dx, dy] = DIRS[st.dir];
    g.shadowColor = st.dead ? 'transparent' : 'rgba(52, 245, 197, 0.7)';
    g.shadowBlur = 14;
    g.fillStyle = st.dead ? '#94a3b8' : `rgb(${HEAD.join(',')})`;
    g.beginPath(); g.arc(hx, hy, C * 0.42, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;
    for (const sgn of [-1, 1]) {
      const ex = hx + dx * C * 0.12 - dy * sgn * C * 0.18;
      const ey = hy + dy * C * 0.12 + dx * sgn * C * 0.18;
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ex, ey, C * 0.11, 0, Math.PI * 2); g.fill();
      if (st.dead) {
        g.strokeStyle = '#ef4444'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(ex - 2.5, ey - 2.5); g.lineTo(ex + 2.5, ey + 2.5); g.moveTo(ex + 2.5, ey - 2.5); g.lineTo(ex - 2.5, ey + 2.5); g.stroke();
      } else {
        g.fillStyle = '#0b1020';
        g.beginPath(); g.arc(ex + dx * 1.5, ey + dy * 1.5, C * 0.055, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // Hạt nổ khi ăn
  for (const p of st.fx || []) {
    const age = (now - p.t0) / 550;
    if (age < 0 || age > 1) continue;
    const [x, y] = center(p.i);
    g.fillStyle = p.c;
    g.globalAlpha = 1 - age;
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2 + p.i;
      const d = 4 + age * C * (1.1 + (k % 3) * 0.3);
      g.beginPath(); g.arc(x + Math.cos(ang) * d, y + Math.sin(ang) * d, 2.4 * (1 - age) + 0.6, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }
  g.restore();

  // Thanh trên: điểm, độ dài, thời gian con thưởng
  g.fillStyle = 'rgba(255,255,255,0.04)';
  g.fillRect(0, 0, bw, HUD);
  g.fillStyle = 'rgba(148,163,255,0.2)';
  g.fillRect(0, HUD - 1, bw, 1);
  g.font = '700 22px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textBaseline = 'middle';
  g.fillStyle = '#e2e8f0';
  g.fillText(String(st.score), 14, HUD / 2);
  const sw = g.measureText(String(st.score)).width;
  g.font = '500 13px system-ui, -apple-system, Segoe UI, sans-serif';
  g.fillStyle = '#94a3b8';
  g.fillText(`điểm  ·  dài ${st.length ?? s.length}`, 22 + sw, HUD / 2 + 1);
  if (st.bonus) {
    const w = 140, x = bw - w - 14, y = HUD / 2 - 4;
    round(g, x, y, w, 8, 4);
    g.fillStyle = 'rgba(251,191,36,0.15)'; g.fill();
    round(g, x, y, Math.max(8, (w * st.bonus.ttl) / BONUS_TICKS), 8, 4);
    g.fillStyle = '#fbbf24'; g.fill();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

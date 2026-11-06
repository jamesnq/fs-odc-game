// Khung vẽ của trò Vẽ đoán: người vẽ vẽ trực tiếp và gửi nét theo từng đoạn (~25 lần/giây);
// người khác nhận nét qua sự kiện 'game:stream' và vẽ lại y hệt. Vào giữa lượt thì tải cả bức vẽ.
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { CANVAS_W as W, CANVAS_H as H, PALETTE } from '@game/shared/scribble';
import { socket, request } from '../socket.js';

const FLUSH_MS = 40;
const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

function drawLine(ctx, { c, w, p }) {
  ctx.strokeStyle = ctx.fillStyle = PALETTE[c];
  if (p.length === 2) {
    ctx.beginPath();
    ctx.arc(p[0], p[1], w / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.stroke();
}

/** Đổ màu vùng liền kề cùng màu (có dung sai để ăn cả viền khử răng cưa). */
function floodFill(ctx, x, y, c) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  const at = (x + y * W) * 4;
  const [r0, g0, b0] = [d[at], d[at + 1], d[at + 2]];
  const [r1, g1, b1] = hexToRgb(PALETTE[c]);
  if (Math.abs(r0 - r1) + Math.abs(g0 - g1) + Math.abs(b0 - b1) < 6) return;
  const TOL = 90;
  const same = (i) => Math.abs(d[i] - r0) + Math.abs(d[i + 1] - g0) + Math.abs(d[i + 2] - b0) <= TOL;
  const seen = new Uint8Array(W * H);
  const stack = [x, y];
  while (stack.length) {
    const py = stack.pop();
    let px = stack.pop();
    while (px > 0 && !seen[py * W + px - 1] && same((px - 1 + py * W) * 4)) px--;
    let up = false;
    let down = false;
    for (; px < W; px++) {
      const k = py * W + px;
      const i = k * 4;
      if (seen[k] || !same(i)) break;
      seen[k] = 1;
      d[i] = r1; d[i + 1] = g1; d[i + 2] = b1; d[i + 3] = 255;
      if (py > 0) {
        const ok = !seen[k - W] && same(i - W * 4);
        if (ok && !up) { stack.push(px, py - 1); up = true; } else if (!ok) up = false;
      }
      if (py < H - 1) {
        const ok = !seen[k + W] && same(i + W * 4);
        if (ok && !down) { stack.push(px, py + 1); down = true; } else if (!ok) down = false;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function applyOp(ctx, op) {
  if (op.k === 'l') drawLine(ctx, op);
  else if (op.k === 'f') floodFill(ctx, op.p[0], op.p[1], op.c);
}

/** Vẽ lại toàn bộ bức vẽ từ danh sách thao tác (nền trắng). */
export function renderOps(ctx, list) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  for (const op of list) applyOp(ctx, op);
}

/**
 * props: turn (số lượt — đổi lượt thì xóa khung và tải lại), canDraw, tool ('pen'|'eraser'|'fill'), color, size
 * ref: { undo(), clear() } cho thanh công cụ
 */
const ScribbleCanvas = forwardRef(function ScribbleCanvas({ turn, canDraw, tool, color, size }, ref) {
  const canvas = useRef(null);
  const ops = useRef([]); // các thao tác của lượt hiện tại (để vẽ lại khi hoàn tác)
  const turnRef = useRef(turn);
  const loading = useRef(false);
  const outbox = useRef([]); // thao tác chờ gửi
  const stroke = useRef(null); // nét đang vẽ { id, c, w, last: [x,y], pts: [] }
  const nextId = useRef(Math.floor(Math.random() * 1e8));

  const ctx = () => canvas.current?.getContext('2d', { willReadFrequently: true });
  const redraw = useCallback(() => {
    const c = ctx();
    if (c) renderOps(c, ops.current);
  }, []);

  // Nhận một thao tác (từ server hoặc của chính mình) vào bức vẽ
  const take = useCallback((op) => {
    if (op.k === 'c') { ops.current = []; redraw(); return; }
    if (op.k === 'u') { ops.current = ops.current.filter((x) => x.id !== op.id); redraw(); return; }
    ops.current.push(op);
    applyOp(ctx(), op);
  }, [redraw]);

  // Đổi lượt: xóa khung, tải bức vẽ hiện có (vào giữa lượt / tải lại trang)
  const load = useCallback(() => {
    loading.current = true;
    ops.current = [];
    redraw();
    request('game:query', { type: 'canvas' })
      .then((res) => {
        if (res.data.turn !== turnRef.current) return;
        ops.current = res.data.ops;
        redraw();
      })
      .catch(() => {})
      .finally(() => { loading.current = false; });
  }, [redraw]);

  useEffect(() => {
    turnRef.current = turn;
    stroke.current = null;
    outbox.current = [];
    load();
  }, [turn, load]);

  useEffect(() => {
    const onStream = ({ turn: t, ops: list }) => {
      // Gói đến trước khi tải xong đã nằm trong bức vẽ tải về → bỏ qua
      if (t !== turnRef.current || loading.current) return;
      for (const op of list) take(op);
    };
    socket.on('game:stream', onStream);
    socket.on('connect', load);
    return () => {
      socket.off('game:stream', onStream);
      socket.off('connect', load);
    };
  }, [take, load]);

  // ----- Người vẽ -----

  /** Chuyển phần nét đang vẽ thành một thao tác chờ gửi (giữ thứ tự với các thao tác khác). */
  const commitStroke = () => {
    const s = stroke.current;
    if (!s || !s.pts.length) return;
    const op = { k: 'l', id: s.id, c: s.c, w: s.w, p: s.last ? [...s.last, ...s.pts] : s.pts };
    s.last = s.pts.slice(-2);
    s.pts = [];
    ops.current.push(op);
    outbox.current.push(op);
  };

  const flush = useCallback(() => {
    commitStroke();
    if (!outbox.current.length || !socket.connected) return;
    while (outbox.current.length) {
      socket.emit('game:stream', { turn: turnRef.current, ops: outbox.current.splice(0, 30) });
    }
  }, []);

  useEffect(() => {
    if (!canDraw) return undefined;
    const t = setInterval(flush, FLUSH_MS);
    return () => { clearInterval(t); flush(); };
  }, [canDraw, flush]);

  const send = (op) => {
    commitStroke();
    take(op);
    outbox.current.push(op);
    flush();
  };

  useImperativeHandle(ref, () => ({
    undo() {
      commitStroke();
      stroke.current = null;
      const last = [...ops.current].reverse().find((o) => o.id !== undefined);
      if (last) send({ k: 'u', id: last.id });
    },
    clear() {
      stroke.current = null;
      send({ k: 'c' });
    },
  }));

  const point = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) * W) / r.width), Math.round(((e.clientY - r.top) * H) / r.height)];
  };

  const onDown = (e) => {
    if (!canDraw || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.preventDefault();
    const [x, y] = point(e);
    const c = tool === 'eraser' ? 0 : color;
    if (tool === 'fill') {
      if (x >= 0 && y >= 0 && x < W && y < H) send({ k: 'f', id: nextId.current++, c, p: [x, y] });
      return;
    }
    canvas.current.setPointerCapture?.(e.pointerId);
    stroke.current = { id: nextId.current++, c, w: tool === 'eraser' ? size * 2 : size, last: null, pts: [x, y], end: [x, y] };
    drawLine(ctx(), { c, w: stroke.current.w, p: [x, y] });
  };

  const onMove = (e) => {
    const s = stroke.current;
    if (!s || !canDraw) return;
    const evts = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const ev of evts) {
      const [x, y] = point(ev);
      const [px, py] = s.end;
      if (Math.abs(x - px) + Math.abs(y - py) < 2) continue;
      drawLine(ctx(), { c: s.c, w: s.w, p: [px, py, x, y] });
      s.pts.push(x, y);
      s.end = [x, y];
    }
  };

  const onUp = () => {
    if (!stroke.current) return;
    commitStroke();
    stroke.current = null;
    flush();
  };

  return (
    <canvas ref={canvas} width={W} height={H} className={`sc-canvas ${canDraw ? `drawing tool-${tool}` : ''}`}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}
      aria-label={canDraw ? 'Khung vẽ — bạn đang vẽ' : 'Khung vẽ'} role="img" />
  );
});

export default ScribbleCanvas;

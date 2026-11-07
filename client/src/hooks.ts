import { useEffect, useRef, useState } from 'react';

const isTyping = (e: KeyboardEvent) => {
  const t = e.target;
  return t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
};

/** Phím tắt: tên phím (chữ thường với phím một ký tự, vd 'f', 'ArrowUp', 'shift+ArrowUp') → hàm xử lý. */
export type Hotkeys = Record<string, ((e: KeyboardEvent) => void) | false | null | undefined>;

/**
 * Đăng ký phím tắt. handlers: { 'f': fn, 'ArrowUp': fn, 'Enter': fn, ... } (không phân biệt hoa/thường).
 * Bỏ qua khi đang gõ trong ô nhập liệu hoặc khi có modal mở (trừ khi allowInModal).
 */
export function useHotkeys(handlers: Hotkeys, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-backdrop')) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const fn = ref.current[key] || (e.shiftKey && ref.current['shift+' + key]);
      if (fn) {
        e.preventDefault();
        fn(e);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** Đếm ngược: `ms` là thời gian còn lại tại thời điểm `since` (performance.now()). */
export function useCountdown(ms: number, since: number, running = true) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(performance.now()), 200);
    return () => clearInterval(t);
  }, [running]);
  if (!running) return ms;
  return Math.max(0, ms - (now - since));
}

export const fmtClock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

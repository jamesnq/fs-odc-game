import { useEffect } from 'react';

export default function Modal({ title, children, onClose, wide }: any) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: any) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e: any) => { if (e.target === e.currentTarget && onClose) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        {title && (
          <div className="modal-head">
            <h3>{title}</h3>
            {onClose && <button className="icon-btn" onClick={onClose} aria-label="Đóng">✕</button>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

import { ReactNode, useCallback, useEffect } from 'react';
import { useDraggable } from '../hooks/useDraggable';

interface Props {
  title: string;
  onClose: () => void;
  onBeforeClose?: () => boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export default function Modal({ title, onClose, onBeforeClose, children, footer, className }: Props) {
  const { containerRef, onHeaderMouseDown, resetPosition } = useDraggable();

  // إعادة الموقع لمركزه في كل مرة يُفتح فيها الـ Modal من جديد
  useEffect(() => {
    resetPosition();
  }, [resetPosition]);

  const handleClose = useCallback(() => {
    if (onBeforeClose && !onBeforeClose()) return;
    onClose();
  }, [onBeforeClose, onClose]);

  // إغلاق الـ Modal بضغط Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose]);

  return (
    <div className={`modal-overlay${className ? ` ${className}` : ''}`} onMouseDown={handleClose}>
      <div
        ref={containerRef}
        className="modal"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div
          className="modal-head"
          onMouseDown={onHeaderMouseDown}
        >
          <h3>{title}</h3>
          <button className="icon-btn" onClick={handleClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

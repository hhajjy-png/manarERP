import { ReactNode, useCallback, useEffect, useRef } from 'react';
import { useDraggable } from '../hooks/useDraggable';

interface Props {
  title: string;
  onClose: () => void;
  onBeforeClose?: () => boolean;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ title, onClose, onBeforeClose, children, footer, className, size }: Props) {
  const { containerRef, onHeaderMouseDown, resetPosition } = useDraggable();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => { resetPosition(); }, [resetPosition]);

  // Save previous focus, lock body scroll, restore on unmount
  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      previousFocusRef.current?.focus();
    };
  }, []);

  const handleClose = useCallback(() => {
    if (onBeforeClose && !onBeforeClose()) return;
    onClose();
  }, [onBeforeClose, onClose]);

  // Escape key + focus trap
  useEffect(() => {
    const container = containerRef.current;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return; }
      if (e.key !== 'Tab' || !container) return;

      const focusable = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleClose, containerRef]);

  const modalClass = ['modal', size && size !== 'md' ? `modal-${size}` : ''].filter(Boolean).join(' ');

  return (
    <div className={`modal-overlay${className ? ` ${className}` : ''}`} onMouseDown={handleClose}>
      <div
        ref={containerRef}
        className={modalClass}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title-id"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal-head" onMouseDown={onHeaderMouseDown}>
          <h3 id="modal-title-id">{title}</h3>
          <button className="icon-btn" onClick={handleClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

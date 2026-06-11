import { ReactNode } from 'react';

interface Props {
  title: string;
  onClose: () => void;
  onBeforeClose?: () => boolean;
  children: ReactNode;
  footer?: ReactNode;
}

export default function Modal({ title, onClose, onBeforeClose, children, footer }: Props) {
  function handleClose() {
    if (onBeforeClose && !onBeforeClose()) return;
    onClose();
  }

  return (
    <div className="modal-overlay" onMouseDown={handleClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={handleClose} aria-label="إغلاق">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

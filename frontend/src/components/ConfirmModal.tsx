import Modal from './Modal';

interface Props {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  title = 'تأكيد',
  message,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  variant = 'danger',
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className={`btn ${variant === 'danger' ? 'danger' : ''}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" className="btn secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
        </>
      }
    >
      <p style={{ lineHeight: 1.8, fontWeight: 600 }}>{message}</p>
    </Modal>
  );
}

import { useState } from 'react';

export interface ApprovalTransitionDef {
  action: string;
  label: string;
  variant?: 'primary' | 'danger' | 'secondary';
  requireComment?: boolean;
}

interface Props {
  availableTransitions: ApprovalTransitionDef[];
  onAction: (action: string, comment?: string) => Promise<void>;
  busy?: boolean;
}

export default function ApprovalActions({ availableTransitions, onAction, busy = false }: Props) {
  const [pendingAction, setPendingAction] = useState<ApprovalTransitionDef | null>(null);
  const [comment, setComment] = useState('');
  const [localBusy, setLocalBusy] = useState(false);

  if (availableTransitions.length === 0) return null;

  async function execute(action: string, commentText?: string) {
    setLocalBusy(true);
    try {
      await onAction(action, commentText);
      setPendingAction(null);
      setComment('');
    } finally {
      setLocalBusy(false);
    }
  }

  const isBusy = busy || localBusy;

  if (pendingAction) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {pendingAction.requireComment && (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="أضف ملاحظة (مطلوبة) …"
            rows={2}
            disabled={isBusy}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.85rem', resize: 'vertical' }}
          />
        )}
        {!pendingAction.requireComment && (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="أضف ملاحظة اختيارية …"
            rows={2}
            disabled={isBusy}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.85rem', resize: 'vertical' }}
          />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={isBusy || (pendingAction.requireComment && !comment.trim())}
            onClick={() => execute(pendingAction.action, comment.trim() || undefined)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: pendingAction.variant === 'danger' ? '#dc2626' : '#2563eb',
              color: '#fff', fontWeight: 600, fontSize: '0.85rem',
              opacity: isBusy ? 0.7 : 1,
            }}
          >
            {isBusy ? '…' : `تأكيد: ${pendingAction.label}`}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => { setPendingAction(null); setComment(''); }}
            style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            إلغاء
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {availableTransitions.map((t) => (
        <button
          key={t.action}
          type="button"
          disabled={isBusy}
          onClick={() => setPendingAction(t)}
          style={{
            padding: '6px 16px', borderRadius: 6, cursor: 'pointer',
            background: t.variant === 'danger'    ? '#fef2f2'
                      : t.variant === 'primary'   ? '#eff6ff'
                      : '#f3f4f6',
            color: t.variant === 'danger'   ? '#dc2626'
                 : t.variant === 'primary'  ? '#2563eb'
                 : '#374151',
            fontWeight: 600, fontSize: '0.85rem',
            border: t.variant === 'danger'  ? '1px solid #fca5a5'
                  : t.variant === 'primary' ? '1px solid #93c5fd'
                  : '1px solid #e5e7eb',
            opacity: isBusy ? 0.7 : 1,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

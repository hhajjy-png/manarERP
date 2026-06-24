import { useEffect, useState } from 'react';
import { approvalHistoryApi, type ApprovalHistoryEntry } from '../../api/approvalHistory';
import ApprovalTimeline from './ApprovalTimeline';
import ApprovalActions, { type ApprovalTransitionDef } from './ApprovalActions';

interface Props {
  entityType: string;
  entityId: number;
  /** When true, renders ApprovalActions below the timeline. Default: false. */
  showActions?: boolean;
  availableTransitions?: ApprovalTransitionDef[];
  onAction?: (action: string, comment?: string) => Promise<void>;
  actionBusy?: boolean;
  /** Optional title override. Default: "سجل الاعتماد". */
  title?: string;
}

export default function ApprovalHistoryPanel({
  entityType,
  entityId,
  showActions = false,
  availableTransitions = [],
  onAction,
  actionBusy,
  title = 'سجل الاعتماد',
}: Props) {
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    approvalHistoryApi
      .getHistory(entityType, entityId)
      .then((data) => { if (!cancelled) setHistory(data); })
      .catch(() => { if (!cancelled) setError('تعذّر تحميل سجل الاعتماد'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  return (
    <div style={{ padding: '16px 0' }}>
      {title && (
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#374151', marginBottom: 12 }}>
          {title}
        </div>
      )}

      {loading && (
        <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '12px 0' }}>
          جارٍ التحميل…
        </div>
      )}

      {!loading && error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>
      )}

      {!loading && !error && <ApprovalTimeline history={history} />}

      {showActions && onAction && (
        <ApprovalActions
          availableTransitions={availableTransitions}
          onAction={async (action, comment) => {
            await onAction(action, comment);
            // Refresh history after action
            setLoading(true);
            approvalHistoryApi
              .getHistory(entityType, entityId)
              .then(setHistory)
              .finally(() => setLoading(false));
          }}
          busy={actionBusy}
        />
      )}
    </div>
  );
}

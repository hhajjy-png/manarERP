import type { ApprovalHistoryEntry } from '../../api/approvalHistory';
import { useT } from '../../lib/i18n';
import ApprovalBadge from './ApprovalBadge';

const ACTION_ICONS: Record<string, string> = {
  approve: '✓',
  reject:  '✗',
  submit:  '→',
  cancel:  '○',
  reopen:  '↺',
  pay:     '＄',
};

const ACTION_LABEL_KEYS: Record<string, string> = {
  approve: 'audit.action.APPROVE',
  reject:  'action.reject',
  submit:  'timeline.action.submit',
  cancel:  'audit.action.CANCEL',
  reopen:  'timeline.action.reopen',
  pay:     'page.salaries.pay_btn',
};

function formatRelativeTime(dateStr: string, t: (key: string, vars?: Record<string, string | number>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return t('timeline.time.now');
  if (mins < 60) return t('timeline.time.minutes_ago', { n: mins });
  if (hours < 24) return t('timeline.time.hours_ago', { n: hours });
  return t('timeline.time.days_ago', { n: days });
}

interface Props {
  history: ApprovalHistoryEntry[];
}

export default function ApprovalTimeline({ history }: Props) {
  const { t } = useT();

  if (history.length === 0) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '12px 0', textAlign: 'center' }}>
        {t('timeline.empty')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {history.map((entry) => (
        <div key={entry.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* Icon dot */}
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: entry.action === 'approve' || entry.action === 'pay' ? '#dcfce7'
                        : entry.action === 'reject'  ? '#fee2e2'
                        : '#f3f4f6',
              color: entry.action === 'approve' || entry.action === 'pay' ? '#16a34a'
                   : entry.action === 'reject'  ? '#dc2626'
                   : '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, marginTop: 2,
            }}
          >
            {ACTION_ICONS[entry.action] ?? '•'}
          </div>

          {/* Content */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                {entry.user?.fullName ?? t('timeline.system_user')}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {ACTION_LABEL_KEYS[entry.action] ? t(ACTION_LABEL_KEYS[entry.action]) : entry.action}
              </span>
              <ApprovalBadge status={entry.fromStatus} />
              <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>←</span>
              <ApprovalBadge status={entry.toStatus} />
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginRight: 'auto' }}>
                {formatRelativeTime(entry.createdAt, t)}
              </span>
            </div>

            {entry.comment && (
              <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#4b5563', paddingRight: 4 }}>
                "{entry.comment}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

import { useT } from '../../lib/i18n';

interface StatusConfig {
  label: string;
  color: string;
  bg: string;
}

interface StatusKeyConfig {
  key: string;
  color: string;
  bg: string;
}

const DEFAULT_STATUS_MAP: Record<string, StatusKeyConfig> = {
  DRAFT:     { key: 'status.draft',           color: '#6b7280', bg: '#f3f4f6' },
  PENDING:   { key: 'badge.status.pending',   color: '#d97706', bg: '#fffbeb' },
  SUBMITTED: { key: 'badge.status.submitted', color: '#2563eb', bg: '#eff6ff' },
  APPROVED:  { key: 'status.approved',        color: '#16a34a', bg: '#f0fdf4' },
  REJECTED:  { key: 'status.rejected',        color: '#dc2626', bg: '#fef2f2' },
  CANCELLED: { key: 'exp.status.cancelled',   color: '#6b7280', bg: '#f3f4f6' },
  REVERSED:  { key: 'badge.status.reversed',  color: '#dc2626', bg: '#fef2f2' },
  PAID:      { key: 'status.paid',            color: '#0891b2', bg: '#ecfeff' },
  UNPAID:    { key: 'badge.status.unpaid',    color: '#d97706', bg: '#fffbeb' },
  PARTIAL:   { key: 'badge.status.partial',   color: '#7c3aed', bg: '#f5f3ff' },
  OVERDUE:   { key: 'badge.status.overdue',   color: '#dc2626', bg: '#fef2f2' },
};

interface Props {
  status: string;
  statusMap?: Record<string, StatusConfig>;
}

export default function ApprovalBadge({ status, statusMap }: Props) {
  const { t } = useT();

  let cfg: StatusConfig;
  if (statusMap) {
    cfg = statusMap[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' };
  } else {
    const keyed = DEFAULT_STATUS_MAP[status];
    cfg = keyed
      ? { label: t(keyed.key), color: keyed.color, bg: keyed.bg }
      : { label: status, color: '#6b7280', bg: '#f3f4f6' };
  }

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}22`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

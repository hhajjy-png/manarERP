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
  DRAFT:     { key: 'status.draft',           color: 'var(--text-muted)', bg: 'var(--surface-2)' },
  PENDING:   { key: 'badge.status.pending',   color: 'var(--amber)', bg: 'var(--amber-light)' },
  SUBMITTED: { key: 'badge.status.submitted', color: 'var(--blue)', bg: 'var(--blue-light)' },
  APPROVED:  { key: 'status.approved',        color: 'var(--green)', bg: 'var(--green-light)' },
  REJECTED:  { key: 'status.rejected',        color: 'var(--red)', bg: 'var(--red-light)' },
  CANCELLED: { key: 'exp.status.cancelled',   color: 'var(--text-muted)', bg: 'var(--surface-2)' },
  REVERSED:  { key: 'badge.status.reversed',  color: 'var(--red)', bg: 'var(--red-light)' },
  PAID:      { key: 'status.paid',            color: 'var(--teal)', bg: 'var(--teal-light)' },
  UNPAID:    { key: 'badge.status.unpaid',    color: 'var(--amber)', bg: 'var(--amber-light)' },
  PARTIAL:   { key: 'badge.status.partial',   color: 'var(--violet)', bg: 'var(--violet-light)' },
  OVERDUE:   { key: 'badge.status.overdue',   color: 'var(--red)', bg: 'var(--red-light)' },
};

interface Props {
  status: string;
  statusMap?: Record<string, StatusConfig>;
}

export default function ApprovalBadge({ status, statusMap }: Props) {
  const { t } = useT();

  let cfg: StatusConfig;
  if (statusMap) {
    cfg = statusMap[status] ?? { label: status, color: 'var(--text-muted)', bg: 'var(--surface-2)' };
  } else {
    const keyed = DEFAULT_STATUS_MAP[status];
    cfg = keyed
      ? { label: t(keyed.key), color: keyed.color, bg: keyed.bg }
      : { label: status, color: 'var(--text-muted)', bg: 'var(--surface-2)' };
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
        border: `1px solid color-mix(in srgb, ${cfg.color} 13%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}

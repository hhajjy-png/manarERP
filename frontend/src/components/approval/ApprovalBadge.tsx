interface StatusConfig {
  label: string;
  color: string;
  bg: string;
}

const DEFAULT_STATUS_MAP: Record<string, StatusConfig> = {
  DRAFT:     { label: 'مسودة',         color: '#6b7280', bg: '#f3f4f6' },
  PENDING:   { label: 'معلق',          color: '#d97706', bg: '#fffbeb' },
  SUBMITTED: { label: 'مُرسل للاعتماد', color: '#2563eb', bg: '#eff6ff' },
  APPROVED:  { label: 'معتمد',         color: '#16a34a', bg: '#f0fdf4' },
  REJECTED:  { label: 'مرفوض',         color: '#dc2626', bg: '#fef2f2' },
  CANCELLED: { label: 'ملغى',          color: '#6b7280', bg: '#f3f4f6' },
  REVERSED:  { label: 'معكوس',         color: '#dc2626', bg: '#fef2f2' },
  PAID:      { label: 'مدفوع',         color: '#0891b2', bg: '#ecfeff' },
  UNPAID:    { label: 'غير مدفوع',     color: '#d97706', bg: '#fffbeb' },
  PARTIAL:   { label: 'مدفوع جزئياً',  color: '#7c3aed', bg: '#f5f3ff' },
  OVERDUE:   { label: 'متأخر',         color: '#dc2626', bg: '#fef2f2' },
};

interface Props {
  status: string;
  statusMap?: Record<string, StatusConfig>;
}

export default function ApprovalBadge({ status, statusMap }: Props) {
  const map = statusMap ?? DEFAULT_STATUS_MAP;
  const cfg = map[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' };

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

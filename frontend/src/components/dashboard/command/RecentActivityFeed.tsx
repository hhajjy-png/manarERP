import { Skeleton } from '../Skeleton';
import { formatDate } from '../../../lib/date';
import type { ActivityRow } from './types';
import { useT } from '../../../lib/i18n';

type TFn = (key: string, vars?: Record<string, string | number>) => string;

// Audit action → i18n key + icon + accent (schema: CREATE|UPDATE|DELETE|LOGIN|LOGOUT|RESTORE…).
const ACTION_META: Record<string, { key: string; icon: string; color: string }> = {
  CREATE:  { key: 'audit.action.CREATE',        icon: '➕', color: 'var(--db-green)' },
  UPDATE:  { key: 'audit.action.UPDATE',        icon: '✏️', color: 'var(--db-blue)' },
  DELETE:  { key: 'audit.action.DELETE',          icon: '🗑️', color: 'var(--db-red)' },
  RESTORE: { key: 'audit.action.RESTORE',      icon: '♻️', color: 'var(--db-green)' },
  APPROVE: { key: 'audit.action.APPROVE',       icon: '✅', color: 'var(--db-green)' },
  LOGIN:   { key: 'audit.action.LOGIN',   icon: '🔑', color: 'var(--db-muted)' },
  LOGOUT:  { key: 'audit.action.LOGOUT',   icon: '🚪', color: 'var(--db-muted)' },
  PRINT:   { key: 'audit.action.PRINT',        icon: '🖨️', color: '#6366F1' },
  AUTO_BACKUP: { key: 'activity.action.auto_backup', icon: '💾', color: '#0EA5E9' },
  BACKUP:  { key: 'activity.action.backup',  icon: '💾', color: '#0EA5E9' },
};

// Module key → i18n key (fallback to the raw key).
const MODULE_KEY: Record<string, string> = {
  invoices: 'perm.module.invoices', customers: 'perm.module.customers', expenses: 'perm.module.expenses', contracts: 'perm.module.contracts',
  payroll: 'perm.module.payroll', salaries: 'perm.module.payroll', cheques: 'perm.module.cheques', employees: 'activity.module.employees',
  equipment: 'perm.module.equipment', maintenance: 'perm.module.maintenance', transactions: 'perm.module.transactions', suppliers: 'activity.module.suppliers',
  users: 'activity.module.users', roles: 'activity.module.roles', auth: 'activity.module.auth', backups: 'perm.module.backups',
  accounting: 'search.page.accounting', attendance: 'perm.module.attendance', prices: 'activity.module.prices', inventory: 'perm.module.inventory',
  forms: 'activity.module.forms', system: 'nav.group.system', dashboard: 'nav.dashboard', reports: 'perm.module.reports',
};

function relativeTime(t: TFn, iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return t('time.now');
  const min = Math.floor(diffSec / 60);
  if (min < 60) return t('time.minutes_ago', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('time.hours_ago', { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t('time.days_ago', { n: day });
  return formatDate(iso);
}

/**
 * "آخر النشاطات" — real recent activity from GET /dashboard/activity (audit log).
 * Empty state shown when there are no recorded activities.
 */
export default function RecentActivityFeed({
  rows,
  loading,
}: {
  rows: ActivityRow[];
  loading: boolean;
}) {
  const { t } = useT();
  if (loading) {
    return (
      <div className="db-af">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={40} style={{ borderRadius: 8 }} />
        ))}
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🕓</div>
        <div className="db-empty-text">{t('activity.empty')}</div>
      </div>
    );
  }

  return (
    <ul className="db-af">
      {rows.map((r) => {
        const meta = ACTION_META[r.action];
        const actionLabel = meta ? t(meta.key) : r.action;
        const icon = meta?.icon ?? '•';
        const color = meta?.color ?? 'var(--db-muted)';
        const moduleKey = MODULE_KEY[r.module];
        const moduleLabel = moduleKey ? t(moduleKey) : r.module;
        return (
          <li key={r.id} className="db-af-row">
            <span className="db-af-icon" style={{ color, background: `color-mix(in srgb, ${color} 11%, transparent)` }}>{icon}</span>
            <div className="db-af-body">
              <div className="db-af-text">
                <span className="db-af-action">{actionLabel}</span> — {moduleLabel}
                {r.user?.fullName && <span className="db-af-user"> · {r.user.fullName}</span>}
              </div>
              <div className="db-af-time">{relativeTime(t, r.createdAt)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

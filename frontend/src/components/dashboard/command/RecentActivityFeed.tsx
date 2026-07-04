import { Skeleton } from '../Skeleton';
import type { ActivityRow } from './types';

// Audit action → Arabic label + icon + accent (schema: CREATE|UPDATE|DELETE|LOGIN|LOGOUT|RESTORE…).
const ACTION_META: Record<string, { label: string; icon: string; color: string }> = {
  CREATE:  { label: 'إنشاء',        icon: '➕', color: '#10B981' },
  UPDATE:  { label: 'تعديل',        icon: '✏️', color: '#3B82F6' },
  DELETE:  { label: 'حذف',          icon: '🗑️', color: '#EF4444' },
  RESTORE: { label: 'استعادة',      icon: '♻️', color: '#10B981' },
  APPROVE: { label: 'اعتماد',       icon: '✅', color: '#10B981' },
  LOGIN:   { label: 'تسجيل دخول',   icon: '🔑', color: '#9CA3AF' },
  LOGOUT:  { label: 'تسجيل خروج',   icon: '🚪', color: '#9CA3AF' },
  PRINT:   { label: 'طباعة',        icon: '🖨️', color: '#6366F1' },
  AUTO_BACKUP: { label: 'نسخ احتياطي تلقائي', icon: '💾', color: '#0EA5E9' },
  BACKUP:  { label: 'نسخ احتياطي',  icon: '💾', color: '#0EA5E9' },
};

// Module key → Arabic name (fallback to the raw key).
const MODULE_AR: Record<string, string> = {
  invoices: 'الفواتير', customers: 'العملاء', expenses: 'المصروفات', contracts: 'العقود',
  payroll: 'الرواتب', salaries: 'الرواتب', cheques: 'الشيكات', employees: 'الموظفين',
  equipment: 'المعدات', maintenance: 'الصيانة', transactions: 'المعاملات', suppliers: 'الموردين',
  users: 'المستخدمين', roles: 'الصلاحيات', auth: 'الحساب', backups: 'النسخ الاحتياطي',
  accounting: 'المحاسبة', attendance: 'الحضور', prices: 'الأسعار', inventory: 'المخزون',
  forms: 'النماذج', system: 'النظام', dashboard: 'لوحة التحكم', reports: 'التقارير',
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffSec < 60) return 'الآن';
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `منذ ${day} يوم`;
  return new Date(iso).toLocaleDateString('ar-KW');
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
        <div className="db-empty-text">لا توجد نشاطات مسجّلة بعد</div>
      </div>
    );
  }

  return (
    <ul className="db-af">
      {rows.map((r) => {
        const meta = ACTION_META[r.action] ?? { label: r.action, icon: '•', color: '#9CA3AF' };
        const moduleAr = MODULE_AR[r.module] ?? r.module;
        return (
          <li key={r.id} className="db-af-row">
            <span className="db-af-icon" style={{ color: meta.color, background: `${meta.color}1c` }}>{meta.icon}</span>
            <div className="db-af-body">
              <div className="db-af-text">
                <span className="db-af-action">{meta.label}</span> — {moduleAr}
                {r.user?.fullName && <span className="db-af-user"> · {r.user.fullName}</span>}
              </div>
              <div className="db-af-time">{relativeTime(r.createdAt)}</div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

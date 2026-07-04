import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../stores/authStore';

interface QuickAction {
  key: string;
  label: string;
  icon: string;
  route: string;
  permission: string;
  tone: string;
}

// All routes and permission keys already exist in the system — nothing new is created.
const ACTIONS: QuickAction[] = [
  { key: 'invoice',  label: 'فاتورة جديدة', icon: '🧾', route: '/invoices',  permission: 'invoices.create',  tone: '#3B82F6' },
  { key: 'customer', label: 'عميل جديد',    icon: '👥', route: '/customers', permission: 'customers.create', tone: '#A855F7' },
  { key: 'expense',  label: 'مصروف جديد',   icon: '💸', route: '/expenses',  permission: 'expenses.create',  tone: '#EF4444' },
  { key: 'contract', label: 'عقد جديد',     icon: '📄', route: '/contracts', permission: 'contracts.create', tone: '#10B981' },
  { key: 'cheque',   label: 'شيك جديد',     icon: '🖋️', route: '/cheques',   permission: 'cheques.create',   tone: '#F59E0B' },
];

/**
 * "إجراءات سريعة" — permission-gated shortcuts to existing pages. Only actions the
 * current user is allowed to create are shown; navigation uses current routes only.
 */
export default function QuickActionsSection() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();

  const allowed = ACTIONS.filter((a) => hasPermission(a.permission));

  if (!allowed.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🔒</div>
        <div className="db-empty-text">لا توجد إجراءات متاحة بصلاحياتك الحالية</div>
      </div>
    );
  }

  return (
    <div className="db-qa-grid">
      {allowed.map((a) => (
        <button
          key={a.key}
          type="button"
          className="db-qa-tile"
          onClick={() => navigate(a.route)}
          style={{ ['--qa-tone' as string]: a.tone }}
        >
          <span className="db-qa-icon">{a.icon}</span>
          <span className="db-qa-label">{a.label}</span>
        </button>
      ))}
    </div>
  );
}

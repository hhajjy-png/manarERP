import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../stores/authStore';
import { useT } from '../../lib/i18n';
import { dateText } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import { MetricCard, EmptyState, ErrorBanner, SkeletonRows, Button } from '../explorer/ExplorerKit';
import {
  type EntitlementsResponse,
  type EmployeeLike,
  daysText,
} from './entitlementsShared';
import './EmployeeEntitlementsTab.css';

/**
 * تبويب «الاستحقاقات» في درج تفاصيل الموظف — ملخّص سريع فقط: رصيد الإجازة، المستحق
 * للدفع، المدفوع، والمتبقي. الكشف الكامل («تفاصيل مستحقات الموظف») صفحة مستقلة يفتحها
 * الزر أدناه — لا تكرار للمعلومة ولا مصدر حقيقة ثانٍ.
 *
 * يُحمَّل بكسل: يُركَّب فقط عند تنشيط التبويب، ومفتاحه معرّف الموظف في الأب فيُعاد تركيبه
 * عند تبديل الموظف. كل الأرقام من الخادم — نفس نقطة القراءة التي يستخدمها الكشف الكامل.
 */
export default function EmployeeEntitlementsTab({ employee }: { employee: EmployeeLike }) {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('employees.read');
  const navigate = useNavigate();
  const { t } = useT();

  const [data, setData] = useState<EntitlementsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!canRead || !employee?.id) return;
    let alive = true;
    setLoading(true);
    setError('');
    api
      .get(`/employees/${employee.id}/entitlements`)
      .then((res) => { if (alive) setData(res.data?.data ?? null); })
      .catch((e) => { if (alive) setError(errorMessage(e)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [employee?.id, canRead]);

  if (!canRead) {
    return <EmptyState icon="lock" title={t('msg.ent.no_permission_title')} message={t('msg.ent.no_permission_message')} tone="neutral" />;
  }
  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (loading || !data) return <SkeletonRows rows={4} withAvatar={false} />;

  const { result: r, employee: emp, balances, payments } = data;

  return (
    <div className="ent-tab ent-tab--summary">
      <div className="ent-kpis">
        <MetricCard
          icon="beach_access"
          label={t('field.ent.current_leave_balance')}
          tone="blue"
          value={r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays, t) : '—'}
          sub={r.firstYearEligible === false ? t('msg.ent.not_yet_eligible_short') : undefined}
        />
        <MetricCard
          icon="event_available"
          label={t('field.ent.total_payable_entitlement')}
          tone="indigo"
          value={balances.totalPayable !== null ? <PrivateAmount value={balances.totalPayable} level={1} /> : '—'}
        />
        <MetricCard
          icon="payments"
          label={t('field.ent.total_paid')}
          tone="green"
          value={<PrivateAmount value={balances.totalPaid} level={1} />}
          sub={payments.entries.length > 0 ? t('msg.ent.payments_count', { n: payments.entries.length }) : t('msg.ent.no_payments_short')}
        />
        <MetricCard
          icon="account_balance_wallet"
          label={t('field.ent.remaining_payable')}
          tone="orange"
          value={balances.totalRemaining !== null ? <PrivateAmount value={balances.totalRemaining} level={1} /> : '—'}
        />
      </div>

      <p className="ent-mini-summary">
        {emp.hireDate ? t('msg.ent.employed_since', { date: dateText(emp.hireDate) }) : t('msg.ent.missing_hire_date')}
        {r.firstYearEligible === false && t('msg.ent.first_year_not_met_suffix')}
      </p>

      <Button
        variant="primary"
        icon="open_in_new"
        onClick={() => navigate(`/employees/${employee.id}/entitlements`)}
      >
        {t('action.ent.open_statement')}
      </Button>
    </div>
  );
}

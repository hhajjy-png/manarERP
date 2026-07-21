import { useEffect, useMemo, useState } from 'react';
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
 * تبويب «الاستحقاقات» في درج تفاصيل الموظف — ملخّص سريع فقط (حزمة إعادة هيكلة تجربة
 * الاستحقاقات v1). التجربة الكاملة (الملخص التنفيذي، التسوية، الجدول الزمني، تسوية
 * الدفعات المقدَّمة، التنبيهات الذكية، دفتر المستحقات، الجداول التفصيلية) انتقلت إلى
 * صفحة مستقلة (pages/EmployeeEntitlementsCenter.tsx) — يفتحها زر «فتح مركز المستحقات».
 * يُحمَّل بكسل (Lazy): يُركَّب فقط عند تنشيط التبويب، ومُفتاحه معرّف الموظف في الأب
 * فيُعاد تركيبه عند تبديل الموظف (لا بيانات قديمة). الحسابات كلها من الخادم — نفس
 * نقطة القراءة GET /employees/:id/entitlements التي تستخدمها صفحة المركز أيضًا.
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

  // إجمالي أيام/مبلغ الدفعات المقدَّمة لبطاقة «ملخص التسويات» فقط — بلا استدعاء API إضافي.
  const settlementTotals = useMemo(() => {
    if (!data) return { count: 0, totalAmount: 0 };
    return {
      count: data.settlements.length,
      totalAmount: data.settlements.reduce((sum, s) => sum + s.settlementAmount, 0),
    };
  }, [data]);

  if (!canRead) {
    return <EmptyState icon="lock" title={t('msg.ent.no_permission_title')} message={t('msg.ent.no_permission_message')} tone="neutral" />;
  }
  if (error) return <ErrorBanner>{error}</ErrorBanner>;
  if (loading || !data) return <SkeletonRows rows={4} withAvatar={false} />;

  const { result: r, employee: emp } = data;

  return (
    <div className="ent-tab ent-tab--summary">
      {/* بطاقات ملخّص مختصرة — أربع فقط (الجزء 1، حزمة إعادة الهيكلة v1) */}
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
          label={t('field.ent.total_legal_entitlement')}
          tone="indigo"
          value={r.accruedLeaveDays !== null ? daysText(r.accruedLeaveDays, t) : '—'}
        />
        <MetricCard
          icon="event_busy"
          label={t('field.ent.leave_used')}
          tone="green"
          value={daysText(r.usedLeaveDays, t)}
        />
        <MetricCard
          icon="savings"
          label={t('field.ent.settlements_summary')}
          tone="orange"
          value={String(settlementTotals.count)}
          sub={settlementTotals.count > 0 ? <PrivateAmount value={settlementTotals.totalAmount} level={1} /> : t('msg.ent.no_advances_short')}
        />
      </div>

      {/* ملخّص صغير جدًا فقط — التفاصيل الكاملة في مركز المستحقات */}
      <p className="ent-mini-summary">
        {emp.hireDate ? t('msg.ent.employed_since', { date: dateText(emp.hireDate) }) : t('msg.ent.missing_hire_date')}
        {r.firstYearEligible === false && t('msg.ent.first_year_not_met_suffix')}
      </p>

      <Button
        variant="primary"
        icon="open_in_new"
        onClick={() => navigate(`/employees/${employee.id}/entitlements`)}
      >
        {t('action.ent.open_center')}
      </Button>
    </div>
  );
}

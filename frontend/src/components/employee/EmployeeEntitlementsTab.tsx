import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../stores/authStore';
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
    return <EmptyState icon="lock" title="صلاحية غير متوفرة" message="لا تملك صلاحية عرض استحقاقات هذا الموظف." tone="neutral" />;
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
          label="رصيد الإجازة الحالي"
          tone="blue"
          value={r.remainingLeaveDays !== null ? daysText(r.remainingLeaveDays) : '—'}
          sub={r.firstYearEligible === false ? 'غير مؤهل بعد' : undefined}
        />
        <MetricCard
          icon="event_available"
          label="الاستحقاق القانوني الإجمالي"
          tone="indigo"
          value={r.accruedLeaveDays !== null ? daysText(r.accruedLeaveDays) : '—'}
        />
        <MetricCard
          icon="event_busy"
          label="الإجازة المستخدمة"
          tone="green"
          value={daysText(r.usedLeaveDays)}
        />
        <MetricCard
          icon="savings"
          label="ملخّص التسويات"
          tone="orange"
          value={String(settlementTotals.count)}
          sub={settlementTotals.count > 0 ? <PrivateAmount value={settlementTotals.totalAmount} level={1} /> : 'لا توجد دفعات'}
        />
      </div>

      {/* ملخّص صغير جدًا فقط — التفاصيل الكاملة في مركز المستحقات */}
      <p className="ent-mini-summary">
        {emp.hireDate ? `على رأس العمل منذ ${dateText(emp.hireDate)}` : 'تاريخ التعيين غير مُدخل'}
        {r.firstYearEligible === false && ' — لم يكتمل شرط أهلية إجازة السنة الأولى بعد (9 أشهر خدمة)'}
      </p>

      <Button
        variant="primary"
        icon="open_in_new"
        onClick={() => navigate(`/employees/${employee.id}/entitlements`)}
      >
        فتح مركز المستحقات
      </Button>
    </div>
  );
}

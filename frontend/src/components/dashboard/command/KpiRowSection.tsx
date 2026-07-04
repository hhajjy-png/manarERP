import KPICard from '../KPICard';
import { Skeleton } from '../Skeleton';
import PrivateAmount from '../../PrivateAmount';
import type { FinancialSummary } from './types';

/**
 * Build a month-on-month badge from a REAL change percentage.
 * Returns undefined when no real comparison exists (null/NaN) — we never invent a growth rate.
 */
function momBadge(v: number | null | undefined): { dir: 'up' | 'down'; text: string } | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return { dir: v >= 0 ? 'up' : 'down', text: `${Math.abs(v).toFixed(1)}%` };
}

/**
 * "المؤشرات المالية الرئيسية" — executive KPI row.
 *
 * Every value is real (financialSummary from /executive/decision-center + the derived
 * net-cash figure = thisMonth.collections − thisMonth.expenses). Trend badges appear only
 * where a real month-on-month change exists; the derived net-cash and receivables have no
 * such comparison, so they show a status/explanation instead of an invented percentage.
 */
export default function KpiRowSection({
  financial,
  cashFlow,
  loading,
}: {
  financial: FinancialSummary | null;
  cashFlow: number | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="db-cc-kpi-grid">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} height={120} style={{ borderRadius: 14 }} />
        ))}
      </div>
    );
  }

  if (!financial) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📊</div>
        <div className="db-empty-text">لا تتوفر المؤشرات المالية حالياً</div>
      </div>
    );
  }

  const f = financial;
  const mom = f.monthOnMonthChanges;
  const profitPositive = f.netProfit >= 0;
  const cash = cashFlow ?? 0;
  const cashPositive = cash >= 0;

  return (
    <div className="db-cc-kpi-grid">
      <KPICard
        label="إجمالي الإيرادات"
        value={<PrivateAmount value={f.totalRevenue} />}
        icon="💰"
        color="green"
        badge={momBadge(mom.revenue)}
        sub="إجمالي الإيرادات المسجّلة"
      />
      <KPICard
        label="صافي الربح"
        value={<PrivateAmount value={f.netProfit} />}
        icon="📈"
        color={profitPositive ? 'blue' : 'red'}
        badge={momBadge(mom.profit)}
        sub={profitPositive ? 'الإيرادات − المصروفات' : '⚠ المصروفات تتجاوز الإيرادات'}
      />
      <KPICard
        label="إجمالي المصروفات"
        value={<PrivateAmount value={f.totalExpenses} />}
        icon="📉"
        color="red"
        badge={momBadge(mom.expenses)}
        badgeInvert
        sub="إجمالي المصروفات المعتمدة"
      />
      <KPICard
        label="صافي النقد لهذا الشهر"
        value={<PrivateAmount value={cash} />}
        icon="💵"
        color={cashPositive ? 'green' : 'red'}
        sub={`${cashPositive ? 'فائض نقدي' : 'عجز نقدي'} — تحصيلات الشهر − مصروفات الشهر`}
      />
      <KPICard
        label="الذمم المستحقة"
        value={<PrivateAmount value={f.totalOutstanding} />}
        icon="⏳"
        color="amber"
        sub="مبالغ لم تُحصَّل بعد"
      />
    </div>
  );
}

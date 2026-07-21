import { MetricCard } from '../../explorer/ExplorerKit';
import { Skeleton } from '../Skeleton';
import PrivateAmount from '../../PrivateAmount';
import type { FinancialSummary } from './types';
import { useT } from '../../../lib/i18n';

/**
 * Build a month-on-month trend indicator from a REAL change percentage.
 * Returns undefined when no real comparison exists (null/NaN) — we never invent a growth rate.
 * `invert` flips only the colour for cost-type metrics (rising expenses read red, not green).
 */
function momTrend(
  v: number | null | undefined,
  invert = false,
): { dir: 'up' | 'down'; text: string; invert?: boolean } | undefined {
  if (v == null || !Number.isFinite(v)) return undefined;
  return { dir: v >= 0 ? 'up' : 'down', text: `${Math.abs(v).toFixed(1)}%`, invert };
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
  const { t } = useT();
  if (loading) {
    return (
      <div className="xpl-kpi-grid">
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
        <div className="db-empty-text">{t('kpirow.empty')}</div>
      </div>
    );
  }

  const f = financial;
  const mom = f.monthOnMonthChanges;
  const profitPositive = f.netProfit >= 0;
  const cash = cashFlow ?? 0;
  const cashPositive = cash >= 0;

  return (
    <div className="xpl-kpi-grid">
      <MetricCard
        label={t('kpi.total_revenue')}
        value={<PrivateAmount value={f.totalRevenue} />}
        icon="payments"
        tone="green"
        trend={momTrend(mom.revenue)}
        sub={t('kpirow.sub.total_revenue_recorded')}
      />
      <MetricCard
        label={t('kpi.net_profit')}
        value={<PrivateAmount value={f.netProfit} />}
        icon="trending_up"
        tone={profitPositive ? 'blue' : 'red'}
        trend={momTrend(mom.profit)}
        sub={profitPositive ? t('kpirow.sub.revenue_minus_expenses') : t('kpirow.sub.expenses_exceed_revenue')}
      />
      <MetricCard
        label={t('kpi.total_expenses')}
        value={<PrivateAmount value={f.totalExpenses} />}
        icon="trending_down"
        tone="red"
        trend={momTrend(mom.expenses, true)}
        sub={t('kpirow.sub.total_expenses_approved')}
      />
      <MetricCard
        label={t('kpirow.net_cash_this_month')}
        value={<PrivateAmount value={cash} />}
        icon="account_balance_wallet"
        tone={cashPositive ? 'green' : 'red'}
        sub={`${cashPositive ? t('kpirow.cash_surplus') : t('kpirow.cash_deficit')} ${t('kpirow.sub.net_cash_formula')}`}
      />
      <MetricCard
        label={t('exec.kpi.outstanding_receivables')}
        value={<PrivateAmount value={f.totalOutstanding} />}
        icon="hourglass_empty"
        tone="orange"
        sub={t('kpirow.sub.outstanding_uncollected')}
      />
    </div>
  );
}

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../../../lib/rechartsDefaults';
import { Skeleton } from '../Skeleton';
import type { RevenueSlice } from './types';
import { formatCurrency, formatInteger, formatPercent } from '../../../lib/format';
import { MoneyText } from '../../../config/modules';
import { useT } from '../../../lib/i18n';
import { CHART_FONT_STACK } from '../../../styles/fontRegistry';

// Distinct palette; the last colour is reserved for the aggregated "أخرى" slice.
const SLICE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#A855F7', '#06B6D4', '#9CA3AF'];

/** Donut tooltip (element form so Recharts injects active/payload; total passed in). */
function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: readonly { name?: string; value?: number }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const val = Number(p.value ?? 0);
  const pct = total > 0 ? (val / total) * 100 : 0;
  return (
    <div style={{
      background: 'var(--db-card)', backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px',
      fontFamily: CHART_FONT_STACK, direction: 'rtl',
    }}>
      <p style={{ color: 'var(--db-text)', fontSize: 13, fontWeight: 700, margin: 0 }}>{p.name}</p>
      <p style={{ color: 'var(--db-muted)', fontSize: 12, margin: '4px 0 0' }}>{<MoneyText value={val} />} · {formatPercent(pct, 1)}</p>
    </div>
  );
}

/**
 * "توزيع الإيرادات حسب العميل" — real revenue split by customer.
 *
 * Data is financialSummary.topCustomersByRevenue reduced to Top 5 + "أخرى" by
 * buildRevenueDistribution (Phase A, unit-tested). No fabricated values; an empty
 * state is shown when there is not enough real revenue data.
 */
export default function RevenueDistributionSection({
  slices,
  loading,
}: {
  slices: RevenueSlice[];
  loading: boolean;
}) {
  const { t } = useT();
  if (loading) return <Skeleton height={260} style={{ borderRadius: 12 }} />;

  if (!slices.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🥧</div>
        <div className="db-empty-text">{t('rds.empty')}</div>
      </div>
    );
  }

  const total = slices.reduce((s, x) => s + x.value, 0);
  const colored = slices.map((s, i) => ({ ...s, fill: SLICE_COLORS[i % SLICE_COLORS.length] }));

  return (
    <div className="db-cc-donut">
      <div className="db-cc-donut-chart">
        <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
          <PieChart>
            <Pie
              data={colored}
              cx="50%"
              cy="50%"
              innerRadius={58}
              outerRadius={86}
              paddingAngle={3}
              dataKey="value"
              nameKey="name"
            >
              {colored.map((entry, i) => (
                <Cell key={i} fill={entry.fill} stroke="transparent" />
              ))}
            </Pie>
            <Tooltip content={<DonutTooltip total={total} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="db-cc-donut-center">
          <div className="db-cc-donut-total">{formatInteger(total)}</div>
          <div className="db-cc-donut-caption">{t('kpi.total_revenue')}</div>
        </div>
      </div>

      <ul className="db-cc-legend">
        {colored.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li key={s.name} className="db-cc-legend-row">
              <span className="db-cc-legend-dot" style={{ background: s.fill }} />
              <span className="db-cc-legend-name">{s.name}</span>
              <span className="db-cc-legend-pct">{formatPercent(pct, 0)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

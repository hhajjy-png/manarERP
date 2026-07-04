import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Skeleton } from '../Skeleton';
import type { RevenueSlice } from './types';

// Distinct palette; the last colour is reserved for the aggregated "أخرى" slice.
const SLICE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#A855F7', '#06B6D4', '#9CA3AF'];

function fmt(v: number): string {
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.ك`;
}

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
      background: 'rgba(15, 23, 40, 0.94)', backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '10px 14px',
      fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', direction: 'rtl',
    }}>
      <p style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700, margin: 0 }}>{p.name}</p>
      <p style={{ color: '#9CA3AF', fontSize: 12, margin: '4px 0 0' }}>{fmt(val)} · {pct.toFixed(1)}%</p>
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
  if (loading) return <Skeleton height={260} style={{ borderRadius: 12 }} />;

  if (!slices.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🥧</div>
        <div className="db-empty-text">لا توجد بيانات إيرادات كافية حسب العميل</div>
      </div>
    );
  }

  const total = slices.reduce((s, x) => s + x.value, 0);
  const colored = slices.map((s, i) => ({ ...s, fill: SLICE_COLORS[i % SLICE_COLORS.length] }));

  return (
    <div className="db-cc-donut">
      <div className="db-cc-donut-chart">
        <ResponsiveContainer width="100%" height="100%">
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
          <div className="db-cc-donut-total">{total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</div>
          <div className="db-cc-donut-caption">إجمالي الإيرادات</div>
        </div>
      </div>

      <ul className="db-cc-legend">
        {colored.map((s) => {
          const pct = total > 0 ? (s.value / total) * 100 : 0;
          return (
            <li key={s.name} className="db-cc-legend-row">
              <span className="db-cc-legend-dot" style={{ background: s.fill }} />
              <span className="db-cc-legend-name">{s.name}</span>
              <span className="db-cc-legend-pct">{pct.toFixed(0)}%</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

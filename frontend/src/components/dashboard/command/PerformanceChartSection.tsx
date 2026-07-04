import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from '../Skeleton';

export interface TrendPoint { label: string; revenue: number; expense: number }

const SERIES_LABEL: Record<string, string> = {
  revenue: 'الإيرادات',
  expense: 'المصروفات',
  profit: 'صافي الربح',
};
const SERIES_COLOR: Record<string, string> = {
  revenue: '#10B981',
  expense: '#EF4444',
  profit: '#3B82F6',
};

interface TipEntry { dataKey?: string; value?: number; color?: string }

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: TipEntry[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 23, 40, 0.94)', backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px',
      fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
      direction: 'rtl', minWidth: 190, boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
    }}>
      <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, marginBottom: 10, letterSpacing: '0.06em' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, flexShrink: 0 }} />
          <p style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700 }}>
            {SERIES_LABEL[p.dataKey ?? ''] ?? p.dataKey}:{' '}
            <span style={{ color: p.color }}>{Number(p.value).toLocaleString('en-US')} د.ك</span>
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * "الأداء المالي (آخر ٦ أشهر)" — monthly revenue/expense bars + a net-profit line.
 *
 * All series are real: revenue & expense come straight from the 6-month `trend`
 * (/dashboard/executive); profit is derived per month (revenue − expense) — a real
 * computation, not fabricated data. Empty/zero data shows a respectful empty state.
 */
export default function PerformanceChartSection({
  trend = [],
  loading,
}: {
  trend?: TrendPoint[];
  loading: boolean;
}) {
  if (loading) return <Skeleton height={260} style={{ borderRadius: 12 }} />;

  const points = Array.isArray(trend) ? trend : [];
  const hasData = points.length > 0 && points.some((d) => (d.revenue ?? 0) !== 0 || (d.expense ?? 0) !== 0);
  if (!hasData) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📊</div>
        <div className="db-empty-text">لا توجد بيانات مالية كافية لعرض الأداء</div>
      </div>
    );
  }

  const data = trend.map((d) => ({
    label: d.label,
    revenue: d.revenue ?? 0,
    expense: d.expense ?? 0,
    profit: (d.revenue ?? 0) - (d.expense ?? 0), // real per-month derivation
  }));

  return (
    <div className="db-cc-chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} barGap={4} barCategoryGap="28%">
          <defs>
            <linearGradient id="ccGradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0.72} />
            </linearGradient>
            <linearGradient id="ccGradExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={1} />
              <stop offset="100%" stopColor="#DC2626" stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#9CA3AF', fontSize: 12, fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
          />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(148,163,184,0.08)' }} />
          <Legend formatter={(value: string) => (
            <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', fontWeight: 700 }}>
              {SERIES_LABEL[value] ?? value}
            </span>
          )} />
          <Bar dataKey="revenue" fill="url(#ccGradRevenue)" radius={[6, 6, 0, 0]} maxBarSize={34} />
          <Bar dataKey="expense" fill="url(#ccGradExpense)" radius={[6, 6, 0, 0]} maxBarSize={34} />
          <Line
            type="monotone"
            dataKey="profit"
            stroke={SERIES_COLOR.profit}
            strokeWidth={2.5}
            dot={{ r: 3, fill: SERIES_COLOR.profit }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

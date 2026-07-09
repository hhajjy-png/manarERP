import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCompact } from '../../lib/format';
import { fcCurrency } from './financialLabels';

export interface AgingBucketData { key: string; label: string; amount: number; }

interface Props { data: AgingBucketData[]; }

// Aging-severity palette sourced from Financial Center tokens (defined in financial.css,
// theme-aware). Fallbacks kept so the chart still renders if the tokens are unavailable.
const BUCKET_FILL: Record<string, string> = {
  current:  'var(--fc-aging-current, #22c55e)',
  '0_30':   'var(--fc-aging-0-30, #86efac)',
  '31_60':  'var(--fc-aging-31-60, #fbbf24)',
  '61_90':  'var(--fc-aging-61-90, #fb923c)',
  '91_120': 'var(--fc-aging-91-120, #f87171)',
  over_120: 'var(--fc-aging-over-120, #ef4444)',
};

function fmt(v: unknown) {
  const n = Number(v);
  return fcCurrency(isNaN(n) ? 0 : n);
}

export function AgingChart({ data }: Props) {
  const hasData = data.some(d => d.amount > 0);
  if (!hasData) return null;

  return (
    <div className="aging-chart-container">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: 'var(--border, #e2e8f0)' }}
            tick={{ fontSize: 12, fontFamily: 'inherit', fill: 'var(--xpl-muted, var(--text-muted, #64748b))' }} />
          <YAxis tickLine={false} axisLine={false}
            tick={{ fontSize: 11, fontFamily: 'inherit', fill: 'var(--xpl-muted, var(--text-muted, #64748b))' }}
            tickFormatter={v => formatCompact(v)} />
          <Tooltip
            formatter={(v: unknown) => fmt(v)}
            cursor={{ fill: 'var(--surface-hover, rgba(148,163,184,.12))' }}
            contentStyle={{
              background: 'var(--surface, #fff)',
              border: '1px solid var(--border, #e2e8f0)',
              borderRadius: 8,
              color: 'var(--text, #0f172a)',
            }}
            labelStyle={{ color: 'var(--text, #0f172a)' }}
            itemStyle={{ color: 'var(--text, #0f172a)' }}
          />
          <Bar dataKey="amount" radius={[6, 6, 0, 0]} maxBarSize={64}>
            {data.map((entry, i) => (
              <Cell key={i} fill={BUCKET_FILL[entry.key] ?? 'var(--fc-aging-default, #94a3b8)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

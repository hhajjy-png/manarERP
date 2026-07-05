import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatCurrency, formatCompact } from '../../lib/format';

export interface AgingBucketData { key: string; label: string; amount: number; }

interface Props { data: AgingBucketData[]; }

const BUCKET_FILL: Record<string, string> = {
  current:  '#22c55e',
  '0_30':   '#86efac',
  '31_60':  '#fde047',
  '61_90':  '#fb923c',
  '91_120': '#f87171',
  over_120: '#ef4444',
};

function fmt(v: unknown) {
  const n = Number(v);
  if (isNaN(n)) return formatCurrency(0);
  return formatCurrency(n);
}

export function AgingChart({ data }: Props) {
  const hasData = data.some(d => d.amount > 0);
  if (!hasData) return null;

  return (
    <div className="aging-chart-container">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
          <XAxis dataKey="label" tick={{ fontSize: 12, fontFamily: 'inherit' }} />
          <YAxis tick={{ fontSize: 11, fontFamily: 'inherit' }} tickFormatter={v => formatCompact(v)} />
          <Tooltip formatter={(v: unknown) => fmt(v)} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={BUCKET_FILL[entry.key] ?? '#94a3b8'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

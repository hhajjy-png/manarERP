import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from './Skeleton';

interface TrendPoint { label: string; revenue: number; expense: number; }
interface Props { data: TrendPoint[]; loading: boolean; }

interface TooltipEntry {
  dataKey?: string;
  fill?: string;
  value?: number;
}
interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
}

function DarkTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(15, 23, 40, 0.94)',
      backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 12,
      padding: '12px 16px',
      fontFamily: 'Cairo, sans-serif',
      direction: 'rtl',
      minWidth: 185,
      boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
    }}>
      <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, marginBottom: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <p style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700 }}>
            {p.dataKey === 'revenue' ? 'إيرادات' : 'مصروفات'}:{' '}
            <span style={{ color: p.fill }}>{Number(p.value).toLocaleString('en-US')} د.ك</span>
          </p>
        </div>
      ))}
    </div>
  );
}

function legendFormatter(value: string) {
  return (
    <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: 'Cairo, sans-serif', fontWeight: 700 }}>
      {value === 'revenue' ? 'إيرادات' : 'مصروفات'}
    </span>
  );
}

export default function RevenueChart({ data, loading }: Props) {
  if (loading) return <Skeleton height={240} style={{ borderRadius: 12 }} />;

  if (!data.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📊</div>
        <div className="db-empty-text">لا توجد بيانات مالية</div>
      </div>
    );
  }

  return (
    <div className="db-chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={4} barCategoryGap="30%">
          <defs>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10B981" stopOpacity={1} />
              <stop offset="100%" stopColor="#059669" stopOpacity={0.72} />
            </linearGradient>
            <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#EF4444" stopOpacity={1} />
              <stop offset="100%" stopColor="#DC2626" stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="label"
            tick={{ fill: '#9CA3AF', fontSize: 12, fontFamily: 'Cairo' }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#9CA3AF', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
          />
          <Tooltip content={<DarkTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Legend formatter={legendFormatter} />
          <Bar dataKey="revenue" fill="url(#gradRevenue)" radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Bar dataKey="expense" fill="url(#gradExpense)" radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

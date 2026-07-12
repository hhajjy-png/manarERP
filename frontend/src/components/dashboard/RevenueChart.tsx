import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../../lib/rechartsDefaults';
import { Skeleton } from './Skeleton';
import { useT } from '../../lib/i18n';
import { formatCurrency, formatCompact } from '../../lib/format';
import { formatMonthShort, formatMonthLabel } from '../../lib/date';

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
  revenueLabel?: string;
  expensesLabel?: string;
}

// Theme-aware tooltip — ExplorerKit tokens only (correct in both light & dark themes).
function ChartTooltip({ active, payload, label, revenueLabel = '', expensesLabel = '' }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--xpl-surface)',
      border: '1px solid var(--xpl-border)',
      borderRadius: 12,
      padding: '12px 16px',
      fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
      direction: 'rtl',
      minWidth: 185,
      boxShadow: 'var(--xpl-shadow)',
    }}>
      <p style={{ color: 'var(--xpl-muted)', fontSize: 11, fontWeight: 700, marginBottom: 10, letterSpacing: '0.06em' }}>{formatMonthLabel(label)}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '5px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.fill, flexShrink: 0 }} />
          <p style={{ color: 'var(--xpl-text)', fontSize: 13, fontWeight: 700 }}>
            {p.dataKey === 'revenue' ? revenueLabel : expensesLabel}:{' '}
            <span style={{ color: p.fill }}>{formatCurrency(p.value)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

export default function RevenueChart({ data, loading }: Props) {
  const { t } = useT();
  const revenueLabel = t('dash.lbl.revenue');
  const expensesLabel = t('dash.lbl.expenses');

  if (loading) return <Skeleton height={240} style={{ borderRadius: 12 }} />;

  if (!data.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📊</div>
        <div className="db-empty-text">{t('empty.no_financial_data')}</div>
      </div>
    );
  }

  return (
    <div className="db-chart-wrap">
      <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
        <BarChart data={data} barGap={4} barCategoryGap="30%">
          <defs>
            <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--xpl-green)' }} stopOpacity={1} />
              <stop offset="100%" style={{ stopColor: 'var(--xpl-green)' }} stopOpacity={0.6} />
            </linearGradient>
            <linearGradient id="gradExpense" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--xpl-red)' }} stopOpacity={1} />
              <stop offset="100%" style={{ stopColor: 'var(--xpl-red)' }} stopOpacity={0.6} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--xpl-border)" />
          <XAxis
            dataKey="label"
            tickFormatter={formatMonthShort}
            tick={{ fill: 'var(--xpl-muted)', fontSize: 12, fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif' }}
            axisLine={false}
            tickLine={false}
            minTickGap={4}
          />
          <YAxis
            tick={{ fill: 'var(--xpl-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={72}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip content={<ChartTooltip revenueLabel={revenueLabel} expensesLabel={expensesLabel} />} cursor={{ fill: 'var(--xpl-faint-2)' }} />
          <Legend formatter={(value: string) => (
            <span style={{ color: 'var(--xpl-muted)', fontSize: 12, fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', fontWeight: 700 }}>
              {value === 'revenue' ? revenueLabel : expensesLabel}
            </span>
          )} />
          <Bar dataKey="revenue" fill="url(#gradRevenue)" radius={[6, 6, 0, 0]} maxBarSize={36} />
          <Bar dataKey="expense" fill="url(#gradExpense)" radius={[6, 6, 0, 0]} maxBarSize={36} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from './Skeleton';

interface StatusPoint { status: string; count: number; }
interface Props { data: StatusPoint[]; loading: boolean; }

const COLORS: Record<string, string> = {
  ACTIVE:    '#2563EB',
  EXPIRED:   '#6B7280',
  RENEWING:  '#F59E0B',
  SUSPENDED: '#EF4444',
};

const LABELS: Record<string, string> = {
  ACTIVE:    'سارية',
  EXPIRED:   'منتهية',
  RENEWING:  'قيد التجديد',
  SUSPENDED: 'موقوفة',
};

interface PieEntry { name?: string; value?: number; fill?: string; }
interface CustomTooltipProps { active?: boolean; payload?: PieEntry[]; }

function DarkTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{
      background: '#1a2535',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 10,
      padding: '10px 14px',
      fontFamily: 'Cairo, sans-serif',
      direction: 'rtl',
    }}>
      <p style={{ color: p.fill ?? '#fff', fontSize: 13, fontWeight: 700 }}>
        {LABELS[p.name ?? ''] ?? p.name}: {p.value} عقد
      </p>
    </div>
  );
}

function legendFormatter(value: string) {
  return (
    <span style={{ color: '#9CA3AF', fontSize: 12, fontFamily: 'Cairo, sans-serif', fontWeight: 700 }}>
      {LABELS[value] ?? value}
    </span>
  );
}

export default function ContractStatusChart({ data, loading }: Props) {
  if (loading) return <Skeleton height={248} style={{ borderRadius: 12 }} />;

  if (!data.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🥧</div>
        <div className="db-empty-text">لا توجد بيانات</div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.status,
    value: d.count,
    fill: COLORS[d.status] ?? '#6B7280',
  }));

  return (
    <div className="db-chart-wrap-sm">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="46%"
            innerRadius={62}
            outerRadius={88}
            paddingAngle={3}
            dataKey="value"
            nameKey="name"
          >
            {chartData.map((entry, i) => (
              <Cell key={i} fill={entry.fill} stroke="transparent" />
            ))}
          </Pie>
          <Tooltip content={<DarkTooltip />} />
          <Legend formatter={legendFormatter} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

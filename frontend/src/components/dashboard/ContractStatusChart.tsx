import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from './Skeleton';
import { useT } from '../../lib/i18n';

interface StatusPoint { status: string; count: number; }
interface Props { data: StatusPoint[]; loading: boolean; }

const COLORS: Record<string, string> = {
  ACTIVE:    '#2563EB',
  EXPIRED:   'var(--db-muted)',
  RENEWING:  '#F59E0B',
  SUSPENDED: '#EF4444',
};

interface PieEntry { name?: string; value?: number; fill?: string; }

export default function ContractStatusChart({ data, loading }: Props) {
  const { t } = useT();
  const contractUnit = t('page.dashboard.contract_unit');

  if (loading) return <Skeleton height={248} style={{ borderRadius: 12 }} />;

  if (!data.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🥧</div>
        <div className="db-empty-text">{t('msg.empty')}</div>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.status,
    value: d.count,
    fill: COLORS[d.status] ?? 'var(--db-muted)',
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
          <Tooltip content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0] as unknown as PieEntry;
            return (
              <div style={{
                background: 'var(--db-card)',
                border: '1px solid var(--db-border)',
                borderRadius: 10,
                padding: '10px 14px',
                fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
                direction: 'rtl',
                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
              }}>
                <p style={{ color: p.fill ?? 'var(--db-text)', fontSize: 13, fontWeight: 700 }}>
                  {t('contract.status.' + (p.name ?? '').toLowerCase())}: {p.value} {contractUnit}
                </p>
              </div>
            );
          }} />
          <Legend formatter={(value: string) => (
            <span style={{ color: 'var(--db-muted)', fontSize: 12, fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', fontWeight: 700 }}>
              {t('contract.status.' + value.toLowerCase())}
            </span>
          )} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

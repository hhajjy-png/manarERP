import { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts';
import { api } from '../../api/client';
import { Skeleton } from './Skeleton';
import { formatCurrency, formatNumber, formatCompact } from '../../lib/format';
import { money } from '../../config/modules';
import { useT } from '../../lib/i18n';

type Period = '1m' | '3m' | '6m' | '12m';

interface TimelinePoint {
  period: string;
  revenue: number;
  expenses: number;
  collections: number;
  profit: number;
  outstandingEnd: number;
}

const PERIOD_LABEL_KEY: Record<Period, string> = {
  '1m':  'kpitl.period.1m',
  '3m':  'kpitl.period.3m',
  '6m':  'kpitl.period.6m',
  '12m': 'kpitl.period.12m',
};

export default function KPITimeline() {
  const { t } = useT();
  const [period, setPeriod] = useState<Period>('6m');
  const [data, setData]     = useState<TimelinePoint[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    api.get<{ success: boolean; data: TimelinePoint[] }>(`/executive/kpi-timeline?period=${period}`)
      .then(r => { setData(r.data.data); })
      .catch(() => { setError(t('kpitl.err.load_failed')); })
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>📊 {t('kpitl.title')}</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['1m', '3m', '6m', '12m'] as Period[]).map(p => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              style={{
                padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: period === p ? 'var(--accent)' : 'var(--db-inner)',
                color: period === p ? '#fff' : 'var(--db-muted)',
                transition: 'all 0.2s',
              }}
            >{t(PERIOD_LABEL_KEY[p])}</button>
          ))}
        </div>
      </div>

      {loading && <Skeleton height={280} />}
      {error && <div style={{ color: '#EF4444', fontSize: 13, padding: 16 }}>{error}</div>}

      {!loading && !error && data && (
        <>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
              <defs>
                <linearGradient id="kpi-rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="kpi-exp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="kpi-col" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="period" tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={v => formatCompact(v)} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--db-text)', fontWeight: 700 }}
                formatter={(v) => typeof v === 'number' ? money(v) : String(v)}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: 'var(--db-muted)' }} />
              <Area type="monotone" dataKey="revenue"    name={t('today.revenue')}   stroke="#3B82F6" fill="url(#kpi-rev)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="expenses"   name={t('today.expenses')}   stroke="#EF4444" fill="url(#kpi-exp)" strokeWidth={2} dot={false} />
              <Area type="monotone" dataKey="collections" name={t('today.collections')} stroke="#10B981" fill="url(#kpi-col)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>

          {/* Summary row */}
          {data.length > 0 && (() => {
            const last = data[data.length - 1];
            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
                {[
                  { label: t('dash.lbl.revenue'), value: last.revenue, color: '#3B82F6' },
                  { label: t('dash.lbl.expenses'), value: last.expenses, color: '#EF4444' },
                  { label: t('exec.lbl.collections'), value: last.collections, color: '#10B981' },
                  { label: t('kpitl.lbl.net_profit'), value: last.profit, color: last.profit >= 0 ? '#10B981' : '#EF4444' },
                  { label: t('kpitl.lbl.outstanding'), value: last.outstandingEnd, color: '#F59E0B' },
                ].map(item => (
                  <div key={item.label} style={{
                    background: 'var(--db-inner)', borderRadius: 8, padding: '8px 10px', textAlign: 'center',
                    borderBottom: `2px solid ${item.color}`,
                  }}>
                    <div style={{ fontSize: 10, color: 'var(--db-muted)', marginBottom: 2 }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: item.color }}>
                      {formatNumber(item.value)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

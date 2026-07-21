import { useEffect, useMemo, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../lib/rechartsDefaults';
import { api } from '../api/client';
import { Skeleton } from '../components/dashboard/Skeleton';
import KPITimeline from '../components/dashboard/KPITimeline';
import { formatCurrency, formatPercent, formatCompact } from '../lib/format';
import { expenseCategoryLabel } from '../config/expenseCategories';
import '../components/dashboard/dashboard.css';
import { money, MoneyText } from '../config/modules';
import { useTableSort } from '../hooks/useTableSort';
import { sortRowsClient } from '../lib/clientSort';
import SortableHeader from '../components/SortableHeader';
import { useT } from '../lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────────

interface ContractProfitRow {
  id: number;
  code: string;
  asphaltPlant: string;
  customerName: string | null;
  revenue: number;
  collected: number;
  expenses: number;
  profit: number;
  profitMargin: number | null;
  collectionRate: number | null;
}

interface ExpenseCategoryRow {
  category: string;
  total: number;
  count: number;
  pct: number;
}

interface CustomerAnalyticsRow {
  id: number;
  name: string;
  code: string;
  revenue: number;
  collected: number;
  outstanding: number;
  invoiceCount: number;
  collectionRate: number | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(v: number | null): string {
  return v == null ? '—' : formatPercent(v, 1);
}

function marginColor(v: number | null): string {
  if (v == null) return 'inherit';
  if (v >= 20) return '#22c55e';   // green
  if (v >= 5)  return '#f59e0b';   // amber
  return '#ef4444';                 // red
}

// طول السطر عند تفافّ العنوان الطويل إلى سطرين — بلا تصغير الخط وبلا حذف نص
// (Recharts يستنسخ عنصر tick بإحداثيات x/y/payload الحقيقية عبر cloneElement،
// لذا لا نمرّر قيمًا افتراضية عند إنشاء العنصر في <YAxis tick={<ExpenseCategoryTick />} />).
const EXPENSE_TICK_LINE_MAX_CHARS = 14;

function wrapExpenseLabel(label: string): [string, string?] {
  if (label.length <= EXPENSE_TICK_LINE_MAX_CHARS) return [label];
  const words = label.split(' ');
  let line1 = '';
  let i = 0;
  for (; i < words.length; i++) {
    const next = line1 ? `${line1} ${words[i]}` : words[i];
    if (line1 && next.length > EXPENSE_TICK_LINE_MAX_CHARS) break;
    line1 = next;
  }
  let line2 = words.slice(i).join(' ');
  if (line2.length > EXPENSE_TICK_LINE_MAX_CHARS) {
    line2 = `${line2.slice(0, EXPENSE_TICK_LINE_MAX_CHARS - 1)}…`;
  }
  return line2 ? [line1, line2] : [line1];
}

function ExpenseCategoryTick({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const label = payload?.value ?? '';
  const [line1, line2] = wrapExpenseLabel(label);
  return (
    <g transform={`translate(${x ?? 0},${y ?? 0})`}>
      <title>{label}</title>
      <text x={-8} y={line2 ? -6 : 0} dy={4} textAnchor="end" fontSize={12} fill="var(--db-muted, #6b7280)">
        {line1}
      </text>
      {line2 && (
        <text x={-8} y={9} dy={4} textAnchor="end" fontSize={12} fill="var(--db-muted, #6b7280)">
          {line2}
        </text>
      )}
    </g>
  );
}

// ── Tab bar ────────────────────────────────────────────────────────────────

type Tab = 'contracts' | 'expenses' | 'customers' | 'trends';

const TABS: { key: Tab; labelKey: string }[] = [
  { key: 'contracts',  labelKey: 'finops.tab.contract_profitability' },
  { key: 'expenses',   labelKey: 'finops.tab.expense_analysis' },
  { key: 'customers',  labelKey: 'finops.tab.customer_analysis' },
  { key: 'trends',     labelKey: 'finops.tab.trends' },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function ContractProfitabilityTab() {
  const { t } = useT();
  const [rows, setRows]       = useState<ContractProfitRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // فرز محلي موحّد (Enterprise Data Grid Foundation v1) — المجموعة محمّلة بكاملها
  const sort = useTableSort('finops-contracts');
  const sorted = useMemo(() => sortRowsClient(rows ?? [], sort.sortBy, sort.sortDir), [rows, sort.sortBy, sort.sortDir]);

  useEffect(() => {
    api.get<{ data: ContractProfitRow[] }>('/executive/contract-profitability')
      .then(r => setRows(r.data.data))
      .catch(() => setError(t('finops.err.contracts_load_failed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Skeleton />;
  if (error)   return <div style={{ color: 'var(--db-danger)', padding: 20 }}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={{ padding: 20, color: 'var(--db-muted)' }}>{t('finops.empty.contracts')}</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="fin-ops-table">
        <thead>
          <tr>
            <SortableHeader label={t('col.acc.code')} title={t('col.acc.code')} state={sort.getState('code')} onToggle={() => sort.toggle('code')} />
            <SortableHeader label={t('finops.col.plant')} title={t('finops.col.plant')} state={sort.getState('asphaltPlant')} onToggle={() => sort.toggle('asphaltPlant')} />
            <SortableHeader label={t('col.customer')} title={t('col.customer')} state={sort.getState('customerName')} onToggle={() => sort.toggle('customerName')} />
            <SortableHeader label={t('today.revenue')} title={t('today.revenue')} state={sort.getState('revenue')} onToggle={() => sort.toggle('revenue')} />
            <SortableHeader label={t('today.expenses')} title={t('today.expenses')} state={sort.getState('expenses')} onToggle={() => sort.toggle('expenses')} />
            <SortableHeader label={t('finops.col.profit')} title={t('finops.col.profit')} state={sort.getState('profit')} onToggle={() => sort.toggle('profit')} />
            <SortableHeader label={t('exec.kpi.profit_margin')} title={t('exec.kpi.profit_margin')} state={sort.getState('profitMargin')} onToggle={() => sort.toggle('profitMargin')} />
            <SortableHeader label={t('exec.kpi.collection_rate')} title={t('exec.kpi.collection_rate')} state={sort.getState('collectionRate')} onToggle={() => sort.toggle('collectionRate')} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id}>
              <td><code style={{ fontSize: 12 }}>{r.code}</code></td>
              <td>{r.asphaltPlant}</td>
              <td>{r.customerName ?? '—'}</td>
              <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{<MoneyText value={r.revenue} />}</td>
              <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{<MoneyText value={r.expenses} />}</td>
              <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: r.profit < 0 ? '#ef4444' : 'inherit' }}>
                {<MoneyText value={r.profit} />}
              </td>
              <td style={{ color: marginColor(r.profitMargin), fontWeight: 600 }}>{pct(r.profitMargin)}</td>
              <td>{pct(r.collectionRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpenseBreakdownTab() {
  const { t } = useT();
  const [rows, setRows]       = useState<ExpenseCategoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get<{ data: ExpenseCategoryRow[] }>('/executive/expense-breakdown')
      .then(r => setRows(r.data.data))
      .catch(() => setError(t('finops.err.expenses_load_failed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Skeleton />;
  if (error)   return <div style={{ color: 'var(--db-danger)', padding: 20 }}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={{ padding: 20, color: 'var(--db-muted)' }}>{t('finops.empty.expenses')}</div>;

  const chartData = rows.map(r => ({ name: expenseCategoryLabel(r.category), total: r.total, pct: r.pct }));

  const COLORS = [
    '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
    '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#0ea5e9',
  ];

  return (
    <div>
      <div className="db-chart-wrap-lg" style={{ marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 5, right: 30, left: 8, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatCompact(v)}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="category" dataKey="name" tick={<ExpenseCategoryTick />} width={150} />
            <Tooltip
              formatter={(value) => [money(Number(value ?? 0)), t('msg.total')]}
              contentStyle={{ fontFamily: 'inherit', fontSize: 12 }}
            />
            <Bar dataKey="total" radius={[0, 4, 4, 0]}>
              {chartData.map((_entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="fin-ops-table">
          <thead>
            <tr>
              <th>{t('finops.col.category')}</th>
              <th style={{ textAlign: 'left' }}>{t('msg.total')}</th>
              <th>{t('finops.col.count')}</th>
              <th>{t('finops.col.percentage')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.category}>
                <td>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: COLORS[i % COLORS.length], marginLeft: 6 }} />
                  {expenseCategoryLabel(r.category)}
                </td>
                <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{<MoneyText value={r.total} />}</td>
                <td>{r.count}</td>
                <td>{formatPercent(r.pct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CustomerAnalyticsTab() {
  const { t } = useT();
  const [rows, setRows]       = useState<CustomerAnalyticsRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  // فرز محلي موحّد (Enterprise Data Grid Foundation v1) — المجموعة محمّلة بكاملها
  const sort = useTableSort('finops-customers');
  const sorted = useMemo(() => sortRowsClient(rows ?? [], sort.sortBy, sort.sortDir), [rows, sort.sortBy, sort.sortDir]);

  useEffect(() => {
    api.get<{ data: CustomerAnalyticsRow[] }>('/executive/customer-analytics')
      .then(r => setRows(r.data.data))
      .catch(() => setError(t('finops.err.customers_load_failed')))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Skeleton />;
  if (error)   return <div style={{ color: 'var(--db-danger)', padding: 20 }}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={{ padding: 20, color: 'var(--db-muted)' }}>{t('finops.empty.customers')}</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="fin-ops-table">
        <thead>
          <tr>
            <SortableHeader label={t('col.customer')} title={t('col.customer')} state={sort.getState('name')} onToggle={() => sort.toggle('name')} />
            <SortableHeader label={t('col.acc.code')} title={t('col.acc.code')} state={sort.getState('code')} onToggle={() => sort.toggle('code')} />
            <SortableHeader label={t('today.revenue')} title={t('today.revenue')} state={sort.getState('revenue')} onToggle={() => sort.toggle('revenue')} />
            <SortableHeader label={t('finops.col.collected')} title={t('finops.col.collected')} state={sort.getState('collected')} onToggle={() => sort.toggle('collected')} />
            <SortableHeader label={t('finops.col.outstanding')} title={t('finops.col.outstanding')} state={sort.getState('outstanding')} onToggle={() => sort.toggle('outstanding')} />
            <SortableHeader label={t('inv.stats.count')} title={t('inv.stats.count')} state={sort.getState('invoiceCount')} onToggle={() => sort.toggle('invoiceCount')} />
            <SortableHeader label={t('exec.kpi.collection_rate')} title={t('exec.kpi.collection_rate')} state={sort.getState('collectionRate')} onToggle={() => sort.toggle('collectionRate')} />
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id}>
              <td>{r.name}</td>
              <td><code style={{ fontSize: 12 }}>{r.code}</code></td>
              <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{<MoneyText value={r.revenue} />}</td>
              <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{<MoneyText value={r.collected} />}</td>
              <td style={{ textAlign: 'left', fontVariantNumeric: 'tabular-nums', color: r.outstanding > 0 ? '#ef4444' : 'inherit' }}>
                {<MoneyText value={r.outstanding} />}
              </td>
              <td style={{ textAlign: 'center' }}>{r.invoiceCount}</td>
              <td>{pct(r.collectionRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function FinancialOperationsDashboard() {
  const { t } = useT();
  const [activeTab, setActiveTab] = useState<Tab>('contracts');

  const tabStyle = (key: Tab): React.CSSProperties => ({
    padding: '8px 18px',
    border: 'none',
    borderBottom: activeTab === key ? '2px solid var(--db-accent, #6366f1)' : '2px solid transparent',
    background: 'none',
    color: activeTab === key ? 'var(--db-accent, #6366f1)' : 'var(--db-muted)',
    fontWeight: activeTab === key ? 700 : 400,
    cursor: 'pointer',
    fontSize: 14,
    transition: 'all 0.15s',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  });

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', color: 'var(--db-text)' }}>
          {t('finops.header.title')}
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--db-muted)' }}>
          {t('finops.header.subtitle')}
        </p>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 4,
        borderBottom: '1px solid var(--db-border)',
        marginBottom: 24,
        overflowX: 'auto',
      }}>
        {TABS.map(tab => (
          <button key={tab.key} style={tabStyle(tab.key)} onClick={() => setActiveTab(tab.key)}>
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: 20, border: '1px solid var(--db-border)' }}>
        {activeTab === 'contracts'  && <ContractProfitabilityTab />}
        {activeTab === 'expenses'   && <ExpenseBreakdownTab />}
        {activeTab === 'customers'  && <CustomerAnalyticsTab />}
        {activeTab === 'trends'     && <KPITimeline />}
      </div>

      <style>{`
        .fin-ops-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .fin-ops-table th,
        .fin-ops-table td {
          padding: 8px 12px;
          text-align: right;
          border-bottom: 1px solid var(--db-border);
          white-space: nowrap;
        }
        .fin-ops-table th {
          font-weight: 600;
          font-size: 12px;
          color: var(--db-muted);
          background: var(--db-bg, var(--bg));
          position: sticky;
          top: 0;
        }
        .fin-ops-table tbody tr:hover {
          background: var(--db-hover, rgba(99,102,241,0.05));
        }
        .fin-ops-table code {
          background: var(--db-bg, var(--bg));
          border-radius: 3px;
          padding: 1px 5px;
          font-family: monospace;
          color: var(--db-text);
        }
      `}</style>
    </div>
  );
}

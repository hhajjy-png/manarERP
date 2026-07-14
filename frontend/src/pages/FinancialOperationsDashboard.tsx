import { useEffect, useState } from 'react';
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

// ── Tab bar ────────────────────────────────────────────────────────────────

type Tab = 'contracts' | 'expenses' | 'customers' | 'trends';

const TABS: { key: Tab; label: string }[] = [
  { key: 'contracts',  label: 'ربحية العقود' },
  { key: 'expenses',   label: 'تحليل المصروفات' },
  { key: 'customers',  label: 'تحليل العملاء' },
  { key: 'trends',     label: 'الاتجاهات' },
];

// ── Sub-components ─────────────────────────────────────────────────────────

function ContractProfitabilityTab() {
  const [rows, setRows]       = useState<ContractProfitRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get<{ data: ContractProfitRow[] }>('/executive/contract-profitability')
      .then(r => setRows(r.data.data))
      .catch(() => setError('تعذّر تحميل بيانات ربحية العقود'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error)   return <div style={{ color: 'var(--db-danger)', padding: 20 }}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={{ padding: 20, color: 'var(--db-muted)' }}>لا توجد بيانات عقود</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="fin-ops-table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>المصنع</th>
            <th>العميل</th>
            <th style={{ textAlign: 'left' }}>الإيرادات</th>
            <th style={{ textAlign: 'left' }}>المصروفات</th>
            <th style={{ textAlign: 'left' }}>الربح</th>
            <th>هامش الربح</th>
            <th>معدل التحصيل</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
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
  const [rows, setRows]       = useState<ExpenseCategoryRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get<{ data: ExpenseCategoryRow[] }>('/executive/expense-breakdown')
      .then(r => setRows(r.data.data))
      .catch(() => setError('تعذّر تحميل بيانات المصروفات'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error)   return <div style={{ color: 'var(--db-danger)', padding: 20 }}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={{ padding: 20, color: 'var(--db-muted)' }}>لا توجد بيانات مصروفات</div>;

  const chartData = rows.map(r => ({ name: expenseCategoryLabel(r.category), total: r.total, pct: r.pct }));

  const COLORS = [
    '#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#3b82f6',
    '#ec4899', '#14b8a6', '#f97316', '#8b5cf6', '#0ea5e9',
  ];

  return (
    <div>
      <div style={{ height: 320, marginBottom: 24 }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
          <BarChart
            layout="vertical"
            data={chartData}
            margin={{ top: 5, right: 30, left: 80, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatCompact(v)}
              tick={{ fontSize: 11 }}
            />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={76} />
            <Tooltip
              formatter={(value) => [money(Number(value ?? 0)), 'الإجمالي']}
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
              <th>الفئة</th>
              <th style={{ textAlign: 'left' }}>الإجمالي</th>
              <th>العدد</th>
              <th>النسبة</th>
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
  const [rows, setRows]       = useState<CustomerAnalyticsRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    api.get<{ data: CustomerAnalyticsRow[] }>('/executive/customer-analytics')
      .then(r => setRows(r.data.data))
      .catch(() => setError('تعذّر تحميل بيانات العملاء'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Skeleton />;
  if (error)   return <div style={{ color: 'var(--db-danger)', padding: 20 }}>{error}</div>;
  if (!rows || rows.length === 0) return <div style={{ padding: 20, color: 'var(--db-muted)' }}>لا توجد بيانات عملاء</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="fin-ops-table">
        <thead>
          <tr>
            <th>العميل</th>
            <th>الكود</th>
            <th style={{ textAlign: 'left' }}>الإيرادات</th>
            <th style={{ textAlign: 'left' }}>المحصّل</th>
            <th style={{ textAlign: 'left' }}>المستحق</th>
            <th>عدد الفواتير</th>
            <th>معدل التحصيل</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
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
          لوحة العمليات المالية التنفيذية
        </h1>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--db-muted)' }}>
          تحليل شامل لربحية العقود، تصنيف المصروفات، وأداء العملاء
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
            {tab.label}
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

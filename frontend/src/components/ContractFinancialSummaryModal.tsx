import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api, errorMessage } from '../api/client';
import { formatCurrency, formatPercent, formatCompact } from '../lib/format';
import { formatDate } from '../lib/date';
import Modal from './Modal';
import { money } from '../config/modules';
import { useT } from '../lib/i18n';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ContractInfo {
  id: number;
  code: string;
  asphaltPlant: string;
  location: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  monthlyTransportValue: number | null;
  price: number | null;
  unitName: string | null;
  companyName: string | null;
  contractDurationMonths: number | null;
  customer: { id: number; name: string; type: string } | null;
}

interface RevenueSummary {
  totalInvoiced: number;
  invoiceCount: number;
  avgInvoice: number;
  lastInvoiceDate: string | null;
  estimatedContractValue: number | null;
  remainingToInvoice: number | null;
}

interface CollectionsSummary {
  totalCollected: number;
  outstanding: number;
  collectionRate: number | null;
  lastPaymentDate: string | null;
  avgCollectionDays: number | null;
}

interface ExpensesSummary {
  totalExpenses: number;
  expenseCount: number;
  lastExpenseDate: string | null;
}

interface ProfitabilitySummary {
  profit: number;
  profitMargin: number | null;
  profitMarginBasis: 'INVOICED_REVENUE';
  profitStatus: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  revenue: number;
  expenses: number;
}

interface ProgressSummary {
  billingProgress: number | null;
  collectionProgress: number | null;
  expenseRatio: number | null;
}

interface MonthlyEntry {
  month: string;
  invoiced: number;
  collected: number;
  expenses: number;
}

interface FinancialSummary {
  contract: ContractInfo;
  revenue: RevenueSummary;
  collections: CollectionsSummary;
  expenses: ExpensesSummary;
  profitability: ProfitabilitySummary;
  progress: ProgressSummary;
  monthlyData: MonthlyEntry[];
}

interface Props {
  contractId: number;
  contractCode: string;
  onClose: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function kwd(n: number | null | undefined): string {
  if (n == null) return '—';
  return money(n);
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return formatPercent(n, 1);
}

function fmtDate(d: string | null | undefined): string {
  return formatDate(d);
}

function clampPct(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

const CONTRACT_STATUS_KEY: Record<string, string> = {
  ACTIVE: 'opt.contract.active', EXPIRED: 'opt.contract.expired', RENEWING: 'opt.contract.renewing', SUSPENDED: 'opt.contract.suspended',
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--success)', EXPIRED: 'var(--text-muted)', RENEWING: 'var(--warning)', SUSPENDED: 'var(--danger)',
};
const PROFIT_COLOR: Record<string, string> = {
  GREEN: '#22c55e', YELLOW: '#f59e0b', ORANGE: '#f97316', RED: '#ef4444',
};
const PROFIT_LABEL_KEY: Record<string, string> = {
  GREEN: 'profit.status.excellent', YELLOW: 'profit.status.good', ORANGE: 'profit.status.low', RED: 'profit.status.loss',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--surface-2, var(--bg-alt))',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '12px 16px',
      minWidth: 0,
      flex: '1 1 120px',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color ?? 'var(--text)', lineHeight: 1.2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 13, fontWeight: 700, color: 'var(--text-muted)',
      borderBottom: '1px solid var(--border)', paddingBottom: 6, marginBottom: 12, marginTop: 20,
      textTransform: 'uppercase', letterSpacing: '0.05em',
    }}>
      {children}
    </div>
  );
}

function ProgressBar({ value, color }: { value: number | null | undefined; color: string }) {
  const v = clampPct(value);
  return (
    <div style={{ background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
      <div style={{ width: `${v}%`, background: color, height: '100%', borderRadius: 4, transition: 'width 0.5s' }} />
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: '24px 0' }}>
      {[160, 120, 200, 100, 180].map((w, i) => (
        <div key={i} style={{
          height: 14, width: w, background: 'var(--border)', borderRadius: 6,
          marginBottom: 14, opacity: 0.6,
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
      ))}
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}`}</style>
    </div>
  );
}

// ── Custom chart tooltip ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--surface, #1e293b)', border: '1px solid var(--border)',
      borderRadius: 8, padding: '10px 14px', fontSize: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{label}</div>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: 2 }}>
          {p.name}: {kwd(p.value)}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ContractFinancialSummaryModal({ contractId, contractCode, onClose }: Props) {
  const { t } = useT();
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    api.get(`/contracts/${contractId}/financial-summary`)
      .then((res) => setData(res.data.data))
      .catch((err) => setLoadError(errorMessage(err)));
  }, [contractId]);

  const ps = data?.profitability.profitStatus;
  const profitColor = ps ? PROFIT_COLOR[ps] : undefined;

  return (
    <Modal
      title={`📊 ${t('action.financial_summary')} — ${contractCode}`}
      onClose={onClose}
      className="modal-wide"
      footer={<button type="button" className="btn secondary" onClick={onClose}>{t('action.close')}</button>}
    >
      {loadError && <div className="alert error">⚠️ {loadError}</div>}
      {!data && !loadError && <Skeleton />}

      {data && (
        <div style={{ direction: 'rtl' }}>

          {/* ── General Info ── */}
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>{data.contract.asphaltPlant}</span>
            {data.contract.location && (
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>📍 {data.contract.location}</span>
            )}
            <span style={{
              fontSize: 12, fontWeight: 600, padding: '2px 10px', borderRadius: 12,
              background: STATUS_COLOR[data.contract.status] + '22',
              color: STATUS_COLOR[data.contract.status],
            }}>
              {CONTRACT_STATUS_KEY[data.contract.status] ? t(CONTRACT_STATUS_KEY[data.contract.status]) : data.contract.status}
            </span>
          </div>
          {data.contract.customer && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {t('lbl.party_colon')} {data.contract.customer.name}
              {data.contract.startDate && ` | ${fmtDate(data.contract.startDate)} — ${fmtDate(data.contract.endDate)}`}
              {data.contract.contractDurationMonths && ` (${data.contract.contractDurationMonths} ${t('unit.month')})`}
            </div>
          )}

          {/* ── KPI Cards ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <KpiCard
              label={t('lbl.contract.monthly_value')}
              value={kwd(data.contract.monthlyTransportValue)}
              sub={data.revenue.estimatedContractValue ? t('lbl.estimated_total_colon', { value: kwd(data.revenue.estimatedContractValue) }) : undefined}
            />
            <KpiCard
              label={t('lbl.total_invoiced')}
              value={kwd(data.revenue.totalInvoiced)}
              sub={`${data.revenue.invoiceCount} ${t('page.dashboard.invoice_unit')}`}
            />
            <KpiCard
              label={t('lbl.total_collected_chip')}
              value={kwd(data.collections.totalCollected)}
              sub={t('lbl.pct_of_invoiced', { pct: pct(data.collections.collectionRate) })}
              color={(data.collections.collectionRate ?? 0) >= 80 ? '#22c55e' : (data.collections.collectionRate ?? 0) >= 50 ? '#f59e0b' : '#ef4444'}
            />
            <KpiCard
              label={t('kpi.total_expenses')}
              value={kwd(data.expenses.totalExpenses)}
              sub={`${data.expenses.expenseCount} ${t('unit.line_item')}`}
            />
            <KpiCard
              label={t('kpi.net_profit')}
              value={kwd(data.profitability.profit)}
              color={profitColor}
            />
            <KpiCard
              label={t('kpi.profit_margin')}
              value={pct(data.profitability.profitMargin)}
              sub={ps ? t(PROFIT_LABEL_KEY[ps]) : undefined}
              color={profitColor}
            />
          </div>

          {/* ── Revenue ── */}
          <SectionTitle>{t('today.revenue')}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label={t('lbl.total_invoiced')} value={kwd(data.revenue.totalInvoiced)} />
              <Row label={t('inv.stats.count')} value={String(data.revenue.invoiceCount)} />
              <Row label={t('inv.stats.average')} value={kwd(data.revenue.avgInvoice)} />
              <Row label={t('lbl.last_invoice')} value={fmtDate(data.revenue.lastInvoiceDate)} />
            </div>
            <div>
              <Row label={t('lbl.estimated_contract_value')} value={kwd(data.revenue.estimatedContractValue)} />
              <Row label={t('lbl.remaining_to_invoice')} value={kwd(data.revenue.remainingToInvoice)} />
              {data.progress.billingProgress !== null && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('lbl.billing_progress')}</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{pct(data.progress.billingProgress)}</span>
                  </div>
                  <ProgressBar value={data.progress.billingProgress} color="#3b82f6" />
                </div>
              )}
            </div>
          </div>

          {/* ── Collections ── */}
          <SectionTitle>{t('today.collections')}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label={t('lbl.total_collected_chip')} value={kwd(data.collections.totalCollected)} />
              <Row
                label={t('lbl.outstanding_receivables')}
                value={kwd(data.collections.outstanding)}
                valueColor={data.collections.outstanding > 0 ? '#f97316' : '#22c55e'}
              />
              <Row label={t('lbl.last_payment')} value={fmtDate(data.collections.lastPaymentDate)} />
            </div>
            <div>
              <Row label={t('lbl.collection_rate')} value={pct(data.collections.collectionRate)} />
              <Row
                label={t('lbl.avg_collection_days')}
                value={data.collections.avgCollectionDays !== null ? `${data.collections.avgCollectionDays} ${t('unit.day')}` : '—'}
              />
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('lbl.collection_progress')}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{pct(data.progress.collectionProgress)}</span>
                </div>
                <ProgressBar value={data.progress.collectionProgress} color="#22c55e" />
              </div>
            </div>
          </div>

          {/* ── Expenses ── */}
          <SectionTitle>{t('today.expenses')}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label={t('kpi.total_expenses')} value={kwd(data.expenses.totalExpenses)} />
              <Row label={t('lbl.expense_item_count')} value={String(data.expenses.expenseCount)} />
              <Row label={t('lbl.last_expense')} value={fmtDate(data.expenses.lastExpenseDate)} />
            </div>
            <div>
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('lbl.expense_ratio')}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{pct(data.progress.expenseRatio)}</span>
                </div>
                <ProgressBar
                  value={data.progress.expenseRatio}
                  color={(data.progress.expenseRatio ?? 0) > 90 ? '#ef4444' : (data.progress.expenseRatio ?? 0) > 70 ? '#f97316' : '#f59e0b'}
                />
              </div>
            </div>
          </div>

          {/* ── Profitability ── */}
          <SectionTitle>{t('section.profitability')}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label={t('today.revenue')} value={kwd(data.profitability.revenue)} />
              <Row label={t('today.expenses')} value={kwd(data.profitability.expenses)} />
              <Row label={t('kpi.net_profit')} value={kwd(data.profitability.profit)} valueColor={profitColor} />
            </div>
            <div>
              <Row label={t('kpi.profit_margin')} value={pct(data.profitability.profitMargin)} valueColor={profitColor} />
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: (profitColor ?? '#6b7280') + '22', border: `1px solid ${profitColor ?? '#6b7280'}44` }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{t('lbl.profitability_status')}</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: profitColor }}>
                  {ps ? t(PROFIT_LABEL_KEY[ps]) : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Monthly Chart ── */}
          {data.monthlyData.length > 0 && (
            <>
              <SectionTitle>{t('section.monthly_trend')}</SectionTitle>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.monthlyData}
                  margin={{ top: 4, right: 0, left: 10, bottom: 0 }}
                  barCategoryGap="30%"
                  barGap={2}
                >
                  <defs>
                    <linearGradient id="cfs-inv" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="cfs-col" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#22c55e" stopOpacity={0.5} />
                    </linearGradient>
                    <linearGradient id="cfs-exp" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#f97316" stopOpacity={0.9} />
                      <stop offset="100%" stopColor="#f97316" stopOpacity={0.5} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 11, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatCompact(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8, direction: 'rtl' }}
                    formatter={(v) => v === 'invoiced' ? t('lbl.invoiced_short') : v === 'collected' ? t('lbl.collected_short') : t('acc.type.expense')}
                  />
                  <Bar dataKey="invoiced" fill="url(#cfs-inv)" radius={[3, 3, 0, 0]} name="invoiced" />
                  <Bar dataKey="collected" fill="url(#cfs-col)" radius={[3, 3, 0, 0]} name="collected" />
                  <Bar dataKey="expenses" fill="url(#cfs-exp)" radius={[3, 3, 0, 0]} name="expenses" />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}

          {data.monthlyData.length === 0 && (
            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: 13 }}>
              {t('empty.no_monthly_data')}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

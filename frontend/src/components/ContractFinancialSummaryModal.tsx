import { useEffect, useState } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { api, errorMessage } from '../api/client';
import Modal from './Modal';

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
  collectionRate: number;
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
  profitMargin: number;
  profitStatus: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  revenue: number;
  expenses: number;
}

interface ProgressSummary {
  billingProgress: number | null;
  collectionProgress: number;
  expenseRatio: number;
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
  return n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) + ' د.ك';
}

function pct(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toFixed(1) + '%';
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('ar-KW', { year: 'numeric', month: 'short', day: 'numeric' });
}

const CONTRACT_STATUS_AR: Record<string, string> = {
  ACTIVE: 'ساري', EXPIRED: 'منتهٍ', RENEWING: 'قيد التجديد', SUSPENDED: 'موقوف',
};
const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--success)', EXPIRED: 'var(--text-muted)', RENEWING: 'var(--warning)', SUSPENDED: 'var(--danger)',
};
const PROFIT_COLOR: Record<string, string> = {
  GREEN: '#22c55e', YELLOW: '#f59e0b', ORANGE: '#f97316', RED: '#ef4444',
};
const PROFIT_LABEL: Record<string, string> = {
  GREEN: 'ممتازة (≥25%)', YELLOW: 'جيدة (10-25%)', ORANGE: 'منخفضة (<10%)', RED: 'خسارة',
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

function ProgressBar({ value, color }: { value: number | null; color: string }) {
  const v = Math.min(100, Math.max(0, value ?? 0));
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
      title={`📊 الملخص المالي — ${contractCode}`}
      onClose={onClose}
      className="modal-wide"
      footer={<button type="button" className="btn secondary" onClick={onClose}>إغلاق</button>}
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
              {CONTRACT_STATUS_AR[data.contract.status] ?? data.contract.status}
            </span>
          </div>
          {data.contract.customer && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              الجهة: {data.contract.customer.name}
              {data.contract.startDate && ` | ${fmtDate(data.contract.startDate)} — ${fmtDate(data.contract.endDate)}`}
              {data.contract.contractDurationMonths && ` (${data.contract.contractDurationMonths} شهر)`}
            </div>
          )}

          {/* ── KPI Cards ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <KpiCard
              label="القيمة الشهرية للعقد"
              value={kwd(data.contract.monthlyTransportValue)}
              sub={data.revenue.estimatedContractValue ? `الإجمالي التقديري: ${kwd(data.revenue.estimatedContractValue)}` : undefined}
            />
            <KpiCard
              label="إجمالي المفوتر"
              value={kwd(data.revenue.totalInvoiced)}
              sub={`${data.revenue.invoiceCount} فاتورة`}
            />
            <KpiCard
              label="إجمالي المحصّل"
              value={kwd(data.collections.totalCollected)}
              sub={`${pct(data.collections.collectionRate)} من المفوتر`}
              color={data.collections.collectionRate >= 80 ? '#22c55e' : data.collections.collectionRate >= 50 ? '#f59e0b' : '#ef4444'}
            />
            <KpiCard
              label="إجمالي المصروفات"
              value={kwd(data.expenses.totalExpenses)}
              sub={`${data.expenses.expenseCount} بند`}
            />
            <KpiCard
              label="صافي الربح"
              value={kwd(data.profitability.profit)}
              color={profitColor}
            />
            <KpiCard
              label="هامش الربح"
              value={pct(data.profitability.profitMargin)}
              sub={ps ? PROFIT_LABEL[ps] : undefined}
              color={profitColor}
            />
          </div>

          {/* ── Revenue ── */}
          <SectionTitle>الإيرادات</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label="إجمالي المفوتر" value={kwd(data.revenue.totalInvoiced)} />
              <Row label="عدد الفواتير" value={String(data.revenue.invoiceCount)} />
              <Row label="متوسط الفاتورة" value={kwd(data.revenue.avgInvoice)} />
              <Row label="آخر فاتورة" value={fmtDate(data.revenue.lastInvoiceDate)} />
            </div>
            <div>
              <Row label="القيمة التقديرية للعقد" value={kwd(data.revenue.estimatedContractValue)} />
              <Row label="المتبقي للإصدار" value={kwd(data.revenue.remainingToInvoice)} />
              {data.progress.billingProgress !== null && (
                <div style={{ padding: '8px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>تقدم الفوترة</span>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{pct(data.progress.billingProgress)}</span>
                  </div>
                  <ProgressBar value={data.progress.billingProgress} color="#3b82f6" />
                </div>
              )}
            </div>
          </div>

          {/* ── Collections ── */}
          <SectionTitle>التحصيلات</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label="إجمالي المحصّل" value={kwd(data.collections.totalCollected)} />
              <Row
                label="الذمم المستحقة"
                value={kwd(data.collections.outstanding)}
                valueColor={data.collections.outstanding > 0 ? '#f97316' : '#22c55e'}
              />
              <Row label="آخر دفعة" value={fmtDate(data.collections.lastPaymentDate)} />
            </div>
            <div>
              <Row label="نسبة التحصيل" value={pct(data.collections.collectionRate)} />
              <Row
                label="متوسط أيام التحصيل"
                value={data.collections.avgCollectionDays !== null ? `${data.collections.avgCollectionDays} يوم` : '—'}
              />
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>تقدم التحصيل</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{pct(data.progress.collectionProgress)}</span>
                </div>
                <ProgressBar value={data.progress.collectionProgress} color="#22c55e" />
              </div>
            </div>
          </div>

          {/* ── Expenses ── */}
          <SectionTitle>المصروفات</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label="إجمالي المصروفات" value={kwd(data.expenses.totalExpenses)} />
              <Row label="عدد بنود المصروفات" value={String(data.expenses.expenseCount)} />
              <Row label="آخر مصروف" value={fmtDate(data.expenses.lastExpenseDate)} />
            </div>
            <div>
              <div style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>نسبة المصروفات من الإيرادات</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{pct(data.progress.expenseRatio)}</span>
                </div>
                <ProgressBar
                  value={data.progress.expenseRatio}
                  color={data.progress.expenseRatio > 90 ? '#ef4444' : data.progress.expenseRatio > 70 ? '#f97316' : '#f59e0b'}
                />
              </div>
            </div>
          </div>

          {/* ── Profitability ── */}
          <SectionTitle>الربحية</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 24px' }}>
            <div>
              <Row label="الإيرادات" value={kwd(data.profitability.revenue)} />
              <Row label="المصروفات" value={kwd(data.profitability.expenses)} />
              <Row label="صافي الربح" value={kwd(data.profitability.profit)} valueColor={profitColor} />
            </div>
            <div>
              <Row label="هامش الربح" value={pct(data.profitability.profitMargin)} valueColor={profitColor} />
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 8, background: (profitColor ?? '#6b7280') + '22', border: `1px solid ${profitColor ?? '#6b7280'}44` }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>حالة الربحية</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: profitColor }}>
                  {ps ? PROFIT_LABEL[ps] : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* ── Monthly Chart ── */}
          {data.monthlyData.length > 0 && (
            <>
              <SectionTitle>التطور الشهري</SectionTitle>
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
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12, paddingTop: 8, direction: 'rtl' }}
                    formatter={(v) => v === 'invoiced' ? 'مفوتر' : v === 'collected' ? 'محصّل' : 'مصروفات'}
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
              لا توجد بيانات شهرية متاحة بعد
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

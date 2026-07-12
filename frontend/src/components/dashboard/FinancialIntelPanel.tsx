import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../../lib/rechartsDefaults';
import { Skeleton } from './Skeleton';
import { money } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import { formatCurrency, formatPercent, formatCompact } from '../../lib/format';
import { formatMonthShort, formatMonthLabel } from '../../lib/date';

// ── Types ──────────────────────────────────────────────────────────────────

interface DebtorEntry {
  customerId: number;
  name: string;
  outstanding: number;
}

interface AgingSummary {
  bucket0_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  totalOutstanding: number;
}

interface TrendPoint {
  label: string;
  collected: number;
}

interface ContractProfit {
  id: number;
  code: string;
  asphaltPlant: string;
  revenue: number;
  expenses: number;
  profit: number;
  profitMargin: number | null;
}

interface FinancialAlert {
  type: string;
  level: 'warning' | 'danger';
  messageAr: string;
}

export interface FinV2Data {
  collectionsThisMonth: number;
  expensesThisMonth: number;
  topDebtors: DebtorEntry[];
  agingSummary: AgingSummary;
  collectionTrend: TrendPoint[];
  topProfitableContracts: ContractProfit[];
  lowestProfitContracts: ContractProfit[];
  financialAlerts: FinancialAlert[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clamp(v: number | null | undefined, lo = 0, hi = 100): number {
  if (v == null || !Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function pct(part: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return clamp((part / total) * 100);
}

// ── Tooltip ────────────────────────────────────────────────────────────────

interface TooltipProps {
  active?: boolean;
  payload?: { value?: number; fill?: string }[];
  label?: string;
}

function CollectionTooltip({ active, payload, label }: TooltipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--db-card)',
      backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: 12,
      padding: '10px 14px',
      fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif',
      direction: 'rtl',
      minWidth: 160,
      boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
    }}>
      <p style={{ color: 'var(--db-muted)', fontSize: 11, fontWeight: 700, marginBottom: 8 }}>{formatMonthLabel(label)}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: payload[0]?.fill, flexShrink: 0 }} />
        <p style={{ color: 'var(--db-text)', fontSize: 13, fontWeight: 700 }}>
          التحصيلات:{' '}
          <span style={{ color: payload[0]?.fill }}>
            {formatCurrency(payload[0]?.value ?? 0)}
          </span>
        </p>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function CollectionChart({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  if (loading) return <Skeleton height={220} style={{ borderRadius: 12 }} />;
  const safe = data.filter((d) => Number.isFinite(d.collected));
  return (
    <div style={{ height: 220 }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
        <BarChart data={safe} barCategoryGap="32%">
          <defs>
            <linearGradient id="gradCollect" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity={1} />
              <stop offset="100%" stopColor="#2563EB" stopOpacity={0.72} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" />
          <XAxis
            dataKey="label"
            tickFormatter={formatMonthShort}
            tick={{ fill: 'var(--db-muted)', fontSize: 11, fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif' }}
            axisLine={false}
            tickLine={false}
            minTickGap={4}
          />
          <YAxis
            tick={{ fill: 'var(--db-muted)', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={64}
            tickFormatter={(v: number) => formatCompact(v)}
          />
          <Tooltip content={<CollectionTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Bar dataKey="collected" fill="url(#gradCollect)" radius={[6, 6, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function DebtorList({ debtors, loading }: { debtors: DebtorEntry[]; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <Skeleton height={14} width="140px" />
            <Skeleton height={14} width="80px" />
          </div>
        ))}
      </div>
    );
  }
  if (!debtors.length) {
    return <p style={{ color: 'var(--db-muted)', fontSize: 13, margin: '16px 0 0', textAlign: 'center' }}>لا توجد ذمم مدينة</p>;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {debtors.map((d, i) => (
        <div
          key={d.customerId}
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 0',
            borderBottom: i < debtors.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 24, height: 24, borderRadius: 6, background: 'rgba(59,130,246,0.15)',
              color: 'var(--db-blue)', fontSize: 11, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {i + 1}
            </span>
            <span style={{ color: 'var(--db-text)', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.name}
            </span>
          </div>
          <span style={{ color: 'var(--db-red)', fontSize: 13, fontWeight: 800, flexShrink: 0, marginRight: 8 }}>
            <PrivateAmount value={d.outstanding} />
          </span>
        </div>
      ))}
    </div>
  );
}

function AgingBar({ label, amount, total, color }: { label: string; amount: number; total: number; color: string }) {
  const width = pct(amount, total);
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ color: 'var(--db-muted)', fontSize: 12, fontWeight: 600 }}>{label}</span>
        <span style={{ color: 'var(--db-text)', fontSize: 12, fontWeight: 700 }}><PrivateAmount value={amount} /></span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{ height: '100%', width: `${width}%`, background: color, borderRadius: 999, transition: 'width 0.5s ease' }} />
      </div>
    </div>
  );
}

function AgingSummaryBars({ aging, loading }: { aging: AgingSummary | null; loading: boolean }) {
  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <Skeleton height={12} width="80px" />
              <Skeleton height={12} width="100px" />
            </div>
            <Skeleton height={6} style={{ borderRadius: 999 }} />
          </div>
        ))}
      </div>
    );
  }
  if (!aging) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📊</div>
        <div className="db-empty-text">لا تتوفر بيانات أعمار الذمم حالياً</div>
      </div>
    );
  }
  const total = aging.totalOutstanding || 1;
  return (
    <div>
      <AgingBar label="0 – 30 يوم"  amount={aging.bucket0_30}   total={total} color="#10B981" />
      <AgingBar label="31 – 60 يوم" amount={aging.bucket31_60}  total={total} color="#F59E0B" />
      <AgingBar label="61 – 90 يوم" amount={aging.bucket61_90}  total={total} color="#F97316" />
      <AgingBar label="+90 يوم"     amount={aging.bucket90Plus} total={total} color="#EF4444" />
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12, marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ color: 'var(--db-muted)', fontSize: 12, fontWeight: 600 }}>إجمالي الذمم</span>
        <span style={{ color: 'var(--db-text)', fontSize: 13, fontWeight: 800 }}><PrivateAmount value={aging.totalOutstanding} /></span>
      </div>
    </div>
  );
}

function ContractProfitRow({ c, rank }: { c: ContractProfit; rank: 'top' | 'low' }) {
  const margin = c.profitMargin;
  const marginColor = rank === 'top' ? '#10B981' : '#EF4444';
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
    }}>
      <div style={{ minWidth: 0 }}>
        <p style={{ color: 'var(--db-text)', fontSize: 13, fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.code}</p>
        <p style={{ color: 'var(--db-muted)', fontSize: 11, margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.asphaltPlant}</p>
      </div>
      <div style={{ textAlign: 'left', flexShrink: 0, marginRight: 8 }}>
        {margin !== null ? (
          <span style={{ color: marginColor, fontSize: 13, fontWeight: 800 }}>{formatPercent(margin, 1)}</span>
        ) : (
          <span style={{ color: 'var(--db-muted)', fontSize: 12 }}>—</span>
        )}
        <p style={{ color: 'var(--db-muted)', fontSize: 10, margin: '2px 0 0', textAlign: 'left' }}>ربح <PrivateAmount value={c.profit} /></p>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props {
  data: FinV2Data | null;
  loading: boolean;
}

export default function FinancialIntelPanel({ data, loading }: Props) {
  const collections = data?.collectionsThisMonth ?? 0;
  const expenses    = data?.expensesThisMonth ?? 0;
  const outstanding = data?.agingSummary.totalOutstanding ?? 0;
  const debtors     = data?.topDebtors ?? [];
  const aging       = data?.agingSummary ?? null;
  const trend       = data?.collectionTrend ?? [];
  const topContracts  = data?.topProfitableContracts ?? [];
  const lowContracts  = data?.lowestProfitContracts ?? [];
  const alerts        = data?.financialAlerts ?? [];

  return (
    <div style={{ marginTop: 32 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <h2 style={{ color: 'var(--db-text)', fontSize: 18, fontWeight: 800, margin: 0 }}>
          المؤشرات المالية التنفيذية
        </h2>
        {alerts.length > 0 && !loading && (
          <span className="db-pill red">{alerts.length} تنبيه</span>
        )}
      </div>

      {/* Alerts banner */}
      {alerts.length > 0 && !loading && (
        <div style={{ marginBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((a) => (
            <div
              key={a.type}
              style={{
                background: a.level === 'danger' ? 'rgba(239,68,68,0.10)' : 'rgba(245,158,11,0.10)',
                border: `1px solid ${a.level === 'danger' ? 'rgba(239,68,68,0.25)' : 'rgba(245,158,11,0.25)'}`,
                borderRadius: 10,
                padding: '10px 16px',
                color: a.level === 'danger' ? 'var(--db-red)' : 'var(--db-amber)',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {a.level === 'danger' ? '⚠️ ' : '🔔 '}{a.messageAr}
            </div>
          ))}
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 20 }}>
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="db-kpi">
                <Skeleton height={46} width="46px" style={{ borderRadius: 13, marginBottom: 14 }} />
                <Skeleton height={13} width="60%" style={{ marginBottom: 8 }} />
                <Skeleton height={26} width="80%" />
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="db-kpi c-green">
              <div className="db-kpi-icon">💰</div>
              <div className="db-kpi-label">تحصيلات هذا الشهر</div>
              <div className="db-kpi-val"><PrivateAmount value={collections} /></div>
            </div>
            <div className="db-kpi c-red">
              <div className="db-kpi-icon">📤</div>
              <div className="db-kpi-label">مصروفات هذا الشهر</div>
              <div className="db-kpi-val"><PrivateAmount value={expenses} /></div>
            </div>
            <div className={`db-kpi ${outstanding > 0 ? 'c-amber' : 'c-blue'}`}>
              <div className="db-kpi-icon">⏳</div>
              <div className="db-kpi-label">إجمالي الذمم المدينة</div>
              <div className="db-kpi-val"><PrivateAmount value={outstanding} /></div>
            </div>
          </>
        )}
      </div>

      {/* Row 2: collection trend + top debtors */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
        {/* Collection trend chart */}
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>اتجاه التحصيلات</h3>
              <p>منذ بداية العام</p>
            </div>
          </div>
          <div className="db-card-body">
            <CollectionChart data={trend} loading={loading} />
          </div>
        </div>

        {/* Top debtors */}
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>كبار المدينين</h3>
              <p>أعلى 5 بالذمم القائمة</p>
            </div>
          </div>
          <div className="db-card-body">
            <DebtorList debtors={debtors} loading={loading} />
          </div>
        </div>
      </div>

      {/* Row 3: aging summary + contract profitability */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: 16 }}>
        {/* Aging summary */}
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>تحليل أعمار الديون</h3>
              <p>توزيع الذمم المدينة حسب التقادم</p>
            </div>
          </div>
          <div className="db-card-body">
            <AgingSummaryBars aging={aging} loading={loading} />
          </div>
        </div>

        {/* Contract profitability */}
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>ربحية العقود</h3>
              <p>أعلى وأدنى هامش ربح للعقود النشطة</p>
            </div>
          </div>
          <div className="db-card-body">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div><Skeleton height={13} width="120px" style={{ marginBottom: 4 }} /><Skeleton height={11} width="80px" /></div>
                    <Skeleton height={20} width="52px" />
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                <div>
                  <p style={{ color: 'var(--db-green)', fontSize: 12, fontWeight: 800, marginBottom: 10 }}>▲ الأعلى ربحية</p>
                  {topContracts.length === 0
                    ? <p style={{ color: 'var(--db-muted)', fontSize: 12 }}>—</p>
                    : topContracts.slice(0, 3).map((c) => <ContractProfitRow key={c.id} c={c} rank="top" />)
                  }
                </div>
                <div>
                  <p style={{ color: 'var(--db-red)', fontSize: 12, fontWeight: 800, marginBottom: 10 }}>▼ الأدنى ربحية</p>
                  {lowContracts.length === 0
                    ? <p style={{ color: 'var(--db-muted)', fontSize: 12 }}>—</p>
                    : lowContracts.slice(0, 3).map((c) => <ContractProfitRow key={c.id} c={c} rank="low" />)
                  }
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

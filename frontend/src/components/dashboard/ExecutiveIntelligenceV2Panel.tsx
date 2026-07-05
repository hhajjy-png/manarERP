import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { Skeleton } from './Skeleton';
import { money } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import { formatCurrency, formatPercent, formatCompact } from '../../lib/format';

// ── Types ──────────────────────────────────────────────────────────────────

interface IntelAlert {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  title: string;
  description: string;
  amount: number | null;
  relatedId: number;
  relatedType: string;
  actionLabel: string;
}

interface Forecast {
  expectedCollections30: number;
  expectedCollections60: number;
  expectedCollections90: number;
  cashRisk: 'LOW' | 'MEDIUM' | 'HIGH';
  next30DaysSummary: { expectedCollections: number; netThisMonth: number; cashRisk: 'LOW' | 'MEDIUM' | 'HIGH' };
}

interface TrendPoint {
  month: string;
  revenue: number;
  expenses: number;
  collections: number;
  profit: number;
}

interface KPIComparisons {
  revenueChangePct: number | null;
  expensesChangePct: number | null;
  collectionsChangePct: number | null;
  profitChangePct: number | null;
  thisMonth: { revenue: number; expenses: number; collections: number; profit: number };
  lastMonth: { revenue: number; expenses: number; collections: number; profit: number };
}

interface HealthEntry {
  contractId: number;
  code: string;
  asphaltPlant: string;
  customerName: string;
  score: number;
  status: 'HEALTHY' | 'WATCH' | 'RISK';
  profitMargin: number | null;
  collectionRate: number | null;
  outstanding: number;
  reason: string;
}

interface Recommendation {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  metric: string;
  actionHint: string;
}

export interface IntelV2Data {
  alerts: IntelAlert[];
  forecast: Forecast;
  monthlyTrends: TrendPoint[];
  kpiComparisons: KPIComparisons;
  contractHealth: {
    riskContracts: HealthEntry[];
    watchContracts: HealthEntry[];
    summary: { healthy: number; watch: number; risk: number; total: number };
  };
  recommendations: Recommendation[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function safeNum(v: number | null | undefined): number {
  if (v == null || !Number.isFinite(v)) return 0;
  return v;
}

const SEV_COLOR: Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#9CA3AF' };
const SEV_BG:    Record<string, string> = { HIGH: 'rgba(239,68,68,0.10)', MEDIUM: 'rgba(245,158,11,0.10)', LOW: 'rgba(156,163,175,0.10)' };
const SEV_LABEL: Record<string, string> = { HIGH: 'عالٍ', MEDIUM: 'متوسط', LOW: 'منخفض' };
const RISK_COLOR: Record<string, string> = { LOW: '#10B981', MEDIUM: '#F59E0B', HIGH: '#EF4444' };
const RISK_LABEL: Record<string, string> = { LOW: 'منخفض', MEDIUM: 'متوسط', HIGH: 'مرتفع' };
const HLTH_COLOR: Record<string, string> = { HEALTHY: '#10B981', WATCH: '#F59E0B', RISK: '#EF4444' };
const HLTH_LABEL: Record<string, string> = { HEALTHY: 'سليم', WATCH: 'مراقبة', RISK: 'خطر' };
const PRI_COLOR:  Record<string, string> = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#9CA3AF' };

function deltaBadge(pct: number | null, invert = false) {
  if (pct === null || !Number.isFinite(pct)) return <span style={{ color: '#6B7280', fontSize: 11 }}>—</span>;
  const positive = invert ? pct < 0 : pct > 0;
  const color = positive ? '#10B981' : '#EF4444';
  const arrow = pct > 0 ? '↑' : '↓';
  return (
    <span style={{ color, fontSize: 12, fontWeight: 800 }}>
      {arrow} {formatPercent(Math.abs(pct), 1)}
    </span>
  );
}

// ── Trend Chart ────────────────────────────────────────────────────────────

interface TrendTooltipProps {
  active?: boolean;
  payload?: { dataKey?: string; fill?: string; color?: string; value?: number }[];
  label?: string;
}

function TrendTooltip({ active, payload, label }: TrendTooltipProps) {
  if (!active || !payload?.length) return null;
  const labels: Record<string, string> = { revenue: 'الإيرادات', expenses: 'المصروفات', collections: 'التحصيلات', profit: 'الربح' };
  return (
    <div style={{
      background: 'rgba(15,23,40,0.94)', backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px',
      fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif',
      direction: 'rtl', minWidth: 190, boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
    }}>
      <p style={{ color: '#6B7280', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color ?? p.fill, flexShrink: 0 }} />
          <span style={{ color: '#F9FAFB', fontSize: 12, fontWeight: 700 }}>
            {labels[p.dataKey ?? ''] ?? p.dataKey}:{' '}
            <span style={{ color: p.color ?? p.fill }}>
              {formatCurrency(p.value ?? 0)}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  if (loading) return <Skeleton height={240} style={{ borderRadius: 12 }} />;
  const safe = data.map(d => ({
    month: d.month,
    revenue:     safeNum(d.revenue),
    expenses:    safeNum(d.expenses),
    collections: safeNum(d.collections),
    profit:      safeNum(d.profit),
  }));
  const hasData = safe.some(d => d.revenue > 0 || d.expenses > 0 || d.collections > 0);
  if (!hasData) return (
    <div className="db-empty"><div className="db-empty-icon">📊</div><div className="db-empty-text">لا بيانات للاتجاهات</div></div>
  );
  const legendLabels: Record<string, string> = { revenue: 'الإيرادات', expenses: 'المصروفات', collections: 'التحصيلات' };
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={safe} barCategoryGap="25%" barGap={2}>
          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
          <XAxis dataKey="month" tick={{ fill: '#9CA3AF', fontSize: 10, fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} width={62}
            tickFormatter={(v: number) => formatCompact(v)} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <Legend formatter={(value: string) => (
            <span style={{ color: '#9CA3AF', fontSize: 11, fontFamily: '"IBM Plex Sans Arabic","Cairo","Tajawal",Arial,sans-serif', fontWeight: 700 }}>
              {legendLabels[value] ?? value}
            </span>
          )} />
          <Bar dataKey="revenue"     fill="#10B981" radius={[4,4,0,0]} maxBarSize={22} />
          <Bar dataKey="expenses"    fill="#EF4444" radius={[4,4,0,0]} maxBarSize={22} />
          <Bar dataKey="collections" fill="#3B82F6" radius={[4,4,0,0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Section Skeletons ──────────────────────────────────────────────────────

function CardRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 12 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="db-kpi">
          <Skeleton height={13} width="60%" style={{ marginBottom: 10 }} />
          <Skeleton height={24} width="80%" style={{ marginBottom: 8 }} />
          <Skeleton height={13} width="50%" />
        </div>
      ))}
    </div>
  );
}

function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div><Skeleton height={13} width="140px" style={{ marginBottom: 6 }} /><Skeleton height={11} width="90px" /></div>
          <Skeleton height={20} width="60px" style={{ borderRadius: 20 }} />
        </div>
      ))}
    </div>
  );
}

// ── Alerts Section ─────────────────────────────────────────────────────────

function AlertsSection({ alerts, loading }: { alerts: IntelAlert[]; loading: boolean }) {
  if (loading) return <ListSkeleton rows={3} />;
  if (!alerts.length) return <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>لا تنبيهات حالية</p>;

  const grouped = {
    HIGH:   alerts.filter(a => a.severity === 'HIGH'),
    MEDIUM: alerts.filter(a => a.severity === 'MEDIUM'),
    LOW:    alerts.filter(a => a.severity === 'LOW'),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {(['HIGH', 'MEDIUM', 'LOW'] as const).flatMap(sev =>
        grouped[sev].map(a => (
          <div key={a.id} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            padding: '10px 14px', borderRadius: 10,
            background: SEV_BG[sev], border: `1px solid ${SEV_COLOR[sev]}30`,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{
                  background: SEV_COLOR[sev], color: '#fff', fontSize: 10, fontWeight: 800,
                  padding: '2px 7px', borderRadius: 20,
                }}>{SEV_LABEL[sev]}</span>
                <span style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 700 }}>{a.title}</span>
              </div>
              <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0 }}>{a.description}</p>
            </div>
            {a.amount !== null && (
              <span style={{ color: SEV_COLOR[sev], fontSize: 13, fontWeight: 800, flexShrink: 0, marginRight: 12 }}>
                <PrivateAmount value={a.amount} />
              </span>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── Forecast Section ───────────────────────────────────────────────────────

function ForecastSection({ forecast, loading }: { forecast: Forecast | null; loading: boolean }) {
  if (loading) return <CardRowSkeleton count={4} />;
  if (!forecast) return null;
  const riskColor = RISK_COLOR[forecast.cashRisk];
  const riskLabel = RISK_LABEL[forecast.cashRisk];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
      <div className="db-kpi c-green">
        <div className="db-kpi-icon">📅</div>
        <div className="db-kpi-label">متوقع خلال 30 يوم</div>
        <div className="db-kpi-val"><PrivateAmount value={forecast.expectedCollections30} /></div>
        <div className="db-kpi-sub">من الذمم الحديثة</div>
      </div>
      <div className="db-kpi c-amber">
        <div className="db-kpi-icon">⏳</div>
        <div className="db-kpi-label">متوقع 31–60 يوم</div>
        <div className="db-kpi-val"><PrivateAmount value={forecast.expectedCollections60} /></div>
        <div className="db-kpi-sub">ذمم متوسطة</div>
      </div>
      <div className="db-kpi c-red">
        <div className="db-kpi-icon">⚠️</div>
        <div className="db-kpi-label">متوقع 61–90 يوم</div>
        <div className="db-kpi-val"><PrivateAmount value={forecast.expectedCollections90} /></div>
        <div className="db-kpi-sub">ذمم متأخرة</div>
      </div>
      <div className="db-kpi" style={{ border: `1px solid ${riskColor}40` }}>
        <div className="db-kpi-icon">🛡️</div>
        <div className="db-kpi-label">مخاطر السيولة</div>
        <div className="db-kpi-val" style={{ color: riskColor, fontSize: 22 }}>{riskLabel}</div>
        <div className="db-kpi-sub">تقدير rule-based</div>
      </div>
    </div>
  );
}

// ── KPI Comparison Section ─────────────────────────────────────────────────

function KPIComparisonSection({ kpi, loading }: { kpi: KPIComparisons | null; loading: boolean }) {
  if (loading) return <CardRowSkeleton count={4} />;
  if (!kpi) return null;
  const items = [
    { label: 'الإيرادات', thisVal: kpi.thisMonth.revenue, pct: kpi.revenueChangePct, icon: '📈', invert: false },
    { label: 'المصروفات', thisVal: kpi.thisMonth.expenses, pct: kpi.expensesChangePct, icon: '📤', invert: true },
    { label: 'التحصيلات', thisVal: kpi.thisMonth.collections, pct: kpi.collectionsChangePct, icon: '💰', invert: false },
    { label: 'صافي الربح', thisVal: kpi.thisMonth.profit, pct: kpi.profitChangePct, icon: '📊', invert: false },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
      {items.map(item => (
        <div key={item.label} className="db-kpi">
          <div className="db-kpi-top">
            <div className="db-kpi-icon">{item.icon}</div>
            {deltaBadge(item.pct, item.invert)}
          </div>
          <div className="db-kpi-label">{item.label} — هذا الشهر</div>
          <div className="db-kpi-val" style={{ fontSize: 16 }}><PrivateAmount value={item.thisVal} /></div>
        </div>
      ))}
    </div>
  );
}

// ── Contract Health Section ────────────────────────────────────────────────

function HealthRow({ h }: { h: HealthEntry }) {
  const sc = HLTH_COLOR[h.status];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ color: sc, fontSize: 13, fontWeight: 800 }}>{h.code}</span>
          <span style={{ background: `${sc}20`, color: sc, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>
            {HLTH_LABEL[h.status]}
          </span>
        </div>
        <p style={{ color: '#9CA3AF', fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {h.reason}
        </p>
      </div>
      <div style={{ textAlign: 'left', flexShrink: 0, marginRight: 12 }}>
        <div style={{
          width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: `${sc}20`, border: `2px solid ${sc}`, fontSize: 12, fontWeight: 800, color: sc,
        }}>{h.score}</div>
      </div>
    </div>
  );
}

function ContractHealthSection({ health, loading }: { health: IntelV2Data['contractHealth'] | null; loading: boolean }) {
  if (loading) return <ListSkeleton rows={4} />;
  if (!health || health.summary.total === 0) return <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>لا عقود نشطة</p>;

  const { summary, riskContracts, watchContracts } = health;
  return (
    <div>
      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: `سليم (${summary.healthy})`, color: '#10B981' },
          { label: `مراقبة (${summary.watch})`, color: '#F59E0B' },
          { label: `خطر (${summary.risk})`, color: '#EF4444' },
        ].map(chip => (
          <span key={chip.label} style={{ background: `${chip.color}20`, color: chip.color, fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 20 }}>
            {chip.label}
          </span>
        ))}
      </div>
      {riskContracts.length > 0 && (
        <div>
          <p style={{ color: '#EF4444', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>▼ عقود في خطر</p>
          {riskContracts.map(h => <HealthRow key={h.contractId} h={h} />)}
        </div>
      )}
      {watchContracts.length > 0 && (
        <div style={{ marginTop: riskContracts.length > 0 ? 16 : 0 }}>
          <p style={{ color: '#F59E0B', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>● عقود تحت المراقبة</p>
          {watchContracts.slice(0, 3).map(h => <HealthRow key={h.contractId} h={h} />)}
        </div>
      )}
    </div>
  );
}

// ── Recommendations Section ────────────────────────────────────────────────

function RecommendationsSection({ recs, loading }: { recs: Recommendation[]; loading: boolean }) {
  if (loading) return <ListSkeleton rows={4} />;
  if (!recs.length) return <p style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>لا توصيات حالياً</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {recs.map(r => (
        <div key={r.id} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '12px 16px',
          borderRight: `3px solid ${PRI_COLOR[r.priority]}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <span style={{ color: '#F9FAFB', fontSize: 13, fontWeight: 800 }}>{r.title}</span>
            <span style={{ background: `${PRI_COLOR[r.priority]}20`, color: PRI_COLOR[r.priority], fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, flexShrink: 0, marginRight: 8 }}>
              {r.priority === 'HIGH' ? 'عالي' : r.priority === 'MEDIUM' ? 'متوسط' : 'منخفض'}
            </span>
          </div>
          <p style={{ color: '#9CA3AF', fontSize: 12, margin: '0 0 6px' }}>{r.message}</p>
          <p style={{ color: '#60A5FA', fontSize: 11, margin: 0 }}>💡 {r.actionHint}</p>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props { data: IntelV2Data | null; loading: boolean; }

export default function ExecutiveIntelligenceV2Panel({ data, loading }: Props) {
  if (!data && !loading) return null;

  const highAlerts = (data?.alerts ?? []).filter(a => a.severity === 'HIGH').length;

  return (
    <div style={{ marginTop: 40 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ color: '#F9FAFB', fontSize: 18, fontWeight: 800, margin: 0 }}>
          الذكاء التنفيذي
        </h2>
        {highAlerts > 0 && !loading && (
          <span className="db-pill red">{highAlerts} تنبيه عالٍ</span>
        )}
      </div>

      {/* Row 1: Alerts + Recommendations side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
        <div className="db-card">
          <div className="db-card-head"><div><h3>التنبيهات التنفيذية</h3><p>مخاطر تحتاج متابعة</p></div></div>
          <div className="db-card-body scrollable">
            <AlertsSection alerts={data?.alerts ?? []} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head"><div><h3>التوصيات الذكية</h3><p>إجراءات مقترحة</p></div></div>
          <div className="db-card-body scrollable">
            <RecommendationsSection recs={data?.recommendations ?? []} loading={loading} />
          </div>
        </div>
      </div>

      {/* Row 2: Forecast */}
      <div className="db-card" style={{ marginBottom: 16 }}>
        <div className="db-card-head"><div><h3>التوقعات المالية</h3><p>تقدير قاعدي — 30/60/90 يوم</p></div></div>
        <div className="db-card-body">
          <ForecastSection forecast={data?.forecast ?? null} loading={loading} />
        </div>
      </div>

      {/* Row 3: KPI Comparisons */}
      <div className="db-card" style={{ marginBottom: 16 }}>
        <div className="db-card-head"><div><h3>مقارنة KPI</h3><p>هذا الشهر مقابل الشهر السابق</p></div></div>
        <div className="db-card-body">
          <KPIComparisonSection kpi={data?.kpiComparisons ?? null} loading={loading} />
        </div>
      </div>

      {/* Row 4: Trends + Contract Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <div className="db-card">
          <div className="db-card-head"><div><h3>الاتجاهات الشهرية</h3><p>إيرادات، مصروفات، تحصيلات — آخر 6 أشهر</p></div></div>
          <div className="db-card-body">
            <TrendChart data={data?.monthlyTrends ?? []} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head"><div><h3>صحة العقود</h3><p>تقييم rule-based للعقود النشطة</p></div></div>
          <div className="db-card-body scrollable">
            <ContractHealthSection health={data?.contractHealth ?? null} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}

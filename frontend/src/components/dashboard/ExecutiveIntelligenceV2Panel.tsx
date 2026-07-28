import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { CHART_INITIAL_DIMENSION } from '../../lib/rechartsDefaults';
import { Skeleton } from './Skeleton';
import { money, TextWithMoney, MoneyText } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import { formatCurrency, formatPercent, formatCompact } from '../../lib/format';
import { formatMonthShort, formatMonthLabel } from '../../lib/date';
import { getRecommendationBody, type RecommendationV2 } from './command/types';
import { useT } from '../../lib/i18n';
import { CHART_FONT_STACK } from '../../styles/fontRegistry';

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

/**
 * كان هنا نوع محلّي مكرَّر يُعلن `message` و`actionHint` **إلزاميين** — وهما غير
 * موجودين في الاستجابة، تمامًا كما في `RecommendationV2`. نستعمل النوع المشترك بدل
 * الاحتفاظ بنسختين تكذبان الكذبة نفسها.
 */
type Recommendation = RecommendationV2;

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

const SEV_COLOR: Record<string, string> = { HIGH: 'var(--db-red)', MEDIUM: 'var(--db-amber)', LOW: 'var(--db-muted)' };
const SEV_BG:    Record<string, string> = { HIGH: 'rgba(239,68,68,0.10)', MEDIUM: 'rgba(245,158,11,0.10)', LOW: 'rgba(156,163,175,0.10)' };
const SEV_LABEL_KEY: Record<string, string> = { HIGH: 'intelv2.sev.high', MEDIUM: 'intelv2.sev.medium', LOW: 'intelv2.sev.low' };
const RISK_COLOR: Record<string, string> = { LOW: 'var(--db-green)', MEDIUM: 'var(--db-amber)', HIGH: 'var(--db-red)' };
const RISK_LABEL_KEY: Record<string, string> = { LOW: 'intelv2.sev.low', MEDIUM: 'intelv2.sev.medium', HIGH: 'intelv2.risk.high' };
const HLTH_COLOR: Record<string, string> = { HEALTHY: 'var(--db-green)', WATCH: 'var(--db-amber)', RISK: 'var(--db-red)' };
const HLTH_LABEL_KEY: Record<string, string> = { HEALTHY: 'intelv2.health.healthy', WATCH: 'intelv2.health.watch', RISK: 'intelv2.health.risk' };
const PRI_COLOR:  Record<string, string> = { HIGH: 'var(--db-red)', MEDIUM: 'var(--db-amber)', LOW: 'var(--db-muted)' };

function deltaBadge(pct: number | null, invert = false) {
  if (pct === null || !Number.isFinite(pct)) return <span style={{ color: 'var(--db-muted)', fontSize: 11 }}>—</span>;
  const positive = invert ? pct < 0 : pct > 0;
  const color = positive ? 'var(--db-green)' : 'var(--db-red)';
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
  const { t } = useT();
  if (!active || !payload?.length) return null;
  const labels: Record<string, string> = { revenue: t('today.revenue'), expenses: t('today.expenses'), collections: t('today.collections'), profit: t('finops.col.profit') };
  return (
    <div style={{
      background: 'var(--db-card)', backdropFilter: 'blur(14px)',
      border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '12px 16px',
      fontFamily: CHART_FONT_STACK,
      direction: 'rtl', minWidth: 190, boxShadow: '0 8px 32px rgba(0,0,0,0.65)',
    }}>
      <p style={{ color: 'var(--db-muted)', fontSize: 11, fontWeight: 700, marginBottom: 10 }}>{formatMonthLabel(label)}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color ?? p.fill, flexShrink: 0 }} />
          <span style={{ color: 'var(--db-text)', fontSize: 12, fontWeight: 700 }}>
            {labels[p.dataKey ?? ''] ?? p.dataKey}:{' '}
            <span style={{ color: p.color ?? p.fill }}>
              {<MoneyText value={p.value ?? 0} />}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function TrendChart({ data, loading }: { data: TrendPoint[]; loading: boolean }) {
  const { t } = useT();
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
    <div className="db-empty"><div className="db-empty-icon">📊</div><div className="db-empty-text">{t('intelv2.empty.trends')}</div></div>
  );
  const legendLabels: Record<string, string> = { revenue: t('today.revenue'), expenses: t('today.expenses'), collections: t('today.collections') };
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={CHART_INITIAL_DIMENSION}>
        <BarChart data={safe} barCategoryGap="25%" barGap={2}>
          <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.18)" />
          <XAxis dataKey="month" tickFormatter={formatMonthShort} minTickGap={4} tick={{ fill: 'var(--db-muted)', fontSize: 10, fontFamily: CHART_FONT_STACK }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: 'var(--db-muted)', fontSize: 10 }} axisLine={false} tickLine={false} width={62}
            tickFormatter={(v: number) => formatCompact(v)} />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(148,163,184,0.12)' }} />
          <Legend formatter={(value: string) => (
            <span style={{ color: 'var(--db-muted)', fontSize: 11, fontFamily: CHART_FONT_STACK, fontWeight: 700 }}>
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
  const { t } = useT();
  if (loading) return <ListSkeleton rows={3} />;
  if (!alerts.length) return <p style={{ color: 'var(--db-muted)', fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>{t('intelv2.empty.alerts')}</p>;

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
            background: SEV_BG[sev], border: `1px solid color-mix(in srgb, ${SEV_COLOR[sev]} 19%, transparent)`,
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{
                  background: SEV_COLOR[sev], color: '#fff', fontSize: 10, fontWeight: 800,
                  padding: '2px 7px', borderRadius: 20,
                }}>{t(SEV_LABEL_KEY[sev])}</span>
                <span style={{ color: 'var(--db-text)', fontSize: 13, fontWeight: 700 }}>{a.title}</span>
              </div>
              <p style={{ color: 'var(--db-muted)', fontSize: 11, margin: 0 }}>{a.description}</p>
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
  const { t } = useT();
  if (loading) return <CardRowSkeleton count={4} />;
  // تعذّر الحساب (لم تصل بيانات التوقّع) — حالة صريحة بدل بطاقة فارغة.
  if (!forecast) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">🔮</div>
        <div className="db-empty-text">{t('intelv2.err.forecast_failed')}</div>
      </div>
    );
  }
  // لا ذمم مستحقة ضمن نطاق التوقّع — حالة «لا بيانات» متميّزة عن تعذّر الحساب.
  const totalExpected =
    forecast.expectedCollections30 + forecast.expectedCollections60 + forecast.expectedCollections90;
  if (totalExpected <= 0) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📭</div>
        <div className="db-empty-text">{t('intelv2.empty.forecast')}</div>
      </div>
    );
  }
  const riskColor = RISK_COLOR[forecast.cashRisk];
  const riskLabel = t(RISK_LABEL_KEY[forecast.cashRisk]);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 14 }}>
      <div className="db-kpi c-green">
        <div className="db-kpi-icon">📅</div>
        <div className="db-kpi-label">{t('intelv2.forecast.expected_30')}</div>
        <div className="db-kpi-val"><PrivateAmount value={forecast.expectedCollections30} /></div>
        <div className="db-kpi-sub">{t('intelv2.forecast.overdue_plus_soon')}</div>
      </div>
      <div className="db-kpi c-amber">
        <div className="db-kpi-icon">⏳</div>
        <div className="db-kpi-label">{t('intelv2.forecast.expected_31_60')}</div>
        <div className="db-kpi-val"><PrivateAmount value={forecast.expectedCollections60} /></div>
        <div className="db-kpi-sub">{t('intelv2.forecast.due_31_60')}</div>
      </div>
      <div className="db-kpi c-red">
        <div className="db-kpi-icon">⚠️</div>
        <div className="db-kpi-label">{t('intelv2.forecast.expected_61_90')}</div>
        <div className="db-kpi-val"><PrivateAmount value={forecast.expectedCollections90} /></div>
        <div className="db-kpi-sub">{t('intelv2.forecast.due_61_90')}</div>
      </div>
      <div className="db-kpi" style={{ border: `1px solid color-mix(in srgb, ${riskColor} 25%, transparent)` }}>
        <div className="db-kpi-icon">🛡️</div>
        <div className="db-kpi-label">{t('intelv2.forecast.liquidity_risk')}</div>
        <div className="db-kpi-val" style={{ color: riskColor, fontSize: 22 }}>{riskLabel}</div>
        <div className="db-kpi-sub">{t('intelv2.forecast.rule_based_estimate')}</div>
      </div>
    </div>
  );
}

// ── KPI Comparison Section ─────────────────────────────────────────────────

function KPIComparisonSection({ kpi, loading }: { kpi: KPIComparisons | null; loading: boolean }) {
  const { t } = useT();
  if (loading) return <CardRowSkeleton count={4} />;
  if (!kpi) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">📊</div>
        <div className="db-empty-text">{t('intelv2.empty.kpi_comparisons')}</div>
      </div>
    );
  }
  const items = [
    { label: t('today.revenue'), thisVal: kpi.thisMonth.revenue, pct: kpi.revenueChangePct, icon: '📈', invert: false },
    { label: t('today.expenses'), thisVal: kpi.thisMonth.expenses, pct: kpi.expensesChangePct, icon: '📤', invert: true },
    { label: t('today.collections'), thisVal: kpi.thisMonth.collections, pct: kpi.collectionsChangePct, icon: '💰', invert: false },
    { label: t('kpi.net_profit'), thisVal: kpi.thisMonth.profit, pct: kpi.profitChangePct, icon: '📊', invert: false },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
      {items.map(item => (
        <div key={item.label} className="db-kpi">
          <div className="db-kpi-top">
            <div className="db-kpi-icon">{item.icon}</div>
            {deltaBadge(item.pct, item.invert)}
          </div>
          <div className="db-kpi-label">{item.label} {t('intelv2.this_month_suffix')}</div>
          <div className="db-kpi-val" style={{ fontSize: 16 }}><PrivateAmount value={item.thisVal} /></div>
        </div>
      ))}
    </div>
  );
}

// ── Contract Health Section ────────────────────────────────────────────────

function HealthRow({ h }: { h: HealthEntry }) {
  const { t } = useT();
  const sc = HLTH_COLOR[h.status];
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
          <span style={{ color: sc, fontSize: 13, fontWeight: 800 }}>{h.code}</span>
          <span style={{ background: `${sc}20`, color: sc, fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 20 }}>
            {t(HLTH_LABEL_KEY[h.status])}
          </span>
        </div>
        <p style={{ color: 'var(--db-muted)', fontSize: 11, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
  const { t } = useT();
  if (loading) return <ListSkeleton rows={4} />;
  if (!health || health.summary.total === 0) return <p style={{ color: 'var(--db-muted)', fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>{t('intelv2.empty.contracts')}</p>;

  const { summary, riskContracts, watchContracts } = health;
  return (
    <div>
      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          { label: `${t('intelv2.health.healthy')} (${summary.healthy})`, color: 'var(--db-green)' },
          { label: `${t('intelv2.health.watch')} (${summary.watch})`, color: 'var(--db-amber)' },
          { label: `${t('intelv2.health.risk')} (${summary.risk})`, color: 'var(--db-red)' },
        ].map(chip => (
          <span key={chip.label} style={{ background: `color-mix(in srgb, ${chip.color} 14%, transparent)`, color: chip.color, fontSize: 12, fontWeight: 800, padding: '4px 12px', borderRadius: 20 }}>
            {chip.label}
          </span>
        ))}
      </div>
      {riskContracts.length > 0 && (
        <div>
          <p style={{ color: 'var(--db-red)', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>▼ {t('intelv2.contracts_at_risk')}</p>
          {riskContracts.map(h => <HealthRow key={h.contractId} h={h} />)}
        </div>
      )}
      {watchContracts.length > 0 && (
        <div style={{ marginTop: riskContracts.length > 0 ? 16 : 0 }}>
          <p style={{ color: 'var(--db-amber)', fontSize: 12, fontWeight: 800, marginBottom: 8 }}>● {t('intelv2.contracts_watch')}</p>
          {watchContracts.slice(0, 3).map(h => <HealthRow key={h.contractId} h={h} />)}
        </div>
      )}
    </div>
  );
}

// ── Recommendations Section ────────────────────────────────────────────────

function RecommendationsSection({ recs, loading }: { recs: Recommendation[]; loading: boolean }) {
  const { t } = useT();
  if (loading) return <ListSkeleton rows={4} />;
  if (!recs.length) return <p style={{ color: 'var(--db-muted)', fontSize: 13, textAlign: 'center', margin: '16px 0 0' }}>{t('intelv2.empty.recommendations')}</p>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {recs.map(r => (
        <div key={r.id} style={{
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12, padding: '12px 16px',
          borderRight: `3px solid ${PRI_COLOR[r.priority]}`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
            <span style={{ color: 'var(--db-text)', fontSize: 13, fontWeight: 800 }}>{r.title}</span>
            <span style={{ background: `${PRI_COLOR[r.priority]}20`, color: PRI_COLOR[r.priority], fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20, flexShrink: 0, marginRight: 8 }}>
              {r.priority === 'HIGH' ? t('intelv2.priority.high') : r.priority === 'MEDIUM' ? t('intelv2.sev.medium') : t('intelv2.sev.low')}
            </span>
          </div>
          <p style={{ color: 'var(--db-muted)', fontSize: 12, margin: '0 0 6px' }}><TextWithMoney text={getRecommendationBody(r)} /></p>
          {r.actionHint && <p style={{ color: 'var(--db-blue)', fontSize: 11, margin: 0 }}>💡 {r.actionHint}</p>}
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

interface Props { data: IntelV2Data | null; loading: boolean; }

export default function ExecutiveIntelligenceV2Panel({ data, loading }: Props) {
  const { t } = useT();
  if (!data && !loading) return null;

  const highAlerts = (data?.alerts ?? []).filter(a => a.severity === 'HIGH').length;

  return (
    <div style={{ marginTop: 40 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ color: 'var(--db-text)', fontSize: 18, fontWeight: 800, margin: 0 }}>
          {t('intelv2.title')}
        </h2>
        {highAlerts > 0 && !loading && (
          <span className="db-pill red">{t('intelv2.high_alerts_count', { count: highAlerts })}</span>
        )}
      </div>

      {/* Row 1: Alerts + Recommendations side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16, marginBottom: 16 }}>
        <div className="db-card">
          <div className="db-card-head"><div><h3>{t('intelv2.section.alerts_title')}</h3><p>{t('intelv2.section.alerts_sub')}</p></div></div>
          <div className="db-card-body scrollable">
            <AlertsSection alerts={data?.alerts ?? []} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head"><div><h3>{t('section.smart_recommendations')}</h3><p>{t('intelv2.section.recommendations_sub')}</p></div></div>
          <div className="db-card-body scrollable">
            <RecommendationsSection recs={data?.recommendations ?? []} loading={loading} />
          </div>
        </div>
      </div>

      {/* Row 2: Forecast */}
      <div className="db-card" style={{ marginBottom: 16 }}>
        <div className="db-card-head"><div><h3>{t('intelv2.section.forecast_title')}</h3><p>{t('intelv2.section.forecast_sub')}</p></div></div>
        <div className="db-card-body">
          <ForecastSection forecast={data?.forecast ?? null} loading={loading} />
        </div>
      </div>

      {/* Row 3: KPI Comparisons */}
      <div className="db-card" style={{ marginBottom: 16 }}>
        <div className="db-card-head"><div><h3>{t('intelv2.section.kpi_compare_title')}</h3><p>{t('intelv2.section.kpi_compare_sub')}</p></div></div>
        <div className="db-card-body">
          <KPIComparisonSection kpi={data?.kpiComparisons ?? null} loading={loading} />
        </div>
      </div>

      {/* Row 4: Trends + Contract Health */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 16 }}>
        <div className="db-card">
          <div className="db-card-head"><div><h3>{t('intelv2.section.trends_title')}</h3><p>{t('intelv2.section.trends_sub')}</p></div></div>
          <div className="db-card-body">
            <TrendChart data={data?.monthlyTrends ?? []} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head"><div><h3>{t('intelv2.section.contract_health_title')}</h3><p>{t('intelv2.section.contract_health_sub')}</p></div></div>
          <div className="db-card-body scrollable">
            <ContractHealthSection health={data?.contractHealth ?? null} loading={loading} />
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import CurrentStatusBadge from '../components/period/CurrentStatusBadge';
import { periodToRangeParams } from '../lib/financialPeriod';
import { formatCurrency, formatPercent } from '../lib/format';
import { Skeleton } from '../components/dashboard/Skeleton';
import CompanyHealthScore from '../components/dashboard/CompanyHealthScore';
import ExecutiveDecisionCards, { DecisionCard } from '../components/dashboard/ExecutiveDecisionCards';
import ExecutiveAlertsV3, { AlertV3 } from '../components/dashboard/ExecutiveAlertsV3';
import ExecutiveRecommendationsPanel, { RecommendationV2 } from '../components/dashboard/ExecutiveRecommendationsPanel';
import KPITimeline from '../components/dashboard/KPITimeline';
import '../components/dashboard/dashboard.css';
import { generateExportFileName, ReportName } from '../utils/exportFilename';

// ── Types ──────────────────────────────────────────────────────────────────

interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalCollected: number;
  totalOutstanding: number;
  overallProfitMargin: number | null;
  overallCollectionRate: number | null;
  thisMonth: { revenue: number; expenses: number; collections: number; profit: number };
  lastMonth: { revenue: number; expenses: number; collections: number; profit: number };
  monthOnMonthChanges: { revenue: number | null; expenses: number | null; collections: number | null; profit: number | null };
  topDebtors: { customerId: number; name: string; outstanding: number; oldestDays: number }[];
  topCustomersByRevenue: { customerId: number; name: string; revenue: number; collected: number }[];
  topContractsByProfit: { id: number; code: string; asphaltPlant: string; revenue: number; expenses: number; profit: number; profitMargin: number | null; collectionRate: number | null }[];
  activeContracts: number;
  totalContracts: number;
}

interface HealthScoreData {
  total: number;
  label: 'EXCELLENT' | 'GOOD' | 'WATCH' | 'RISK';
  labelAr: string;
  explanation: string;
  components: { collections: number; profitability: number; outstanding: number; cashFlow: number; contracts: number; stability: number };
}

interface DecisionCenterData {
  financialSummary: FinancialSummary;
  decisionCards: DecisionCard[];
  alertsV3: AlertV3[];
  healthScore: HealthScoreData;
  recommendations: RecommendationV2[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return formatPercent(v, 1);
}

function changeBadge(v: number | null, invertColor = false) {
  if (v == null || !Number.isFinite(v)) return null;
  const up = v >= 0;
  const color = (up !== invertColor) ? '#10B981' : '#EF4444';
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color, marginRight: 6 }}>
      {up ? '↑' : '↓'} {formatPercent(Math.abs(v), 1)}
    </span>
  );
}

// ── Financial Summary Panel ────────────────────────────────────────────────

function FinancialSummaryPanel({ data }: { data: FinancialSummary }) {
  const kpis = [
    { label: 'إجمالي الإيرادات',  value: formatCurrency(data.totalRevenue),   color: '#3B82F6', icon: '💰', change: data.monthOnMonthChanges.revenue, invertColor: false },
    { label: 'إجمالي المصروفات',  value: formatCurrency(data.totalExpenses),  color: '#EF4444', icon: '💸', change: data.monthOnMonthChanges.expenses, invertColor: true },
    { label: 'صافي الربح',         value: formatCurrency(data.netProfit),      color: data.netProfit >= 0 ? '#10B981' : '#EF4444', icon: '📊', change: data.monthOnMonthChanges.profit, invertColor: false },
    { label: 'إجمالي التحصيلات',  value: formatCurrency(data.totalCollected), color: '#10B981', icon: '✅', change: data.monthOnMonthChanges.collections, invertColor: false },
    { label: 'الذمم المستحقة',    value: formatCurrency(data.totalOutstanding), color: '#F59E0B', icon: '⏳', change: null, invertColor: true },
    { label: 'هامش الربح',        value: pct(data.overallProfitMargin), color: '#A855F7', icon: '📈', change: null, invertColor: false },
    { label: 'معدل التحصيل',      value: pct(data.overallCollectionRate), color: '#06B6D4', icon: '🎯', change: null, invertColor: false },
    { label: 'العقود النشطة',      value: `${data.activeContracts} / ${data.totalContracts}`, color: '#F97316', icon: '📄', change: null, invertColor: false, currentStatus: true },
  ];

  return (
    <div>
      <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>
        📋 الملخص المالي التنفيذي
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
        {kpis.map(k => (
          <div key={k.label} style={{
            background: 'var(--db-card)', borderRadius: 'var(--db-radius)',
            padding: '14px 16px', border: `1px solid ${k.color}33`,
            borderBottom: `3px solid ${k.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 16 }}>{k.icon}</span>
              <span style={{ fontSize: 11, color: 'var(--db-muted)' }}>{k.label}</span>
              {'currentStatus' in k && k.currentStatus && <CurrentStatusBadge />}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: k.color, fontFamily: 'monospace' }}>{k.value}</span>
              {changeBadge(k.change, k.invertColor)}
            </div>
          </div>
        ))}
      </div>

      {/* Two-column: this month vs last month — حالة حالية لا تتبع الفترة المختارة */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--db-muted)' }}>المقارنة الشهرية</span>
        <CurrentStatusBadge />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'هذا الشهر', d: data.thisMonth, color: '#3B82F6' },
          { label: 'الشهر الماضي', d: data.lastMonth, color: '#9CA3AF' },
        ].map(({ label, d, color }) => (
          <div key={label} style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '14px 16px', border: '1px solid var(--db-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 10 }}>{label}</div>
            {[
              { l: 'إيرادات', v: d.revenue }, { l: 'مصروفات', v: d.expenses },
              { l: 'تحصيلات', v: d.collections }, { l: 'ربح', v: d.profit },
            ].map(({ l, v }) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
                <span style={{ color: 'var(--db-muted)' }}>{l}</span>
                <span style={{ color: v < 0 ? '#EF4444' : 'var(--db-text)', fontWeight: 600 }}>{formatCurrency(v)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Top debtors + top customers side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '14px 16px', border: '1px solid var(--db-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#F59E0B', marginBottom: 10 }}>كبار المدينين</div>
          {data.topDebtors.length === 0 && <div style={{ color: 'var(--db-muted)', fontSize: 12 }}>لا يوجد</div>}
          {data.topDebtors.map(d => (
            <div key={d.customerId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: 'var(--db-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{d.name}</span>
              <span style={{ color: '#F59E0B', fontWeight: 700 }}>{formatCurrency(d.outstanding)}</span>
            </div>
          ))}
        </div>
        <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '14px 16px', border: '1px solid var(--db-border)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#10B981', marginBottom: 10 }}>أعلى عقود ربحاً</div>
          {data.topContractsByProfit.length === 0 && <div style={{ color: 'var(--db-muted)', fontSize: 12 }}>لا يوجد</div>}
          {data.topContractsByProfit.map(c => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 12 }}>
              <span style={{ color: 'var(--db-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '55%' }}>{c.code} — {c.asphaltPlant}</span>
              <span style={{ color: c.profit >= 0 ? '#10B981' : '#EF4444', fontWeight: 700 }}>{formatCurrency(c.profit)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────

export default function ExecutiveDecisionCenter() {
  const { period } = useFinancialPeriod();
  const [data, setData]       = useState<DecisionCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfMsg, setPdfMsg]   = useState('');
  const [pdfErr, setPdfErr]   = useState('');
  const [activeTab, setActiveTab] = useState<'summary' | 'cards' | 'alerts' | 'timeline' | 'health' | 'recommendations'>('summary');

  useEffect(() => {
    setLoading(true);
    // مؤشرات الحركة والذمم اللحظية تتبع الفترة؛ الحالة الحالية (هذا/الشهر الماضي،
    // النشاط، العقود النشطة) تبقى كما هي من الـ backend. عند 'all' تُحذف الحدود.
    const params = periodToRangeParams(period);
    api.get<{ success: boolean; data: DecisionCenterData }>('/executive/decision-center', {
      params: { fromDate: params.fromDate, toDate: params.toDate },
    })
      .then(r => setData(r.data.data))
      .catch(() => setError('تعذّر تحميل بيانات مركز القرار'))
      .finally(() => setLoading(false));
  }, [period.fromDate, period.toDate, period.isAllPeriods]);

  async function handleExportPdf() {
    if (!window.manar?.exportPdf) { setPdfErr('تصدير PDF غير متاح في هذه البيئة'); return; }
    setPdfBusy(true); setPdfMsg(''); setPdfErr('');
    try {
      const name = generateExportFileName({ reportName: ReportName.ExecutiveReport, identifier: 'Dashboard', extension: 'pdf' });
      const result = await window.manar.exportPdf(name);
      if (result?.canceled) { return; }
      if (result?.success && result.path) {
        setPdfMsg(`تم الحفظ: ${result.path}`);
        setTimeout(() => setPdfMsg(''), 6000);
      } else {
        setPdfErr(result?.error ?? 'فشل تصدير PDF');
      }
    } catch (e) {
      setPdfErr(e instanceof Error ? e.message : 'فشل تصدير PDF');
    } finally {
      setPdfBusy(false);
    }
  }

  const tabs: { key: typeof activeTab; label: string; icon: string }[] = [
    { key: 'summary',         label: 'الملخص المالي',  icon: '📋' },
    { key: 'cards',           label: 'بطاقات القرار',  icon: '🃏' },
    { key: 'alerts',          label: 'التنبيهات',       icon: '🔔' },
    { key: 'timeline',        label: 'المؤشرات الزمنية', icon: '📊' },
    { key: 'health',          label: 'صحة الشركة',     icon: '🏥' },
    { key: 'recommendations', label: 'التوصيات',        icon: '💡' },
  ];

  const highAlerts = data?.alertsV3.filter(a => a.severity === 'HIGH').length ?? 0;

  return (
    <div className="db-page">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="db-header no-print">
        <div>
          <h2>🎯 مركز القرار التنفيذي</h2>
          <div className="db-header-sub">تحليل شامل — بيانات في الوقت الفعلي</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <PeriodControl />
          {highAlerts > 0 && (
            <span style={{ background: 'rgba(239,68,68,0.15)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 20, padding: '4px 14px', fontSize: 12, fontWeight: 700 }}>
              ⚠️ {highAlerts} تنبيهات عالية
            </span>
          )}
          <button
            onClick={handleExportPdf}
            disabled={pdfBusy || loading}
            style={{
              background: pdfBusy ? 'rgba(96,165,250,0.2)' : 'rgba(96,165,250,0.15)',
              color: '#60A5FA', border: '1px solid rgba(96,165,250,0.3)',
              borderRadius: 8, padding: '7px 16px', cursor: pdfBusy ? 'not-allowed' : 'pointer',
              fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            {pdfBusy ? '⏳ جارٍ التصدير…' : '⬇️ تصدير PDF'}
          </button>
        </div>
      </div>

      {pdfMsg && <div style={{ background: 'rgba(16,185,129,0.12)', color: '#10B981', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '8px 16px', marginBottom: 14, fontSize: 13 }} className="no-print">{pdfMsg}</div>}
      {pdfErr && <div style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, padding: '8px 16px', marginBottom: 14, fontSize: 13 }} className="no-print">{pdfErr}</div>}

      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={80} />)}
          </div>
          <Skeleton height={320} />
          <Skeleton height={240} />
        </div>
      )}

      {error && (
        <div style={{ textAlign: 'center', color: '#EF4444', padding: '60px 0', fontSize: 15 }}>
          ⚠️ {error}
        </div>
      )}

      {!loading && !error && data && (
        <>
          {/* ── Tab navigation ────────────────────────────────────────────── */}
          <div className="no-print" style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                style={{
                  padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: activeTab === t.key ? 'var(--accent)' : 'var(--db-card)',
                  color: activeTab === t.key ? '#fff' : 'var(--db-muted)',
                  border: activeTab === t.key ? '1px solid var(--accent)' : '1px solid var(--db-border)',
                  transition: 'all 0.2s',
                }}
              >{t.icon} {t.label}</button>
            ))}
          </div>

          {/* ── Tab content ───────────────────────────────────────────────── */}
          {activeTab === 'summary' && (
            <FinancialSummaryPanel data={data.financialSummary} />
          )}

          {activeTab === 'cards' && (
            <ExecutiveDecisionCards cards={data.decisionCards} />
          )}

          {activeTab === 'alerts' && (
            <>
              <div style={{ marginBottom: 10 }}><CurrentStatusBadge label="حالة حالية · لا تتبع الفترة المختارة" /></div>
              <ExecutiveAlertsV3 alerts={data.alertsV3} />
            </>
          )}

          {activeTab === 'timeline' && (
            <>
              <div style={{ marginBottom: 10 }}><CurrentStatusBadge label="حالة حالية · لا تتبع الفترة المختارة" /></div>
              <KPITimeline />
            </>
          )}

          {activeTab === 'health' && (
            <div style={{ maxWidth: 500 }}>
              <div style={{ marginBottom: 10 }}><CurrentStatusBadge label="حالة حالية · لا تتبع الفترة المختارة" /></div>
              <CompanyHealthScore data={data.healthScore} />
            </div>
          )}

          {activeTab === 'recommendations' && (
            <>
              <div style={{ marginBottom: 10 }}><CurrentStatusBadge label="حالة حالية · لا تتبع الفترة المختارة" /></div>
              <ExecutiveRecommendationsPanel recommendations={data.recommendations} />
            </>
          )}

          {/* ── Print view: all sections visible for PDF ──────────────────── */}
          <div className="print-only" style={{ display: 'none' }}>
            <FinancialSummaryPanel data={data.financialSummary} />
            <div style={{ marginTop: 24 }}><ExecutiveDecisionCards cards={data.decisionCards} /></div>
            <div style={{ marginTop: 24 }}><ExecutiveAlertsV3 alerts={data.alertsV3} /></div>
            <div style={{ marginTop: 24, maxWidth: 500 }}><CompanyHealthScore data={data.healthScore} /></div>
            <div style={{ marginTop: 24 }}><ExecutiveRecommendationsPanel recommendations={data.recommendations} /></div>
          </div>
        </>
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .db-page { margin: 0 !important; padding: 16px !important; background: #fff !important; color: #111 !important; }
        }
        @media screen {
          .print-only { display: none !important; }
        }
      `}</style>
    </div>
  );
}

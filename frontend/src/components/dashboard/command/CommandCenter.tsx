import SectionCard from './SectionCard';
import HealthGaugeSection from './HealthGaugeSection';
import KpiRowSection from './KpiRowSection';
import PerformanceChartSection, { type TrendPoint } from './PerformanceChartSection';
import RevenueDistributionSection from './RevenueDistributionSection';
import ActionCenterSection from './ActionCenterSection';
import QuickActionsSection from './QuickActionsSection';
import RecentActivityFeed from './RecentActivityFeed';
import RecommendationsSection from './RecommendationsSection';
import type { ActivityRow, DashboardSection, DecisionCenterData, RevenueSlice } from './types';

export interface CommandData {
  decisionCenter: DecisionCenterData | null;
  activity: ActivityRow[];
  cashFlowThisMonth: number | null;
  revenueDistribution: RevenueSlice[];
  loading: boolean;
}

/** Placement region within the Command Center grid. Changing a section's region
 *  (or reordering the registry) re-lays-out the page without structural changes —
 *  the hook for future hide/show/reorder (Dashboard Personalization). */
type Region = 'side' | 'kpi' | 'analytics' | 'flow' | 'full';

type CCSection = DashboardSection & { region: Region };

/**
 * Composition layer for the Executive Command Center.
 *
 * Phase B: builds the section registry and lays it into a responsive grid of titled
 * placeholder cards. Section bodies are intentionally empty — real widgets are added
 * per-section in later phases by replacing each entry's `node`. No widget depends on
 * another; this layer only arranges them.
 */
export default function CommandCenter({
  data,
  trend,
  onRefresh,
  refreshing = false,
  refreshAt = null,
}: {
  data: CommandData;
  trend: TrendPoint[];
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshAt?: Date | null;
}) {
  const dc = data.decisionCenter;

  const sections: CCSection[] = [
    {
      id: 'health',
      title: 'حالة الشركة اليوم',
      region: 'side',
      node: <HealthGaugeSection health={dc?.healthScore ?? null} loading={data.loading} />,
    },
    {
      id: 'action-center',
      title: 'يحتاج إجراءً الآن',
      region: 'side',
      node: <ActionCenterSection cards={dc?.decisionCards ?? []} loading={data.loading} />,
    },
    {
      id: 'kpi',
      title: 'المؤشرات المالية الرئيسية',
      region: 'kpi',
      node: (
        <KpiRowSection
          financial={dc?.financialSummary ?? null}
          cashFlow={data.cashFlowThisMonth}
          loading={data.loading}
        />
      ),
    },
    {
      id: 'performance',
      title: 'الأداء المالي (آخر ٦ أشهر)',
      region: 'analytics',
      node: <PerformanceChartSection trend={trend} loading={data.loading} />,
    },
    {
      id: 'revenue-dist',
      title: 'توزيع الإيرادات حسب العميل',
      region: 'analytics',
      node: <RevenueDistributionSection slices={data.revenueDistribution} loading={data.loading} />,
    },
    { id: 'quick-actions',   title: 'إجراءات سريعة',                region: 'flow',      node: <QuickActionsSection /> },
    {
      id: 'recent-activity',
      title: 'آخر النشاطات',
      region: 'flow',
      node: <RecentActivityFeed rows={data.activity} loading={data.loading} />,
    },
    {
      id: 'recommendations',
      title: 'التوصيات الذكية',
      region: 'full',
      node: <RecommendationsSection recommendations={dc?.recommendations ?? []} loading={data.loading} />,
    },
  ];

  const inRegion = (r: Region) => sections.filter((s) => s.region === r);

  const renderCard = (s: CCSection) => (
    <SectionCard key={s.id} title={s.title} className={`db-cc-${s.id}`}>
      {s.node}
    </SectionCard>
  );

  const side = inRegion('side');
  const kpi = inRegion('kpi');
  const analytics = inRegion('analytics');
  const flow = inRegion('flow');
  const full = inRegion('full');

  return (
    <section className="db-command-center" aria-label="مركز القيادة التنفيذي">
      <div className="db-cc-titlebar">
        <div className="db-cc-titlebar-main">
          <h1 className="db-cc-title">لوحة التحكم</h1>
          <p className="db-cc-subtitle">نظرة عامة على أداء الشركة</p>
        </div>
        {onRefresh && (
          <div className="db-cc-titlebar-actions">
            {refreshAt && (
              <span className="db-cc-updated">آخر تحديث {refreshAt.toLocaleTimeString('ar')}</span>
            )}
            <button
              type="button"
              className="db-cc-refresh"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label="تحديث بيانات لوحة التحكم"
            >
              {refreshing ? '⏳ جارٍ التحديث' : '↻ تحديث'}
            </button>
          </div>
        )}
      </div>
      <div className="db-cc-grid">
        <div className="db-cc-side">{side.map(renderCard)}</div>
        <div className="db-cc-main">
          {kpi.map(renderCard)}
          {analytics.length > 0 && <div className="db-cc-analytics">{analytics.map(renderCard)}</div>}
          {flow.map(renderCard)}
        </div>
      </div>
      {full.length > 0 && <div className="db-cc-full">{full.map(renderCard)}</div>}
    </section>
  );
}

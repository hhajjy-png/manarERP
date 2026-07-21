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
import { useT } from '../../../lib/i18n';
import { useUI } from '../../../stores/uiStore';

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
  const { t } = useT();
  const { lang } = useUI();
  const dc = data.decisionCenter;

  const sections: CCSection[] = [
    {
      id: 'health',
      title: t('section.company_health_today'),
      region: 'side',
      node: <HealthGaugeSection health={dc?.healthScore ?? null} loading={data.loading} />,
    },
    {
      id: 'action-center',
      title: t('section.needs_action_now'),
      region: 'side',
      node: <ActionCenterSection cards={dc?.decisionCards ?? []} loading={data.loading} />,
    },
    {
      id: 'kpi',
      title: t('section.key_financial_indicators'),
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
      title: t('section.financial_performance_ytd'),
      region: 'analytics',
      node: <PerformanceChartSection trend={trend} loading={data.loading} />,
    },
    {
      id: 'revenue-dist',
      title: t('section.revenue_by_customer'),
      region: 'analytics',
      node: <RevenueDistributionSection slices={data.revenueDistribution} loading={data.loading} />,
    },
    { id: 'quick-actions',   title: t('section.quick_actions_panel'),                region: 'flow',      node: <QuickActionsSection /> },
    {
      id: 'recent-activity',
      title: t('section.recent_activity'),
      region: 'flow',
      node: <RecentActivityFeed rows={data.activity} loading={data.loading} />,
    },
    {
      id: 'recommendations',
      title: t('section.smart_recommendations'),
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
    <section className="db-command-center" aria-label={t('cc.aria.command_center')}>
      <div className="db-cc-titlebar">
        <div className="db-cc-titlebar-main">
          <h1 className="db-cc-title">{t('nav.dashboard')}</h1>
          <p className="db-cc-subtitle">{t('dash.header.subtitle')}</p>
        </div>
        {onRefresh && (
          <div className="db-cc-titlebar-actions">
            {refreshAt && (
              <span className="db-cc-updated">{t('dash.header.last_updated')} {refreshAt.toLocaleTimeString(lang === 'ar' ? 'ar' : 'en')}</span>
            )}
            <button
              type="button"
              className="db-cc-refresh"
              onClick={onRefresh}
              disabled={refreshing}
              aria-label={t('cc.aria.refresh_data')}
            >
              {refreshing ? `⏳ ${t('cc.refreshing')}` : `↻ ${t('action.refresh')}`}
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

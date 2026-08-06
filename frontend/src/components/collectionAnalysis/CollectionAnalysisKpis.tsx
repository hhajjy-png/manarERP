import AnalysisSection, { type SectionKpi } from '../financialAnalysis/AnalysisSection';
import { useT } from '../../lib/i18n';
import type { CollectionDrilldownRequest, CollectionKpis } from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   بطاقات تحليل التحصيلات الثماني.

   تُبنى بنفس مكوّن البطاقات المعتمد في مركز التحليل المالي (`AnalysisSection` ⇐
   `MetricCard`) بلا أي تصميم جديد — نفس الشبكة ونفس النغمات ونفس احترام وضع
   الخصوصية عبر `PrivateAmount`.

   كل بطاقة نقدية قابلة للضغط وتفتح نفس درج التفصيل الذي تفتحه خلايا الجداول.
   ════════════════════════════════════════════════════════════════════════════ */

function percentText(value: number | null): string {
  return value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(2)}%`;
}

interface CollectionAnalysisKpisProps {
  kpis: CollectionKpis;
  onDrill: (request: CollectionDrilldownRequest) => void;
}

export default function CollectionAnalysisKpis({ kpis, onDrill }: CollectionAnalysisKpisProps) {
  const { t } = useT();

  const cards: SectionKpi[] = [
    {
      key: 'invoiced',
      icon: 'receipt_long',
      tone: 'blue',
      label: t('ca.kpi.total_invoiced'),
      money: kpis.totalInvoiceValue,
      sub: t('ca.kpi.invoice_count', { count: kpis.invoiceCount }),
      onClick: () => onDrill({ title: t('ca.kpi.total_invoiced') }),
    },
    {
      key: 'collected',
      icon: 'task_alt',
      tone: 'green',
      label: t('ca.kpi.total_collected'),
      money: kpis.totalCollected,
      sub: t('ca.kpi.collection_count', { count: kpis.collectionCount }),
      onClick: () => onDrill({ title: t('ca.kpi.total_collected') }),
    },
    {
      key: 'rate',
      icon: 'percent',
      tone: 'indigo',
      label: t('ca.kpi.collection_rate'),
      text: percentText(kpis.collectionRate),
      sub: t('ca.kpi.of_invoiced'),
    },
    {
      key: 'sameYear',
      icon: 'event_available',
      tone: 'green',
      label: t('ca.kpi.same_year'),
      money: kpis.collectedSameYear,
      sub: t('ca.kpi.same_year_sub'),
    },
    {
      key: 'otherYears',
      icon: 'move_down',
      tone: 'orange',
      label: t('ca.kpi.other_years'),
      money: kpis.collectedOtherYears,
      sub: t('ca.kpi.other_years_sub'),
    },
    {
      key: 'outstanding',
      icon: 'pending_actions',
      tone: 'red',
      label: t('ca.kpi.outstanding'),
      money: kpis.outstanding,
      onClick: () => onDrill({ title: t('ca.kpi.outstanding') }),
    },
    {
      key: 'avgDays',
      icon: 'schedule',
      tone: 'blue',
      label: t('ca.kpi.average_period'),
      text: kpis.averageCollectionDays == null ? '—' : t('ca.unit.days', { count: kpis.averageCollectionDays }),
      sub: t('ca.kpi.weighted'),
    },
    {
      key: 'deferred',
      icon: 'history_toggle_off',
      tone: 'orange',
      label: t('ca.kpi.largest_deferred_year'),
      text: kpis.largestDeferredYear == null ? '—' : String(kpis.largestDeferredYear),
      sub: kpis.largestDeferredYear == null ? undefined : t('ca.kpi.largest_deferred_sub'),
      onClick:
        kpis.largestDeferredYear == null
          ? undefined
          : () =>
              onDrill({
                title: t('ca.kpi.largest_deferred_year'),
                subtitle: String(kpis.largestDeferredYear),
                scopeCollectionYear: kpis.largestDeferredYear ?? undefined,
              }),
    },
  ];

  return (
    <AnalysisSection index={1} icon="query_stats" title={t('ca.section.kpis')} kpis={cards}>
      <p className="fac-note">{t('ca.note.kpis')}</p>
    </AnalysisSection>
  );
}

import { MetricCard } from '../explorer/ExplorerKit';
import { money } from '../../config/modules';
import { formatPct, type WorkAnalysisTotals } from '../../lib/workAnalysisCalc';
import { useT } from '../../lib/i18n';

/**
 * بطاقات المؤشرات التنفيذية لتحليل الشغل والعمولة.
 *
 * مكوّن عرض خالص: لا يحسب شيئًا ولا يجلب شيئًا — يستقبل `totals` المحسوبة مسبقًا.
 * لون بطاقتَي العمولة والهامش يتبع الإشارة: العمولة السالبة (شغل بخسارة) تُعرض
 * حمراء لا خضراء، فالبطاقة تخبر بالحقيقة بدل تلوين موحّد يُطمئِن زورًا.
 *
 * تستخدم `xpl-kpi-grid` القياسية من ExplorerKit — نفس شبكة المؤشرات في لوحة
 * التحكم والتقارير — بدل شبكة خاصة بهذه الصفحة، فتتطابق أحجام البطاقات
 * والمسافات تلقائيًا مع بقية النظام وتتبع أي تعديل لاحق على لغة التصميم.
 */
export default function WorkAnalysisKpis({ totals }: { totals: WorkAnalysisTotals }) {
  const { t } = useT();
  const isLoss = totals.totalCommission < 0;

  return (
    <div className="xpl-kpi-grid wa-kpis">
      <MetricCard
        icon="request_quote"
        tone="blue"
        label={t('wa.kpi.customer_value')}
        value={money(totals.totalCustomerValue)}
      />
      <MetricCard
        icon="local_shipping"
        tone="orange"
        label={t('wa.kpi.owner_cost')}
        value={money(totals.totalOwnerCost)}
      />
      <MetricCard
        icon="savings"
        tone={isLoss ? 'red' : 'green'}
        label={t('wa.kpi.commission')}
        value={money(totals.totalCommission)}
      />
      <MetricCard
        icon="percent"
        tone={totals.grossMarginPct < 0 ? 'red' : 'green'}
        label={t('wa.kpi.margin')}
        value={formatPct(totals.grossMarginPct)}
      />
      <MetricCard
        icon="functions"
        tone="indigo"
        label={t('wa.kpi.avg_commission')}
        value={money(totals.avgCommissionPerUnit)}
      />
      <MetricCard
        icon="scale"
        tone="neutral"
        label={t('wa.kpi.total_quantity')}
        value={totals.totalQuantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}
      />
      <MetricCard
        icon="list_alt"
        tone="neutral"
        label={t('wa.kpi.line_count')}
        value={String(totals.lineCount)}
      />
    </div>
  );
}

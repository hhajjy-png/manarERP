import { money } from '../../config/modules';
import { formatPct, type WorkAnalysisTotals } from '../../lib/workAnalysisCalc';
import { useT } from '../../lib/i18n';

/**
 * شريط الإجماليات أسفل شبكة البنود مباشرةً.
 *
 * موضعه هو وظيفته: عين المستخدم لا تغادر الشبكة أثناء إدخال سعر صاحب المعدة،
 * فالنتيجة يجب أن تكون في المسار البصري نفسه لا في بطاقة بعيدة أعلى الصفحة.
 * بطاقات المؤشرات أعلى الصفحة تخدم النظرة الشاملة؛ هذا الشريط يخدم حلقة
 * «أدخل رقمًا ← انظر الأثر» اللحظية.
 *
 * عرض بحت: لا حساب هنا — `totals` تصل محسوبة من `calcTotals`.
 */
export default function WorkAnalysisSummaryBar({ totals }: { totals: WorkAnalysisTotals }) {
  const { t } = useT();
  const isLoss = totals.totalCommission < 0;

  return (
    <div className="wa-summary-bar">
      <div className="wa-sum-item">
        <span className="wa-sum-label">{t('wa.col.customer_total')}</span>
        <span className="wa-sum-value">{money(totals.totalCustomerValue)}</span>
      </div>
      <span className="wa-sum-op" aria-hidden="true">−</span>
      <div className="wa-sum-item">
        <span className="wa-sum-label">{t('wa.col.owner_total')}</span>
        <span className="wa-sum-value">{money(totals.totalOwnerCost)}</span>
      </div>
      <span className="wa-sum-op" aria-hidden="true">=</span>
      <div className={`wa-sum-item wa-sum-item--result${isLoss ? ' wa-neg' : ''}`}>
        <span className="wa-sum-label">{t('wa.col.commission_total')}</span>
        <span className="wa-sum-value">{money(totals.totalCommission)}</span>
      </div>
      <div className={`wa-sum-item wa-sum-item--margin${totals.grossMarginPct < 0 ? ' wa-neg' : ''}`}>
        <span className="wa-sum-label">{t('wa.profit.margin')}</span>
        <span className="wa-sum-value">{formatPct(totals.grossMarginPct)}</span>
      </div>
    </div>
  );
}

import { money } from '../../config/modules';
import { formatPct, type WorkAnalysisTotals } from '../../lib/workAnalysisCalc';
import { useT } from '../../lib/i18n';

/**
 * ملخّص الربحية — المعادلة الأساسية معروضة صراحةً:
 * إيراد العميل − تكلفة صاحب المعدة = العمولة.
 *
 * تُعرض الأسطر الثلاثة كمعادلة مرئية لا كثلاث بطاقات منفصلة، لأن القيمة الإدراكية
 * هنا في العلاقة بينها لا في القيم منفردة.
 */
export default function WorkAnalysisProfitability({ totals }: { totals: WorkAnalysisTotals }) {
  const { t } = useT();
  const isLoss = totals.totalCommission < 0;

  return (
    <div className="wa-profit">
      <div className="wa-profit-row">
        <span className="wa-profit-label">{t('wa.profit.revenue')}</span>
        <span className="wa-profit-value">{money(totals.totalCustomerValue)}</span>
      </div>
      <div className="wa-profit-row wa-profit-row--op">
        <span className="wa-profit-op" aria-hidden="true">−</span>
        <span className="wa-profit-label">{t('wa.profit.cost')}</span>
        <span className="wa-profit-value">{money(totals.totalOwnerCost)}</span>
      </div>
      <div className={`wa-profit-row wa-profit-row--result${isLoss ? ' wa-neg' : ''}`}>
        <span className="wa-profit-op" aria-hidden="true">=</span>
        <span className="wa-profit-label">{t('wa.profit.commission')}</span>
        <span className="wa-profit-value">{money(totals.totalCommission)}</span>
      </div>
      <div className={`wa-profit-margin${totals.grossMarginPct < 0 ? ' wa-neg' : ''}`}>
        <span>{t('wa.profit.margin')}</span>
        <strong>{formatPct(totals.grossMarginPct)}</strong>
      </div>
    </div>
  );
}

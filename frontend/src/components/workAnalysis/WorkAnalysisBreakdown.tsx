import { money } from '../../config/modules';
import { calcLine, calcTotals, formatPct } from '../../lib/workAnalysisCalc';
import { useT } from '../../lib/i18n';
import { EmptyState } from '../explorer/ExplorerKit';
import { lineAmountsInput, type WorkAnalysisLineDraft } from '../../pages/workAnalysis/types';

/**
 * جدول التحليل التفصيلي — عرض بحت للقراءة، ونظير الشبكة القابلة للتحرير.
 *
 * يعرض نفس البنود مضافًا إليها «نسبة العمولة» لكل بند، وصف مجاميع. يُشتق من نفس
 * `calcLine`/`calcTotals` اللذين تستخدمهما الشبكة والبطاقات — فالأرقام الثلاثة على
 * الشاشة تأتي من مصدر واحد ولا يمكن أن تتباين.
 */
export default function WorkAnalysisBreakdown({ lines }: { lines: WorkAnalysisLineDraft[] }) {
  const { t } = useT();
  const filled = lines.filter((line) => line.itemLabel);

  if (filled.length === 0) {
    return <EmptyState icon="table_chart" title={t('wa.breakdown.empty')} message={t('wa.breakdown.empty_hint')} />;
  }

  const totals = calcTotals(filled.map(lineAmountsInput));

  return (
    <div className="wa-table-scroll">
      <table className="wa-table">
        <thead>
          <tr>
            <th>{t('wa.col.item')}</th>
            <th>{t('wa.col.customer_price')}</th>
            <th>{t('wa.col.owner_price')}</th>
            <th>{t('wa.col.commission_unit')}</th>
            <th>{t('wa.col.commission_pct')}</th>
            <th>{t('wa.col.quantity')}</th>
            <th>{t('wa.col.customer_total')}</th>
            <th>{t('wa.col.owner_total')}</th>
            <th>{t('wa.col.commission_total')}</th>
          </tr>
        </thead>
        <tbody>
          {filled.map((line) => {
            const amounts = calcLine(lineAmountsInput(line));
            return (
              <tr key={line.key}>
                <td className="wa-td-item">
                  {line.itemLabel}
                  <small>{line.priceAgreementName}</small>
                </td>
                <td className="wa-num">{money(line.customerPrice)}</td>
                <td className="wa-num">{money(Number(line.ownerPrice) || 0)}</td>
                <td className={`wa-num${amounts.commissionPerUnit < 0 ? ' wa-neg' : ''}`}>
                  {money(amounts.commissionPerUnit)}
                </td>
                <td className={`wa-num${amounts.commissionPct < 0 ? ' wa-neg' : ''}`}>
                  {formatPct(amounts.commissionPct)}
                </td>
                <td className="wa-num">
                  {(Number(line.quantity) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 })}
                  <span className="wa-unit"> {line.unit}</span>
                </td>
                <td className="wa-num">{money(amounts.customerTotal)}</td>
                <td className="wa-num">{money(amounts.ownerTotal)}</td>
                <td className={`wa-num wa-strong${amounts.commissionTotal < 0 ? ' wa-neg' : ''}`}>
                  {money(amounts.commissionTotal)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td>{t('msg.total')}</td>
            <td colSpan={4} />
            <td className="wa-num">
              {totals.totalQuantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}
            </td>
            <td className="wa-num">{money(totals.totalCustomerValue)}</td>
            <td className="wa-num">{money(totals.totalOwnerCost)}</td>
            <td className={`wa-num wa-strong${totals.totalCommission < 0 ? ' wa-neg' : ''}`}>
              {money(totals.totalCommission)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

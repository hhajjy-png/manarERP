import type { StatementRow } from '../../types/financial.types';
import { DrillDownLink, type FinancialDrillDownState } from './DrillDownLink';
import { formatDate } from '../../lib/date';
import { referenceTypeLabel, fcMoneyHeader, fcMoneyCell } from './financialLabels';
import { useT } from '../../lib/i18n';

interface Props {
  rows: StatementRow[];
  currentState: FinancialDrillDownState;
  highlightId?: string | null;
}

// الرمز يقع **مرّة واحدة في عنوان العمود** (`fcMoneyHeader`)، فالخليّة رقم مجرّد.
// وكان `n ? … : ''` **يُخفي الصفر الحقيقي**: رصيد أو حركة صفرية تُقرأ «لا قيمة» بينما
// هي صفر فعلي. الآن «0.000»، و«—» لغير المنطبق وحده — عبر المُنسّق المشترك.
function fmt(n: number) {
  return fcMoneyCell(n);
}

export function StatementTable({ rows, currentState, highlightId }: Props) {
  const { t } = useT();
  return (
    <div className="table-responsive">
      <table className="financial-table statement-table" dir="rtl">
        <thead>
          <tr>
            <th>{t('col.date')}</th>
            <th>{t('col.acc.reference')}</th>
            <th>{t('col.acc.type')}</th>
            <th>{t('col.acc.description')}</th>
            <th className="num">{fcMoneyHeader(t('acc.balance.debit'))}</th>
            <th className="num">{fcMoneyHeader(t('acc.balance.credit'))}</th>
            <th className="num">{fcMoneyHeader(t('fc.col.balance'))}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr
              key={row.id}
              id={`row-${row.id}`}
              className={highlightId === row.id ? 'highlight-row' : ''}
            >
              <td>{formatDate(row.date)}</td>
              <td>
                <DrillDownLink drillDown={row.drillDown} currentState={currentState}>
                  {row.reference}
                </DrillDownLink>
              </td>
              <td>{referenceTypeLabel(row.referenceType, t)}</td>
              <td>{row.description}</td>
              <td className="num">{fmt(row.debit)}</td>
              <td className="num">{fmt(row.credit)}</td>
              <td className={`num ${row.runningBalance < 0 ? 'negative' : ''}`}>
                {fmt(row.runningBalance)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

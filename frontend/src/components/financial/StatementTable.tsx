import type { StatementRow } from '../../types/financial.types';
import { DrillDownLink, type FinancialDrillDownState } from './DrillDownLink';
import { formatDate } from '../../lib/date';
import { referenceTypeAr, fcMoneyHeader, fcMoneyCell } from './financialLabels';

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
  return (
    <div className="table-responsive">
      <table className="financial-table statement-table" dir="rtl">
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>المرجع</th>
            <th>النوع</th>
            <th>البيان</th>
            <th>{fcMoneyHeader('مدين')}</th>
            <th>{fcMoneyHeader('دائن')}</th>
            <th>{fcMoneyHeader('الرصيد')}</th>
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
              <td>{referenceTypeAr(row.referenceType)}</td>
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

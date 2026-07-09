import type { StatementRow } from '../../types/financial.types';
import { DrillDownLink, type FinancialDrillDownState } from './DrillDownLink';
import { formatDate } from '../../lib/date';
import { fcCurrency, referenceTypeAr } from './financialLabels';

interface Props {
  rows: StatementRow[];
  currentState: FinancialDrillDownState;
  highlightId?: string | null;
}

function fmt(n: number) {
  return n ? fcCurrency(n) : '';
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
            <th>مدين</th>
            <th>دائن</th>
            <th>الرصيد</th>
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

import type { StatementRow } from '../../types/financial.types';
import { DrillDownLink, type FinancialDrillDownState } from './DrillDownLink';
import { formatCurrency } from '../../lib/format';

interface Props {
  rows: StatementRow[];
  currentState: FinancialDrillDownState;
  highlightId?: string | null;
}

function fmt(n: number) {
  return n ? formatCurrency(n) : '';
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
              <td>{row.date.slice(0, 10)}</td>
              <td>
                <DrillDownLink drillDown={row.drillDown} currentState={currentState}>
                  {row.reference}
                </DrillDownLink>
              </td>
              <td>{row.referenceType}</td>
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

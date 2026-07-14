import { useState } from 'react';
import type { StatementRow } from '../../types/financial.types';
import type { FinancialDrillDownState } from './DrillDownLink';
import { DrillDownLink } from './DrillDownLink';
import { formatDate, formatMonthLabel } from '../../lib/date';
import { fcCurrency, referenceTypeAr, fcMoneyHeader } from './financialLabels';

interface Props {
  rows: StatementRow[];
  currentState: FinancialDrillDownState;
  highlightId?: string | null;
}

interface MonthGroup { month: string; label: string; rows: StatementRow[] }
interface YearGroup  { year: string; months: MonthGroup[] }

function groupRows(rows: StatementRow[]): YearGroup[] {
  const byYear = new Map<string, Map<string, StatementRow[]>>();
  for (const row of rows) {
    const d = new Date(row.date);
    const year  = String(d.getFullYear());
    const month = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!byYear.has(year))  byYear.set(year, new Map());
    const byMonth = byYear.get(year)!;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(row);
  }
  return Array.from(byYear.entries()).map(([year, byMonth]) => ({
    year,
    months: Array.from(byMonth.entries()).map(([month, r]) => ({
      month,
      label: formatMonthLabel(month),   // 'يناير 2026' — أرقام غربية، بلا Date ولا انزياح منطقة زمنية
      rows: r,
    })),
  }));
}

function monthSum(rows: StatementRow[]) {
  return rows.reduce((acc, r) => ({ debit: acc.debit + r.debit, credit: acc.credit + r.credit }), { debit: 0, credit: 0 });
}

function fmt(n: number) {
  return n ? fcCurrency(n) : '';
}

export function GroupedTable({ rows, currentState, highlightId }: Props) {
  const groups = groupRows(rows);
  const [collapsedYears,  setCollapsedYears]  = useState<Set<string>>(new Set());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  function toggleYear(year: string) {
    setCollapsedYears(prev => {
      const next = new Set(prev);
      next.has(year) ? next.delete(year) : next.add(year);
      return next;
    });
  }

  function toggleMonth(monthKey: string) {
    setCollapsedMonths(prev => {
      const next = new Set(prev);
      next.has(monthKey) ? next.delete(monthKey) : next.add(monthKey);
      return next;
    });
  }

  return (
    <div className="table-responsive">
      <table className="financial-table grouped-table" dir="rtl">
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
          {groups.map(({ year, months }) => {
            const yearCollapsed = collapsedYears.has(year);
            return (
              <>
                <tr key={`year-${year}`} className="group-header year-header" onClick={() => toggleYear(year)}>
                  <td colSpan={7}>
                    <span className="toggle-icon">{yearCollapsed ? '▶' : '▼'}</span>
                    {year}
                  </td>
                </tr>
                {!yearCollapsed && months.map(({ month, label, rows: mRows }) => {
                  const monthCollapsed = collapsedMonths.has(month);
                  const sums = monthSum(mRows);
                  return (
                    <>
                      <tr key={`month-${month}`} className="group-header month-header" onClick={() => toggleMonth(month)}>
                        <td colSpan={4}>
                          <span className="toggle-icon">{monthCollapsed ? '▶' : '▼'}</span>
                          {label}
                        </td>
                        <td className="num">{fmt(sums.debit)}</td>
                        <td className="num">{fmt(sums.credit)}</td>
                        <td></td>
                      </tr>
                      {!monthCollapsed && mRows.map(row => (
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
                    </>
                  );
                })}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

import { useState } from 'react';
import type { JournalBookRow } from '../../types/financial.types';
import { DrillDownLink } from './DrillDownLink';
import type { FinancialDrillDownState } from './DrillDownLink';
import { formatCurrency } from '../../lib/format';

function fmt(n: number) {
  return formatCurrency(n);
}

interface Props {
  rows:         JournalBookRow[];
  currentState: FinancialDrillDownState;
}

export function JournalBookTable({ rows, currentState }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleRow(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function toggleAll(expand: boolean) {
    setExpanded(expand ? new Set(rows.map(r => r.id)) : new Set());
  }

  return (
    <div className="journal-book-container" dir="rtl">
      <div className="journal-book-controls">
        <button type="button" onClick={() => toggleAll(true)}>فتح الكل</button>
        <button type="button" onClick={() => toggleAll(false)}>إغلاق الكل</button>
      </div>
      <div className="table-responsive">
        <table className="financial-table journal-book-table">
          <thead>
            <tr>
              <th style={{ width: 24 }} />
              <th>رقم القيد</th>
              <th>التاريخ</th>
              <th>البيان</th>
              <th>المرجع</th>
              <th>الحالة</th>
              <th className="num">مدين</th>
              <th className="num">دائن</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <>
                <tr
                  key={row.id}
                  id={`row-${row.id}`}
                  className={`journal-entry-row${expanded.has(row.id) ? ' expanded' : ''}`}
                  onClick={() => toggleRow(row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="journal-expand-icon">{expanded.has(row.id) ? '▼' : '▶'}</td>
                  <td><strong>{row.entryNumber}</strong></td>
                  <td>{row.date.slice(0, 10)}</td>
                  <td>{row.description}</td>
                  <td>
                    <DrillDownLink drillDown={row.drillDown} currentState={currentState}>
                      {row.referenceType}
                    </DrillDownLink>
                  </td>
                  <td>
                    <span className={`journal-status journal-status-${row.status.toLowerCase()}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="num">{fmt(row.totalDebit)}</td>
                  <td className="num">{fmt(row.totalCredit)}</td>
                </tr>
                {expanded.has(row.id) && (
                  <tr key={`${row.id}-lines`} className="journal-lines-row">
                    <td colSpan={8}>
                      <table className="journal-lines-table">
                        <thead>
                          <tr>
                            <th>الحساب</th>
                            <th>اسم الحساب</th>
                            <th>البيان</th>
                            <th className="num">مدين</th>
                            <th className="num">دائن</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.lines.map((line, li) => (
                            <tr key={li}>
                              <td>{line.accountCode}</td>
                              <td>{line.accountName}</td>
                              <td>{line.description ?? ''}</td>
                              <td className="num">{line.debit  ? fmt(line.debit)  : ''}</td>
                              <td className="num">{line.credit ? fmt(line.credit) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

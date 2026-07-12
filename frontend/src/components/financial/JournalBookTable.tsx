import { Fragment, useState } from 'react';
import type { JournalBookRow } from '../../types/financial.types';
import { DrillDownLink } from './DrillDownLink';
import type { FinancialDrillDownState } from './DrillDownLink';
import { formatDate } from '../../lib/date';
import { fcCurrency, referenceTypeAr, journalStatusAr } from './financialLabels';

function fmt(n: number) {
  return fcCurrency(n);
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
              /* عنصر القائمة هو الـ Fragment نفسه (صفّان: القيد وسطوره)، فالمفتاح يخصّه
                 هو — لا أبناءه. الاختصار `<>` لا يقبل مفتاحًا، فكان المفتاح يوضع على
                 الـ <tr> بداخله ولا يراه React، ومن هنا تحذير unique key. */
              <Fragment key={row.id}>
                <tr
                  id={`row-${row.id}`}
                  className={`journal-entry-row${expanded.has(row.id) ? ' expanded' : ''}`}
                  onClick={() => toggleRow(row.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="journal-expand-icon">{expanded.has(row.id) ? '▼' : '▶'}</td>
                  <td><strong>{row.entryNumber}</strong></td>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.description}</td>
                  <td>
                    <DrillDownLink drillDown={row.drillDown} currentState={currentState}>
                      {referenceTypeAr(row.referenceType)}
                    </DrillDownLink>
                  </td>
                  <td>
                    <span className={`journal-status journal-status-${row.status.toLowerCase()}`}>
                      {journalStatusAr(row.status)}
                    </span>
                  </td>
                  <td className="num">{fmt(row.totalDebit)}</td>
                  <td className="num">{fmt(row.totalCredit)}</td>
                </tr>
                {expanded.has(row.id) && (
                  <tr className="journal-lines-row">
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
                          {/* سطور القيد لا تحمل معرّفًا في عقد الـ API (accountCode/الوصف/
                              المبالغ فقط)، والقائمة تأتي مرتّبة من الخادم ولا تُرتَّب ولا
                              تُصفّى ولا يُدرَج فيها شيء في العميل — فالفهرس ثابت هنا. ومع
                              ذلك نُركّبه مع معرّف القيد ليبقى المفتاح فريدًا ودلاليًا. */}
                          {row.lines.map((line, li) => (
                            <tr key={`${row.id}-line-${li}`}>
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
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

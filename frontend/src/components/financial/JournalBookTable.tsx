import { Fragment, useState } from 'react';
import type { JournalBookRow } from '../../types/financial.types';
import { DrillDownLink } from './DrillDownLink';
import type { FinancialDrillDownState } from './DrillDownLink';
import { formatDate } from '../../lib/date';
import { referenceTypeLabel, journalStatusLabel, fcMoneyCell, fcMoneyHeader } from './financialLabels';
import { useT } from '../../lib/i18n';

// الرمز في **عنوان العمود** لا في كل خليّة. الخليّة رقم مجرّد، والصفر يبقى «0.000».
function fmt(n: number) {
  return fcMoneyCell(n);
}

interface Props {
  rows:         JournalBookRow[];
  currentState: FinancialDrillDownState;
}

export function JournalBookTable({ rows, currentState }: Props) {
  const { t } = useT();
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
        <button type="button" onClick={() => toggleAll(true)}>{t('fc.journal.expand_all')}</button>
        <button type="button" onClick={() => toggleAll(false)}>{t('fc.journal.collapse_all')}</button>
      </div>
      <div className="table-responsive">
        <table className="financial-table journal-book-table">
          <thead>
            <tr>
              <th className="journal-expand-icon" />
              <th>{t('col.acc.entry_number')}</th>
              <th>{t('col.date')}</th>
              <th>{t('col.acc.description')}</th>
              <th>{t('col.acc.reference')}</th>
              <th>{t('col.status')}</th>
              <th className="num">{fcMoneyHeader(t('acc.balance.debit'))}</th>
              <th className="num">{fcMoneyHeader(t('acc.balance.credit'))}</th>
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
                      {referenceTypeLabel(row.referenceType, t)}
                    </DrillDownLink>
                  </td>
                  <td>
                    <span className={`journal-status journal-status-${row.status.toLowerCase()}`}>
                      {journalStatusLabel(row.status, t)}
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
                            <th>{t('col.acc.account')}</th>
                            <th>{t('col.acc.name')}</th>
                            <th>{t('col.acc.description')}</th>
                            <th className="num">{fcMoneyHeader(t('acc.balance.debit'))}</th>
                            <th className="num">{fcMoneyHeader(t('acc.balance.credit'))}</th>
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
                              {/* لا شرط truthy يُخفي الصفر: سطر بمدين صفري يُقرأ «0.000» لا فراغًا. */}
                              <td className="num">{fmt(line.debit)}</td>
                              <td className="num">{fmt(line.credit)}</td>
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

import type { ReportColumn } from './excel.service';
import { fmtCell, esc } from './htmlUtils';
import { moneyHeader } from '../../utils/currency';

export function buildTable(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  totalsRow?: Record<string, unknown>,
): string {
  // الرمز مرّة واحدة في العنوان («المبلغ (KWD)») بدل تكراره في كل صفّ.
  const headerCells = columns
    .map((c) => `<th>${esc(c.format === 'currency' ? moneyHeader(c.header) : c.header)}</th>`)
    .join('');

  const numAttr = (c: ReportColumn) => (c.format === 'currency' ? ' class="num"' : '');

  const bodyRows = rows
    .map((row, i) => {
      const cells = columns.map((c) => `<td${numAttr(c)}>${fmtCell(row[c.key], c)}</td>`).join('');
      const cls = i % 2 === 1 ? ' class="zebra"' : '';
      return `<tr${cls}>${cells}</tr>`;
    })
    .join('\n');

  const totalsHtml = totalsRow
    ? `<tfoot><tr class="totals">${columns.map((c) => `<td${numAttr(c)}>${fmtCell(totalsRow[c.key], c)}</td>`).join('')}</tr></tfoot>`
    : '';

  return `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="' + columns.length + '">لا توجد بيانات</td></tr>'}</tbody>
      ${totalsHtml}
    </table>
  `;
}

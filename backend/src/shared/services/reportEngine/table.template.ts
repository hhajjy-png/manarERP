import type { ReportColumn } from './excel.service';
import { fmtCell, esc } from './htmlUtils';

export function buildTable(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  totalsRow?: Record<string, unknown>,
): string {
  const headerCells = columns.map((c) => `<th>${esc(c.header)}</th>`).join('');

  const bodyRows = rows
    .map((row, i) => {
      const cells = columns.map((c) => `<td>${fmtCell(row[c.key])}</td>`).join('');
      const cls = i % 2 === 1 ? ' class="zebra"' : '';
      return `<tr${cls}>${cells}</tr>`;
    })
    .join('\n');

  const totalsHtml = totalsRow
    ? `<tfoot><tr class="totals">${columns.map((c) => `<td>${fmtCell(totalsRow[c.key])}</td>`).join('')}</tr></tfoot>`
    : '';

  return `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows || '<tr><td colspan="' + columns.length + '">لا توجد بيانات</td></tr>'}</tbody>
      ${totalsHtml}
    </table>
  `;
}

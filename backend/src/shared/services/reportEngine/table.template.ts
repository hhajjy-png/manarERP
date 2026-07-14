import type { ReportColumn } from './excel.service';
import { fmtCell, esc } from './htmlUtils';
import { moneyHeader } from '../../utils/currency';

export interface BuildTableOptions {
  /** Force every cell onto one line — no wrapping. */
  noWrapCells?: boolean;
  /** Render the totals row as the last <tbody> row instead of a repeating <tfoot>,
   *  so it appears exactly once, after the final data row, on whichever page that is. */
  totalsAsLastRow?: boolean;
}

export function buildTable(
  columns: ReportColumn[],
  rows: Record<string, unknown>[],
  totalsRow?: Record<string, unknown>,
  options?: BuildTableOptions,
): string {
  // محاذاة العمود (`ReportColumn.align`) كـ inline style — تتجاوز أي قاعدة CSS في
  // styles.template.ts (مثل `thead th`/`tr.totals td`) بصرف النظر عن الخصوصية،
  // بدل الاعتماد على صنف CSS قد يخسر معركة الخصوصية (وهذا ما كان يحدث فعلًا: صفوف
  // المجاميع وخلايا الرأس كانتا تتجاهلان `align: 'center'`).
  const alignStyle = (c: ReportColumn): string => {
    if (c.align === 'center') return ' style="text-align:center;vertical-align:middle"';
    if (c.align === 'left') return ' style="text-align:left;vertical-align:middle"';
    return '';
  };

  // الرمز مرّة واحدة في العنوان («المبلغ (KWD)») بدل تكراره في كل صفّ.
  const headerCells = columns
    .map((c) => `<th${alignStyle(c)}>${esc(c.format === 'currency' ? moneyHeader(c.header) : c.header)}</th>`)
    .join('');

  const cellAttr = (c: ReportColumn) => {
    const classes: string[] = [];
    if (c.format === 'currency') classes.push('num');
    if (options?.noWrapCells) classes.push('nowrap-cell');
    if (c.align === 'center') classes.push('cell-center');
    else if (c.align === 'left') classes.push('cell-left');
    const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
    return `${classAttr}${alignStyle(c)}`;
  };

  const bodyRows = rows
    .map((row, i) => {
      const cells = columns.map((c) => `<td${cellAttr(c)}>${fmtCell(row[c.key], c)}</td>`).join('');
      const cls = i % 2 === 1 ? ' class="zebra"' : '';
      return `<tr${cls}>${cells}</tr>`;
    })
    .join('\n');

  const emptyRow = '<tr><td colspan="' + columns.length + '">لا توجد بيانات</td></tr>';

  if (totalsRow && options?.totalsAsLastRow) {
    const totalsCells = columns.map((c) => `<td${cellAttr(c)}>${fmtCell(totalsRow[c.key], c)}</td>`).join('');
    const totalsRowHtml = `<tr class="totals">${totalsCells}</tr>`;
    return `
      <table>
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows || emptyRow}${totalsRowHtml}</tbody>
      </table>
    `;
  }

  const totalsHtml = totalsRow
    ? `<tfoot><tr class="totals">${columns.map((c) => `<td${cellAttr(c)}>${fmtCell(totalsRow[c.key], c)}</td>`).join('')}</tr></tfoot>`
    : '';

  return `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows || emptyRow}</tbody>
      ${totalsHtml}
    </table>
  `;
}

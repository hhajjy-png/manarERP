import type { ReportColumn } from './excel.service';
import { fmtCell, esc } from './htmlUtils';
import { rowGroupLayout } from './rowGroups';
import { moneyHeader } from '../../utils/currency';

export interface BuildTableOptions {
  /** Force every cell onto one line — no wrapping. */
  noWrapCells?: boolean;
  /** `ReportInput.rowGroupKey` — contiguous row groups get a uniform tint and a real
   *  `rowspan` cell in every `mergeRowGroup` column. See `rowGroups.ts`. */
  rowGroupKey?: string;
  /**
   * @deprecated NO-OP since the totals-row pagination fix — the totals row is now
   * ALWAYS rendered as the last `<tbody>` row, for every report. Kept only so the
   * existing `invoiceReportLayout` wiring keeps compiling; it selects nothing.
   * See the totals-row note in `buildTable` below.
   */
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

  const cellAttr = (c: ReportColumn, extraClass?: string) => {
    const classes: string[] = [];
    if (c.format === 'currency') classes.push('num');
    if (options?.noWrapCells) classes.push('nowrap-cell');
    if (c.align === 'center') classes.push('cell-center');
    else if (c.align === 'left') classes.push('cell-left');
    if (extraClass) classes.push(extraClass);
    const classAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
    return `${classAttr}${alignStyle(c)}`;
  };

  const groups = options?.rowGroupKey ? rowGroupLayout(rows, options.rowGroupKey) : undefined;

  const bodyRows = rows
    .map((row, i) => {
      const group = groups?.[i];
      const cells = columns
        .map((c) => {
          if (!c.mergeRowGroup || !group || group.span === 1) return `<td${cellAttr(c)}>${fmtCell(row[c.key], c)}</td>`;
          if (group.span === 0) return ''; // مغطّاة بخليّة أول صفّ في الكتلة
          return `<td${cellAttr(c, 'merged-cell')} rowspan="${group.span}">${fmtCell(row[c.key], c)}</td>`;
        })
        .join('');
      const cls = group?.grouped ? ' class="row-group"' : i % 2 === 1 ? ' class="zebra"' : '';
      return `<tr${cls}>${cells}</tr>`;
    })
    .join('\n');

  const emptyRow = '<tr><td colspan="' + columns.length + '">لا توجد بيانات</td></tr>';

  /**
   * TOTALS ROW PAGINATION — the totals row is always the LAST `<tbody>` row.
   *
   * It used to be emitted inside `<tfoot>` for every report except the invoice
   * layout, and `styles.template.ts` declares `tfoot { display: table-footer-group }`.
   * In paged media Chromium treats a table-footer-group as a *running* footer and
   * repeats it at the bottom of EVERY page — so a multi-page report printed its
   * grand total once per page, and the total the reader saw at the foot of page 1
   * looked like the total of page 1. Rendering it as the final body row instead
   * makes it appear exactly once, immediately after the last data row, on whatever
   * page that turns out to be — one page or ten.
   *
   * The companion half of the fix lives in `styles.template.ts`: `tr.totals` now
   * carries `break-inside: avoid`, so when the row does not fit in the remaining
   * space it moves WHOLE to the next page instead of being sliced through.
   *
   * This is deliberately unconditional rather than opt-in: the repetition was a
   * side effect of the default `<tfoot>` rendering, never a per-report choice, and
   * a grand total that repeats per page is wrong for every report equally.
   */
  const totalsRowHtml = totalsRow
    ? `<tr class="totals">${columns.map((c) => `<td${cellAttr(c)}>${fmtCell(totalsRow[c.key], c)}</td>`).join('')}</tr>`
    : '';

  return `
    <table>
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${bodyRows || emptyRow}${totalsRowHtml}</tbody>
    </table>
  `;
}

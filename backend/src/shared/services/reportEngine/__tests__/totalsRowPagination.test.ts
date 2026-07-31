import { describe, it, expect } from 'vitest';
import { buildTable } from '../table.template';
import { buildReportHtml } from '../html.service';
import { buildStyles } from '../styles.template';
import { buildExcel } from '../excel.service';
import type { ReportColumn, ReportInput } from '../excel.service';
import ExcelJS from 'exceljs';

/**
 * Totals-row pagination — Cheques Report PDF Final Total corrective pass.
 *
 * The grand total used to be emitted inside `<tfoot>`, and the print stylesheet
 * declares `tfoot { display: table-footer-group }`. Chromium treats that as a
 * RUNNING footer in paged media and repeats it at the bottom of every page, so a
 * multi-page report printed its grand total once per page — and the copy at the
 * foot of page 1 read like a page-1 subtotal. The row also had no
 * `break-inside: avoid` of its own, so a tall totals row could be sliced by a
 * page boundary.
 *
 * The fix is in the SHARED renderer (it was never cheques-specific): the totals
 * row is always the last `<tbody>` row, and `tr.totals` carries an explicit
 * break-inside guard. These tests pin both halves, for every report.
 */

const COLS: ReportColumn[] = [
  { header: 'رقم الشيك', key: 'chequeNumber', width: 18 },
  { header: 'المستفيد', key: 'beneficiaryName', width: 34 },
  { header: 'المبلغ', key: 'amount', width: 18, numFmt: '#,##0.000', format: 'currency' },
];

const TOTALS = { beneficiaryName: 'إجمالي مبالغ الشيكات', amount: 47687.015 };

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    chequeNumber: String(i + 1).padStart(6, '0'),
    beneficiaryName: `مستفيد ${i + 1}`,
    amount: 899.755,
  }));
}

function input(n: number): ReportInput {
  return { title: 'تقرير الشيكات', columns: COLS, rows: rows(n), totalsRow: TOTALS };
}

const occurrences = (haystack: string, needle: string) => haystack.split(needle).length - 1;

// ── Appears exactly once ─────────────────────────────────────────────────────

describe('totals row appears exactly once', () => {
  it.each([1, 20, 53, 500])('one totals row for a report of %i data rows', (n) => {
    const html = buildTable(COLS, rows(n), TOTALS);
    expect(occurrences(html, '<tr class="totals">')).toBe(1);
    expect(occurrences(html, 'إجمالي مبالغ الشيكات')).toBe(1);
  });

  it('is never emitted as a repeating table-footer-group', () => {
    const html = buildTable(COLS, rows(53), TOTALS);
    expect(html).not.toContain('<tfoot');
    expect(html).not.toContain('</tfoot>');
  });

  it('the full rendered document also carries it exactly once', () => {
    const html = buildReportHtml(input(53), { profile: 'a4-landscape' });
    expect(occurrences(html, '<tr class="totals">')).toBe(1);
    expect(occurrences(html, 'إجمالي مبالغ الشيكات')).toBe(1);
  });
});

// ── Position: after the last data row ────────────────────────────────────────

describe('totals row sits after the final data row', () => {
  it('comes after the last data row and inside tbody', () => {
    const html = buildTable(COLS, rows(53), TOTALS);
    const lastDataRow = html.lastIndexOf('مستفيد 53');
    const totalsAt = html.indexOf('<tr class="totals">');
    const tbodyClose = html.indexOf('</tbody>');
    expect(lastDataRow).toBeGreaterThan(-1);
    expect(totalsAt).toBeGreaterThan(lastDataRow);
    expect(totalsAt).toBeLessThan(tbodyClose);
  });

  it('is the very last row of the table', () => {
    const html = buildTable(COLS, rows(10), TOTALS);
    const afterTotals = html.slice(html.indexOf('<tr class="totals">'));
    // No further <tr> opens after it.
    expect(occurrences(afterTotals, '<tr')).toBe(1);
  });

  it('single-page report — totals still follow the last row on that same page', () => {
    // A one-row report has no page break at all: the total is simply the next row.
    const html = buildTable(COLS, rows(1), TOTALS);
    const dataAt = html.indexOf('مستفيد 1');
    const totalsAt = html.indexOf('<tr class="totals">');
    expect(totalsAt).toBeGreaterThan(dataAt);
    expect(occurrences(html, '<tr class="totals">')).toBe(1);
  });

  it('multi-page report — one totals row in document order, so it lands on the last page', () => {
    // 500 rows will paginate; because the row is emitted once, in flow, after the
    // final data row, the only page it can render on is the last one.
    const html = buildTable(COLS, rows(500), TOTALS);
    expect(occurrences(html, '<tr class="totals">')).toBe(1);
    expect(html.indexOf('<tr class="totals">')).toBeGreaterThan(html.lastIndexOf('مستفيد 500'));
  });

  it('still renders after the empty-state row when there is no data', () => {
    const html = buildTable(COLS, [], TOTALS);
    expect(html.indexOf('<tr class="totals">')).toBeGreaterThan(html.indexOf('لا توجد بيانات'));
    expect(occurrences(html, '<tr class="totals">')).toBe(1);
  });
});

// ── Never split across a page break ──────────────────────────────────────────

describe('totals row is never sliced by a page break', () => {
  it('the stylesheet forbids breaking inside the totals row', () => {
    const css = buildStyles('a4-landscape');
    const rule = css.slice(css.indexOf('tr.totals {'), css.indexOf('tr.totals td'));
    expect(rule).toContain('page-break-inside: avoid');
    expect(rule).toContain('break-inside: avoid');
  });

  it('the guard is present in every print profile', () => {
    for (const profile of ['a4-portrait', 'a4-landscape'] as const) {
      const css = buildStyles(profile);
      expect(css, profile).toContain('tr.totals {');
      expect(css, profile).toMatch(/tr\.totals\s*\{[^}]*break-inside:\s*avoid/);
    }
  });

  it('data rows keep their own break guard (unchanged)', () => {
    const css = buildStyles('a4-landscape');
    expect(css).toMatch(/tbody tr\s*\{[^}]*page-break-inside:\s*avoid/);
  });

  it('the rendered document ships the guard', () => {
    const html = buildReportHtml(input(53), { profile: 'a4-landscape' });
    expect(html).toMatch(/tr\.totals\s*\{[^}]*break-inside:\s*avoid/);
  });
});

// ── Value and formatting unchanged ───────────────────────────────────────────

describe('the total value and its formatting are untouched', () => {
  it('renders the same figure it was given, with the dinar’s 3 decimals', () => {
    const html = buildTable(COLS, rows(53), TOTALS);
    expect(html).toContain('47,687.015');
    expect(html).toContain('إجمالي مبالغ الشيكات');
  });

  it('keeps the totals cells styled as totals cells', () => {
    const html = buildTable(COLS, rows(5), TOTALS);
    const totalsMarkup = html.slice(html.indexOf('<tr class="totals">'));
    expect(totalsMarkup).toContain('class="num"'); // the currency column keeps its numeric class
  });

  it('never renders the #…# cheque-print amount form', () => {
    const html = buildTable(COLS, rows(5), TOTALS);
    expect(html).not.toContain('#47,687');
  });
});

// ── Excel is untouched by an HTML/print-only change ──────────────────────────

describe('Excel export is unaffected', () => {
  it('still writes the totals row as the last sheet row with its numeric format', async () => {
    const buf = await buildExcel(input(53));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];

    const totalsRow = ws.getRow(ws.rowCount);
    // Column 2 carries the caption, column 3 the summed number.
    expect(totalsRow.getCell(2).value).toBe('إجمالي مبالغ الشيكات');
    expect(totalsRow.getCell(3).value).toBe(47687.015);
    expect(totalsRow.getCell(3).numFmt).toBe('#,##0.000');
    expect(totalsRow.getCell(2).font?.bold).toBe(true);
  });

  it('writes it exactly once', async () => {
    const buf = await buildExcel(input(53));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.worksheets[0];
    let seen = 0;
    ws.eachRow((row) => { if (row.getCell(2).value === 'إجمالي مبالغ الشيكات') seen += 1; });
    expect(seen).toBe(1);
  });
});

// ── No regression for other report shapes ───────────────────────────────────

describe('no regression for existing reports', () => {
  it('a report with no totals row renders no totals markup at all', () => {
    const html = buildTable(COLS, rows(5));
    expect(html).not.toContain('class="totals"');
    expect(html).not.toContain('<tfoot');
  });

  it('the invoice compact layout still gets its totals row exactly once', () => {
    const html = buildReportHtml(input(53), { profile: 'a4-landscape', invoiceReportLayout: true });
    expect(occurrences(html, '<tr class="totals">')).toBe(1);
    expect(html).toContain('invoice-report-compact');
    expect(html).not.toContain('<tfoot');
  });

  it('zebra striping and header markup are unchanged', () => {
    const html = buildTable(COLS, rows(4), TOTALS);
    expect(html).toContain('class="zebra"');
    expect(html).toContain('<thead><tr>');
    // The totals row is not zebra-striped.
    expect(html).not.toContain('<tr class="zebra totals">');
  });
});

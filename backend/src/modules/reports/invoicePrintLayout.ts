import type { ReportInput } from '../../shared/services/reportEngine/excel.service';
import type { ReportOptions } from '../../shared/services/reportEngine/reportTypes';
import { formatCurrency } from '../../shared/utils/currency';

// These columns stay in the data and in the Excel export — they're hidden only from
// the printed/HTML layout so the remaining columns fit on one line per row.
const HIDDEN_COLUMNS = new Set(['issueDate', 'paid', 'remaining']);

/** "1-3-6/2026" — months grouped by year, ascending, deduplicated. Multiple years are
 *  joined with ", ". */
function monthsLabel(dates: Date[]): string {
  if (dates.length === 0) return '';
  const byYear = new Map<number, Set<number>>();
  for (const d of dates) {
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    if (!byYear.has(year)) byYear.set(year, new Set());
    byYear.get(year)!.add(month);
  }
  const years = [...byYear.keys()].sort((a, b) => a - b);
  return years
    .map((year) => `${[...byYear.get(year)!].sort((a, b) => a - b).join('-')}/${year}`)
    .join(', ');
}

/** Per-customer rollup (invoice count, total, months) derived only from the rows
 *  already in the report — no extra query, no calculation change. Customers are
 *  ordered by first appearance in `rows`, not alphabetically. */
function buildCustomerSummary(rows: Record<string, unknown>[]): NonNullable<ReportOptions['summaryTable']> {
  const order: string[] = [];
  const byCustomer = new Map<string, { count: number; total: number; dates: Date[] }>();

  for (const row of rows) {
    const name = String(row.party ?? '');
    let entry = byCustomer.get(name);
    if (!entry) {
      entry = { count: 0, total: 0, dates: [] };
      byCustomer.set(name, entry);
      order.push(name);
    }
    entry.count += 1;
    entry.total += Number(row.total ?? 0);
    // Prefer the invoice's accounting month/year (same fields backing "شهر الحساب");
    // fall back to the issue date only when billing month/year weren't set.
    if (row.billingMonth && row.billingYear) {
      entry.dates.push(new Date(Number(row.billingYear), Number(row.billingMonth) - 1, 1));
    } else if (row.issueDate) {
      entry.dates.push(new Date(row.issueDate as string | Date));
    }
  }

  return {
    columns: [
      { header: 'العميل', key: 'customer' },
      { header: 'عدد الفواتير', key: 'invoiceCount' },
      { header: 'إجمالي الفواتير', key: 'total', format: 'currency' as const },
      { header: 'الأشهر', key: 'months' },
    ],
    rows: order.map((name) => {
      const entry = byCustomer.get(name)!;
      return {
        customer: name,
        invoiceCount: entry.count,
        total: entry.total,
        months: monthsLabel(entry.dates),
      };
    }),
  };
}

export interface InvoicePrintLayoutResult {
  data: ReportInput;
  options: Pick<ReportOptions, 'invoiceReportLayout' | 'summaryTable'>;
}

/**
 * Presentation-only transform for the invoices report's HTML/PDF print output.
 * Never touches reports.service.ts — the Excel export and the /preview JSON both keep
 * receiving the original, unmodified ReportInput.
 */
export function applyInvoicePrintLayout(data: ReportInput, statusFilter?: string): InvoicePrintLayoutResult {
  const columns = data.columns
    .filter((c) => !HIDDEN_COLUMNS.has(c.key))
    .map((c) => (c.key === 'party' ? c : { ...c, align: 'center' as const }));

  // Grand-total label moves from the "الجهة" column to "شهر الحساب", right beside the
  // total amount — no calculation change, only repositioning.
  const totalsRow: Record<string, unknown> | undefined = data.totalsRow
    ? { ...data.totalsRow, party: undefined, billingPeriod: 'الإجمالي' }
    : data.totalsRow;

  // "غير مسددة" (UNPAID) filter: collected/remaining aren't meaningful when every
  // invoice is unpaid, so the header summary drops those two segments.
  const hideCollectedRemaining = statusFilter === 'UNPAID';
  const subtitleParts = [
    `العدد: ${data.rows.length}`,
    `الإجمالي: ${formatCurrency(totalsRow?.total ?? 0)}`,
  ];
  if (!hideCollectedRemaining) {
    subtitleParts.push(`المحصّل: ${formatCurrency(totalsRow?.paid ?? 0)}`);
    subtitleParts.push(`المتبقي: ${formatCurrency(totalsRow?.remaining ?? 0)}`);
  }

  return {
    data: {
      ...data,
      columns,
      totalsRow,
      subtitle: subtitleParts.join(' — '),
    },
    options: {
      invoiceReportLayout: true,
      summaryTable: buildCustomerSummary(data.rows),
    },
  };
}

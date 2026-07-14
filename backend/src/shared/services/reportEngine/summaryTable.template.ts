import { esc, fmtCell } from './htmlUtils';
import { moneyHeader } from '../../utils/currency';

export interface SummaryTableColumn {
  header: string;
  key: string;
  format?: 'currency';
}

/**
 * Borderless "clean list" table — e.g. a customer-level rollup shown after the main
 * report table. Presentation-only: the report engine renders whatever rows it's given,
 * it never computes them.
 */
export function buildSummaryTable(
  columns: SummaryTableColumn[],
  rows: Record<string, unknown>[],
): string {
  if (rows.length === 0) return '';

  const headerCells = columns
    .map((c) => `<th>${esc(c.format === 'currency' ? moneyHeader(c.header) : c.header)}</th>`)
    .join('');

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((c) => `<td${c.format === 'currency' ? ' class="num"' : ''}>${fmtCell(row[c.key], c)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('\n');

  return `
    <div class="report-summary-section">
      <table class="report-summary-table">
        <thead><tr>${headerCells}</tr></thead>
        <tbody>${bodyRows}</tbody>
      </table>
    </div>
  `;
}

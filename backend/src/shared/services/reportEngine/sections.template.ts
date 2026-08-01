/**
 * Analytical sections rendered after the main report table.
 *
 * Presentation-only: the caller computes every row and total; this template just
 * renders them with the SAME `buildTable` the main report uses — so a section's
 * columns, currency headers, alignment, zebra striping and totals-row styling are
 * identical to the main table by construction, not by duplication.
 */
import type { ReportSection } from './excel.service';
import { buildTable } from './table.template';
import { esc } from './htmlUtils';

export function buildReportSections(sections: ReportSection[]): string {
  if (!sections || sections.length === 0) return '';
  return sections
    .map(
      (s) => `
    <section class="report-analysis">
      <h2 class="report-analysis-title">${esc(s.title)}</h2>
      ${s.note ? `<p class="report-analysis-note">${esc(s.note)}</p>` : ''}
      ${buildTable(s.columns, s.rows, s.totalsRow)}
    </section>`,
    )
    .join('\n');
}

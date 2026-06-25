import type { ReportInput } from './excel.service';
import type { ReportOptions } from './reportTypes';
import { esc } from './htmlUtils';

export function buildReportHeader(input: ReportInput, options?: ReportOptions): string {
  const at = options?.generatedAt ?? new Date();
  const today = at.toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' });

  const dateRangeLine =
    options?.dateRange?.from || options?.dateRange?.to
      ? `<p class="report-date-range">الفترة: ${esc(options.dateRange!.from ?? '—')} إلى ${esc(options.dateRange!.to ?? '—')}</p>`
      : '';

  const generatedLine = options?.generatedBy
    ? `<p class="report-generated">تاريخ التقرير: ${today} · بواسطة: ${esc(options.generatedBy)}</p>`
    : `<p class="report-generated">تاريخ التقرير: ${today}</p>`;

  return `
    <div class="report-header">
      <h1 class="report-title">${esc(input.title)}</h1>
      ${input.subtitle ? `<p class="report-subtitle">${esc(input.subtitle)}</p>` : ''}
      ${dateRangeLine}
      ${generatedLine}
    </div>
  `;
}

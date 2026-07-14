import type { ReportInput } from './excel.service';
import type { ReportOptions } from './reportTypes';
import { esc } from './htmlUtils';
import { formatDisplayDate, formatDateRange } from '../../utils/dateDisplay';

export function buildReportHeader(input: ReportInput, options?: ReportOptions): string {
  const at = options?.generatedAt ?? new Date();
  const today = formatDisplayDate(at);   // DD/MM/YYYY بأرقام غربية (كان «١٤ يوليو ٢٠٢٦»)

  const dateRangeLine =
    options?.dateRange?.from || options?.dateRange?.to
      // كانت الفترة تُطبع خامًا بصيغة ISO («2026-01-01») — صيغة داخلية لا تُعرض للمستخدم.
      ? `<p class="report-date-range">الفترة: ${esc(formatDateRange(options.dateRange!.from, options.dateRange!.to))}</p>`
      : '';

  const generatedLine = options?.generatedBy
    ? `<p class="report-generated">تاريخ التقرير: ${today} · بواسطة: ${esc(options.generatedBy)}</p>`
    : `<p class="report-generated">تاريخ التقرير: ${today}</p>`;

  if (options?.invoiceReportLayout) {
    const dateRangeText = options?.dateRange?.from || options?.dateRange?.to
      ? `الفترة: ${formatDateRange(options.dateRange!.from, options.dateRange!.to)}`
      : '';
    const generatedText = options?.generatedBy
      ? `تاريخ التقرير: ${today} — بواسطة: ${options.generatedBy}`
      : `تاريخ التقرير: ${today}`;
    const segments = [
      `<span class="report-title-inline">${esc(input.title)}</span>`,
      input.subtitle ? `<span class="report-subtitle-inline">${esc(input.subtitle)}</span>` : '',
      dateRangeText ? `<span class="report-daterange-inline">${esc(dateRangeText)}</span>` : '',
      `<span class="report-generated-inline">${esc(generatedText)}</span>`,
    ].filter(Boolean);
    return `
      <div class="report-header report-header--single-line">
        <p class="report-singleline">${segments.join(' — ')}</p>
      </div>
    `;
  }

  return `
    <div class="report-header">
      <h1 class="report-title">${esc(input.title)}</h1>
      ${input.subtitle ? `<p class="report-subtitle">${esc(input.subtitle)}</p>` : ''}
      ${dateRangeLine}
      ${generatedLine}
    </div>
  `;
}

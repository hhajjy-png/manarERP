import type { PrintProfile, ReportBranding } from './reportTypes';
import { PRINT_PROFILES } from './printProfiles';
import { REPORT_FONT_STACK } from './fonts';

export function resolveTablePadding(density?: 'compact' | 'normal' | 'comfortable'): string {
  if (density === 'compact')     return '2px 6px';
  if (density === 'comfortable') return '6px 12px';
  return '4px 8px';
}

export function resolveLogoWidth(size?: 'small' | 'medium' | 'large'): string {
  if (size === 'medium') return '90px';
  if (size === 'large')  return '120px';
  return '60px';
}

export function resolveLogoJustify(align?: 'start' | 'center' | 'end'): string {
  if (align === 'center') return 'center';
  if (align === 'end')    return 'flex-end';
  return 'flex-start';
}

export function buildStyles(
  profile: PrintProfile = 'a4-landscape',
  branding?: ReportBranding,
  fontFace = '',
): string {
  const p = PRINT_PROFILES[profile];
  const primary   = branding?.primaryColor   ?? '#1d4e6f';
  const secondary = branding?.secondaryColor ?? '#2563eb';
  const headerBg  = `${primary}14`; // 8% opacity tint for company header background

  return `
    ${fontFace}

    @page {
      size: ${p.pageSize} ${p.orientation};
      margin: ${p.margin};
    }

    @page {
      @bottom-center {
        content: "صفحة " counter(page) " من " counter(pages);
        font-family: ${REPORT_FONT_STACK};
        font-size: 7px;
        color: #94a3b8;
      }
    }

    *, *::before, *::after {
      box-sizing: border-box;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    html, body {
      direction: rtl;
      font-family: ${REPORT_FONT_STACK};
      font-size: ${p.fontSize};
      color: #1f2933;
      background: #fff;
      margin: 0;
      padding: 0;
    }

    /* ── Company Header ── */
    .company-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 7px 12px;
      background: ${headerBg};
      border-radius: 6px;
      margin-bottom: 8px;
      border-right: 4px solid ${primary};
    }

    .company-logo-placeholder {
      width: 44px;
      height: 44px;
      border-radius: 8px;
      background: ${primary};
      color: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      font-weight: 800;
      flex-shrink: 0;
    }

    .company-logo {
      width: 44px;
      height: 44px;
      object-fit: contain;
      border-radius: 4px;
    }

    .company-info { flex: 1; }

    .company-name-ar {
      font-size: 17.5px;
      font-weight: 700;
      color: ${primary};
      line-height: 1.25;
    }

    .company-name-en {
      font-size: 8px;
      color: #475569;
      margin-top: 1px;
    }

    .company-contact {
      font-size: 7.5px;
      color: #64748b;
      margin-top: 3px;
    }

    .company-divider {
      border: none;
      border-top: 1.5px solid ${primary}33;
      margin: 0 0 8px 0;
    }

    /* ── Report Header ── */
    .report-header {
      text-align: center;
      margin-bottom: 10px;
    }

    .report-title {
      font-size: 10.5px;
      font-weight: 800;
      color: ${primary};
      margin: 0 0 3px 0;
    }

    .report-subtitle {
      font-size: 10.5px;
      font-weight: 600;
      color: #334155;
      margin: 0 0 2px 0;
    }

    .report-date-range {
      font-size: 9.5px;
      font-weight: 400;
      color: #475569;
      margin: 0 0 2px 0;
    }

    .report-generated {
      font-size: 9.5px;
      font-weight: 400;
      color: #94a3b8;
      margin: 0;
    }

    /* Invoice Report print refinement — single-line report info (opt-in) */
    .report-singleline {
      margin: 0;
      text-align: center;
      font-size: 10.5px;
      white-space: nowrap;
    }

    .report-title-inline {
      font-weight: 800;
      color: ${primary};
    }

    .report-subtitle-inline {
      font-weight: 600;
      color: #334155;
    }

    .report-daterange-inline,
    .report-generated-inline {
      font-weight: 400;
      color: #94a3b8;
      font-size: 9.5px;
    }

    .invoice-report-compact .company-header {
      margin-bottom: 4px;
    }

    .invoice-report-compact .company-divider {
      margin: 0 0 4px 0;
    }

    .invoice-report-compact .report-header--single-line {
      margin-bottom: 4px;
    }

    /* Invoice Report print refinement — reduce logo + company name ~10% (opt-in).
       The logo BOX width/height is set inline (see branding.template.ts's
       logoWidthOverride) because it always wins over a class here; only the
       placeholder letter's font-size is a plain CSS property. */
    .invoice-report-compact .company-logo-placeholder {
      font-size: 19.8px;
    }

    .invoice-report-compact .company-name-ar {
      font-size: 15.75px;
    }

    /* ── Table ── */
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: ${p.tableFontSize};
    }

    thead {
      display: table-header-group;
    }

    tfoot {
      display: table-footer-group;
    }

    thead tr {
      background: ${primary};
      color: #ffffff;
    }

    thead th {
      padding: 7px 8px;
      text-align: right;
      font-size: 10.5px;
      font-weight: 700;
      border: 1px solid ${primary}cc;
      white-space: nowrap;
    }

    /* Invoice Report print refinement — every column header centered (opt-in) */
    .invoice-report-compact thead th {
      text-align: center;
      vertical-align: middle;
    }

    tbody td {
      padding: 6px 8px;
      text-align: right;
      font-size: 9.5px;
      font-weight: 400;
      border: 1px solid #e2e8f0;
    }

    /* Numeric values: aligned digits, semibold */
    td.num {
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      direction: ltr;
      unicode-bidi: isolate;   /* «-1,250.000» لا ينقلب داخل تقرير عربي */
      white-space: nowrap;
    }

    /* Invoice Report print refinement — opt-in via ReportOptions.invoiceReportLayout */
    td.nowrap-cell {
      white-space: nowrap;
    }

    td.cell-center {
      text-align: center;
      vertical-align: middle;
    }

    td.cell-left {
      text-align: left;
      vertical-align: middle;
    }

    tbody tr.zebra {
      background: #f4f6f9;
    }

    tbody tr {
      page-break-inside: avoid;
    }

    tr.totals td {
      padding: 7px 8px;
      text-align: right;
      font-size: 10.5px;
      font-weight: 700;
      background: ${primary}18;
      border: 1px solid ${primary}66;
      border-top: 2px solid ${primary};
      color: ${primary};
    }

    tr.totals td.num {
      font-weight: 700;
    }

    /* Invoice Report print refinement — clean totals band: keep shading + the top
       separator line, drop the per-cell grid borders (opt-in) */
    .invoice-report-compact tr.totals td {
      border: none;
      border-top: 2px solid ${primary};
    }

    /* ── Summary Table (borderless clean list — e.g. customer rollup, opt-in via
       ReportOptions.summaryTable) ── */
    .report-summary-section {
      margin-top: 8px;
      page-break-inside: avoid;
    }

    .report-summary-table {
      width: auto;
      margin: 0 0 0 auto;
      border-collapse: collapse;
    }

    .report-summary-table thead tr {
      background: transparent;
      color: inherit;
    }

    .report-summary-table th,
    .report-summary-table td {
      border: none;
      padding: 3px 10px;
      text-align: right;
      font-size: 8.5px;
      white-space: nowrap;
    }

    .report-summary-table th {
      font-weight: 700;
      color: #475569;
    }

    .report-summary-table td.num {
      font-variant-numeric: tabular-nums;
      direction: ltr;
      unicode-bidi: isolate;
    }

    /* ── Notes ── */
    .report-notes {
      margin-top: 14px;
      padding: 8px 12px;
      background: #f8fafc;
      border-right: 3px solid ${secondary};
      border-radius: 4px;
      font-size: 10px;
      color: #374151;
      page-break-inside: avoid;
    }

    /* ── Signature ── */
    .signature-area {
      display: flex;
      justify-content: space-around;
      margin-top: 36px;
      page-break-inside: avoid;
    }

    .signature-block {
      text-align: center;
      width: 180px;
    }

    .sig-line {
      border-bottom: 1px solid #1f2933;
      margin-bottom: 6px;
      height: 42px;
    }

    .sig-label {
      font-size: 10px;
      color: #475569;
      font-weight: 600;
    }

    /* ── Watermark ── */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-40deg);
      font-size: 80px;
      font-weight: 900;
      color: rgba(0, 0, 0, 0.05);
      pointer-events: none;
      z-index: 9999;
      white-space: nowrap;
      letter-spacing: 8px;
    }

    /* ── Summary Cards ── */
    .summary-cards {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      margin-bottom: 14px;
    }

    .summary-card {
      flex: 1;
      min-width: 120px;
      padding: 10px 12px;
      border-radius: 6px;
      border: 1px solid #e2e8f0;
      page-break-inside: avoid;
    }

    .summary-card.default { background: #f8fafc; }
    .summary-card.green   { background: #f0fdf4; border-color: #86efac; }
    .summary-card.red     { background: #fff1f2; border-color: #fca5a5; }
    .summary-card.blue    { background: #eff6ff; border-color: #93c5fd; }

    .card-label { font-size: 9.5px; color: #6b7280; margin-bottom: 4px; }
    .card-value { font-size: 14px; font-weight: 700; color: #111827; }

    /* ── Profile density + logo sizing ── */
    table td, table th { padding: ${resolveTablePadding(p.tableDensity)}; }
    .branding-logo-wrap { display: flex; justify-content: ${resolveLogoJustify(p.logoAlignment)}; }
    .branding-logo { width: ${resolveLogoWidth(p.logoSize)}; height: auto; }
  `;
}

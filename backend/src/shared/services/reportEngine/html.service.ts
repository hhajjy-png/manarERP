import fs from 'fs';
import path from 'path';
import type { ReportInput } from './excel.service';
import type { ReportOptions } from './reportTypes';
import { buildStyles, resolveLogoWidth } from './styles.template';
import { buildBrandingHeader } from './branding.template';
import { PRINT_PROFILES } from './printProfiles';
import { buildReportHeader } from './header.template';
import { buildPageFooterHtml } from './footer.template';
import { buildTable } from './table.template';
import { buildWatermark } from './watermark.template';
import { buildSummaryTable } from './summaryTable.template';
import { esc } from './htmlUtils';
import { buildEmbeddedFontFaceCss } from './fonts';

/** Scales a "<n>px" width string by `factor`, rounding to one decimal place. */
function scaleWidthPx(px: string, factor: number): string {
  const n = parseFloat(px);
  return Number.isFinite(n) ? `${Math.round(n * factor * 10) / 10}px` : px;
}

const FONT_PATH = path.resolve(process.cwd(), 'assets', 'fonts', 'Cairo-Regular.ttf');

let cachedFontBase64: string | null = null;

function getFontBase64(): string {
  if (cachedFontBase64 !== null) return cachedFontBase64;
  try {
    const buf = fs.readFileSync(FONT_PATH);
    cachedFontBase64 = buf.toString('base64');
  } catch {
    cachedFontBase64 = '';
  }
  return cachedFontBase64;
}

/**
 * Generates a complete, self-contained HTML report.
 *
 * Backward compatible — existing callers that pass only `input` continue to work
 * and receive A4-landscape layout without branding header.
 *
 * Pass `options.branding` to include the company header.
 * Pass `options.watermark` for a diagonal overlay.
 * Pass `options.showSignatureArea` for signature lines.
 */
export function buildReportHtml(input: ReportInput, options?: ReportOptions): string {
  const fontBase64 = getFontBase64();
  const fontFace = buildEmbeddedFontFaceCss(fontBase64);

  const profile       = options?.profile ?? 'a4-landscape';
  const profileConfig = PRINT_PROFILES[profile];
  const styles        = buildStyles(profile, options?.branding, fontFace);
  const watermark     = buildWatermark(options?.watermark);
  const logoWidthOverride = options?.invoiceReportLayout
    ? scaleWidthPx(resolveLogoWidth(profileConfig.logoSize), 0.9)
    : undefined;
  const brandingHdr   = options?.branding
    ? buildBrandingHeader(options.branding, profileConfig, logoWidthOverride)
    : '';
  const reportHdr    = buildReportHeader(input, options);
  const table        = buildTable(input.columns, input.rows, input.totalsRow, {
    noWrapCells: options?.invoiceReportLayout,
    totalsAsLastRow: options?.invoiceReportLayout,
  });
  const summaryTableHtml = options?.summaryTable
    ? buildSummaryTable(options.summaryTable.columns, options.summaryTable.rows)
    : '';
  const footerHtml   = buildPageFooterHtml(options?.branding, options);
  const bodyClass    = options?.invoiceReportLayout ? ' class="invoice-report-compact"' : '';

  const notesSection = options?.notes
    ? `<div class="report-notes"><strong>ملاحظات:</strong> ${esc(options.notes)}</div>`
    : '';

  const signatureArea = options?.showSignatureArea
    ? `<div class="signature-area">
        <div class="signature-block">
          <div class="sig-line"></div>
          <div class="sig-label">المحاسب</div>
        </div>
        <div class="signature-block">
          <div class="sig-line"></div>
          <div class="sig-label">المدير العام</div>
        </div>
      </div>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(input.title)}</title>
  <style>${styles}</style>
</head>
<body${bodyClass}>
  ${watermark}
  ${brandingHdr}
  ${reportHdr}
  ${table}
  ${summaryTableHtml}
  ${notesSection}
  ${signatureArea}
  ${footerHtml}
</body>
</html>`;
}

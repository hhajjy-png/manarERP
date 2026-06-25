import fs from 'fs';
import path from 'path';
import type { ReportInput } from './excel.service';
import type { ReportOptions } from './reportTypes';
import { buildStyles } from './styles.template';
import { buildBrandingHeader } from './branding.template';
import { PRINT_PROFILES } from './printProfiles';
import { buildReportHeader } from './header.template';
import { buildPageFooterHtml } from './footer.template';
import { buildTable } from './table.template';
import { buildWatermark } from './watermark.template';
import { esc } from './htmlUtils';

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
  const fontFace = fontBase64
    ? `@font-face {
        font-family: 'Cairo';
        src: url('data:font/truetype;base64,${fontBase64}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }`
    : '';

  const profile       = options?.profile ?? 'a4-landscape';
  const profileConfig = PRINT_PROFILES[profile];
  const styles        = buildStyles(profile, options?.branding, fontFace);
  const watermark     = buildWatermark(options?.watermark);
  const brandingHdr   = options?.branding ? buildBrandingHeader(options.branding, profileConfig) : '';
  const reportHdr    = buildReportHeader(input, options);
  const table        = buildTable(input.columns, input.rows, input.totalsRow);
  const footerHtml   = buildPageFooterHtml(options?.branding, options);

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
<body>
  ${watermark}
  ${brandingHdr}
  ${reportHdr}
  ${table}
  ${notesSection}
  ${signatureArea}
  ${footerHtml}
</body>
</html>`;
}

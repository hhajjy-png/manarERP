/**
 * Page footer — the only footer content is the "صفحة X من Y" page counter,
 * rendered via the CSS @page @bottom-center counter in styles.template.ts.
 * The previous visible company-name / generated-by bar has been removed per the
 * approved report layout, so this returns no additional HTML.
 */
import type { ReportBranding, ReportOptions } from './reportTypes';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildPageFooterHtml(_branding?: ReportBranding, _options?: ReportOptions): string {
  return '';
}

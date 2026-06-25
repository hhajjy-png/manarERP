/**
 * Page footer — rendered via CSS @page @bottom-* counters in styles.template.ts.
 * This module provides an HTML footer bar shown at the bottom of the last page
 * (useful when running(footer) is not available or when a visible divider is wanted).
 */
import type { ReportBranding, ReportOptions } from './reportTypes';
import { esc } from './htmlUtils';

export function buildPageFooterHtml(branding?: ReportBranding, options?: ReportOptions): string {
  if (!branding && options?.showPageNumbers === false) return '';

  const companyText = branding?.footer ?? branding?.companyNameAr ?? '';
  if (!companyText) return '';

  return `<div style="margin-top:20px; padding-top:6px; border-top:1px solid #e2e8f0; font-size:9px; color:#94a3b8; text-align:center;">${esc(companyText)}</div>`;
}

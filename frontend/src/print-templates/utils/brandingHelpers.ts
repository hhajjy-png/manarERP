import type { CompanyPrintData } from '../engine/types';

export type BrandingBase = Pick<CompanyPrintData, 'signatureUrl' | 'stampUrl' | 'showSignature' | 'showStamp'>;

export interface PrintBrandingOverrides {
  showSignature: boolean;
  showStamp: boolean;
}

/** Merges per-print session overrides onto Settings-sourced branding. URLs come from Settings; show toggles come from the print session. */
export function mergeEffectiveBranding(
  base: BrandingBase,
  overrides: PrintBrandingOverrides,
): BrandingBase {
  return { ...base, showSignature: overrides.showSignature, showStamp: overrides.showStamp };
}

/** Whether a signature image should be rendered given company print data. */
export function shouldShowSignature(
  company: Pick<CompanyPrintData, 'showSignature' | 'signatureUrl'> | undefined,
): boolean {
  return !!(company?.showSignature !== false && company?.signatureUrl);
}

/** Whether a stamp image should be rendered given company print data. */
export function shouldShowStamp(
  company: Pick<CompanyPrintData, 'showStamp' | 'stampUrl'> | undefined,
): boolean {
  return !!(company?.showStamp !== false && company?.stampUrl);
}

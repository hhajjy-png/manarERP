import type { ApiQuotation } from '../adapters/apiTypes';
import type { QuotationPrintData, CompanyPrintData } from '../engine/types';
import { adaptQuotation } from '../adapters/quotationAdapter';
import { createCompanyPrintData } from '../adapters/companyData';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface QuotationBuildOptions {
  /**
   * Shallow overrides for company header data.
   * Applies only truthy string values; defaults to ALMANAR_COMPANY.
   */
  company?: Partial<CompanyPrintData>;

  // ── Future hooks ──────────────────────────────────────────────────────────
  // qrEnabled?: boolean;      — Phase 2: embed QR for online quotation view
  // expiryWarning?: boolean;  — Phase 2: highlight when validity is near expiry
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds a complete QuotationPrintData from an API quotation response.
 *
 * ⚠️ The backend Quotation entity does not exist yet (Phase 1.95).
 * This builder is a forward declaration — it will be wired in Phase 2.
 *
 * @example
 * ```ts
 * const data = buildQuotationPrintData(apiQuotation);
 * <QuotationTemplate data={data} />
 * ```
 */
export function buildQuotationPrintData(
  quotation: ApiQuotation,
  options?: QuotationBuildOptions,
): QuotationPrintData {
  const base = adaptQuotation(quotation);

  if (options?.company) {
    return { ...base, company: createCompanyPrintData(options.company) };
  }

  return base;
}

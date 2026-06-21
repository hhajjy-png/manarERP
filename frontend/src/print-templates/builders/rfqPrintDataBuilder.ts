import type { ApiRFQ } from '../adapters/apiTypes';
import type { RFQPrintData, CompanyPrintData } from '../engine/types';
import { adaptRFQ } from '../adapters/rfqAdapter';
import { createCompanyPrintData } from '../adapters/companyData';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface RFQBuildOptions {
  /**
   * Shallow overrides for company header data.
   * Applies only truthy string values; defaults to ALMANAR_COMPANY.
   */
  company?: Partial<CompanyPrintData>;

  // ── Future hooks ──────────────────────────────────────────────────────────
  // qrEnabled?: boolean;       — Phase 2: embed QR for online RFQ view
  // responseDeadline?: string; — Phase 2: add reply-by date to the footer
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds a complete RFQPrintData from an API RFQ response.
 *
 * ⚠️ The backend RFQ entity does not exist yet (Phase 1.95).
 * This builder is a forward declaration — it will be wired in Phase 2.
 *
 * Note: RFQ line items carry zero prices intentionally — suppliers fill those in.
 *
 * @example
 * ```ts
 * const data = buildRFQPrintData(apiRFQ);
 * <RFQTemplate data={data} />
 * ```
 */
export function buildRFQPrintData(rfq: ApiRFQ, options?: RFQBuildOptions): RFQPrintData {
  const base = adaptRFQ(rfq);

  if (options?.company) {
    return { ...base, company: createCompanyPrintData(options.company) };
  }

  return base;
}

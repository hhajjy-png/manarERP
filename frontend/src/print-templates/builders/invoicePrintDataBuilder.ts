import type { ApiInvoice } from '../adapters/apiTypes';
import type { InvoicePrintData, CompanyPrintData } from '../engine/types';
import { adaptInvoice } from '../adapters/invoiceAdapter';
import { createCompanyPrintData } from '../adapters/companyData';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface InvoiceBuildOptions {
  /**
   * Shallow overrides for company header data.
   * Only truthy string values are applied; omitted keys use the Al-Manar defaults.
   *
   * @example
   * { email: 'accounting@manar.kw' }
   */
  company?: Partial<CompanyPrintData>;

  // ── Future hooks (not yet wired) ──────────────────────────────────────────
  // qrEnabled?: boolean;   — Phase 2: embed QR linking to online invoice view
  // signatory?: string;    — Phase 2: override printed signatory name
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds a complete InvoicePrintData from an API invoice response.
 *
 * Role in the pipeline:
 *   ApiInvoice → adaptInvoice() → [apply overrides + future hooks] → InvoicePrintData
 *
 * Phase 2 production pages should call this builder, not `adaptInvoice` directly.
 *
 * @example
 * ```ts
 * const data = buildInvoicePrintData(apiInvoice);
 * const { resolvedTemplate } = usePrintTemplate('invoice', data);
 * <resolvedTemplate.component data={data} />
 * ```
 */
export function buildInvoicePrintData(
  invoice: ApiInvoice,
  options?: InvoiceBuildOptions,
): InvoicePrintData {
  const base = adaptInvoice(invoice);

  if (options?.company) {
    return { ...base, company: createCompanyPrintData(options.company) };
  }

  return base;
}

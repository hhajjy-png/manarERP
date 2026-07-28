import type { ApiInvoice } from '../adapters/apiTypes';
import type { InvoicePrintData, CompanyPrintData } from '../engine/types';
import { adaptInvoice } from '../adapters/invoiceAdapter';
import { createCompanyPrintData } from '../adapters/companyData';
import type { TafqeetLang } from '../../lib/tafqeet';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface InvoiceBuildOptions {
  /**
   * Shallow overrides for company header data.
   * Only truthy string/boolean values are applied; omitted keys use the Al-Manar defaults.
   *
   * @example
   * { email: 'accounting@manar.kw' }
   */
  company?: Partial<CompanyPrintData>;
  /**
   * Signature and stamp branding. Merged on top of company overrides.
   * Pass from useCompanyBranding() hook.
   */
  branding?: Pick<CompanyPrintData, 'signatureUrl' | 'stampUrl' | 'showSignature' | 'showStamp' | 'brandingLayout' | 'textStyleOverrides' | 'staticTextOverrides'>;
  /**
   * Language for the amount-in-words field only (`totalInWords`). Defaults to
   * 'ar' — every other piece of invoice print content is Arabic-only today (no
   * template branches on document language yet), so this does not change any
   * template's rendered output unless a future caller explicitly passes 'en'.
   */
  lang?: TafqeetLang;

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
  const base = adaptInvoice(invoice, options?.lang ?? 'ar');
  const overrides: Partial<CompanyPrintData> = { ...(options?.company ?? {}), ...(options?.branding ?? {}) };
  if (Object.keys(overrides).length === 0) return base;
  return { ...base, company: createCompanyPrintData(overrides) };
}

import type { ApiInvoice } from '../adapters/apiTypes';
import type { PurchaseOrderPrintData, CompanyPrintData } from '../engine/types';
import { adaptPurchaseOrder } from '../adapters/purchaseOrderAdapter';
import { createCompanyPrintData } from '../adapters/companyData';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface PurchaseOrderBuildOptions {
  /**
   * Shallow overrides for company header data.
   * Applies only truthy string values; defaults to ALMANAR_COMPANY.
   */
  company?: Partial<CompanyPrintData>;

  // ── Future hooks ──────────────────────────────────────────────────────────
  // qrEnabled?: boolean;     — Phase 2: embed QR for online PO view
  // approverName?: string;   — Phase 2: override the printed approver name
}

// ─── Builder ─────────────────────────────────────────────────────────────────

/**
 * Builds a complete PurchaseOrderPrintData from a PURCHASE invoice API response.
 *
 * The backend uses a single Invoice model for both SALES and PURCHASE directions.
 * PURCHASE invoices are printed as purchase orders.
 *
 * @example
 * ```ts
 * if (isPurchaseInvoice(apiInvoice)) {
 *   const data = buildPurchaseOrderPrintData(apiInvoice);
 *   <POTemplate data={data} />
 * }
 * ```
 */
export function buildPurchaseOrderPrintData(
  invoice: ApiInvoice,
  options?: PurchaseOrderBuildOptions,
): PurchaseOrderPrintData {
  const base = adaptPurchaseOrder(invoice);

  if (options?.company) {
    return { ...base, company: createCompanyPrintData(options.company) };
  }

  return base;
}

import type { ApiQuotation } from './apiTypes';
import type { QuotationPrintData, PrintLineItem } from '../engine/types';
import { getDefaultCompanyPrintData } from './companyData';
import { formatDateForPrint } from '../utils/formatDate';

// ─── Line-item mapping ────────────────────────────────────────────────────────

function toLineItems(items: ApiQuotation['items']): PrintLineItem[] {
  return items.map((item, i) => ({
    number: i + 1,
    descriptionAr: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
  }));
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Adapts a Quotation API response to QuotationPrintData.
 *
 * ⚠️  FORWARD DECLARATION — the backend has no Quotation entity as of Phase 1.95.
 *
 * ## Expected future API shape
 *
 * When the backend adds GET /api/quotations/:id, the response will match
 * `ApiQuotation` (see adapters/apiTypes.ts).  Required fields:
 *   - quotationNumber  — e.g. "MN-QT-2026-0001"
 *   - issueDate        — ISO date string
 *   - validityDays     — integer, default 30
 *   - subject          — short Arabic description of the work
 *   - customerName     — full company/person name in Arabic
 *   - items[]          — each with description, unit, quantity, unitPrice, total
 *
 * ## Intentionally optional fields
 *
 *   - attention        — contact person at the customer; omitted on most quotations
 *   - terms[]          — payment/delivery conditions; omitted when standard terms apply
 *   - notes            — free-text footer; omitted when blank
 *
 * ## Phase 2 wiring
 *
 * ```ts
 * // In the future Quotation page:
 * import { buildQuotationPrintData } from '../print-templates/builders';
 *
 * const data = buildQuotationPrintData(apiResponse);
 * <QuotationTemplate data={data} />
 * ```
 *
 * ## Manual/test usage (current)
 *
 * Until the backend endpoint exists, callers can construct `ApiQuotation`
 * manually from form state and pass it here.  The adapter has no side effects.
 */
export function adaptQuotation(quotation: ApiQuotation): QuotationPrintData {
  const grandTotal = quotation.items.reduce((sum, item) => sum + item.total, 0);

  return {
    company: getDefaultCompanyPrintData(),
    quotationNumber: quotation.quotationNumber,
    date: formatDateForPrint(quotation.issueDate),
    customerName: quotation.customerName,
    attention: quotation.attention ?? undefined,
    validity: `${quotation.validityDays} يوماً من تاريخ العرض`,
    subject: quotation.subject,
    lineItems: toLineItems(quotation.items),
    grandTotal,
    terms: quotation.terms.length > 0 ? quotation.terms : undefined,
    notes: quotation.notes ?? undefined,
  };
}

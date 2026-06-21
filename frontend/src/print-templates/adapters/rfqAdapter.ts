import type { ApiRFQ } from './apiTypes';
import type { RFQPrintData, PrintLineItem } from '../engine/types';
import { getDefaultCompanyPrintData } from './companyData';
import { formatDateForPrint } from '../utils/formatDate';

// ─── Line-item mapping ────────────────────────────────────────────────────────

function toLineItems(items: ApiRFQ['items']): PrintLineItem[] {
  return items.map((item, i) => ({
    number: i + 1,
    descriptionAr: item.description,
    unit: item.unit,
    quantity: item.quantity,
    // RFQ items intentionally carry no price — the supplier fills those in.
    unitPrice: 0,
    total: 0,
  }));
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

/**
 * Adapts an RFQ API response to RFQPrintData.
 *
 * ⚠️  FORWARD DECLARATION — the backend has no RFQ entity as of Phase 1.95.
 *
 * ## Expected future API shape
 *
 * When the backend adds GET /api/rfq/:id, the response will match
 * `ApiRFQ` (see adapters/apiTypes.ts).  Required fields:
 *   - rfqNumber     — e.g. "MN-RFQ-2026-0001"
 *   - issueDate     — ISO date string
 *   - supplierName  — full company name in Arabic
 *   - subject       — short Arabic description of the requested goods/services
 *   - items[]       — each with description, unit, quantity ONLY (no price)
 *
 * ## Intentionally optional fields
 *
 *   - attention     — supplier contact person; omitted when addressing the company generally
 *   - terms[]       — delivery/payment requirements; omitted when standard terms apply
 *   - notes         — free-text footer; omitted when blank
 *
 * ## RFQ-specific design decision
 *
 * RFQ line items have `unitPrice: 0` and `total: 0` intentionally.
 * The purpose of an RFQ is to request pricing — the supplier fills in prices
 * on their reply.  Templates should hide or grey out price columns when
 * all items carry zero prices.
 *
 * ## Phase 2 wiring
 *
 * ```ts
 * // In the future RFQ page:
 * import { buildRFQPrintData } from '../print-templates/builders';
 *
 * const data = buildRFQPrintData(apiResponse);
 * <RFQTemplate data={data} />
 * ```
 *
 * ## Manual/test usage (current)
 *
 * Callers can construct `ApiRFQ` manually from form state.
 * The adapter has no side effects and makes no API calls.
 */
export function adaptRFQ(rfq: ApiRFQ): RFQPrintData {
  return {
    company: getDefaultCompanyPrintData(),
    rfqNumber: rfq.rfqNumber,
    date: formatDateForPrint(rfq.issueDate),
    supplierName: rfq.supplierName,
    attention: rfq.attention ?? undefined,
    subject: rfq.subject,
    lineItems: toLineItems(rfq.items),
    notes: rfq.notes ?? undefined,
    terms: rfq.terms.length > 0 ? rfq.terms : undefined,
  };
}

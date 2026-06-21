import type { ApiInvoice } from './apiTypes';
import type { PurchaseOrderPrintData, PrintLineItem } from '../engine/types';
import { getDefaultCompanyPrintData } from './companyData';
import { tafqeet } from '../utils/tafqeet';
import { formatDateForPrint } from '../utils/formatDate';

function toLineItems(items: ApiInvoice['items']): PrintLineItem[] {
  return items.map((item, i) => ({
    number: i + 1,
    descriptionAr: item.description,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
  }));
}

/**
 * Adapts a PURCHASE invoice API response to the PurchaseOrderPrintData shape.
 *
 * The backend uses a single Invoice model for both SALES and PURCHASE directions.
 * Purchase invoices map to PurchaseOrder print templates.
 *
 * Usage (Phase 2):
 * ```ts
 * const data = adaptPurchaseOrder(apiResponse);
 * <Template data={data} />
 * ```
 */
export function adaptPurchaseOrder(invoice: ApiInvoice): PurchaseOrderPrintData {
  const supplierName = invoice.supplier?.name ?? invoice.customer?.name ?? '';
  const deliveryLocation = invoice.contract?.asphaltPlant ?? undefined;

  return {
    company: getDefaultCompanyPrintData(),
    poNumber: invoice.invoiceNumber,
    date: formatDateForPrint(invoice.issueDate),
    supplierName,
    deliveryLocation,
    lineItems: toLineItems(invoice.items),
    grandTotal: invoice.total,
    notes: invoice.notes ?? undefined,
    terms: invoice.dueDate
      ? [`الاستحقاق: ${formatDateForPrint(invoice.dueDate)}`]
      : undefined,
  };
}

/**
 * Infers whether an invoice should use a PO template (PURCHASE direction).
 */
export function isPurchaseInvoice(invoice: ApiInvoice): boolean {
  return invoice.direction === 'PURCHASE';
}

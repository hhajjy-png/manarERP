import type { ApiInvoice } from './apiTypes';
import type { InvoicePrintData, PrintLineItem } from '../engine/types';
import { getDefaultCompanyPrintData } from './companyData';
import { tafqeet } from '../utils/tafqeet';
import { splitKWD } from '../utils/formatKWD';
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
 * Adapts a SALES invoice API response to the InvoicePrintData shape
 * required by invoice print templates.
 *
 * Usage (Phase 2):
 * ```ts
 * const data = adaptInvoice(apiResponse);
 * <Template data={data} />
 * ```
 */
export function adaptInvoice(invoice: ApiInvoice): InvoicePrintData {
  const { dinars, fils } = splitKWD(invoice.total);
  const partyName = invoice.customer?.name ?? invoice.supplier?.name ?? '';

  return {
    company: getDefaultCompanyPrintData(),
    invoiceNumber: invoice.invoiceNumber,
    date: formatDateForPrint(invoice.issueDate),
    customerName: partyName,
    projectName: invoice.contract?.asphaltPlant ?? undefined,
    lineItems: toLineItems(invoice.items),
    totalDinars: dinars,
    totalFils: fils,
    totalInWords: tafqeet(invoice.total),
    notes: invoice.notes ?? undefined,
  };
}

import type { ApiInvoice } from './apiTypes';
import type { InvoicePrintData, PrintLineItem } from '../engine/types';
import { getDefaultCompanyPrintData } from './companyData';
import { amountToWordsInvoiceKWD, type TafqeetLang } from '../../lib/tafqeet';
import { splitKWD } from '../utils/formatKWD';
import { formatDateForPrint } from '../utils/formatDate';
import { resolveName } from '../../lib/resolveName';

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
export function adaptInvoice(invoice: ApiInvoice, lang: TafqeetLang = 'ar'): InvoicePrintData {
  const { dinars, fils } = splitKWD(invoice.total);
  const partyName = invoice.customer
    ? resolveName(invoice.customer, lang)
    : invoice.supplier
      ? resolveName(invoice.supplier, lang)
      : '';

  return {
    company: getDefaultCompanyPrintData(),
    invoiceNumber: invoice.invoiceNumber,
    date: formatDateForPrint(invoice.issueDate),
    customerName: partyName,
    projectName: invoice.contract?.asphaltPlant ?? undefined,
    lineItems: toLineItems(invoice.items),
    totalDinars: dinars,
    totalFils: fils,
    totalInWords: amountToWordsInvoiceKWD(invoice.total, lang),
    notes: invoice.notes ?? undefined,
  };
}

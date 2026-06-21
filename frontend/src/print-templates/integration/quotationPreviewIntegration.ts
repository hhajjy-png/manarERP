import type { QuotationPrintData, PrintLineItem } from '../engine/types';
import type { QuotationPrintFields, QuotationItem } from '../../forms/QuotationTemplate';
import { getDefaultCompanyPrintData } from '../adapters/companyData';
import { formatDateForPrint } from '../utils/formatDate';

// ─── Shared warning type (same shape as invoicePreviewIntegration) ────────────

export interface PrintDataWarning {
  field: string;
  messageAr: string;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates QuotationPrintData for missing required fields.
 * Returns non-blocking warnings — the caller decides what to show.
 * Never throws.
 */
export function validateQuotationPrintData(data: QuotationPrintData): PrintDataWarning[] {
  const warnings: PrintDataWarning[] = [];

  if (!data.quotationNumber) {
    warnings.push({ field: 'quotationNumber', messageAr: 'رقم العرض مفقود' });
  }
  if (!data.customerName) {
    warnings.push({ field: 'customerName', messageAr: 'اسم العميل مفقود' });
  }
  if (!data.subject) {
    warnings.push({ field: 'subject', messageAr: 'موضوع العرض مفقود' });
  }
  if (data.lineItems.length === 0) {
    warnings.push({ field: 'lineItems', messageAr: 'العرض لا يحتوي على بنود' });
  }
  if (data.grandTotal <= 0) {
    warnings.push({ field: 'grandTotal', messageAr: 'إجمالي العرض صفر أو غير محدد' });
  }

  return warnings;
}

// ─── Form → PrintData adapter ─────────────────────────────────────────────────

function toLineItem(item: QuotationItem, index: number): PrintLineItem {
  const quantity = parseFloat(item.qty) || 0;
  const unitPrice = parseFloat(item.unitPrice) || 0;
  return {
    number: index + 1,
    descriptionAr: item.description,
    unit: item.unit || '',
    quantity,
    unitPrice,
    total: Math.round(quantity * unitPrice * 1000) / 1000,
  };
}

/**
 * Converts the Quotation page's local form state (QuotationPrintFields) to the
 * QuotationPrintData shape required by the print template engine.
 *
 * This adapter runs client-side from user-entered form data (no API call).
 * All numeric fields are safely parsed; missing optional fields produce `undefined`
 * (not null), which the templates treat as "omit this section".
 *
 * Called in Quotation.tsx before switching to engine preview mode.
 */
export function adaptFormToQuotationPrintData(fields: QuotationPrintFields): QuotationPrintData {
  const lineItems = fields.items.map(toLineItem);
  const subtotal = Math.round(lineItems.reduce((s, i) => s + i.total, 0) * 1000) / 1000;

  const terms = fields.paymentTerms.trim() ? [fields.paymentTerms.trim()] : undefined;

  return {
    company: getDefaultCompanyPrintData(),
    quotationNumber: fields.quotationNumber,
    date: formatDateForPrint(fields.date),
    customerName: fields.customerName,
    attention: fields.contactPerson.trim() || undefined,
    validity: fields.validUntil
      ? formatDateForPrint(fields.validUntil)
      : '30 يوماً من تاريخ العرض',
    subject: fields.subject,
    projectName: fields.project.trim() || undefined,
    lineItems,
    subtotal,
    discount: 0,
    grandTotal: subtotal,
    terms,
    notes: fields.notes.trim() || undefined,
  };
}

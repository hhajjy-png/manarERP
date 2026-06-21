import type { InvoicePrintData } from '../engine/types';

export interface PrintDataWarning {
  field: string;
  messageAr: string;
}

/**
 * Validates InvoicePrintData for common missing fields.
 * Returns non-blocking warnings — the caller decides whether to suppress printing.
 */
export function validateInvoicePrintData(data: InvoicePrintData): PrintDataWarning[] {
  const warnings: PrintDataWarning[] = [];
  if (!data.invoiceNumber) {
    warnings.push({ field: 'invoiceNumber', messageAr: 'رقم الفاتورة مفقود' });
  }
  if (!data.customerName) {
    warnings.push({ field: 'customerName', messageAr: 'اسم العميل / المورد مفقود' });
  }
  if (data.lineItems.length === 0) {
    warnings.push({ field: 'lineItems', messageAr: 'الفاتورة لا تحتوي على بنود' });
  }
  return warnings;
}

const INVOICE_STATUS_MAP: Record<string, string> = {
  UNPAID: 'غير مسددة',
  PARTIAL: 'مسددة جزئياً',
  PAID: 'مسددة',
  OVERDUE: 'متأخرة',
  CANCELLED: 'ملغاة',
  DRAFT: 'مسودة',
  PRINTED: 'مطبوعة',
  REVERSED: 'معكوسة',
  VOID: 'لاغية',
};

export function translateInvoiceStatusAr(status: string): string {
  return INVOICE_STATUS_MAP[status] ?? status;
}

/**
 * Cheque status labels — deliberately SEPARATE from the invoice map above
 * (Cheques Reporting & Excel Export Pack v1).
 *
 * A cheque is «شيك» (masculine) while an invoice is «فاتورة» (feminine), so the
 * shared map's `PRINTED: 'مطبوعة'` / `CANCELLED: 'ملغاة'` would read wrong on a
 * cheque. These strings are the EXACT values the Cheques screen renders (see
 * `cheque.status.*` in the frontend i18n catalogue and `STATUS_META` in
 * Cheques.tsx), so the report and the Excel export label a cheque's status
 * identically to the screen it came from. The status model itself is untouched.
 */
const CHEQUE_STATUS_MAP: Record<string, string> = {
  DRAFT: 'مسودة',
  PRINTED: 'مطبوع',
  CANCELLED: 'ملغي',
};

export function translateChequeStatusAr(status: string): string {
  return CHEQUE_STATUS_MAP[status] ?? status;
}

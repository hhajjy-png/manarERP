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

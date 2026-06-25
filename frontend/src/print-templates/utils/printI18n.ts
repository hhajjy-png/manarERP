const INVOICE_STATUS_MAP: Record<string, string> = {
  UNPAID:    'غير مسددة',
  PARTIAL:   'مسددة جزئياً',
  PAID:      'مسددة',
  OVERDUE:   'متأخرة',
  CANCELLED: 'ملغاة',
  DRAFT:     'مسودة',
  APPROVED:  'معتمد',
  REJECTED:  'مرفوض',
  PENDING:   'قيد الانتظار',
  PRINTED:   'مطبوعة',
  REVERSED:  'معكوسة',
  VOID:      'لاغية',
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  CASH:     'نقداً',
  BANK:     'بنك',
  CHEQUE:   'شيك',
  TRANSFER: 'تحويل',
};

const INVOICE_DIRECTION_MAP: Record<string, string> = {
  SALES:    'نقليات عميل',
  PURCHASE: 'مشتريات مورّد',
};

const REF_TYPE_MAP: Record<string, string> = {
  INVOICE:       'فاتورة',
  PAYMENT:       'دفعة',
  EXPENSE:       'مصروف',
  JOURNAL_ENTRY: 'قيد',
  MANUAL:        'يدوي',
  CONTRACT:      'عقد',
};

const DOCUMENT_STATE_MAP: Record<string, string> = {
  APPROVED:  'معتمد',
  REJECTED:  'مرفوض',
  DRAFT:     'مسودة',
  CANCELLED: 'ملغي',
  PENDING:   'قيد الانتظار',
};

export function translateInvoiceStatus(status: string): string {
  return INVOICE_STATUS_MAP[status] ?? status;
}

export function translatePaymentMethod(method: string): string {
  return PAYMENT_METHOD_MAP[method] ?? method;
}

export function translateInvoiceDirection(direction: string): string {
  return INVOICE_DIRECTION_MAP[direction] ?? direction;
}

export function translateRefType(type: string): string {
  return REF_TYPE_MAP[type] ?? type;
}

export function translateDocumentState(state: string): string {
  return DOCUMENT_STATE_MAP[state] ?? state;
}

export function formatArabicDate(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(date);
  }
}

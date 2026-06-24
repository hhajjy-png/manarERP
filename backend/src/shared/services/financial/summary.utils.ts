export function buildSubtitle(fromDate?: string, toDate?: string): string {
  if (fromDate && toDate) return `من ${fromDate} إلى ${toDate}`;
  if (fromDate) return `من ${fromDate}`;
  if (toDate) return `حتى ${toDate}`;
  return 'كل الفترات';
}

export function formatDate(dateStr: string | Date): string {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toISOString().slice(0, 10);
}

export function translateRefType(type: string): string {
  const map: Record<string, string> = {
    INVOICE:       'فاتورة',
    PAYMENT:       'دفعة',
    EXPENSE:       'مصروف',
    JOURNAL_ENTRY: 'قيد',
    MANUAL:        'يدوي',
    CONTRACT:      'عقد',
  };
  return map[type] ?? type;
}

export function sanitizeFilters(filters: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined && v !== null && v !== '') safe[k] = v;
  }
  return safe;
}

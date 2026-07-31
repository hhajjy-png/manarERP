import { formatDisplayDate } from '../../utils/dateDisplay';

/**
 * عنوان فرعي للتقرير — حدود الفترة **بصيغة العرض** `DD/MM/YYYY`، لا الصيغة
 * القانونية `YYYY-MM-DD` التي تصل من الـAPI. الصيغة القانونية سلكية داخلية
 * ولا يجوز أن تظهر في عنوان أو خلية يقرأها المستخدم.
 */
export function buildSubtitle(fromDate?: string, toDate?: string): string {
  if (fromDate && toDate) return `من ${formatDisplayDate(fromDate)} إلى ${formatDisplayDate(toDate)}`;
  if (fromDate) return `من ${formatDisplayDate(fromDate)}`;
  if (toDate) return `حتى ${formatDisplayDate(toDate)}`;
  return 'كل الفترات';
}

/**
 * تاريخ خلية التقرير (كشف الحساب/الأستاذ/اليومية) بصيغة العرض `DD/MM/YYYY`.
 *
 * كانت `toISOString().slice(0,10)` — وهي معيبة مرّتين: تعرض الصيغة القانونية
 * للمستخدم، **و** تقرأ اليوم بتوقيت UTC. قيد مُخزَّن عند منتصف الليل المحلي
 * (`new Date(y,m,d)`) يصبح 21:00 من اليوم السابق بتوقيت UTC في الكويت
 * (UTC+03:00)، فكان التاريخ المعروض ينزلق يومًا كاملًا إلى الوراء.
 * `formatDisplayDate` يقرأ مكوّنات التاريخ المحلية، فلا انزلاق.
 */
export function formatDate(dateStr: string | Date): string {
  return formatDisplayDate(dateStr);
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

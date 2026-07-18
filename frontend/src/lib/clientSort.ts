import type { SortDir } from '../hooks/useTableSort';

/**
 * فرز الواجهة الموحّد (Enterprise Data Grid Foundation v1) — للجداول المحمَّلة
 * **بكاملها** من الخادم بلا ترقيم خادمي (المستخدمون، تبويبات الصيانة، رصيد
 * المخزون…). هناك الفرز المحلي فوق المجموعة الكاملة صحيح؛ أمّا الجداول المرقّمة
 * خادميًا فيبقى فرزها خادميًا حصرًا (فرز صفحة واحدة يضلّل).
 *
 * التنفيذ الوحيد المعتمد للمقارنة المحلية — لا comparators لكل صفحة:
 * - الفراغات (null/undefined/'') آخرًا دائمًا في الاتجاهين (نفس سياسة
 *   nulls: 'last' الخادمية).
 * - أرقام ↔ أرقام: مقارنة عددية. تواريخ (Date أو ISO): زمنية. غير ذلك: نصية
 *   بترتيب عربي مع numeric (الأكواد مثل C-10 بعد C-2).
 * - الفرز مستقر: التعادل يحافظ على الترتيب الوارد من الخادم.
 */

const AR_COLLATOR = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') return Number(a) - Number(b);
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const sa = String(a);
  const sb = String(b);
  if (ISO_DATE.test(sa) && ISO_DATE.test(sb)) {
    const ta = Date.parse(sa);
    const tb = Date.parse(sb);
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta - tb;
  }
  return AR_COLLATOR.compare(sa, sb);
}

export function sortRowsClient<T>(
  rows: readonly T[],
  sortBy: string | null,
  sortDir: SortDir,
  /** مستخرج القيمة الخام للعمود — افتراضيًا الحقل المباشر row[sortBy]. */
  getValue?: (row: T, key: string) => unknown,
): T[] {
  if (!sortBy) return [...rows];
  const read = getValue ?? ((row: T, key: string) => (row as Record<string, unknown>)[key]);
  const sign = sortDir === 'asc' ? 1 : -1;
  return rows
    .map((row, index) => ({ row, index, value: read(row, sortBy) }))
    .sort((x, y) => {
      const xBlank = isBlank(x.value);
      const yBlank = isBlank(y.value);
      if (xBlank || yBlank) {
        if (xBlank && yBlank) return x.index - y.index;
        return xBlank ? 1 : -1; // الفراغات آخرًا في الاتجاهين
      }
      const cmp = compareValues(x.value, y.value) * sign;
      return cmp !== 0 ? cmp : x.index - y.index; // استقرار
    })
    .map((e) => e.row);
}

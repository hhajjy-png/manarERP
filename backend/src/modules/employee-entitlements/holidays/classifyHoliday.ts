import { FIXED_KUWAIT_HOLIDAYS } from './fixedKuwaitHolidays';
import type { HolidayOrigin, HolidayStatus } from '../models/Holiday';

/**
 * يصنّف عطلة مخزَّنة بالفعل (origin/status) وقت القراءة فقط — تصنيف عرضي مُشتقّ، وليس
 * عمودًا مخزَّنًا (لا تغيير في مخطط جدول Holiday). المطابقة تتم على الشهر/اليوم مقابل
 * `FIXED_KUWAIT_HOLIDAYS`؛ أي عطلة لا تُطابق تُصنَّف افتراضيًا كعطلة هجرية أُدخلت يدويًا
 * — فكل عطل الكويت الرسمية غير الثلاث الثابتة هجرية بطبيعتها (عيد الفطر، عرفة، عيد
 * الأضحى، إلخ)، وأي صف مخزَّن اليوم أُدخل يدويًا (لا مصدر توليد هجري تلقائي بعد).
 */
export function classifyHoliday(date: Date): { origin: HolidayOrigin; status: HolidayStatus } {
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const isFixed = FIXED_KUWAIT_HOLIDAYS.some((h) => h.month === month && h.day === day);
  if (isFixed) return { origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' };
  return { origin: 'HIJRI', status: 'MANUALLY_ADJUSTED' };
}

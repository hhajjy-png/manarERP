import { AppError } from '../../core/errors/AppError';
import { daysInMonth } from '../../core/utils/dateOnly';

/**
 * المصدر الموحّد الوحيد للتحقق من أن تاريخ المستند (فاتورة/مصروف) يقع داخل
 * شهر الحساب المحدد له. تُستدعى من طبقة الخدمة (Service) في كل من الفواتير
 * والمصروفات — عند Create وEdit كليهما — فتعمل حتى لو استُدعي الـ API مباشرة
 * دون المرور بالواجهة.
 *
 * إلزامية 100%: لا Override، لا Skip، لا Hidden Flag، لا وضع Administrator.
 * أي استثناء مستقبلي يُنفَّذ في حزمة مستقلة، لا هنا.
 */

/** يقارن على مستوى اليوم بالتقويم المحلي — نفس نمط `periodLock.service.ts`. */
function toLocalYMD(date: Date): number {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

export const DOCUMENT_DATE_OUT_OF_PERIOD_MESSAGE =
  'لا يمكن حفظ المستند. تاريخ المستند لا يقع ضمن شهر الحساب المحدد. يرجى تعديل تاريخ المستند أو شهر الحساب بحيث يكونان ضمن نفس الفترة المحاسبية.';

/**
 * تتحقق أن `date` يقع بين أول وآخر يوم فعلي (تقويميًا) لـ `billingMonth`/`billingYear`.
 * إذا لم يُحدَّد أحد الحقلين (كلاهما اختياري في الفواتير والمصروفات) فلا توجد فترة
 * محاسبية للمقارنة معها — لا تحقق، ويمر الحفظ دون اعتراض.
 */
export function assertDateWithinBillingPeriod(
  date: Date,
  billingMonth: number | null | undefined,
  billingYear: number | null | undefined,
): void {
  if (billingMonth == null || billingYear == null) return;

  const lastDay = daysInMonth(billingYear, billingMonth);
  const periodStart = billingYear * 10000 + billingMonth * 100 + 1;
  const periodEnd = billingYear * 10000 + billingMonth * 100 + lastDay;
  const value = toLocalYMD(date);

  if (value < periodStart || value > periodEnd) {
    throw AppError.badRequest(DOCUMENT_DATE_OUT_OF_PERIOD_MESSAGE);
  }
}

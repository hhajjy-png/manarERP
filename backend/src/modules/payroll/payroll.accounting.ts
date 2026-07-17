/**
 * تاريخ قيد الرواتب المحاسبي — لا يزال يُستخدم لتحديد `transactionDate` عند تسجيل
 * حركة الصرف في السجل التاريخي (recordHistoricalEntry)، وإن لم تعد الرواتب تُرحَّل
 * تلقائيًا إلى الأستاذ العام (قرار العمل النهائي — Payroll GL Posting Removal Pack v1).
 *
 * السياسة:
 *   1. تاريخ صرف صريح من المستخدم إن وُجد.
 *   2. وإلا: آخر يوم في شهر وسنة الراتب.
 * لا يُستخدم تاريخ اليوم أبدًا كتاريخ محاسبي — راتب ديسمبر 2024 يُسجَّل
 * في 31/12/2024 مهما كان تاريخ إدخاله.
 *
 * `new Date(year, month, 0)` — اليوم صفر من الشهر التالي = آخر يوم في الشهر
 * الحالي، لأن `month` هنا 1-based بينما مُنشئ Date يتوقع 0-based.
 */
export function resolvePayrollPostingDate(
  payroll: { month: number; year: number },
  explicitPaymentDate?: Date | null,
): Date {
  return explicitPaymentDate ?? new Date(payroll.year, payroll.month, 0);
}

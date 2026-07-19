/**
 * مساعدات عرض بحتة لسجل المستحقات المصروفة — للعرض فقط، بلا أي أثر على الاحتساب.
 *
 * الشارة «مرتبط بتسوية الإجازة» مؤشّر بصري فقط: تُشتق لحظة العرض من مطابقة تاريخ صف
 * «بدل الإجازة» مع تاريخ تسوية إجازة لنفس الموظف. لا مفتاح أجنبي، لا تبعية حسابية، ولا
 * مزامنة تلقائية — إزالة هذا الملف بالكامل لا تؤثر في أي احتساب.
 */

/** مفتاح اليوم (YYYY-MM-DD) من سلسلة تاريخ ISO — للمطابقة على مستوى اليوم فقط. */
export function dayKey(iso: string | null | undefined): string {
  return iso ? String(iso).slice(0, 10) : '';
}

/** true إذا وُجدت تسوية إجازة بنفس اليوم (مؤشّر بصري فقط، بلا ربط منطقي). */
export function hasMatchingSettlement(entryDateIso: string, settlementDayKeys: ReadonlySet<string>): boolean {
  const key = dayKey(entryDateIso);
  return key !== '' && settlementDayKeys.has(key);
}

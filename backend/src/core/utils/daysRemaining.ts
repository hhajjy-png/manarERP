/**
 * عقد «الأيام المتبقية» الموحَّد — Financial Precision & KPI Hardening Pack v4.
 *
 * تدقيق 2026-08-22 وجد ثلاث طرق مختلفة لحساب المفهوم نفسه في ثلاث وحدات:
 *
 *   • مركز الوثائق:   `Math.floor((expiry − now) / 86_400_000)` بطابع زمني **حيّ**
 *   • تأمين المركبات: تطبيع الطرفين إلى منتصف ليل UTC ثم `Math.round`
 *   • المعدات:        تطبيع الطرفين إلى منتصف الليل المحلي ثم `Math.round`
 *
 * النتيجة أن وثيقة تنتهي **اليوم** كانت تُقرأ «منتهية منذ يوم» في مركز الوثائق (لأن
 * `now` بعد منتصف الليل بساعات فيصير الفرق سالبًا ثم يُقرَّب لأسفل) بينما تُقرأ «سارية
 * اليوم» في الوحدتين الأخريين. ثلاث إجابات لسؤال واحد عن الوثيقة نفسها.
 *
 * العقد المعتمد هنا هو عقد تأمين المركبات — لأنه يطابق طريقة **التخزين**: تواريخ
 * الوثائق تُحفَظ عند منتصف ليل UTC (`dateOnlySchema`)، فلا يصحّ طرح طابع زمني حيّ منها.
 * نطبّع «اليوم» إلى نفس التمثيل أولًا، فيصير الفرق عددًا صحيحًا من الأيام دائمًا:
 *
 *   • أمس  ⇒ `-1`  (منتهية)
 *   • اليوم ⇒ `0`   (تنتهي اليوم — لا تزال سارية طوال يومها)
 *   • غدًا  ⇒ `+1`  (تنتهي قريبًا)
 *
 * «اليوم» يُشتقّ من مكوّنات التاريخ **المحلية** (`getFullYear/Month/Date`) فيتبع
 * التقويم الذي يراه المستخدم في الكويت، لا تقويم UTC.
 *
 * لا تُوحَّد هنا **عتبات** التنبيه (7/15/30/60/90): لكل وحدة عتباتها لأغراض مختلفة،
 * وهي مُعرَّفة في `config/thresholds.ts`. الموحَّد هو **طريقة العدّ** وحدها.
 */

const MS_PER_DAY = 86_400_000;

/**
 * منتصف ليل UTC لليوم التقويمي **المحلي** الحالي — التمثيل الذي تُخزَّن به تواريخ
 * الوثائق، فتصير المقارنة بين قيمتين من النوع نفسه.
 */
export function todayAsStoredDate(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * عدد الأيام المتبقية حتى تاريخ الانتهاء.
 * `0` = تنتهي اليوم · سالب = منتهية منذ ذلك العدد · موجب = ما تبقّى.
 */
export function daysUntil(expiryDate: Date, now: Date = new Date()): number {
  const end = Date.UTC(
    expiryDate.getUTCFullYear(),
    expiryDate.getUTCMonth(),
    expiryDate.getUTCDate(),
  );
  return Math.round((end - todayAsStoredDate(now).getTime()) / MS_PER_DAY);
}

/** منتهية فعلًا — أي أن يومها الأخير مضى. اليوم نفسه **ليس** منتهيًا. */
export function isExpired(daysRemaining: number): boolean {
  return daysRemaining < 0;
}

/** تنتهي اليوم — لا تزال سارية، لكنها آخر يوم لها. */
export function expiresToday(daysRemaining: number): boolean {
  return daysRemaining === 0;
}

/** تقع ضمن نافذة التنبيه المعطاة (شاملةً اليوم الأخير)، وليست منتهية بعد. */
export function expiresWithin(daysRemaining: number, windowDays: number): boolean {
  return daysRemaining >= 0 && daysRemaining <= windowDays;
}

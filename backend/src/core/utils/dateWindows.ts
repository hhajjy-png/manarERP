/**
 * نوافذ زمنية موحّدة لرسوم لوحة التحكم الشهرية.
 *
 * الغرض: منع اختفاء يناير في الرسوم. كانت الرسوم تستخدم نافذة متحركة بطول 6 أشهر
 * مثبّتة على الشهر الحالي (في يوليو ⇒ فبراير…يوليو)، فتسقط يناير. البديل الموحّد هو
 * نافذة «منذ بداية السنة حتى الشهر الحالي» (Year-To-Date): يناير من السنة الحالية حتى
 * الشهر الحالي (شاملًا). لا تُخصَّص يناير بأي حالة خاصة — القاعدة عامة لكل الأشهر.
 */

export interface MonthWindow {
  /** وسم الشهر بصيغة YYYY-MM (مطابق لما تعرضه محاور الرسوم). */
  label: string;
  /** بداية الشهر — 00:00:00.000 محليًا. */
  start: Date;
  /** نهاية الشهر — اليوم الأخير 23:59:59.999 محليًا. */
  end: Date;
}

/**
 * يُرجع نافذة YTD: شهرًا لكل شهر من يناير السنة الحالية حتى شهر `now` (شاملًا).
 * يناير (getMonth()===0) ⇒ شهر واحد؛ الشهر الحالي مُضمَّن دائمًا.
 */
export function ytdMonths(now: Date = new Date()): MonthWindow[] {
  const year = now.getFullYear();
  const count = now.getMonth() + 1; // عدد الأشهر من يناير حتى الشهر الحالي شاملًا
  return Array.from({ length: count }, (_, i) => ({
    label: `${year}-${String(i + 1).padStart(2, '0')}`,
    start: new Date(year, i, 1),
    end: new Date(year, i + 1, 0, 23, 59, 59, 999),
  }));
}

/**
 * نهاية اليوم محليًا (23:59:59.999).
 *
 * ضروري لتقارير «كما في تاريخ»: `asOfDate` يصل كـ `2024-12-31` أي منتصف الليل،
 * فمقارنة `lte` كانت ستُسقط كل ما جرى خلال 31/12 نفسه.
 */
export function endOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * `YYYY-MM-DD` من مكوّنات التاريخ **المحلية**.
 *
 * لا تستخدم `toISOString().slice(0,10)` لعرض تاريخ محلي: التوقيت المحلي للكويت
 * هو UTC+03:00، فمنتصف ليل 15/12/2024 محليًا يصبح `2024-12-14` بتوقيت UTC.
 * الفرق يوم كامل في رسائل الأخطاء وسجل التدقيق وأسماء الملفات.
 */
export function toLocalDateString(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

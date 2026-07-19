/**
 * تحويل هجري↔ميلادي (Part 1) — خوارزمية جدولية/حسابية حتمية بالكامل (يُشار إليها غالبًا
 * بـ«الخوارزمية الكويتية» — Kuwaiti Algorithm/tabular Islamic calendar)، لا تعتمد على أي
 * اتصال إنترنت أو خدمة خارجية (النظام Offline-only حسب هوية المشروع). هذه هي نفس فئة
 * الحساب الفلكي/الجدولي التي يقوم عليها تقويم العجيري الكويتي: تقدير حسابي لبداية الشهر
 * القمري قبل صدور الإعلان الرسمي (رصد الهلال) — ولهذا بالضبط تُصنَّف كل عطلة هجرية
 * ناتجة عنها بحالة «متوقَّعة (العجيري)» EXPECTED_ALOJAIRI وليس «رسمية» (انظر
 * kuwaitHijriHolidayDefinitions.ts + services/HijriHolidayService.ts).
 *
 * لا توجد هنا أي تواريخ ميلادية مستقبلية مُرسَّخة — الدالتان أدناه حسابيتان بحتتان تُنتِجان
 * التاريخ الميلادي المقابل لأي سنة/شهر/يوم هجري عند الطلب فقط.
 *
 * المصدر الرياضي: التقويم الهجري الجدولي (tabular Islamic calendar)، نمط الكبس المعتاد
 * (11 سنة كبيسة من كل 30 سنة هجرية)، حقبة (epoch) بصيغة يوليوس Julian Day 1948440، مع
 * تحويل يوم يوليوس↔ميلادي وفق خوارزمية Fliegel & Van Flandern القياسية (منشورة، عامة،
 * مستخدَمة في أنظمة تقويم عديدة).
 */

const ISLAMIC_EPOCH_JDN = 1948440;

/** يحوّل تاريخًا ميلاديًا (UTC) إلى رقم يوم يوليوس (Julian Day Number). */
export function gregorianToJDN(year: number, month: number, day: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045
  );
}

/** يحوّل رقم يوم يوليوس إلى تاريخ ميلادي (UTC) — عكس gregorianToJDN تمامًا. */
export function jdnToGregorian(jdn: number): { year: number; month: number; day: number } {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  return { year, month, day };
}

/** يحوّل تاريخًا هجريًا (سنة/شهر/يوم) إلى رقم يوم يوليوس وفق التقويم الجدولي (الخوارزمية الكويتية). */
export function hijriToJDN(hijriYear: number, hijriMonth: number, hijriDay: number): number {
  return (
    Math.floor((11 * hijriYear + 3) / 30) +
    354 * hijriYear +
    30 * hijriMonth -
    Math.floor((hijriMonth - 1) / 2) +
    hijriDay +
    ISLAMIC_EPOCH_JDN -
    385
  );
}

/** يحوّل تاريخًا هجريًا إلى تاريخ ميلادي (UTC Date) مباشرةً. */
export function hijriToGregorianDate(hijriYear: number, hijriMonth: number, hijriDay: number): Date {
  const jdn = hijriToJDN(hijriYear, hijriMonth, hijriDay);
  const { year, month, day } = jdnToGregorian(jdn);
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * نطاق السنوات الميلادية المدعومة عمليًا لتوليد العطل الهجرية المتوقَّعة. الخوارزمية
 * الحسابية صالحة رياضيًا خارج هذا النطاق أيضًا، لكن نطاق الدعم هنا يُبقي الميزة ضمن أفق
 * تخطيط عملي منطقي لموارد بشرية حقيقية (انظر Part 5 — «سنوات غير مدعومة» يجب أن تُرجع
 * رسالة تحقّق واضحة، لا تُخمَّن أو تُرسَّخ خارج هذا النطاق).
 */
export const SUPPORTED_HIJRI_GENERATION_YEARS = { min: 2020, max: 2050 } as const;

export function isYearSupportedForHijriGeneration(gregorianYear: number): boolean {
  return (
    gregorianYear >= SUPPORTED_HIJRI_GENERATION_YEARS.min &&
    gregorianYear <= SUPPORTED_HIJRI_GENERATION_YEARS.max
  );
}

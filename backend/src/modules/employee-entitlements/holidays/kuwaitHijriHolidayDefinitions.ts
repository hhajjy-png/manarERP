import type { HijriHolidayDefinition } from './hijriHolidayTypes';
import { hijriToGregorianDate } from './hijriCalendarConversion';

/**
 * تعريفات العطل الهجرية الكويتية المدعومة (Part 2) — شهر/يوم هجريَّين ثابتَين (حقائق
 * تقويمية هجرية لا تتغيّر، تمامًا كثبات «25 ديسمبر» ميلاديًا)، وليست تواريخ ميلادية
 * مُخمَّنة لأي سنة بعينها. مدة كل عطلة هنا هي مدة العطلة الدينية المعروفة (Ayyam
 * al-Tashreeq لعيد الأضحى، ثلاثة أيام لعيد الفطر) — قد يختلف عدد الأيام الرسمي الذي
 * يقرّره مجلس الوزراء الكويتي سنويًا عن هذا الرقم؛ يُترَك تعديل ذلك يدويًا عبر
 * `/api/holidays` عند الحاجة (لا نُخمِّن قرارًا حكوميًا مستقبليًا).
 */
export const KUWAIT_HIJRI_HOLIDAY_DEFINITIONS: readonly HijriHolidayDefinition[] = [
  { hijriMonth: 1, hijriDay: 1, name: 'رأس السنة الهجرية', durationDays: 1 },
  { hijriMonth: 3, hijriDay: 12, name: 'المولد النبوي الشريف', durationDays: 1 },
  { hijriMonth: 10, hijriDay: 1, name: 'عيد الفطر', durationDays: 3 },
  { hijriMonth: 12, hijriDay: 9, name: 'يوم عرفة', durationDays: 1 },
  { hijriMonth: 12, hijriDay: 10, name: 'عيد الأضحى', durationDays: 4 },
];

export interface HijriOccurrence {
  definition: HijriHolidayDefinition;
  /** فهرس اليوم ضمن مدة العطلة (0 = يوم البداية الهجري نفسه). */
  dayOffset: number;
  date: Date;
}

/**
 * يبحث عن كل تكرار لتعريف عطلة هجرية معيّن (شهر/يوم هجريَّين + مدة) يقع كليًا أو جزئيًا
 * ضمن سنة ميلادية معيّنة. يفحص نطاقًا آمنًا من السنوات الهجرية المحتملة (السنة الهجرية
 * تقارب 354–355 يومًا فتنزاح ما يقارب 10-11 يومًا أبكر كل سنة ميلادية) بدل تخمين سنة
 * هجرية واحدة فقط — يغطي هذا حالات الحدود النادرة (بداية/نهاية سنة ميلادية).
 */
export function findHijriOccurrencesInGregorianYear(
  definition: HijriHolidayDefinition,
  gregorianYear: number,
): Date[] {
  const approxHijriYear = Math.floor(((gregorianYear - 622) * 33) / 32);
  const results: Date[] = [];
  const durationDays = definition.durationDays ?? 1;

  for (let hijriYear = approxHijriYear - 2; hijriYear <= approxHijriYear + 2; hijriYear++) {
    const startDate = hijriToGregorianDate(hijriYear, definition.hijriMonth, definition.hijriDay);
    for (let offset = 0; offset < durationDays; offset++) {
      const date = new Date(startDate.getTime() + offset * 86_400_000);
      if (date.getUTCFullYear() === gregorianYear) {
        results.push(date);
      }
    }
  }

  return results;
}

import type { HolidayCandidate } from './holidayCandidate';

/**
 * تعريف عطلة هجرية (Part 1.2) — بشهر/يوم هجريَّين ثابتَين (مثل 1 شوال لعيد الفطر)، لا
 * بتاريخ ميلادي ثابت، لأن معادِله الميلادي يتغيّر كل سنة. البنية التحتية هنا فقط — لا
 * تحويل هجري↔ميلادي حقيقي مُنفَّذ بعد (انظر services/HijriHolidayService.ts) ولا تواريخ
 * مستقبلية مُخمَّنة أو مرسَّخة، بالضبط وفق تعليمات هذه الحزمة.
 */
export interface HijriHolidayDefinition {
  hijriMonth: number; // 1-12
  hijriDay: number;
  name: string;
  /** عدد الأيام (شامل يوم البداية) إن كانت العطلة تمتد لأكثر من يوم هجري واحد. */
  durationDays?: number;
}

/**
 * أسماء العطل الهجرية الكويتية المعروفة — الأسماء فقط (لا تواريخ). تُستخدم كمرجع نصّي
 * موحَّد عند الإدخال اليدوي لعطلة هجرية قبل توفّر مصدر بيانات تقويم هجري حقيقي.
 */
export const KNOWN_HIJRI_HOLIDAY_NAMES: readonly string[] = [
  'رأس السنة الهجرية',
  'المولد النبوي الشريف',
  'ليلة الإسراء والمعراج',
  'عيد الفطر',
  'يوم عرفة',
  'عيد الأضحى',
];

/** يبني مرشَّح عطلة هجرية «مُعلَنة/مُعدَّلة يدويًا» من تاريخ ميلادي معروف بالفعل (لا تخمين — التاريخ يُمرَّر صراحةً من المتصل). */
export function buildManualHijriHolidayCandidate(date: Date, name: string, status: 'OFFICIAL' | 'MANUALLY_ADJUSTED' = 'MANUALLY_ADJUSTED'): HolidayCandidate {
  return { date, name, origin: 'HIJRI', status };
}

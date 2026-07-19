import type { HolidayCandidate } from './holidayCandidate';

/** تعريف عطلة ميلادية ثابتة تتكرر في نفس اليوم/الشهر كل سنة. */
export interface FixedHolidayDefinition {
  month: number; // 1-12
  day: number;
  name: string;
}

/**
 * العطل الكويتية الميلادية الثابتة (Part 1.1) — تواريخ ثابتة سنويًا، لا علاقة لها
 * بالتقويم الهجري، آمن ترسيخها كثوابت (بخلاف العطل الهجرية — انظر hijriHolidayTypes.ts).
 */
export const FIXED_KUWAIT_HOLIDAYS: readonly FixedHolidayDefinition[] = [
  { month: 1, day: 1, name: 'رأس السنة الميلادية' },
  { month: 2, day: 25, name: 'العيد الوطني' },
  { month: 2, day: 26, name: 'يوم التحرير' },
];

/** يولّد مرشَّحي العطل الميلادية الثابتة لسنة معيّنة (بلا كتابة في قاعدة البيانات). */
export function generateFixedHolidaysForYear(year: number): HolidayCandidate[] {
  return FIXED_KUWAIT_HOLIDAYS.map((h) => ({
    date: new Date(Date.UTC(year, h.month - 1, h.day)),
    name: h.name,
    origin: 'FIXED_GREGORIAN',
    status: 'OFFICIAL',
  }));
}

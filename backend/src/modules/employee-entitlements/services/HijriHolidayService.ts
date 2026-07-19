import type { HolidayCandidate } from '../holidays/holidayCandidate';
import { KNOWN_HIJRI_HOLIDAY_NAMES } from '../holidays/hijriHolidayTypes';

/**
 * خدمة العطل الهجرية (Part 1.2 + Part 3) — بنية تحتية معمارية فقط، غير مكتملة التنفيذ
 * عمدًا. تحويل التاريخ الهجري↔الميلادي الحقيقي (تقويم أم القرى أو تقويم العجيري
 * الفلكي) يتطلّب مصدر بيانات/مكتبة مخصَّصة غير متوفرة في المشروع بعد — ولن نُخمِّن أو
 * نُرسِّخ تواريخ مستقبلية بديلاً عنه (تعليمات هذه الحزمة صراحةً). عند توفّر ذلك المصدر
 * في حزمة مستقبلية، يُنفَّذ `getExpectedHijriHolidays` هنا فقط — بقية النظام (محرّك
 * العطل، تدفّق التوليد) يستهلك هذه الواجهة بالفعل ولن يحتاج أي تعديل.
 */
export class HijriHolidayService {
  /**
   * يُرجع العطل الهجرية «المتوقَّعة» (تقويم العجيري) لسنة ميلادية معيّنة. تُرجع مصفوفة
   * فارغة حاليًا — لا بيانات مُخمَّنة. TODO: تنفيذ حقيقي عند توفّر مصدر تقويم هجري.
   */
  getExpectedHijriHolidays(_gregorianYear: number): HolidayCandidate[] {
    return [];
  }

  /** أسماء العطل الهجرية الكويتية المعروفة — مرجع نصّي للإدخال اليدوي فقط. */
  getKnownHolidayNames(): readonly string[] {
    return KNOWN_HIJRI_HOLIDAY_NAMES;
  }
}

export const hijriHolidayService = new HijriHolidayService();

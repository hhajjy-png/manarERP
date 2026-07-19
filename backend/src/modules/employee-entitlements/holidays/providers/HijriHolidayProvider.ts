import type { HolidaySourceProvider } from './HolidaySourceProvider';
import type { HolidayCandidate } from '../holidayCandidate';
import { HijriHolidayService, hijriHolidayService } from '../../services/HijriHolidayService';

/**
 * مصدر العطل الهجرية المتوقَّعة (تقويم العجيري) — Part 1.2 + Part 3. تنفيذ التحويل
 * الهجري↔الميلادي الحقيقي معزول بالكامل خلف HijriHolidayService؛ هذا المزوِّد مجرَّد
 * غلاف رقيق يطابق واجهة HolidaySourceProvider الموحَّدة فلا يحتاج مستهلكوه (المخطِّط)
 * معرفة أي تفصيل عن التقويم الهجري. يُرجع مصفوفة فارغة حاليًا (لا تواريخ مُخمَّنة) حتى
 * يُنفَّذ HijriHolidayService فعليًا.
 */
export class HijriHolidayProvider implements HolidaySourceProvider {
  readonly sourceName = 'HIJRI_ALOJAIRI';

  constructor(private readonly service: HijriHolidayService = hijriHolidayService) {}

  generateForYear(year: number): HolidayCandidate[] {
    return this.service.getExpectedHijriHolidays(year);
  }
}

import type { HolidaySourceProvider, HolidayProviderResult } from './HolidaySourceProvider';
import { HijriHolidayService, hijriHolidayService } from '../../services/HijriHolidayService';

/**
 * مصدر العطل الهجرية المتوقَّعة (تقويم العجيري) — Part 1/2/3 من Al-Ojairi Integration
 * Pack v1. تنفيذ التحويل الهجري↔الميلادي الحقيقي معزول بالكامل خلف HijriHolidayService؛
 * هذا المزوِّد مجرَّد غلاف رقيق يطابق واجهة HolidaySourceProvider الموحَّدة فلا يحتاج
 * مستهلكه الوحيد (HolidayEngine.generateCandidates — Part 7) معرفة أي تفصيل عن التقويم
 * الهجري أو مصدر بياناته.
 */
export class HijriHolidayProvider implements HolidaySourceProvider {
  readonly sourceName = 'HIJRI_ALOJAIRI';

  constructor(private readonly service: HijriHolidayService = hijriHolidayService) {}

  generateForYear(year: number): HolidayProviderResult {
    return this.service.generateExpectedHijriHolidays(year);
  }
}

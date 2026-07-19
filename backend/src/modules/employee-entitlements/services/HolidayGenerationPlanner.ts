import { DEFAULT_HOLIDAY_PROVIDERS, type HolidaySourceProvider } from '../holidays/providers';
import type { HolidayProviderWarning } from '../holidays/providers/HolidaySourceProvider';
import { compareHolidayYear, type HolidayYearComparison } from '../holidays/holidayYearComparison';
import { HolidayValidationService, type InvalidHolidayCandidate } from './HolidayValidationService';
import { HolidayConflictService, type HolidayConflict } from './HolidayConflictService';
import { HolidayService, holidayService } from './HolidayService';
import { HolidayEngine } from '../engines/HolidayEngine';

export interface HolidayGenerationPlan {
  year: number;
  comparison: HolidayYearComparison;
  conflicts: HolidayConflict[];
  invalidCandidates: InvalidHolidayCandidate[];
  /** رسائل تحقّق صادرة عن مصادر التوليد (سنة غير مدعومة، فشل مصدر...) — Al-Ojairi Integration Pack v1، Part 4 + 5. */
  warnings: HolidayProviderWarning[];
}

/**
 * المخطِّط (Part 6 من Kuwait Holiday Intelligence Pack v1) — يُنتج معاينة كاملة (Preview)
 * لتوليد عطل سنة معيّنة بلا أي كتابة في قاعدة البيانات («Nothing should be written until
 * the user confirms»، Part 1). يستهلك مرشَّحي التوليد عبر HolidayEngine.generateCandidates
 * حصرًا (Al-Ojairi Integration Pack v1، Part 7 — لا يستدعي أي provider.generateForYear
 * مباشرةً بعد الآن) + خدمة العطل الموجودة (HolidayService، المصدر الوحيد لقراءة العطل
 * المسجَّلة — Part 8: لا استعلام Prisma خام مكرَّر هنا) + خدمتَي التحقق والتعارض.
 */
export class HolidayGenerationPlanner {
  constructor(
    private readonly providers: readonly HolidaySourceProvider[] = DEFAULT_HOLIDAY_PROVIDERS,
    private readonly holidays: HolidayService = holidayService,
    private readonly validation: HolidayValidationService = new HolidayValidationService(),
    private readonly conflicts: HolidayConflictService = new HolidayConflictService(),
  ) {}

  async plan(year: number): Promise<HolidayGenerationPlan> {
    const generated = await HolidayEngine.generateCandidates(year, this.providers);

    const { valid, invalid } = this.validation.validateAll(generated.candidates);

    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31));
    const existingHolidays = await this.holidays.listHolidays({ from: yearStart, to: yearEnd });

    const comparison = compareHolidayYear(
      valid,
      existingHolidays.map((h) => ({ date: h.date, name: h.name })),
    );

    return {
      year,
      comparison,
      conflicts: this.conflicts.extractConflicts(comparison),
      invalidCandidates: invalid,
      warnings: generated.warnings,
    };
  }
}

export const holidayGenerationPlanner = new HolidayGenerationPlanner();

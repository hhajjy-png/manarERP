import { DEFAULT_HOLIDAY_PROVIDERS, type HolidaySourceProvider } from '../holidays/providers';
import { compareHolidayYear, type HolidayYearComparison } from '../holidays/holidayYearComparison';
import { HolidayValidationService, type InvalidHolidayCandidate } from './HolidayValidationService';
import { HolidayConflictService, type HolidayConflict } from './HolidayConflictService';
import { HolidayService, holidayService } from './HolidayService';

export interface HolidayGenerationPlan {
  year: number;
  comparison: HolidayYearComparison;
  conflicts: HolidayConflict[];
  invalidCandidates: InvalidHolidayCandidate[];
}

/**
 * المخطِّط (Part 6) — يُنتج معاينة كاملة (Preview) لتوليد عطل سنة معيّنة بلا أي كتابة في
 * قاعدة البيانات («Nothing should be written until the user confirms»، Part 1). يستهلك
 * قائمة مزوِّدين (Part 3) + خدمة العطل الموجودة (HolidayService، المصدر الوحيد لقراءة
 * العطل المسجَّلة — Part 8: لا استعلام Prisma خام مكرَّر هنا) + خدمتَي التحقق والتعارض.
 */
export class HolidayGenerationPlanner {
  constructor(
    private readonly providers: readonly HolidaySourceProvider[] = DEFAULT_HOLIDAY_PROVIDERS,
    private readonly holidays: HolidayService = holidayService,
    private readonly validation: HolidayValidationService = new HolidayValidationService(),
    private readonly conflicts: HolidayConflictService = new HolidayConflictService(),
  ) {}

  async plan(year: number): Promise<HolidayGenerationPlan> {
    const rawCandidates = (
      await Promise.all(this.providers.map((p) => p.generateForYear(year)))
    ).flat();

    const { valid, invalid } = this.validation.validateAll(rawCandidates);

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
    };
  }
}

export const holidayGenerationPlanner = new HolidayGenerationPlanner();

import { prisma } from '../../../config/database';
import { computeEffectiveAnnualLeaveDays, type DateInterval } from '../../employees/entitlements.calc';
import { DEFAULT_HOLIDAY_PROVIDERS, type HolidaySourceProvider } from '../holidays/providers';
import type { HolidayCandidate } from '../holidays/holidayCandidate';
import type { HolidayProviderWarning } from '../holidays/providers/HolidaySourceProvider';

const MS_PER_DAY = 86_400_000;

export interface HolidayGenerationCandidates {
  candidates: HolidayCandidate[];
  warnings: HolidayProviderWarning[];
}

/** الجمعة والسبت — عطلة نهاية الأسبوع الرسمية في الكويت (أسبوع العمل: أحد–خميس). */
const DEFAULT_WEEKEND_DAYS: readonly number[] = [5, 6]; // JS Date#getDay(): 5=Friday, 6=Saturday

export interface HolidayEngineOptions {
  /** أيام نهاية الأسبوع (قيم Date#getDay()، 0=أحد..6=سبت). الافتراضي: الجمعة والسبت. */
  weekendDays?: readonly number[];
}

function dayIndex(d: Date): number {
  return Math.floor(d.getTime() / MS_PER_DAY);
}

/**
 * محرّك العطل (Part 2 من Kuwait Holiday Intelligence Pack v1) — نقطة مركزية واحدة لتحميل
 * العطل، وكشف يوم العمل/العطلة، واحتساب أيام العمل، واستثناء أيام الإجازة السنوية.
 * الحسابات القانونية المحمية (المادة 70) تُفوَّض بالكامل إلى computeEffectiveAnnualLeaveDays
 * في entitlements.calc.ts — هذا المحرّك واجهة مريحة عامة حولها، وليس إعادة تنفيذ لها. غير
 * مستهلَك بعد من أي مسار احتساب حالي — بنية تحتية جاهزة لاحتسابات مستقبلية («Future
 * Entitlements calculations must consume this engine») بلا أي تغيير على النتائج الحالية
 * اليوم.
 *
 * منذ Al-Ojairi Integration Pack v1 (Part 7)، أصبح `generateCandidates` هو المستهلك
 * الوحيد لمزوِّدي توليد العطل (providers) في كامل النظام — إضافة توليدية بحتة لا تمسّ أي
 * من الطرق أعلاه (isHoliday/isWeekend/isWorkingDay/countWorkingDays/computeExcludedLeaveDays)
 * بأي شكل.
 */
export class HolidayEngine {
  private readonly holidayDayIndexes: Set<number>;
  private readonly weekendDays: Set<number>;

  private constructor(holidayDates: readonly Date[], weekendDays: readonly number[]) {
    this.holidayDayIndexes = new Set(holidayDates.map(dayIndex));
    this.weekendDays = new Set(weekendDays);
  }

  /** يحمّل كل العطل الرسمية المسجَّلة في قاعدة البيانات (Holiday.date) ويبني المحرّك. */
  static async load(options: HolidayEngineOptions = {}): Promise<HolidayEngine> {
    const rows = await prisma.holiday.findMany({ select: { date: true } });
    return new HolidayEngine(
      rows.map((r) => r.date),
      options.weekendDays ?? DEFAULT_WEEKEND_DAYS,
    );
  }

  /** يبني المحرّك من قائمة عطل جاهزة بلا استعلام قاعدة بيانات — للاختبارات والسياقات المحسوبة مسبقًا. */
  static fromHolidays(holidayDates: readonly Date[], options: HolidayEngineOptions = {}): HolidayEngine {
    return new HolidayEngine(holidayDates, options.weekendDays ?? DEFAULT_WEEKEND_DAYS);
  }

  /**
   * يُولِّد مرشَّحي عطل سنة معيّنة من كل مصادر التوليد (Al-Ojairi Integration Pack v1،
   * Part 7) — HolidayEngine هو المستهلك الوحيد لقائمة المزوِّدين في كامل النظام؛ لا مكان
   * آخر (لا HolidayGenerationPlanner ولا أي كود آخر) يستدعي provider.generateForYear
   * مباشرةً. فشل مصدر واحد (استثناء غير متوقَّع) لا يُسقط توليد بقية المصادر — يُلتقَط
   * ويُحوَّل إلى تحذير PROVIDER_FAILURE («توليد آمن دائمًا» — Part 5)، فالعطل الثابتة مثلاً
   * تبقى تُولَّد حتى لو فشل مصدر العطل الهجرية.
   */
  static async generateCandidates(
    year: number,
    providers: readonly HolidaySourceProvider[] = DEFAULT_HOLIDAY_PROVIDERS,
  ): Promise<HolidayGenerationCandidates> {
    const candidates: HolidayCandidate[] = [];
    const warnings: HolidayProviderWarning[] = [];

    const results = await Promise.all(
      providers.map(async (provider) => {
        try {
          return await provider.generateForYear(year);
        } catch (error) {
          return {
            candidates: [],
            warnings: [
              {
                code: 'PROVIDER_FAILURE' as const,
                sourceName: provider.sourceName,
                message: `فشل مصدر العطل «${provider.sourceName}» عند توليد سنة ${year}: ${error instanceof Error ? error.message : 'خطأ غير معروف'}.`,
              },
            ],
          };
        }
      }),
    );

    for (const result of results) {
      candidates.push(...result.candidates);
      warnings.push(...result.warnings);
    }

    return { candidates, warnings };
  }

  /** هل هذا اليوم عطلة رسمية مسجَّلة؟ */
  isHoliday(date: Date): boolean {
    return this.holidayDayIndexes.has(dayIndex(date));
  }

  /** هل هذا اليوم ضمن عطلة نهاية الأسبوع؟ */
  isWeekend(date: Date): boolean {
    return this.weekendDays.has(date.getUTCDay());
  }

  /** يوم عمل فعلي = ليس نهاية أسبوع وليس عطلة رسمية. */
  isWorkingDay(date: Date): boolean {
    return !this.isWeekend(date) && !this.isHoliday(date);
  }

  /** عدد أيام العمل الفعلية ضمن فترة شاملة الطرفين (بلا عطل نهاية أسبوع أو عطل رسمية). */
  countWorkingDays(interval: DateInterval): number {
    const start = dayIndex(interval.start);
    const end = dayIndex(interval.end);
    const lo = Math.min(start, end);
    const hi = Math.max(start, end);

    let count = 0;
    for (let day = lo; day <= hi; day++) {
      const current = new Date(day * MS_PER_DAY);
      if (!this.weekendDays.has(current.getUTCDay()) && !this.holidayDayIndexes.has(day)) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * أيام الإجازة السنوية المستهلكة فعليًا ضمن فترة إجازة معتمدة، مستثنيًا العطل الرسمية
   * والإجازة المرضية الواقعة داخلها (المادة 70). واجهة مريحة فقط حول الدالة النقيّة
   * المركزية computeEffectiveAnnualLeaveDays — لا تكرار للقاعدة القانونية.
   */
  computeExcludedLeaveDays(leaveInterval: DateInterval, sickLeaveIntervals: readonly DateInterval[]): number {
    const holidayDates = [...this.holidayDayIndexes].map((idx) => new Date(idx * MS_PER_DAY));
    return computeEffectiveAnnualLeaveDays(leaveInterval, holidayDates, [...sickLeaveIntervals]);
  }
}

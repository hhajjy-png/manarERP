import type { HolidayProviderResult, HolidayProviderWarning } from '../holidays/providers/HolidaySourceProvider';
import { KNOWN_HIJRI_HOLIDAY_NAMES } from '../holidays/hijriHolidayTypes';
import { KUWAIT_HIJRI_HOLIDAY_DEFINITIONS, findHijriOccurrencesInGregorianYear } from '../holidays/kuwaitHijriHolidayDefinitions';
import { isYearSupportedForHijriGeneration, SUPPORTED_HIJRI_GENERATION_YEARS } from '../holidays/hijriCalendarConversion';

const SOURCE_NAME = 'HIJRI_ALOJAIRI';

/**
 * خدمة العطل الهجرية (Al-Ojairi Integration Pack v1، Part 1 + Part 2) — التنفيذ الحقيقي
 * لتوليد العطل الهجرية الكويتية المتوقَّعة، معزولاً بالكامل خلف هذه الخدمة (لا يعرف
 * HijriHolidayProvider ولا HolidayEngine أي تفصيل عن خوارزمية التحويل الهجري↔الميلادي —
 * انظر holidays/hijriCalendarConversion.ts). كل عطلة مُولَّدة هنا تحمل الحالة
 * EXPECTED_ALOJAIRI دائمًا (Part 3) — لا تصبح رسمية تلقائيًا أبدًا؛ الاعتماد الرسمي تعديل
 * يدوي فقط عبر `/api/holidays` الحالي (غير مُعدَّل في هذه الحزمة).
 */
export class HijriHolidayService {
  /**
   * يُولِّد العطل الهجرية الكويتية المتوقَّعة (تقويم العجيري) لسنة ميلادية معيّنة، وفق
   * خوارزمية تحويل هجري↔ميلادي حتمية بلا اتصال إنترنت (Part 1). لا يرمي أبدًا — أي فشل
   * (سنة غير مدعومة، أو خطأ غير متوقَّع في الحساب) يُترجَم إلى تحذير ضمن النتيجة، فالتوليد
   * يبقى آمنًا دومًا (Part 5).
   */
  generateExpectedHijriHolidays(gregorianYear: number): HolidayProviderResult {
    if (!isYearSupportedForHijriGeneration(gregorianYear)) {
      return {
        candidates: [],
        warnings: [
          {
            code: 'UNSUPPORTED_YEAR',
            sourceName: SOURCE_NAME,
            message: `سنة ${gregorianYear} خارج النطاق المدعوم حاليًا لتوليد العطل الهجرية المتوقَّعة (${SUPPORTED_HIJRI_GENERATION_YEARS.min}–${SUPPORTED_HIJRI_GENERATION_YEARS.max}). لا عطل هجرية ستُقترَح لهذه السنة — العطل الثابتة الميلادية غير متأثرة.`,
          },
        ],
      };
    }

    try {
      const warnings: HolidayProviderWarning[] = [];
      const candidates = KUWAIT_HIJRI_HOLIDAY_DEFINITIONS.flatMap((definition) => {
        const occurrences = findHijriOccurrencesInGregorianYear(definition, gregorianYear);
        return occurrences.map((date) => {
          if (Number.isNaN(date.getTime())) {
            warnings.push({
              code: 'INVALID_DATA',
              sourceName: SOURCE_NAME,
              message: `تعذَّر حساب تاريخ ميلادي صالح لعطلة «${definition.name}» في سنة ${gregorianYear}.`,
            });
            return null;
          }
          return { date, name: definition.name, origin: 'HIJRI' as const, status: 'EXPECTED_ALOJAIRI' as const };
        });
      }).filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

      return { candidates, warnings };
    } catch (error) {
      return {
        candidates: [],
        warnings: [
          {
            code: 'PROVIDER_FAILURE',
            sourceName: SOURCE_NAME,
            message: `فشل توليد العطل الهجرية لسنة ${gregorianYear}: ${error instanceof Error ? error.message : 'خطأ غير معروف'}.`,
          },
        ],
      };
    }
  }

  /** أسماء العطل الهجرية الكويتية المعروفة — مرجع نصّي للإدخال اليدوي فقط. */
  getKnownHolidayNames(): readonly string[] {
    return KNOWN_HIJRI_HOLIDAY_NAMES;
  }
}

export const hijriHolidayService = new HijriHolidayService();

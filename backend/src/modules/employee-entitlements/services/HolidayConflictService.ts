import type { HolidayYearComparison, HolidayComparisonEntry } from '../holidays/holidayYearComparison';

/** بند تعارض واحد جاهز للعرض — مُشتقّ من نتيجة المقارنة، وليس اكتشافًا مستقلاً (Part 8: لا تكرار للمنطق). */
export interface HolidayConflict extends HolidayComparisonEntry {
  category: 'CHANGED' | 'CONFLICT';
}

/**
 * خدمة اكتشاف التعارض (Part 4 + Part 6) — طبقة عرض/استعلام رقيقة فوق نتيجة
 * compareHolidayYear (المصدر الوحيد لمنطق المقارنة/التعارض — انظر holidayYearComparison.ts).
 * تُغطّي الأنواع الأربعة المطلوبة: تواريخ مكرَّرة وأسماء مكرَّرة داخل الخطة (SKIPPED)،
 * تداخل مُولَّد بين مصدرين (CONFLICT)، وتعديل يدوي يتعارض مع ما يقترحه التوليد (CHANGED).
 */
export class HolidayConflictService {
  /** كل بنود CHANGED/CONFLICT من نتيجة المقارنة — تحتاج مراجعة يدوية قبل أي تطبيق. */
  extractConflicts(comparison: HolidayYearComparison): HolidayConflict[] {
    return comparison.entries.filter(
      (e): e is HolidayConflict => e.category === 'CHANGED' || e.category === 'CONFLICT',
    );
  }

  /** هل توجد أي بنود تحتاج مراجعة يدوية قبل التطبيق؟ */
  hasBlockingConflicts(comparison: HolidayYearComparison): boolean {
    return comparison.summary.CHANGED > 0 || comparison.summary.CONFLICT > 0;
  }
}

export const holidayConflictService = new HolidayConflictService();

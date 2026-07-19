import type { HolidayCandidate } from '../holidays/holidayCandidate';

export interface InvalidHolidayCandidate {
  candidate: HolidayCandidate;
  errors: string[];
}

export interface HolidayCandidateValidationResult {
  valid: HolidayCandidate[];
  invalid: InvalidHolidayCandidate[];
}

/**
 * خدمة التحقق من سلامة مرشَّحي العطل (Part 6) — فحص بنيوي بحت (تاريخ صالح، اسم غير
 * فارغ) قبل أي مقارنة بقاعدة البيانات. مسؤولية مستقلّة عن اكتشاف التعارض
 * (HolidayConflictService) أو المقارنة السنوية (compareHolidayYear) عمدًا.
 */
export class HolidayValidationService {
  validateCandidate(candidate: HolidayCandidate): string[] {
    const errors: string[] = [];
    if (Number.isNaN(candidate.date.getTime())) errors.push('تاريخ العطلة غير صالح');
    if (!candidate.name || !candidate.name.trim()) errors.push('اسم العطلة مطلوب');
    return errors;
  }

  validateAll(candidates: readonly HolidayCandidate[]): HolidayCandidateValidationResult {
    const valid: HolidayCandidate[] = [];
    const invalid: InvalidHolidayCandidate[] = [];
    for (const candidate of candidates) {
      const errors = this.validateCandidate(candidate);
      if (errors.length === 0) valid.push(candidate);
      else invalid.push({ candidate, errors });
    }
    return { valid, invalid };
  }
}

export const holidayValidationService = new HolidayValidationService();

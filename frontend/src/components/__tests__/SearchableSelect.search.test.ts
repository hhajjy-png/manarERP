import { describe, it, expect } from 'vitest';
import { normalizeSearch, optionMatchesQuery, SearchableOption } from '../SearchableSelect';
import { EXPENSE_CATEGORIES } from '../../config/expenseCategories';

const OPTIONS: SearchableOption[] = EXPENSE_CATEGORIES.map((c) => ({
  value: c.value,
  label: c.labelAr,
  keywords: c.labelEn,
}));

/** يعيد مفاتيح البنود المطابقة لنص بحث ما. */
function matchValues(query: string): string[] {
  const q = normalizeSearch(query);
  return OPTIONS.filter((o) => optionMatchesQuery(o, q)).map((o) => o.value);
}

describe('SearchableSelect — Arabic category search', () => {
  it('matches on the Arabic label, not the enum key', () => {
    // كتابة المفتاح الإنجليزي بحروف عربية غير مقصودة لا يهم — المهم أن اسم البند العربي يطابق.
    // كتابة اسم المفتاح نفسه (بالإنجليزية عبر keywords) مسموحة، لكن يجب ألا يُطابق مفتاح value.
    // «tires» (من keywords) تطابق TIRES، بينما لا يوجد بند اسمه العربي «TIRES».
    expect(matchValues('TIRES')).toContain('TIRES'); // via English keywords
  });

  it('typing "كر" surfaces «كرين سحب» (TOW_TRUCK)', () => {
    expect(matchValues('كر')).toContain('TOW_TRUCK');
  });

  it('typing "بط" surfaces «شراء بطارية» (BATTERY)', () => {
    expect(matchValues('بط')).toContain('BATTERY');
  });

  it('typing "زي" surfaces «زيوت وتشحيم» (OILS)', () => {
    expect(matchValues('زي')).toContain('OILS');
  });

  it('typing "رس" surfaces the government-fee categories', () => {
    const m = matchValues('رس');
    expect(m).toEqual(
      expect.arrayContaining(['GOVERNMENT_FEES', 'RESIDENCY', 'LABOR_INSURANCE', 'TOLL', 'COURT_FEES', 'VEHICLE_INSURANCE', 'VEHICLE_REGISTRATION']),
    );
  });

  it('normalizes alef/diacritics variants (إطارات ~ اطارات)', () => {
    expect(matchValues('اطار')).toContain('TIRES');
  });

  it('empty query matches everything', () => {
    expect(matchValues('').length).toBe(EXPENSE_CATEGORIES.length);
  });

  it('does NOT match on the raw enum key value', () => {
    // «vehicle_paint» ليست جزءًا من الاسم العربي ولا الإنجليزي المعروض بهذا الشكل (بشرطة سفلية)
    expect(matchValues('vehicle_paint')).not.toContain('VEHICLE_PAINT');
  });
});

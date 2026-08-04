/**
 * نموذج الفلاتر: عدّاد الفلاتر المفعَّلة + التحقق من تناقضات المدى.
 * نتيجة تدقيق v1: «من > إلى» و«الأدنى > الأعلى» كانا يُنتجان صفر نتائج بلا سبب.
 */
import { describe, it, expect } from 'vitest';
import {
  countActiveFilters, validateFilterInputs, areFilterInputsValid,
  DIRECTION_OPTIONS, CATEGORY_OPTIONS, DIRECTION_FILTER_KEYS, CATEGORY_FILTER_KEYS,
  quickRangeToDates, toIsoDate,
} from '../pages/bankTimelineFilters';

describe('countActiveFilters', () => {
  it('لا فلاتر ⇒ صفر', () => {
    expect(countActiveFilters({})).toBe(0);
  });

  it('المدى الزمني بُعد واحد مهما بلغ عدد حدوده', () => {
    expect(countActiveFilters({ fromDate: '2026-01-01' })).toBe(1);
    expect(countActiveFilters({ fromDate: '2026-01-01', toDate: '2026-02-01' })).toBe(1);
  });

  it('مدى المبلغ بُعد واحد كذلك', () => {
    expect(countActiveFilters({ minAmount: 10, maxAmount: 20 })).toBe(1);
  });

  it('التصنيفات المتعددة بُعد واحد', () => {
    expect(countActiveFilters({ categories: ['cheque', 'transfer', 'bank_fee'] })).toBe(1);
  });

  it('يجمع الأبعاد المستقلة', () => {
    expect(countActiveFilters({
      search: 'x', fromDate: '2026-01-01', direction: 'withdrawal',
      categories: ['cheque'], minAmount: 5, excludeDuplicates: true,
    })).toBe(6);
  });

  it('قائمة تصنيفات فارغة لا تُحتسب', () => {
    expect(countActiveFilters({ categories: [] })).toBe(0);
  });
});

describe('validateFilterInputs', () => {
  it('مدى تاريخ صالح ⇒ بلا مشاكل', () => {
    expect(validateFilterInputs({ fromDate: '2026-01-01', toDate: '2026-01-31' })).toEqual([]);
  });

  it('اليوم نفسه في الطرفين صالح (المدى شامل)', () => {
    expect(areFilterInputsValid({ fromDate: '2026-01-05', toDate: '2026-01-05' })).toBe(true);
  });

  it('«من» بعد «إلى» ⇒ مشكلة صريحة', () => {
    const issues = validateFilterInputs({ fromDate: '2026-06-30', toDate: '2026-06-01' });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'dateRange' });
  });

  it('«الأدنى» أكبر من «الأعلى» ⇒ مشكلة صريحة', () => {
    const issues = validateFilterInputs({ minAmount: 500, maxAmount: 100 });
    expect(issues[0]).toMatchObject({ field: 'amountRange' });
  });

  it('الحدّان متساويان صالح', () => {
    expect(areFilterInputsValid({ minAmount: 100, maxAmount: 100 })).toBe(true);
  });

  it('حدّ واحد فقط صالح دائمًا', () => {
    expect(areFilterInputsValid({ fromDate: '2026-06-30' })).toBe(true);
    expect(areFilterInputsValid({ maxAmount: 5 })).toBe(true);
  });

  it('يرصد التناقضين معًا', () => {
    expect(validateFilterInputs({
      fromDate: '2026-06-30', toDate: '2026-06-01', minAmount: 9, maxAmount: 1,
    })).toHaveLength(2);
  });
});

describe('خيارات البعدين', () => {
  it('لكل اتجاه وتصنيف مفتاح ترجمة', () => {
    for (const d of DIRECTION_OPTIONS) expect(DIRECTION_FILTER_KEYS[d]).toBeTruthy();
    for (const c of CATEGORY_OPTIONS) expect(CATEGORY_FILTER_KEYS[c]).toBeTruthy();
  });

  it('الاتجاهات ثلاثة والتصنيفات خمسة عشر بلا تكرار', () => {
    expect(DIRECTION_OPTIONS).toHaveLength(3);
    expect(new Set(CATEGORY_OPTIONS).size).toBe(CATEGORY_OPTIONS.length);
    expect(CATEGORY_OPTIONS).toHaveLength(15);
  });
});

describe('النطاقات السريعة — إعادة تحقّق بعد التغييرات', () => {
  it('«اليوم» يبدأ وينتهي في اليوم نفسه', () => {
    const now = new Date(2026, 7, 4);
    expect(quickRangeToDates('today', now)).toEqual({ fromDate: '2026-08-04', toDate: '2026-08-04' });
  });

  it('الأسبوع يبدأ السبت', () => {
    const tuesday = new Date(2026, 7, 4); // الثلاثاء
    expect(quickRangeToDates('week', tuesday).fromDate).toBe('2026-08-01'); // السبت
  });

  it('«الكل» يمسح الحدّين', () => {
    expect(quickRangeToDates('all')).toEqual({ fromDate: '', toDate: '' });
  });

  it('آخر 30 يومًا شاملة اليوم', () => {
    const r = quickRangeToDates('last30', new Date(2026, 7, 4));
    expect(r).toEqual({ fromDate: '2026-07-06', toDate: '2026-08-04' });
  });

  it('toIsoDate بلا انزياح منطقة زمنية', () => {
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });
});

import { describe, it, expect } from 'vitest';
import { roundMoney, sumMoney, moneyEquals, moneyDifference, roundMoneySafe } from '../money';

/**
 * PERMANENT GUARD — تكافؤ تقريب النقود بين الواجهة والخلفية.
 *
 * الواجهة كانت تحمل خمس عائلات تقريب متوازية (`Math.round((n+EPSILON)*1000)/1000`
 * ×3، و`Math.round(n*1000)/1000`، و`Number(n.toFixed(3))`). الفروق تظهر عند نصف
 * الفلس وعند السالب، فيختلف رقمٌ تعرضه الشاشة عن الرقم الذي كتبته الخلفية للسجل نفسه.
 *
 * الحالات أدناه منسوخة من عقد `backend/src/shared/utils/money.ts` — إن تغيّرت سياسة
 * أحد الطرفين انكسر هذا الملف.
 */

/** القاعدة المرجعية: نصف بعيدًا عن الصفر بثلاث خانات، مع تصحيح EPSILON. */
const HALF_CASES: Array<[number, number]> = [
  [2.0005, 2.001],
  [2.0015, 2.002],
  [1.0005, 1.001],
  [0.0005, 0.001],
  [-2.0005, -2.001],
  [-1.0005, -1.001],
  [-0.0005, -0.001],
];

describe('roundMoney — نصف بعيدًا عن الصفر', () => {
  it.each(HALF_CASES)('roundMoney(%s) === %s', (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });

  it('يخالف `toFixed` عند نصف الفلس — وهذا هو سبب وجوده', () => {
    // `Number((2.0005).toFixed(3))` تعطي 2.0 أو 2.001 حسب التمثيل الثنائي — غير موثوقة.
    expect(roundMoney(2.0005)).toBe(2.001);
    expect(roundMoney(-2.0005)).toBe(-2.001); // متماثل حول الصفر، خلافًا للقصّ
  });

  it('يبتلع الصفر السالب', () => {
    expect(Object.is(roundMoney(-0), 0)).toBe(true);
    expect(Object.is(roundMoney(-0.0000001), 0)).toBe(true);
  });

  it('يبتلع ضجيج الجمع الثنائي', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(1.005 * 3)).toBe(3.015);
  });

  it('القيم المقرَّبة أصلًا لا تتغيّر', () => {
    for (const v of [0, 1, 1.5, 123.456, -987.654, 1_000_000.001]) {
      expect(roundMoney(v)).toBe(v);
    }
  });
});

describe('sumMoney — تقريب واحد في النهاية لا تقريب تراكمي', () => {
  it('لا يجمع خطأ التقريب عبر بنود كثيرة', () => {
    const items = Array.from({ length: 9 }, () => 0.3335);
    // مجموع مقرَّب مرة واحدة: 3.0015 → 3.002 (لا 9 × 0.334 = 3.006)
    expect(sumMoney(items)).toBe(3.002);
    expect(items.reduce((s, v) => s + roundMoney(v), 0)).toBeCloseTo(3.006, 3);
  });

  it('يتجاهل القيم الغائبة بدل نشر NaN', () => {
    expect(sumMoney([1.5, null, 2.25, undefined, NaN])).toBe(3.75);
  });

  it('المجموع الفارغ صفر', () => {
    expect(sumMoney([])).toBe(0);
  });
});

describe('moneyEquals / moneyDifference — دقّة الدينار', () => {
  it('ضجيج ثنائي = تساوٍ', () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('فارق فلس = اختلاف حقيقي', () => {
    expect(moneyEquals(1.000, 1.001)).toBe(false);
    expect(moneyDifference(1.001, 1.000)).toBe(0.001);
  });

  it('الفارق يُقرَّب طرفاه أولًا فيقارَن ما يُعرض فعلًا', () => {
    expect(moneyDifference(2.0005, 2.0004)).toBe(0.001); // 2.001 − 2.000
  });
});

describe('roundMoneySafe — مسارات العرض لا تنشر NaN', () => {
  it.each([null, undefined, NaN, Infinity, -Infinity])('%s ⇒ 0', (v) => {
    expect(roundMoneySafe(v as number)).toBe(0);
  });

  it('القيمة الصالحة تمرّ بالسياسة نفسها', () => {
    expect(roundMoneySafe(2.0005)).toBe(2.001);
  });
});

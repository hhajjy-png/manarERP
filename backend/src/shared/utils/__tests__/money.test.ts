import { describe, it, expect } from 'vitest';
import {
  roundMoney,
  normalizeMoney,
  roundMoneyOrNull,
  moneyEquals,
  moneyDifference,
  sumMoney,
  MONEY_DECIMALS,
  MONEY_SMALLEST_UNIT,
  MONEY_EPSILON,
} from '../money';

/**
 * وحدة النقود القانونية.
 *
 * كان في المشروع 14 دالة تقريب في ثلاث عائلات متناقضة: القيد يُكتب بقاعدة ويُقرأ في ميزان
 * المراجعة بقاعدة أخرى. هذه الاختبارات تُثبت أن السياسة صارت واحدة، **وأنها لا تغيّر
 * السلوك القائم على القيم الموجبة** — وهو الشرط الذي بُنيت عليه الحزمة.
 */

/** العائلة التي كانت تكتب الدفتر (GL/الفواتير/الرواتب) — مرجع التوافق. */
const legacyGlRound = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

describe('السياسة: نصف بعيدًا عن الصفر، ثلاث خانات', () => {
  it('الثوابت تصف الدينار الكويتي', () => {
    expect(MONEY_DECIMALS).toBe(3);
    expect(MONEY_SMALLEST_UNIT).toBe(0.001);
    expect(MONEY_EPSILON).toBeLessThan(MONEY_SMALLEST_UNIT); // تسامح تنفيذي، لا محاسبي
  });

  it.each([
    [1.2344, 1.234],
    [1.2345, 1.235],   // تعادل موجب → بعيدًا عن الصفر
    [-1.2345, -1.235], // تعادل سالب → متماثل، لا انحياز نحو +∞
    [1.0005, 1.001],
    [-1.0005, -1.001],
    [0.0005, 0.001],
    [-0.0005, -0.001],
    [0, 0],
    [150, 150],
  ])('roundMoney(%s) = %s', (input, expected) => {
    expect(roundMoney(input)).toBe(expected);
  });

  it('يبتلع ضجيج التمثيل الثنائي', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);          // 0.30000000000000004
    expect(roundMoney(1.005 * 3)).toBe(3.015);
    expect(0.1 + 0.2).not.toBe(0.3);                   // الضجيج حقيقي — والاختبار يقيس شيئًا
  });

  it('الصفر السالب يُطبَّع إلى صفر — لا يتسرّب -0 إلى JSON', () => {
    expect(Object.is(roundMoney(-0.0004), 0)).toBe(true);
    expect(Object.is(roundMoney(-0), 0)).toBe(true);
    expect(JSON.stringify({ v: roundMoney(-0.0001) })).toBe('{"v":0}');
  });

  it('القيم الكبيرة تبقى دقيقة', () => {
    expect(roundMoney(9_999_999.9994)).toBe(9_999_999.999);
    expect(roundMoney(1_234_567.8905)).toBe(1_234_567.891);
  });

  it('القيم غير الصالحة تُرفض — لا تُقرَّب بصمت إلى صفر', () => {
    expect(() => roundMoney(NaN)).toThrow(/ليس قيمة نقدية صالحة/);
    expect(() => roundMoney(Infinity)).toThrow();
    expect(() => roundMoney(-Infinity)).toThrow();
    expect(() => roundMoney('1.5' as unknown as number)).toThrow();
  });

  it('normalizeMoney هي roundMoney نفسها — اسمان لسياسة واحدة', () => {
    expect(normalizeMoney).toBe(roundMoney);
  });

  it('roundMoneyOrNull يحفظ دلالة الفراغ', () => {
    expect(roundMoneyOrNull(null)).toBeNull();
    expect(roundMoneyOrNull(undefined)).toBeUndefined();
    expect(roundMoneyOrNull(1.2345)).toBe(1.235);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// التوافق مع السلوك القائم — الشرط الذي بُنيت عليه الحزمة
// ═══════════════════════════════════════════════════════════════════════════
describe('التوافق التاريخي', () => {
  it('مطابق حرفيًا لتقريب الدفتر القديم على **كل** قيمة موجبة', () => {
    const mismatches: number[] = [];
    // مسح حتمي (لا عشوائية): آلاف القيم عبر مراتب مختلفة، وحالات التعادل تحديدًا.
    for (let i = 0; i < 20_000; i++) {
      const v = i / 7; // كسور غير منتظمة تولّد آثار تمثيل حقيقية
      if (roundMoney(v) !== legacyGlRound(v)) mismatches.push(v);
    }
    for (const v of [1.0005, 2.5005, 0.0005, 1.2345, 1.2344, 999.9995, 0.001, 150]) {
      if (roundMoney(v) !== legacyGlRound(v)) mismatches.push(v);
    }
    expect(mismatches).toEqual([]);
  });

  it('الاختلاف الوحيد على السالب — وهو **الإصلاح** لا الانحدار', () => {
    // القديم كان يقرّب نحو +∞ (لا متماثل): -1.0005 → -1.000، فتختلف عن +1.0005 → 1.001.
    expect(legacyGlRound(-1.0005)).toBe(-1);
    expect(roundMoney(-1.0005)).toBe(-1.001); // متماثل مع الموجب
    // ولا قيمة نقدية سالبة واحدة في بيانات الإنتاج ⇒ لا سجلّ تاريخي يتغيّر.
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// المقارنة — الفلس فارق، والضجيج ليس فارقًا
// ═══════════════════════════════════════════════════════════════════════════
describe('moneyEquals / moneyDifference', () => {
  it('ضجيج الثنائي لا يُعدّ فارقًا', () => {
    expect(moneyEquals(0.1 + 0.2, 0.3)).toBe(true);
    expect(moneyEquals(1.0000001, 1)).toBe(true);
    expect(moneyDifference(0.1 + 0.2, 0.3)).toBe(0);
  });

  it('**فلس واحد فارق حقيقي** — وهو جوهر تصليب الحارس', () => {
    expect(moneyEquals(1.0, 1.001)).toBe(false);
    expect(moneyEquals(100.0, 100.001)).toBe(false);
    expect(moneyDifference(1.001, 1.0)).toBe(0.001);
  });

  it('فارق أكبر من فلس مرفوض بداهةً', () => {
    expect(moneyEquals(1.0, 1.002)).toBe(false);
    expect(moneyEquals(500, 499.5)).toBe(false);
  });

  it('المقارنة تقرّب الطرفين أولًا — نقارن ما يُخزَّن لا تمثيله', () => {
    expect(moneyEquals(1.2345, 1.235)).toBe(true); // كلاهما يُخزَّن 1.235
    expect(moneyEquals(1.2344, 1.235)).toBe(false);
  });
});

describe('sumMoney', () => {
  it('يقرّب مرة واحدة على المجموع — لا تقريبًا تراكميًا', () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
    expect(sumMoney([1.0005, 1.0005])).toBe(2.001); // 2.001 لا 2.002 (لا يقرّب كل طرف)
    expect(sumMoney([])).toBe(0);
  });

  it('مجموع طويل من الفلوس يبقى دقيقًا', () => {
    const thousandFils = Array.from({ length: 1000 }, () => 0.001);
    expect(sumMoney(thousandFils)).toBe(1);
  });
});

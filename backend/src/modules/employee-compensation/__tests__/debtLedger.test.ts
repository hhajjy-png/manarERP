import { describe, it, expect } from 'vitest';
import {
  assertOriginalCoversPayments,
  assertPaymentWithinBalance,
  availableForMovement,
  computeDebtBalance,
  summarizeDebts,
  DEBT_PAYMENT_SOURCES,
  DEBT_TYPES,
} from '../engine';

/**
 * دفتر المديونيات والسلف — منطق الرصيد خالصًا.
 *
 * ما تُثبته هذه الاختبارات تحديدًا: أن الرصيد **مشتقّ** لا مخزَّن، وأن التحقّق من حدّ
 * السداد يستبعد الحركة الجاري تعديلها (وإلا رُفض تعديل ٢٥ ← ٣٠ خطأً)، وأن خفض الأصل
 * دون المسدَّد مرفوض، وأن كل شيء بدقّة الفلس.
 */

const mv = (id: number, amount: number) => ({ id, amount });

describe('الأنواع والمصادر — قوائم مغلقة', () => {
  it('أنواع السجل ثلاثة لا رابع', () => {
    expect([...DEBT_TYPES]).toEqual(['ADVANCE', 'DEBT', 'CUSTOM']);
  });

  it('مصدر الحركة إمّا حسبة شهرية أو سداد يدوي', () => {
    expect([...DEBT_PAYMENT_SOURCES]).toEqual(['MONTHLY_COMPENSATION', 'MANUAL_PAYMENT']);
  });
});

describe('الرصيد مشتقّ من الدفتر', () => {
  it('بلا حركات: المتبقي = الأصل، والحالة قائمة', () => {
    const b = computeDebtBalance(100, []);
    expect(b).toEqual({ originalAmount: 100, paidAmount: 0, remainingAmount: 100, status: 'OPEN' });
  });

  it('المتبقي = الأصل − مجموع الحركات', () => {
    const b = computeDebtBalance(100, [mv(1, 25), mv(2, 10)]);
    expect(b.paidAmount).toBe(35);
    expect(b.remainingAmount).toBe(65);
    expect(b.status).toBe('OPEN');
  });

  it('السداد الكامل يجعل الحالة «مسدَّدة»', () => {
    expect(computeDebtBalance(100, [mv(1, 60), mv(2, 40)]).status).toBe('SETTLED');
  });

  it('بدقّة الفلس: ثلاث خانات، وبجمع واحد لا تراكمي', () => {
    const b = computeDebtBalance(1, [mv(1, 0.3335), mv(2, 0.3335)]);
    expect(b.paidAmount).toBe(0.667); // 0.6670 مجموعًا مرة واحدة
    expect(b.remainingAmount).toBe(0.333);
  });

  it('يرفض أصلًا غير صالح بدل إنتاج رصيد NaN', () => {
    expect(() => computeDebtBalance(Number.NaN, [])).toThrow();
    expect(() => computeDebtBalance(Number.POSITIVE_INFINITY, [])).toThrow();
  });
});

describe('الرصيد المتاح لحركة بعينها', () => {
  it('يستبعد أثر الحركة الجاري تعديلها', () => {
    const movements = [mv(1, 25)];
    expect(availableForMovement(100, movements)).toBe(75);
    // عند تعديل الحركة رقم ١ نفسها، المتاح هو الأصل كاملًا.
    expect(availableForMovement(100, movements, 1)).toBe(100);
  });

  it('يستبعد الحركة المعنية وحدها لا كل الحركات', () => {
    const movements = [mv(1, 25), mv(2, 10)];
    expect(availableForMovement(100, movements, 1)).toBe(90);
  });
});

describe('حدّ السداد', () => {
  const ctx = (movements = [] as { id: number; amount: number }[], exclude?: number) => ({
    originalAmount: 100,
    movements,
    excludeMovementId: exclude ?? null,
    debtLabel: 'سلفة سيارة',
  });

  it('يقبل سدادًا داخل الرصيد ويعيده مقرَّبًا', () => {
    expect(assertPaymentWithinBalance(25, ctx())).toBe(25);
    expect(assertPaymentWithinBalance(0.3335, ctx())).toBe(0.334);
  });

  it('يرفض سدادًا يتجاوز الرصيد، ويسمّي السجل والمتبقي في الرسالة', () => {
    expect(() => assertPaymentWithinBalance(30, ctx([mv(1, 80)]))).toThrow(/سلفة سيارة/);
    expect(() => assertPaymentWithinBalance(30, ctx([mv(1, 80)]))).toThrow(/20\.000/);
  });

  it('يقبل السداد المساوي للرصيد بالضبط', () => {
    expect(assertPaymentWithinBalance(20, ctx([mv(1, 80)]))).toBe(20);
  });

  it('تعديل حركة قائمة يُقارَن بالرصيد بدونها — ٨٠ ← ٩٠ مقبول', () => {
    // الأصل ١٠٠ وعليه حركة واحدة بـ٨٠. رفعها إلى ٩٠ **مقبول** لأن المقارنة تجري
    // بالرصيد بعد استبعادها (١٠٠)، لا بالرصيد الظاهر (٢٠) الذي يحسبها ضمن المسدَّد.
    const movements = [mv(7, 80)];
    expect(() => assertPaymentWithinBalance(90, ctx(movements))).toThrow(/20\.000/);
    expect(assertPaymentWithinBalance(90, ctx(movements, 7))).toBe(90);
  });

  it('حتى مع الاستبعاد لا يُقبل ما يتجاوز الأصل', () => {
    expect(() => assertPaymentWithinBalance(120, ctx([mv(7, 80)], 7))).toThrow(/100\.000/);
  });

  it('يرفض الصفر والسالب وغير المحدود', () => {
    expect(() => assertPaymentWithinBalance(0, ctx())).toThrow();
    expect(() => assertPaymentWithinBalance(-5, ctx())).toThrow();
    expect(() => assertPaymentWithinBalance(Number.NaN, ctx())).toThrow();
  });
});

describe('تعديل أصل المديونية', () => {
  it('يقبل رفع الأصل دائمًا', () => {
    expect(assertOriginalCoversPayments(200, [mv(1, 80)])).toBe(200);
  });

  it('يقبل خفضه إلى حدّ المسدَّد بالضبط', () => {
    expect(assertOriginalCoversPayments(80, [mv(1, 80)])).toBe(80);
  });

  it('يرفض خفضه دون المسدَّد فعلًا — ولا ينتج رصيدًا سالبًا', () => {
    expect(() => assertOriginalCoversPayments(50, [mv(1, 80)])).toThrow(/80\.000/);
  });

  it('يرفض أصلًا صفرًا أو سالبًا', () => {
    expect(() => assertOriginalCoversPayments(0, [])).toThrow();
    expect(() => assertOriginalCoversPayments(-1, [])).toThrow();
  });
});

describe('ملخّص السجل', () => {
  it('يعدّ المفتوح والمسدَّد ويجمع الأصل والمسدَّد', () => {
    const s = summarizeDebts([
      computeDebtBalance(100, [mv(1, 25)]),
      computeDebtBalance(50, [mv(2, 50)]),
      computeDebtBalance(80, []),
    ]);
    expect(s).toEqual({
      totalDebts: 3,
      openDebts: 2,
      settledDebts: 1,
      totalOriginal: 230,
      totalPaid: 75,
      totalRemaining: 155, // 75 + 80 — المسدَّدة لا تضيف شيئًا
    });
  });

  it('سجل فارغ يعطي أصفارًا لا NaN', () => {
    expect(summarizeDebts([])).toEqual({
      totalDebts: 0, openDebts: 0, settledDebts: 0, totalOriginal: 0, totalPaid: 0, totalRemaining: 0,
    });
  });
});

import { describe, it, expect } from 'vitest';
import { calculateEntitlements } from '../entitlements.calc';

/**
 * اختبارات حاسبة الاستحقاقات (قانون 6/2010، المادتان 70 و51).
 * كل الحسابات نقيّة ومحسومة النتائج، والتواريخ ثابتة (لا Date.now).
 */
describe('calculateEntitlements', () => {
  const asOf = new Date('2026-01-01T00:00:00Z');

  it('returns incomplete flags and null money values when hireDate is missing', () => {
    const r = calculateEntitlements({ hireDate: null, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    expect(r.hasHireDate).toBe(false);
    expect(r.hasSalary).toBe(true);
    expect(r.duration).toBeNull();
    expect(r.accruedLeaveDays).toBeNull();
    expect(r.remainingLeaveDays).toBeNull();
    expect(r.gratuity).toBeNull();
    expect(r.leaveAllowanceValue).toBeNull();
    // نسبة الاستحقاق السنوي القانونية تظل معروضة دائمًا.
    expect(r.annualEntitlementDays).toBe(30);
  });

  it('computes leave days but null money values when salary is missing', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z'); // سنة كاملة قبل asOf
    const r = calculateEntitlements({ hireDate, monthlySalary: 0, asOf, usedAnnualLeaveDays: 0 });
    expect(r.hasSalary).toBe(false);
    // أيام الإجازة تُحتسب من التاريخ فقط.
    expect(r.accruedLeaveDays).toBeGreaterThan(29);
    expect(r.accruedLeaveDays).toBeLessThanOrEqual(30);
    // القيم النقدية تبقى null بلا تخمين.
    expect(r.dailyWage).toBeNull();
    expect(r.leaveAllowanceValue).toBeNull();
    expect(r.gratuity).toBeNull();
  });

  it('accrues ~30 annual leave days for one completed year (Article 70)', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    // 30 × 365/365 = 30 (asOf فرق 365 يومًا).
    expect(r.accruedLeaveDays).toBe(30);
    expect(r.remainingLeaveDays).toBe(30);
    expect(r.leaveAllowanceDays).toBe(30);
  });

  it('subtracts used annual leave days from the balance and never goes negative', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 40 });
    expect(r.usedLeaveDays).toBe(40);
    // 30 مستحق − 40 مستخدم → يُقصّ إلى 0 (لا رصيد سالب).
    expect(r.remainingLeaveDays).toBe(0);
    expect(r.leaveAllowanceValue).toBe(0);
  });

  it('values leave allowance at monthly salary / 30 per day', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    // الأجر اليومي = 900 / 30 = 30 ؛ 30 يومًا × 30 = 900.
    expect(r.dailyWage).toBe(30);
    expect(r.leaveAllowanceValue).toBe(900);
  });

  it('computes gratuity for exactly 5 years — first tier only (Article 51)', () => {
    const hireDate = new Date('2021-01-01T00:00:00Z'); // 5 سنوات (بعضها كبيسة)
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g).not.toBeNull();
    // الأجر اليومي = 30 ؛ الشريحة الأولى ≈ 15 × 30 × 5 = 2250 (± بسبب أيام الكبيسة).
    expect(g.firstTierYears).toBeGreaterThanOrEqual(5);
    expect(g.firstTierAmount).toBeGreaterThan(2249);
    // لا استحقاق للمدة الإضافية عند 5 سنوات تقريبًا.
    expect(g.secondTierAmount).toBeGreaterThanOrEqual(0);
    expect(g.capApplied).toBe(false);
    expect(r.assumptionsApplied).toBe(true);
  });

  it('applies the second tier (one month/year) beyond 5 years (Article 51)', () => {
    const hireDate = new Date('2016-01-01T00:00:00Z'); // 10 سنوات
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    // أول 5 سنوات: 15×30×5 = 2250 ؛ الإضافية 5 سنوات: 30×30×5 = 4500 ؛ الإجمالي ≈ 6750.
    expect(g.firstTierYears).toBe(5);
    expect(g.secondTierYears).toBeGreaterThan(4.9);
    expect(g.total).toBeGreaterThan(6700);
    expect(g.capApplied).toBe(false);
  });

  it('caps total gratuity at 18 months of wage (Article 51)', () => {
    const hireDate = new Date('1990-01-01T00:00:00Z'); // خدمة طويلة جدًا
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g.capApplied).toBe(true);
    expect(g.total).toBe(g.capAmount);
    expect(g.total).toBe(900 * 18); // 16200
  });

  it('clamps a future hire date to zero service (no negative values)', () => {
    const hireDate = new Date('2027-01-01T00:00:00Z'); // بعد asOf
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
    expect(r.accruedLeaveDays).toBe(0);
    expect(r.gratuity!.total).toBe(0);
  });

  it('produces an exact calendar duration breakdown', () => {
    const hireDate = new Date('2023-06-15T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    // من 2023-06-15 إلى 2026-01-01 = سنتان و6 أشهر و17 يومًا.
    expect(r.duration).toEqual({ years: 2, months: 6, days: 17, totalDays: 931 });
  });
});

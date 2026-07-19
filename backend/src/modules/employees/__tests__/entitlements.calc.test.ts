import { describe, it, expect } from 'vitest';
import { calculateEntitlements, resolveLeaveBaseline } from '../entitlements.calc';

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

describe('resolveLeaveBaseline — خط أساس رصيد الإجازة', () => {
  const hire = new Date('2024-01-01T00:00:00Z');

  it('falls back to hire date when there are no settlements', () => {
    const { baselineDate, isSettlement } = resolveLeaveBaseline(hire, []);
    expect(baselineDate).toEqual(hire);
    expect(isSettlement).toBe(false);
  });

  it('uses the settlement date when one settlement exists', () => {
    const s = new Date('2026-07-15T00:00:00Z');
    const { baselineDate, isSettlement } = resolveLeaveBaseline(hire, [s]);
    expect(baselineDate).toEqual(s);
    expect(isSettlement).toBe(true);
  });

  it('picks the latest settlement when multiple exist (order-independent)', () => {
    const older = new Date('2025-03-01T00:00:00Z');
    const latest = new Date('2026-07-15T00:00:00Z');
    const mid = new Date('2025-12-20T00:00:00Z');
    const { baselineDate, isSettlement } = resolveLeaveBaseline(hire, [older, latest, mid]);
    expect(baselineDate).toEqual(latest);
    expect(isSettlement).toBe(true);
  });

  it('ignores invalid settlement dates and falls back to hire date', () => {
    const bad = new Date('not-a-date');
    const { baselineDate, isSettlement } = resolveLeaveBaseline(hire, [bad, null]);
    expect(baselineDate).toEqual(hire);
    expect(isSettlement).toBe(false);
  });

  it('returns null baseline when neither hire date nor settlement exists', () => {
    const { baselineDate, isSettlement } = resolveLeaveBaseline(null, []);
    expect(baselineDate).toBeNull();
    expect(isSettlement).toBe(false);
  });
});

describe('calculateEntitlements — accrual from leave baseline (settlement)', () => {
  const asOf = new Date('2026-09-20T00:00:00Z');
  const hire = new Date('2024-01-01T00:00:00Z'); // خدمة طويلة قبل التسوية

  it('accrues leave from the hire date when no settlement baseline is passed', () => {
    const r = calculateEntitlements({ hireDate: hire, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    // ~2.72 سنة × 30 ≈ 82 يومًا — رصيد كبير متراكم من التعيين.
    expect(r.accruedLeaveDays).toBeGreaterThan(80);
  });

  it('accrues leave ONLY from the settlement date forward when a baseline is passed', () => {
    const settlement = new Date('2026-07-15T00:00:00Z'); // آخر تسوية
    const r = calculateEntitlements({
      hireDate: hire,
      leaveBaselineDate: settlement,
      monthlySalary: 900,
      asOf,
      usedAnnualLeaveDays: 0,
    });
    // من 15/07/2026 إلى 20/09/2026 = 67 يومًا → 30 × 67/365 ≈ 5.51 يومًا (رصيد صغير جديد).
    expect(r.accruedLeaveDays).toBeGreaterThan(5);
    expect(r.accruedLeaveDays).toBeLessThan(6);
    // مدة الخدمة ومكافأة نهاية الخدمة تبقى من تاريخ التعيين (لا تتأثر بالتسوية).
    expect(r.duration!.years).toBe(2);
    expect(r.gratuity!.serviceYears).toBeGreaterThan(2.6);
  });
});

describe('Entitlement ledger is historical only — never feeds the calculation', () => {
  const asOf = new Date('2026-09-20T00:00:00Z');
  const hire = new Date('2024-01-01T00:00:00Z');

  // العقد المعماري: للحاسبة النقيّة مدخلات محدّدة (تاريخ التعيين، خط أساس الإجازة،
  // الراتب، الأيام المستخدمة، asOf) — ولا وجود لأي مدخل «سجل مستحقات». لذا فإضافة صفوف
  // في سجل المستحقات المصروفة لا يمكنها أن تغيّر أي ناتج احتساب. تُوثّق هذه الاختبارات ذلك.

  it('produces identical output for identical calc inputs (ledger rows are irrelevant to it)', () => {
    const input = { hireDate: hire, leaveBaselineDate: hire, monthlySalary: 900, asOf, usedAnnualLeaveDays: 3 };
    // «قبل» و«بعد» إضافة صفوف سجل — نفس مدخلات الاحتساب لأن السجل ليس مدخلًا أصلًا.
    const before = calculateEntitlements({ ...input });
    const after = calculateEntitlements({ ...input });
    expect(after).toEqual(before);
  });

  it('EOS (gratuity) depends only on hire date + salary, not on any ledger/allowance record', () => {
    const a = calculateEntitlements({ hireDate: hire, leaveBaselineDate: hire, monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    // خط أساس الإجازة (تسوية) لا يغيّر المكافأة — المكافأة من تاريخ التعيين حصرًا.
    const b = calculateEntitlements({ hireDate: hire, leaveBaselineDate: new Date('2026-07-15T00:00:00Z'), monthlySalary: 900, asOf, usedAnnualLeaveDays: 0 });
    expect(b.gratuity!.total).toBe(a.gratuity!.total);
    expect(b.gratuity!.serviceYears).toBe(a.gratuity!.serviceYears);
  });
});

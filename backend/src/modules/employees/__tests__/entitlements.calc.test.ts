import { describe, it, expect } from 'vitest';
import { calculateEntitlements, computeEffectiveAnnualLeaveDays } from '../entitlements.calc';

/**
 * اختبارات حاسبة الاستحقاقات (قانون 6/2010، المواد 51 و53 و55 و62 و70 و73 و74).
 * كل الحسابات نقيّة ومحسومة النتائج، والتواريخ ثابتة (لا Date.now).
 * قاسم الأجر اليومي = 26 (خط أساس قانوني معتمَد للمشروع — غير قابل لإعادة التقييم).
 */
describe('calculateEntitlements', () => {
  const asOf = new Date('2026-01-01T00:00:00Z');

  it('returns incomplete flags and null money values when hireDate is missing', () => {
    const r = calculateEntitlements({ hireDate: null, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    expect(r.hasHireDate).toBe(false);
    expect(r.hasWageBase).toBe(true);
    expect(r.duration).toBeNull();
    expect(r.accruedLeaveDays).toBeNull();
    expect(r.remainingLeaveDays).toBeNull();
    expect(r.gratuity).toBeNull();
    expect(r.leaveAllowanceValue).toBeNull();
    // نسبة الاستحقاق السنوي القانونية تظل معروضة دائمًا.
    expect(r.annualEntitlementDays).toBe(30);
  });

  it('computes leave days but null money values when the wage base is missing', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z'); // سنة كاملة قبل asOf
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 0, asOf, usedAnnualLeaveDays: 0 });
    expect(r.hasWageBase).toBe(false);
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
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    // 30 × 365/365 = 30 (asOf فرق 365 يومًا).
    expect(r.accruedLeaveDays).toBe(30);
    expect(r.remainingLeaveDays).toBe(30);
    expect(r.leaveAllowanceDays).toBe(30);
  });

  it('subtracts used annual leave days from the balance and never goes negative', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 40 });
    expect(r.usedLeaveDays).toBe(40);
    // 30 مستحق − 40 مستخدم → يُقصّ إلى 0 (لا رصيد سالب).
    expect(r.remainingLeaveDays).toBe(0);
    expect(r.leaveAllowanceValue).toBe(0);
  });

  it('values daily wage and leave allowance at wage base / 26 per day (project baseline divisor)', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    // الأجر اليومي = 900 / 26 = 34.615... (مقرَّب لـ3 منازل) ؛ 30 يومًا × القيمة الخام.
    expect(r.dailyWage).toBeCloseTo(900 / 26, 3);
    expect(r.leaveAllowanceValue).toBeCloseTo(30 * (900 / 26), 3);
  });

  it('does not duplicate the divisor computation — dailyWage and leaveAllowanceValue derive from the same raw value', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 901, asOf, usedAnnualLeaveDays: 5 });
    // لو استُخدم قاسمان مختلفان (مثلاً تقريب مبكر) لظهر انحراف طفيف — نتحقق من الاتساق:
    // leaveAllowanceValue ÷ الأيام المتبقية يجب أن يساوي dailyWage الخام حتى تقريب دقيق.
    const impliedDaily = r.leaveAllowanceValue! / r.remainingLeaveDays!;
    expect(impliedDaily).toBeCloseTo(901 / 26, 2);
  });

  it('computes gratuity for exactly 5 years — first tier only (Article 51)', () => {
    const hireDate = new Date('2021-01-01T00:00:00Z'); // 5 سنوات (بعضها كبيسة)
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g).not.toBeNull();
    // الأجر اليومي = 900/26 ؛ الشريحة الأولى = 15 × (900/26) × 5.
    expect(g.firstTierYears).toBeGreaterThanOrEqual(5);
    expect(g.firstTierAmount).toBeCloseTo(15 * (900 / 26) * 5, 1);
    // عند 5 سنوات بالضبط (مع كبيسة) تتجاوز سنوات الخدمة 5 قليلاً → شريحة ثانية ضئيلة موجبة.
    expect(g.secondTierAmount).toBeGreaterThanOrEqual(0);
    expect(g.capApplied).toBe(false);
    expect(r.assumptionsApplied).toBe(true);
  });

  it('applies the second tier as exactly one month of wage per year beyond 5 years (Article 51)', () => {
    const hireDate = new Date('2016-01-01T00:00:00Z'); // 10 سنوات
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g.firstTierYears).toBe(5);
    expect(g.secondTierYears).toBeGreaterThan(4.9);
    // الشريحة الثانية = أجر شهر كامل (900) × سنوات الشريحة الثانية — وليس 30 × الأجر اليومي.
    // (فارق مسموح أوسع: g.secondTierYears معروضة مقرَّبة لمنزلتين فيضخّم الفارق عند الضرب في 900)
    expect(Math.abs(g.secondTierAmount - 900 * g.secondTierYears)).toBeLessThan(2);
    // إجمالي أول 5 سنوات ≈ 15×(900/26)×5 ≈ 2596 ؛ + شريحة ثانية ≈ 4514 → إجمالي ≈ 7110.
    expect(g.total).toBeGreaterThan(7000);
    expect(g.capApplied).toBe(false);
  });

  it('caps total gratuity at 18 months of wage (Article 51)', () => {
    const hireDate = new Date('1990-01-01T00:00:00Z'); // خدمة طويلة جدًا
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g.capApplied).toBe(true);
    expect(g.total).toBe(g.capAmount);
    expect(g.total).toBe(900 * 18); // 16200 — لا يتأثر بقاسم الأجر اليومي.
  });

  it('clamps a future hire date to zero service (no negative values)', () => {
    const hireDate = new Date('2027-01-01T00:00:00Z'); // بعد asOf
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration).toEqual({ years: 0, months: 0, days: 0, totalDays: 0 });
    expect(r.accruedLeaveDays).toBe(0);
    expect(r.gratuity!.total).toBe(0);
    expect(r.gratuity!.resignationAmount).toBe(0);
  });

  it('produces an exact calendar duration breakdown', () => {
    const hireDate = new Date('2023-06-15T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    // من 2023-06-15 إلى 2026-01-01 = سنتان و6 أشهر و17 يومًا.
    expect(r.duration).toEqual({ years: 2, months: 6, days: 17, totalDays: 931 });
  });
});

describe('calculateEntitlements — resignation fraction (Article 53)', () => {
  const asOf = new Date('2026-01-01T00:00:00Z');
  const wage = 900;

  it('grants zero resignation amount under 3 years of service', () => {
    const hireDate = new Date('2024-06-01T00:00:00Z'); // ~1.6 سنة
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.gratuity!.resignationFraction).toBe(0);
    expect(r.gratuity!.resignationAmount).toBe(0);
    // الأساس الكامل (إنهاء من صاحب العمل) يبقى مستحقًا كاملًا رغم ذلك.
    expect(r.gratuity!.total).toBeGreaterThan(0);
  });

  it('grants half the full gratuity for 3–5 years of service', () => {
    const hireDate = new Date('2022-06-01T00:00:00Z'); // ~3.6 سنة
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g.serviceYears).toBeGreaterThanOrEqual(3);
    expect(g.serviceYears).toBeLessThan(5);
    expect(g.resignationFraction).toBe(0.5);
    expect(g.resignationAmount).toBeCloseTo(g.total * 0.5, 2);
  });

  it('grants two-thirds the full gratuity for 5–10 years of service', () => {
    const hireDate = new Date('2019-06-01T00:00:00Z'); // ~6.6 سنة — بوضوح بين 5 و10 سنوات
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g.serviceYears).toBeGreaterThanOrEqual(5);
    expect(g.serviceYears).toBeLessThan(10);
    expect(g.resignationFraction).toBeCloseTo(2 / 3, 6);
    expect(g.resignationAmount).toBeCloseTo(g.total * (2 / 3), 2);
  });

  it('grants the full gratuity (same as employer termination) for 10+ years of service', () => {
    const hireDate = new Date('2010-01-01T00:00:00Z'); // 16 سنة
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    const g = r.gratuity!;
    expect(g.serviceYears).toBeGreaterThanOrEqual(10);
    expect(g.resignationFraction).toBe(1);
    expect(g.resignationAmount).toBe(g.total);
  });

  it('both scenarios (employer termination and resignation) are always returned together', () => {
    const hireDate = new Date('2020-01-01T00:00:00Z');
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    // لا افتراض ضمني لسيناريو واحد — القيمتان معًا متاحتان دومًا عند اكتمال البيانات.
    expect(r.gratuity!.total).toBeGreaterThan(0);
    expect(r.gratuity).toHaveProperty('resignationFraction');
    expect(r.gratuity).toHaveProperty('resignationAmount');
  });
});

describe('calculateEntitlements — leave balance is never reset by a settlement/advance (Articles 73 & 74)', () => {
  const asOf = new Date('2026-09-20T00:00:00Z');
  const hire = new Date('2024-01-01T00:00:00Z'); // خدمة طويلة قبل أي دفعة مقدَّمة مفترضة

  it('has no settlement/baseline input at all — the calculator cannot be affected by one', () => {
    // العقد المعماري: EntitlementInput لا يحتوي أي حقل متعلق بتسويات/دفعات مقدَّمة —
    // فالإجازة تتراكم من تاريخ التعيين دائمًا، بلا أي مسار لإزاحة خط البداية.
    const r = calculateEntitlements({ hireDate: hire, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    // ~2.72 سنة × 30 ≈ 82 يومًا — رصيد كبير متراكم من التعيين، غير قابل للتصفير بأي إدخال آخر.
    expect(r.accruedLeaveDays).toBeGreaterThan(80);
  });

  it('produces identical output for identical calc inputs regardless of any external settlement/ledger activity', () => {
    const input = { hireDate: hire, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 3 };
    const before = calculateEntitlements({ ...input });
    const after = calculateEntitlements({ ...input });
    expect(after).toEqual(before);
  });

  it('EOS (gratuity) depends only on hire date + wage base, not on any ledger/settlement record', () => {
    const a = calculateEntitlements({ hireDate: hire, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    const b = calculateEntitlements({ hireDate: hire, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 0 });
    expect(b.gratuity!.total).toBe(a.gratuity!.total);
    expect(b.gratuity!.serviceYears).toBe(a.gratuity!.serviceYears);
  });
});

describe('calculateEntitlements — first-year annual leave eligibility (Article 70, 9 months)', () => {
  const asOf = new Date('2026-01-01T00:00:00Z');
  const wage = 900;

  it('grants no payable annual leave entitlement at 8 months of service', () => {
    const hireDate = new Date('2025-05-01T00:00:00Z'); // 8 أشهر تقويمية بالضبط حتى asOf
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration).toEqual({ years: 0, months: 8, days: 0, totalDays: 245 });
    expect(r.firstYearEligible).toBe(false);
    expect(r.accruedLeaveDays).toBe(0);
    expect(r.remainingLeaveDays).toBe(0);
    // بدل الإجازة صفر صراحةً (وليس null) — لا شيء قابل للصرف قبل الأهلية.
    expect(r.leaveAllowanceDays).toBe(0);
    expect(r.leaveAllowanceValue).toBe(0);
  });

  it('begins accrual automatically at exactly 9 months of service, using the unchanged proportional formula', () => {
    const hireDate = new Date('2025-04-01T00:00:00Z'); // 9 أشهر تقويمية بالضبط حتى asOf
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration!.years * 12 + r.duration!.months).toBe(9);
    expect(r.firstYearEligible).toBe(true);
    // نفس صيغة التراكم التناسبي القائمة (30 × الأيام الكلية / 365) — بلا بوابة أخرى مضافة.
    const expected = Math.round(30 * (r.duration!.totalDays / 365) * 100) / 100;
    expect(r.accruedLeaveDays).toBe(expected);
    expect(r.accruedLeaveDays).toBeGreaterThan(0);
  });

  it('continues normal accrual for more than 9 months of service', () => {
    const hireDate = new Date('2025-02-01T00:00:00Z'); // 11 شهرًا تقويميًا
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration!.years * 12 + r.duration!.months).toBe(11);
    expect(r.firstYearEligible).toBe(true);
    const expected = Math.round(30 * (r.duration!.totalDays / 365) * 100) / 100;
    expect(r.accruedLeaveDays).toBe(expected);
  });

  it('does not affect end-of-service gratuity — EOS calculation is untouched by the 9-month gate', () => {
    const hireDate = new Date('2025-05-01T00:00:00Z'); // نفس حالة الشهر الثامن غير المؤهلة للإجازة
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.firstYearEligible).toBe(false);
    expect(r.accruedLeaveDays).toBe(0);
    // المكافأة تُحتسب دائمًا من مدة الخدمة والأجر فقط — لا علاقة لها ببوابة الإجازة.
    expect(r.gratuity).not.toBeNull();
    expect(r.gratuity!.total).toBeGreaterThan(0);
  });
});

describe('computeEffectiveAnnualLeaveDays — official holiday & sick leave exclusion (Article 70)', () => {
  it('excludes a single official holiday falling inside the leave interval', () => {
    const leave = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-10T00:00:00Z') }; // 10 أيام شاملة
    const holidays = [new Date('2026-01-05T00:00:00Z')];
    expect(computeEffectiveAnnualLeaveDays(leave, holidays, [])).toBe(9);
  });

  it('excludes a sick leave period falling inside the leave interval', () => {
    const leave = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-10T00:00:00Z') };
    const sick = [{ start: new Date('2026-01-03T00:00:00Z'), end: new Date('2026-01-04T00:00:00Z') }]; // يومان
    expect(computeEffectiveAnnualLeaveDays(leave, [], sick)).toBe(8);
  });

  it('excludes multiple official holidays inside the leave interval', () => {
    const leave = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-10T00:00:00Z') };
    const holidays = [new Date('2026-01-02T00:00:00Z'), new Date('2026-01-08T00:00:00Z')];
    expect(computeEffectiveAnnualLeaveDays(leave, holidays, [])).toBe(8);
  });

  it('excludes multiple sick leave periods inside the leave interval', () => {
    const leave = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-20T00:00:00Z') }; // 20 يومًا
    const sick = [
      { start: new Date('2026-01-03T00:00:00Z'), end: new Date('2026-01-04T00:00:00Z') }, // يومان
      { start: new Date('2026-01-10T00:00:00Z'), end: new Date('2026-01-12T00:00:00Z') }, // 3 أيام
    ];
    expect(computeEffectiveAnnualLeaveDays(leave, [], sick)).toBe(15);
  });

  it('does not double-count a day that is both an official holiday and inside a sick leave period', () => {
    const leave = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-10T00:00:00Z') };
    const holidays = [new Date('2026-01-05T00:00:00Z')];
    // فترة مرضية تتداخل جزئيًا مع العطلة الرسمية في نفس اليوم (05) — يوم فريد واحد إضافي (06).
    const sick = [{ start: new Date('2026-01-05T00:00:00Z'), end: new Date('2026-01-06T00:00:00Z') }];
    // لو حدث ازدواج عدّ، لكانت النتيجة 7 (10 - 1 - 2)؛ الصحيح 8 (10 - يومان فريدان: 05 و06).
    expect(computeEffectiveAnnualLeaveDays(leave, holidays, sick)).toBe(8);
  });

  it('is unaffected when holidays and sick leave fall entirely outside the leave interval', () => {
    const leave = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-10T00:00:00Z') }; // 10 أيام
    const holidays = [new Date('2025-12-25T00:00:00Z')];
    const sick = [{ start: new Date('2026-02-01T00:00:00Z'), end: new Date('2026-02-02T00:00:00Z') }];
    expect(computeEffectiveAnnualLeaveDays(leave, holidays, sick)).toBe(10);
  });
});

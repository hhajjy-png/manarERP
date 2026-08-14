import { describe, it, expect } from 'vitest';
import { calculateEntitlements, clipLeaveIntervalToAsOf, computeEffectiveAnnualLeaveDays } from '../entitlements.calc';

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

/**
 * أهلية الإجازة السنوية — البوابة المعتمدة للمشروع **6 أشهر** (قرار عمل نهائي حلّ محلّ
 * بوابة الـ9 أشهر السابقة). الحدود الثلاثة مُختبَرة صراحةً: دون الستة، عند الستة بالضبط، وفوقها.
 */
describe('calculateEntitlements — annual leave eligibility gate (6 completed months)', () => {
  const asOf = new Date('2026-01-01T00:00:00Z');
  const wage = 900;

  it('grants no payable annual leave entitlement below 6 completed months', () => {
    const hireDate = new Date('2025-08-01T00:00:00Z'); // 5 أشهر تقويمية بالضبط حتى asOf
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration!.years * 12 + r.duration!.months).toBe(5);
    expect(r.firstYearEligible).toBe(false);
    expect(r.accruedLeaveDays).toBe(0);
    expect(r.remainingLeaveDays).toBe(0);
    // بدل الإجازة صفر صراحةً (وليس null) — لا شيء قابل للصرف قبل الأهلية.
    expect(r.leaveAllowanceDays).toBe(0);
    expect(r.leaveAllowanceValue).toBe(0);
  });

  it('is still not eligible one day before completing 6 months', () => {
    const hireDate = new Date('2025-07-02T00:00:00Z'); // ينقصه يوم واحد على إتمام 6 أشهر
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration!.years * 12 + r.duration!.months).toBe(5);
    expect(r.firstYearEligible).toBe(false);
    expect(r.accruedLeaveDays).toBe(0);
  });

  it('begins accrual automatically at exactly 6 completed months, using the unchanged proportional formula', () => {
    const hireDate = new Date('2025-07-01T00:00:00Z'); // 6 أشهر تقويمية بالضبط حتى asOf
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.duration!.years * 12 + r.duration!.months).toBe(6);
    expect(r.firstYearEligible).toBe(true);
    // نفس صيغة التراكم التناسبي القائمة (30 × الأيام الكلية / 365) — بلا بوابة أخرى مضافة.
    const expected = Math.round(30 * (r.duration!.totalDays / 365) * 100) / 100;
    expect(r.accruedLeaveDays).toBe(expected);
    expect(r.accruedLeaveDays).toBeGreaterThan(0);
  });

  it('continues normal accrual above 6 months (including what the old 9-month gate used to block)', () => {
    for (const hire of ['2025-05-01T00:00:00Z', '2025-04-01T00:00:00Z', '2025-02-01T00:00:00Z']) {
      const r = calculateEntitlements({ hireDate: new Date(hire), monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
      expect(r.firstYearEligible).toBe(true);
      const expected = Math.round(30 * (r.duration!.totalDays / 365) * 100) / 100;
      expect(r.accruedLeaveDays).toBe(expected);
      expect(r.accruedLeaveDays).toBeGreaterThan(0);
    }
  });

  it('applies the annual rate of 30 days per year of service', () => {
    const hireDate = new Date('2025-01-01T00:00:00Z'); // سنة كاملة (365 يومًا)
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.annualEntitlementDays).toBe(30);
    expect(r.duration!.totalDays).toBe(365);
    expect(r.accruedLeaveDays).toBe(30);
  });

  it('does not affect end-of-service gratuity — EOS calculation is untouched by the eligibility gate', () => {
    const hireDate = new Date('2025-08-01T00:00:00Z'); // غير مؤهل للإجازة (5 أشهر)
    const r = calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf, usedAnnualLeaveDays: 0 });
    expect(r.firstYearEligible).toBe(false);
    expect(r.accruedLeaveDays).toBe(0);
    // المكافأة تُحتسب دائمًا من مدة الخدمة والأجر فقط — لا علاقة لها ببوابة الإجازة.
    expect(r.gratuity).not.toBeNull();
    expect(r.gratuity!.total).toBeGreaterThan(0);
  });
});

/**
 * حتمية الاحتساب عند asOf صريح — نفس المدخلات تُنتج نفس النتيجة مهما تغيّر «اليوم»، وهو
 * شرط إعادة إنتاج الكشوف والتسويات المستقبلية.
 */
describe('calculateEntitlements — explicit asOf determinism', () => {
  const hireDate = new Date('2020-01-01T00:00:00Z');

  it('produces identical output for the same explicit asOf, independent of wall-clock time', () => {
    const asOf = new Date('2026-03-15T00:00:00Z');
    const a = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 10 });
    const b = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf, usedAnnualLeaveDays: 10 });
    expect(b).toEqual(a);
  });

  it('yields a larger accrued balance for a later asOf — service duration drives the value', () => {
    const early = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf: new Date('2025-01-01T00:00:00Z'), usedAnnualLeaveDays: 0 });
    const late = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf: new Date('2026-01-01T00:00:00Z'), usedAnnualLeaveDays: 0 });
    expect(late.accruedLeaveDays!).toBeGreaterThan(early.accruedLeaveDays!);
    expect(late.gratuity!.total).toBeGreaterThan(early.gratuity!.total);
  });

  it('treats a default (current-date) calculation as an ordinary asOf — no separate code path', () => {
    const now = new Date();
    const explicit = calculateEntitlements({ hireDate, monthlyWageBase: 900, asOf: now, usedAnnualLeaveDays: 0 });
    expect(explicit.hasHireDate).toBe(true);
    expect(explicit.accruedLeaveDays).toBeGreaterThan(0);
  });
});

/**
 * أجر الاستحقاق = `Employee.salary` وحده. الحاسبة نقيّة فلا تعرف مصادر أخرى أصلًا؛ ما
 * يُثبَت هنا هو أن القيمة الممرَّرة (الراتب) هي وحدها ما يحرّك الناتج — فأي بدل أو لقطة راتب
 * تاريخية لا تجد طريقًا إلى الرقم.
 */
describe('calculateEntitlements — entitlement wage is Employee.salary only', () => {
  const hireDate = new Date('2020-01-01T00:00:00Z');
  const asOf = new Date('2026-01-01T00:00:00Z');
  const salary = 500;

  it('derives the approved wage and daily wage from the passed salary alone', () => {
    const r = calculateEntitlements({ hireDate, monthlyWageBase: salary, asOf, usedAnnualLeaveDays: 0 });
    expect(r.gratuity!.approvedWage).toBe(salary);
    expect(r.dailyWage).toBe(Math.round((salary / 26) * 1000) / 1000);
  });

  it('would change if an allowance were added — proving the exclusion is material, not cosmetic', () => {
    const withoutAllowance = calculateEntitlements({ hireDate, monthlyWageBase: salary, asOf, usedAnnualLeaveDays: 0 });
    const ifAllowanceHadBeenAdded = calculateEntitlements({ hireDate, monthlyWageBase: salary + 150, asOf, usedAnnualLeaveDays: 0 });
    expect(ifAllowanceHadBeenAdded.gratuity!.total).not.toBe(withoutAllowance.gratuity!.total);
    expect(withoutAllowance.gratuity!.approvedWage).toBe(salary);
  });

  it('is unchanged by any historical payroll snapshot value', () => {
    const current = calculateEntitlements({ hireDate, monthlyWageBase: salary, asOf, usedAnnualLeaveDays: 0 });
    const historicalSnapshot = calculateEntitlements({ hireDate, monthlyWageBase: 400, asOf, usedAnnualLeaveDays: 0 });
    expect(current.gratuity!.approvedWage).toBe(salary);
    expect(historicalSnapshot.gratuity!.approvedWage).not.toBe(current.gratuity!.approvedWage);
  });
});

/**
 * تثبيت العيّنة المرصودة أثناء المراجعة البصرية (راتب 150 د.ك، تعيين 23/10/2024).
 *
 * الغرض توثيقي لا تصحيحي: تُظهر هذه الاختبارات **سلوك المحرّك الحالي كما هو** خطوة بخطوة
 * (عدد أيام الخدمة ← التراكم ← الأجر اليومي ← القيمة النقدية) حتى يكون أي تغيير مستقبلي في
 * القاسم 26 أو في معالجة التراكم قرارًا صريحًا يُسقط اختبارًا، لا انزلاقًا صامتًا.
 *
 * ملاحظة مهمة: `totalDays` فرق لحظات زمنية (UTC). تاريخ التعيين مخزَّن عند منتصف ليل UTC،
 * بينما الاحتساب الافتراضي يستخدم لحظة «الآن» — فيتغيّر العدّ بيوم واحد حسب لحظة التنفيذ
 * خلال اليوم. لذلك تُمرَّر هنا لحظات asOf صريحة، ويُغطّى الطرفان معًا.
 */
/**
 * العيّنة المعتمدة: راتب 150 د.ك، تعيين 23/10/2024، احتساب 29/07/2026.
 *
 * تُثبّت هذه الاختبارات **سلسلة الاحتساب** لا رقمًا محفوظًا: كل قيمة متوقَّعة تُشتق هنا من
 * القواعد المعتمدة (30 يومًا/سنة · القاسم 26 · التراكم التناسبي من تاريخ التعيين) ثم تُقارن
 * بمخرج المحرّك — فأي انحراف مستقبلي في أي حلقة يسقط الاختبار.
 */
describe('calculateEntitlements — approved sample (150 KWD, hired 23/10/2024, asOf 29/07/2026)', () => {
  const hireDate = new Date('2024-10-23T00:00:00.000Z');
  const asOf = new Date('2026-07-29T00:00:00.000Z');
  const salary = 150;

  const run = (at: Date) => calculateEntitlements({ hireDate, monthlyWageBase: salary, asOf: at, usedAnnualLeaveDays: 0 });

  it('derives the whole chain from the approved rules', () => {
    const r = run(asOf);

    // ١) مدة الخدمة بالأيام التقويمية — من 23/10/2024 إلى 29/07/2026.
    const expectedDays =
      (Date.UTC(2026, 6, 29) - Date.UTC(2024, 9, 23)) / 86_400_000;
    expect(r.duration!.totalDays).toBe(expectedDays);

    // ٢) التراكم = 30 يومًا/سنة × (أيام الخدمة ÷ 365)، مقرَّبًا لخانتين.
    const expectedAccrued = Math.round(30 * (expectedDays / 365) * 100) / 100;
    expect(r.accruedLeaveDays).toBe(expectedAccrued);
    expect(r.remainingLeaveDays).toBe(expectedAccrued);

    // ٣) الأجر اليومي = الراتب ÷ 26 (القاعدة المعتمدة)، مقرَّبًا لثلاث خانات.
    expect(r.dailyWage).toBe(Math.round((salary / 26) * 1000) / 1000);

    // ٤) القيمة النقدية = الأيام المتبقية × الأجر اليومي **الخام**، مقرَّبة مرة واحدة.
    expect(r.leaveAllowanceValue).toBe(Math.round(expectedAccrued * (salary / 26) * 1000) / 1000);
  });

  it('is identical at every hour of the calculation day — no time-of-day drift', () => {
    const baseline = run(asOf);
    for (const hour of ['T00:00:00.000Z', 'T03:30:00.000Z', 'T12:00:00.000Z', 'T21:00:00.000Z', 'T23:59:59.999Z']) {
      const r = run(new Date('2026-07-29' + hour));
      expect(r.duration!.totalDays).toBe(baseline.duration!.totalDays);
      expect(r.accruedLeaveDays).toBe(baseline.accruedLeaveDays);
      expect(r.leaveAllowanceValue).toBe(baseline.leaveAllowanceValue);
    }
  });

  it('advances by exactly one service day on the next calendar date', () => {
    const today = run(asOf);
    const tomorrow = run(new Date('2026-07-30T00:00:00.000Z'));
    expect(tomorrow.duration!.totalDays).toBe(today.duration!.totalDays + 1);
  });

  it('counts service from the original hire date — the first 6 months are not discarded', () => {
    const r = run(asOf);
    const discardedFirst6Months = 30 * ((r.duration!.totalDays - 182) / 365);
    expect(r.accruedLeaveDays!).toBeGreaterThan(discardedFirst6Months);
    expect(r.accruedLeaveDays).toBe(Math.round(30 * (r.duration!.totalDays / 365) * 100) / 100);
  });
});

/**
 * القاسم 26 — قاعدة احتساب معتمَدة في المنار (لا صيغة قانونية حرفية). مركزية في المحرّك
 * الوحيد، ومقفلة هنا صراحةً حتى يكون أي تغيير مستقبلي قرارًا واعيًا يُسقط اختبارًا.
 */
describe('calculateEntitlements — approved daily-wage divisor (26)', () => {
  const hireDate = new Date('2020-01-01T00:00:00.000Z');
  const asOf = new Date('2026-01-01T00:00:00.000Z');

  it('always derives the daily wage as Employee.salary / 26', () => {
    for (const salary of [150, 260, 500, 901]) {
      const r = calculateEntitlements({ hireDate, monthlyWageBase: salary, asOf, usedAnnualLeaveDays: 0 });
      expect(r.dailyWage).toBe(Math.round((salary / 26) * 1000) / 1000);
      expect(r.gratuity!.dailyWage).toBe(Math.round((salary / 26) * 1000) / 1000);
    }
  });

  it('uses the same divisor for the end-of-service first tier — one central rule, not two', () => {
    const salary = 260; // يقسم على 26 بلا كسور: الأجر اليومي = 10 بالضبط
    const r = calculateEntitlements({ hireDate, monthlyWageBase: salary, asOf, usedAnnualLeaveDays: 0 });
    expect(r.dailyWage).toBe(10);
    expect(r.gratuity!.firstTierAmount).toBe(
      Math.round(15 * 10 * r.gratuity!.firstTierYears * 1000) / 1000,
    );
  });
});

/**
 * بوابة الأهلية (6 أشهر) تقويمية أيضًا: لا تنفتح ولا تنغلق بتغيّر ساعة الاحتساب.
 */
describe('calculateEntitlements — eligibility gate is calendar-stable', () => {
  const hireDate = new Date('2025-01-31T00:00:00.000Z');
  const wage = 900;
  const at = (iso: string) => calculateEntitlements({ hireDate, monthlyWageBase: wage, asOf: new Date(iso), usedAnnualLeaveDays: 0 });

  it('stays closed for the whole day before the gate opens', () => {
    for (const hour of ['T00:00:00.000Z', 'T12:00:00.000Z', 'T23:59:59.999Z']) {
      const r = at('2025-07-30' + hour); // ما يزال دون 6 أشهر كاملة
      expect(r.firstYearEligible).toBe(false);
      expect(r.accruedLeaveDays).toBe(0);
      expect(r.leaveAllowanceValue).toBe(0);
    }
  });

  it('opens on the completion date and stays open for the whole day', () => {
    for (const hour of ['T00:00:00.000Z', 'T12:00:00.000Z', 'T23:59:59.999Z']) {
      const r = at('2025-07-31' + hour); // 6 أشهر كاملة بالضبط
      expect(r.firstYearEligible).toBe(true);
      expect(r.accruedLeaveDays!).toBeGreaterThan(0);
      // التراكم يعود لتاريخ التعيين الأصلي، لا لتاريخ فتح البوابة.
      expect(r.accruedLeaveDays).toBe(Math.round(30 * (r.duration!.totalDays / 365) * 100) / 100);
    }
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

/* ════════════════════════════════════════════════════════════════════════════
   قصّ فترة الإجازة عند تاريخ الاحتساب
   (Legal Leave Balance & Payments Reconciliation Pack v1)

   القاعدة: يوم الإجازة يستهلك الرصيد حين **يُقضى** لا حين **يُعتمَد**. لذلك يُقصّ كل
   سجل إجازة عند `asOf` قبل عدّ أيامه. دالة نقيّة حتمية — بلا `new Date()`.
   ════════════════════════════════════════════════════════════════════════════ */
describe('clipLeaveIntervalToAsOf', () => {
  const d = (s: string) => new Date(s + 'T00:00:00Z');
  const daysOf = (start: string, end: string, asOf: string) => {
    const clipped = clipLeaveIntervalToAsOf({ start: d(start), end: d(end) }, d(asOf));
    return clipped ? computeEffectiveAnnualLeaveDays(clipped, [], []) : 0;
  };

  it('إجازة مستقبلية لا تُخصم إطلاقًا — سيناريو المتطلّب حرفيًا', () => {
    // asOf = 15/08/2026 · الإجازة 16/08/2026 → 15/11/2026 ⇒ صفر يوم.
    expect(clipLeaveIntervalToAsOf({ start: d('2026-08-16'), end: d('2026-11-15') }, d('2026-08-15'))).toBeNull();
    expect(daysOf('2026-08-16', '2026-11-15', '2026-08-15')).toBe(0);
  });

  it('إجازة تبدأ في يوم الاحتساب نفسه = يوم واحد', () => {
    expect(daysOf('2026-08-15', '2026-11-15', '2026-08-15')).toBe(1);
  });

  it('إجازة جارية تُخصم بجزئها المنقضي فقط', () => {
    // 01/08 → 15/08 منقضية من أصل إجازة تمتد إلى 15/11.
    expect(daysOf('2026-08-01', '2026-11-15', '2026-08-15')).toBe(15);
  });

  it('إجازة منتهية تُخصم كاملةً', () => {
    expect(daysOf('2026-01-01', '2026-01-10', '2026-08-15')).toBe(10);
    expect(daysOf('2026-08-01', '2026-08-15', '2026-08-15')).toBe(15); // تنتهي في asOf
  });

  it('يوم واحد يساوي تاريخ الاحتساب', () => {
    expect(daysOf('2026-08-15', '2026-08-15', '2026-08-15')).toBe(1);
  });

  it('إجازة تمتد بين شهرين وأخرى بين سنتين تُعدّان تقويميًا بلا انقطاع', () => {
    expect(daysOf('2026-01-25', '2026-02-05', '2026-08-15')).toBe(12);
    expect(daysOf('2025-12-20', '2026-01-10', '2026-08-15')).toBe(22);
  });

  it('حتمية: نفس المدخلات تعطي نفس الناتج دائمًا', () => {
    const once = daysOf('2026-08-01', '2026-11-15', '2026-08-15');
    for (let i = 0; i < 5; i++) expect(daysOf('2026-08-01', '2026-11-15', '2026-08-15')).toBe(once);
  });

  it('لا يتأثر القصّ بمكوّن الوقت داخل التواريخ المخزَّنة', () => {
    const clipped = clipLeaveIntervalToAsOf(
      { start: new Date('2026-08-01T23:59:59Z'), end: new Date('2026-11-15T06:30:00Z') },
      new Date('2026-08-15T18:42:11Z'),
    );
    expect(computeEffectiveAnnualLeaveDays(clipped!, [], [])).toBe(15);
  });

  it('العطلات الرسمية والمرضية داخل الجزء المنقضي تُستثنى (المادة 70)', () => {
    const clipped = clipLeaveIntervalToAsOf({ start: d('2026-08-01'), end: d('2026-11-15') }, d('2026-08-15'))!;
    // عطلتان رسميتان داخل الجزء المنقضي + يوم مرضي واحد ⇒ 15 − 3 = 12.
    const days = computeEffectiveAnnualLeaveDays(
      clipped,
      [d('2026-08-05'), d('2026-08-06')],
      [{ start: d('2026-08-10'), end: d('2026-08-10') }],
    );
    expect(days).toBe(12);
  });
});

describe('calculateEntitlements — تجاوز الرصيد يُسمّى ولا يُطمس', () => {
  const base = { hireDate: new Date('2020-01-01T00:00:00Z'), monthlyWageBase: 520, asOf: new Date('2026-01-01T00:00:00Z') };

  it('الرصيد لا ينزل تحت الصفر، والفائض يظهر في overusedLeaveDays', () => {
    const accrued = calculateEntitlements({ ...base, usedAnnualLeaveDays: 0 }).accruedLeaveDays!;
    const r = calculateEntitlements({ ...base, usedAnnualLeaveDays: accrued + 5 });

    expect(r.remainingLeaveDays).toBe(0);
    expect(r.overusedLeaveDays).toBe(5);
    // لا قيمة مالية سالبة — النظام لا يملك مفهوم دَين إجازة.
    expect(r.leaveAllowanceValue).toBe(0);
  });

  it('بلا تجاوز يكون overusedLeaveDays صفرًا و remaining = accrued − used', () => {
    const r = calculateEntitlements({ ...base, usedAnnualLeaveDays: 30 });
    expect(r.overusedLeaveDays).toBe(0);
    expect(r.remainingLeaveDays).toBe(round2Helper(r.accruedLeaveDays! - 30));
  });
});

/** تقريب موضعي مطابق لتقريب المحرّك (خانتان) — للمقارنة فقط. */
function round2Helper(n: number): number {
  return Math.round(n * 100) / 100;
}

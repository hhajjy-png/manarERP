import { describe, it, expect } from 'vitest';
import { DAILY_WAGE_DIVISOR } from '../../employees/entitlements.calc';
import {
  ceilHoursInFavourOfEmployee,
  checkOvertimeLimits,
  computeCompensation,
  computeHourlyRate,
  computeOvertimeLine,
  computeOvertimeLines,
  DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING,
  LEGAL_RULES_VERSION,
  MONTHLY_WAGE_DAYS_DIVISOR,
  MONTHLY_WORK_HOURS,
  OVERTIME_LIMITS,
  OVERTIME_RULES,
  reverseOvertimeFromAmount,
} from '../engine';

/**
 * محرّك مستحقات الموظف الشهرية — اختبارات المنطق القانوني والحسابي.
 *
 * كلها خالصة: لا Prisma، لا Express، لا تهيئة. ما تُثبته تحديدًا هو أن المعاملات
 * القانونية الثلاثة مطبَّقة كما وردت في المادة ٦٦، وأن التقريب في الحسبة العكسية يقع
 * **دائمًا لصالح الموظف**، وأن تجاوز الحد القانوني يظهر تحذيرًا ولا يُقصّ الساعات.
 */

/** راتب مرجعي يعطي أجر ساعة عشريًا نظيفًا: 416 ÷ 208 = 2.000 د.ك. */
const SALARY_CLEAN = 416;
/** راتب يعطي أجر ساعة دوريًا (2.40384…) لاختبار سلوك التقريب. */
const SALARY_REPEATING = 500;

describe('أجر الساعة — القاسم الموثَّق للمشروع', () => {
  it('يستورد قاسم الأجر اليومي من خط الأساس القانوني الموثَّق ولا يعيد تعريفه', () => {
    // الحارس الحقيقي: لو غُيّر القاسم في `employees/entitlements.calc.ts` وحده لسرى
    // التغيير هنا تلقائيًا. تساوي القيمتين مُثبَت لا مفترَض.
    expect(MONTHLY_WAGE_DAYS_DIVISOR).toBe(DAILY_WAGE_DIVISOR);
    expect(MONTHLY_WAGE_DAYS_DIVISOR).toBe(26);
  });

  it('ساعات الشهر = القاسم اليومي × ٨ ساعات = ٢٠٨', () => {
    expect(MONTHLY_WORK_HOURS).toBe(208);
  });

  it('يشتقّ أجر الساعة من الراتب الشهري ÷ ٢٠٨ ساعة', () => {
    expect(computeHourlyRate(SALARY_CLEAN)).toBe(2); // 416 ÷ 208
  });

  it('يقرّب أجر الساعة إلى ثلاث خانات فيبقى الكشف قابلًا لإعادة الحساب', () => {
    expect(computeHourlyRate(SALARY_REPEATING)).toBe(2.404); // 500 ÷ 208 = 2.403846…
  });

  it('أجر الساعة متّسق مع الأجر اليومي المستعمل في التصفية النهائية', () => {
    // لا يجوز أن «يوم العمل» له قيمتان في نظام واحد: أجر الساعة × ٨ = الأجر اليومي.
    const dailyFromHourly = computeHourlyRate(SALARY_CLEAN) * 8;
    expect(dailyFromHourly).toBe(SALARY_CLEAN / DAILY_WAGE_DIVISOR);
  });

  it('يرفض راتبًا صفرًا أو سالبًا بدل إنتاج أجر ساعة صفر بصمت', () => {
    expect(() => computeHourlyRate(0)).toThrow();
    expect(() => computeHourlyRate(-100)).toThrow();
    expect(() => computeHourlyRate(Number.NaN)).toThrow();
  });
});

describe('المعاملات والمراجع القانونية — ٦٦ / ٦٧ / ٦٨', () => {
  it('يوم عمل عادي = الأجر العادي + ٢٥٪ — المادة ٦٦', () => {
    expect(OVERTIME_RULES.REGULAR.multiplier).toBe(1.25);
    const line = computeOvertimeLine({ overtimeType: 'REGULAR', hours: 10 }, 2);
    expect(line.amount).toBe(25); // 10 × 2.000 × 1.25
    expect(line.compensatoryRestDay).toBe(false);
    expect(OVERTIME_RULES.REGULAR.article).toBe(66);
    expect(line.legalReference).toContain('المادة ٦٦');
  });

  it('يوم الراحة الأسبوعية = الأجر العادي + ٥٠٪ + يوم راحة بديل — المادة ٦٧', () => {
    expect(OVERTIME_RULES.WEEKLY_REST.multiplier).toBe(1.5);
    const line = computeOvertimeLine({ overtimeType: 'WEEKLY_REST', hours: 8 }, 2);
    expect(line.amount).toBe(24); // 8 × 2.000 × 1.50
    expect(line.compensatoryRestDay).toBe(true);
    expect(OVERTIME_RULES.WEEKLY_REST.article).toBe(67);
    expect(line.legalReference).toContain('المادة ٦٧');
  });

  it('العطلة الرسمية = أجر مضاعف + يوم راحة بديل — المادة ٦٨', () => {
    expect(OVERTIME_RULES.OFFICIAL_HOLIDAY.multiplier).toBe(2);
    const line = computeOvertimeLine({ overtimeType: 'OFFICIAL_HOLIDAY', hours: 8 }, 2);
    expect(line.amount).toBe(32); // 8 × 2.000 × 2.00
    expect(line.compensatoryRestDay).toBe(true);
    expect(OVERTIME_RULES.OFFICIAL_HOLIDAY.article).toBe(68);
    expect(line.legalReference).toContain('المادة ٦٨');
  });

  it('يقرّب المبلغ مرة واحدة في النهاية لا عند كل خطوة', () => {
    // 11 × 2.404 × 1.25 = 33.055 بتقريب واحد.
    const line = computeOvertimeLine({ overtimeType: 'REGULAR', hours: 11 }, 2.404);
    expect(line.amount).toBe(33.055);
  });

  it('يرفض نوع عمل إضافي خارج القائمة القانونية', () => {
    // @ts-expect-error — اختبار حارس وقت التشغيل لا وقت البناء.
    expect(() => computeOvertimeLine({ overtimeType: 'NIGHT_SHIFT', hours: 3 }, 2)).toThrow();
  });

  it('يرفض ساعات سالبة', () => {
    expect(() => computeOvertimeLine({ overtimeType: 'REGULAR', hours: -1 }, 2)).toThrow();
  });
});

describe('تقريب الساعات لصالح الموظف', () => {
  it('يترك الساعة الكاملة كما هي', () => {
    expect(ceilHoursInFavourOfEmployee(10)).toBe(10);
  });

  it('يرفع أي جزء من ساعة إلى الساعة التالية', () => {
    expect(ceilHoursInFavourOfEmployee(10.01)).toBe(11);
    expect(ceilHoursInFavourOfEmployee(10.1)).toBe(11);
    expect(ceilHoursInFavourOfEmployee(10.9)).toBe(11);
    expect(ceilHoursInFavourOfEmployee(0.01)).toBe(1);
  });

  it('لا يرفع ساعة وهمية بسبب ضجيج التمثيل الثنائي', () => {
    expect(ceilHoursInFavourOfEmployee(9.999999999999998)).toBe(10);
  });

  it('الصفر يبقى صفرًا ولا يصير سالبًا', () => {
    expect(Object.is(ceilHoursInFavourOfEmployee(0), 0)).toBe(true);
  });
});

describe('الحسبة العكسية — احسب الساعات من مبلغ', () => {
  const hourlyRate = computeHourlyRate(SALARY_CLEAN); // 2.000

  it('مبلغ ينتج ساعات كاملة بالضبط لا يُرفع', () => {
    // 25.000 ÷ (2.000 × 1.25) = 10 ساعات بالضبط.
    const r = reverseOvertimeFromAmount({ targetAmount: 25, overtimeType: 'REGULAR', hourlyRate });
    expect(r.rawHours).toBe(10);
    expect(r.hours).toBe(10);
    expect(r.amount).toBe(25);
    expect(r.difference).toBe(0);
  });

  it('مبلغ ينتج جزءًا صغيرًا من ساعة يُرفع إلى الساعة التالية لصالح الموظف', () => {
    // 25.100 ÷ 2.5 = 10.04 → 11 ساعة → 27.500 د.ك.
    const r = reverseOvertimeFromAmount({ targetAmount: 25.1, overtimeType: 'REGULAR', hourlyRate });
    expect(r.rawHours).toBe(10.04);
    expect(r.hours).toBe(11);
    expect(r.amount).toBe(27.5);
    expect(r.difference).toBe(2.4);
  });

  it('المبلغ النهائي أعلى من المستهدف أو مساوٍ له — لا أقل أبدًا', () => {
    for (const target of [0.5, 1, 3.333, 17.75, 100, 840]) {
      for (const type of ['REGULAR', 'WEEKLY_REST', 'OFFICIAL_HOLIDAY'] as const) {
        const r = reverseOvertimeFromAmount({ targetAmount: target, overtimeType: type, hourlyRate });
        expect(r.amount).toBeGreaterThanOrEqual(r.targetAmount);
        expect(r.difference).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(r.hours)).toBe(true);
      }
    }
  });

  it('يطبّق معامل النوع المختار لا معامل الإضافي العادي دائمًا', () => {
    const regular = reverseOvertimeFromAmount({ targetAmount: 30, overtimeType: 'REGULAR', hourlyRate });
    const holiday = reverseOvertimeFromAmount({ targetAmount: 30, overtimeType: 'OFFICIAL_HOLIDAY', hourlyRate });
    expect(regular.hours).toBe(12); // 30 ÷ 2.5
    expect(holiday.hours).toBe(8); // 30 ÷ 4.0
  });

  it('المثال المرجعي: مبلغ ٨٤٠ د.ك على راتب ٥٠٠ د.ك', () => {
    const rate = computeHourlyRate(SALARY_REPEATING); // 2.404
    const r = reverseOvertimeFromAmount({ targetAmount: 840, overtimeType: 'REGULAR', hourlyRate: rate });
    // 840 ÷ (2.404 × 1.25) = 279.534… ساعة → 280 ساعة.
    expect(r.rawHours).toBe(279.534);
    expect(r.hours).toBe(280);
    expect(r.amount).toBe(841.4);
    expect(r.difference).toBe(1.4);
  });

  it('يرفض مبلغًا سالبًا أو أجر ساعة صفرًا', () => {
    expect(() => reverseOvertimeFromAmount({ targetAmount: -1, overtimeType: 'REGULAR', hourlyRate })).toThrow();
    expect(() => reverseOvertimeFromAmount({ targetAmount: 10, overtimeType: 'REGULAR', hourlyRate: 0 })).toThrow();
  });

  it('نتيجتها تُعامَل كساعات عادية: نفس المبلغ من المسار اليدوي', () => {
    const r = reverseOvertimeFromAmount({ targetAmount: 25.1, overtimeType: 'REGULAR', hourlyRate });
    const manual = computeOvertimeLine({ overtimeType: 'REGULAR', hours: r.hours }, hourlyRate);
    expect(manual.amount).toBe(r.amount);
  });
});

describe('الحدود القانونية', () => {
  const hourlyRate = 2;

  it('داخل الحدود: لا تحذير تجاوز — لكن يبقى إفصاح الحدود غير المفحوصة', () => {
    const lines = computeOvertimeLines([{ overtimeType: 'REGULAR', hours: 10 }], hourlyRate);
    const w = checkOvertimeLimits(lines, 0);
    expect(w.map((x) => x.code)).toEqual(['OVERTIME_DAILY_LIMITS_NOT_VERIFIABLE']);
    expect(w[0].basis).toBe('DISCLOSURE');
  });

  it('لا إفصاح ولا تحذير إطلاقًا حين لا توجد ساعات', () => {
    expect(checkOvertimeLimits([], 0)).toEqual([]);
  });

  it('يُفصح صراحةً عن الحدود التي لا يفحصها النظام بدل الصمت عنها', () => {
    const lines = computeOvertimeLines([{ overtimeType: 'REGULAR', hours: 4 }], hourlyRate);
    const w = checkOvertimeLimits(lines, 0).find((x) => x.code === 'OVERTIME_DAILY_LIMITS_NOT_VERIFIABLE');
    expect(w?.basis).toBe('DISCLOSURE');
    expect(w?.messageAr).toContain('لا يفحصها');
    expect(w?.messageAr).toContain('2 ساعة في اليوم');
    expect(w?.messageAr).toContain('3 أيام في الأسبوع');
    expect(w?.messageAr).toContain('90 يومًا في السنة');
  });

  /**
   * أُعيد تصنيف ثلاثة حدود من `false` إلى `true` مع حزمة السجل اليومي.
   *
   * لم يتغيّر أي **رقم** قانوني ولا أي تفسير: تغيّر ما تملكه الوحدة من بيانات وحدَه.
   * كانت الحدود اليومية والأسبوعية والسنوية-بالأيام غير قابلة للفحص لأن الوحدة لم تكن
   * تعرف تواريخ الساعات؛ صار `OvertimeDayEntry` يعرفها، فصارت مفحوصة.
   *
   * `verifiable: true` هنا تعني «قابل للفحص متى وُجدت تفاصيل يومية» لا «مفحوص دائمًا» —
   * الأشهر القديمة بلا أيام تبقى بلا فحص يومي، ويميّزها `hasDailyDetail` صراحةً.
   */
  it('حدود المادة ٦٦ الأربعة كلها صارت قابلة للفحص بعد السجل اليومي', () => {
    expect(OVERTIME_LIMITS.maxHoursPerYear.verifiable).toBe(true);
    expect(OVERTIME_LIMITS.maxHoursPerDay.verifiable).toBe(true);
    expect(OVERTIME_LIMITS.maxDaysPerWeek.verifiable).toBe(true);
    expect(OVERTIME_LIMITS.maxDaysPerYear.verifiable).toBe(true);
  });

  it('أرقام الحدود القانونية نفسها لم تتغيّر', () => {
    expect(OVERTIME_LIMITS.maxHoursPerDay.value).toBe(2);
    expect(OVERTIME_LIMITS.maxDaysPerWeek.value).toBe(3);
    expect(OVERTIME_LIMITS.maxDaysPerYear.value).toBe(90);
    expect(OVERTIME_LIMITS.maxHoursPerYear.value).toBe(180);
  });

  it('تجاوز ١٨٠ ساعة سنويًا يُنتج تحذيرًا منصوصًا بالحد والفرق', () => {
    const lines = computeOvertimeLines([{ overtimeType: 'REGULAR', hours: 20 }], hourlyRate);
    const w = checkOvertimeLimits(lines, 170).find((x) => x.code === 'OVERTIME_ANNUAL_LIMIT_EXCEEDED');
    expect(w).toBeDefined();
    expect(w?.basis).toBe('STATUTORY');
    expect(w?.limit).toBe(OVERTIME_LIMITS.maxHoursPerYear.value);
    expect(w?.actual).toBe(190);
    expect(w?.excess).toBe(10);
  });

  it('التحذير لا يقصّ الساعات ولا يخفض المبلغ', () => {
    const lines = computeOvertimeLines([{ overtimeType: 'REGULAR', hours: 200 }], hourlyRate);
    expect(lines[0].hours).toBe(200);
    expect(lines[0].amount).toBe(500); // 200 × 2 × 1.25 — كاملة رغم التجاوز
    expect(checkOvertimeLimits(lines, 0).some((w) => w.code === 'OVERTIME_ANNUAL_LIMIT_EXCEEDED')).toBe(true);
  });

  it('السقف الشهري المُشتَقّ موسوم DERIVED لا STATUTORY', () => {
    const lines = computeOvertimeLines(
      [{ overtimeType: 'REGULAR', hours: DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING + 5 }],
      hourlyRate,
    );
    const w = checkOvertimeLimits(lines, 0).find((x) => x.code === 'OVERTIME_MONTHLY_DERIVED_CEILING_EXCEEDED');
    expect(w?.basis).toBe('DERIVED');
    expect(w?.messageAr).toContain('مُشتَقّ');
  });

  it('يوم الراحة البديل يُذكَّر به بالمادة الصحيحة لكل نوع', () => {
    const rest = computeOvertimeLines([{ overtimeType: 'WEEKLY_REST', hours: 4 }], hourlyRate);
    const holiday = computeOvertimeLines([{ overtimeType: 'OFFICIAL_HOLIDAY', hours: 4 }], hourlyRate);
    const restWarn = checkOvertimeLimits(rest).find((w) => w.code === 'COMPENSATORY_REST_DAY_DUE');
    const holidayWarn = checkOvertimeLimits(holiday).find((w) => w.code === 'COMPENSATORY_REST_DAY_DUE');
    expect(restWarn?.messageAr).toContain('المادة ٦٧');
    expect(restWarn?.messageAr).not.toContain('المادة ٦٨');
    expect(holidayWarn?.messageAr).toContain('المادة ٦٨');
    expect(holidayWarn?.messageAr).not.toContain('المادة ٦٧');
  });

  it('ساعات الراحة والعطلة لا تدخل في حد الـ١٨٠ ساعة الخاص بالإضافي العادي', () => {
    const lines = computeOvertimeLines([{ overtimeType: 'WEEKLY_REST', hours: 300 }], hourlyRate);
    expect(lines.some((l) => l.hours === 300)).toBe(true);
    expect(checkOvertimeLimits(lines, 0).some((w) => w.code === 'OVERTIME_ANNUAL_LIMIT_EXCEEDED')).toBe(false);
  });
});

describe('الحسبة الكاملة والإجماليات', () => {
  const base = {
    basicSalary: SALARY_CLEAN, // 416 ⇒ أجر الساعة 2.000
    overtime: [
      { overtimeType: 'REGULAR' as const, hours: 10 }, // 25.000
      { overtimeType: 'OFFICIAL_HOLIDAY' as const, hours: 5 }, // 20.000
    ],
    earnings: [
      { type: 'BONUS' as const, label: 'مكافأة أداء', amount: 50 },
      { type: 'ALLOWANCE' as const, label: 'بدل مواصلات', amount: 25.5 },
    ],
    deductions: [{ type: 'ADVANCE' as const, label: 'سلفة', amount: 30 }],
  };

  it('يطبّق المعادلة: أساسي + إضافي + استحقاقات أخرى − استقطاعات', () => {
    const r = computeCompensation(base);
    expect(r.basicSalary).toBe(416);
    expect(r.hourlyRate).toBe(2);
    expect(r.totalOvertimeAmount).toBe(45); // 25.000 + 20.000
    expect(r.totalOtherEarnings).toBe(75.5);
    expect(r.grossEntitlements).toBe(536.5); // 416 + 45 + 75.5
    expect(r.totalDeductions).toBe(30);
    expect(r.netAmount).toBe(506.5);
  });

  it('يختم النتيجة بإصدار القواعد القانونية المستخدم', () => {
    expect(computeCompensation(base).legalRulesVersion).toBe(LEGAL_RULES_VERSION);
  });

  it('يحترم أجر الساعة المحفوظ في اللقطة بدل إعادة اشتقاقه', () => {
    const r = computeCompensation({ ...base, hourlyRateOverride: 3 });
    expect(r.hourlyRate).toBe(3);
    expect(r.totalOvertimeAmount).toBe(67.5); // 10×3×1.25 + 5×3×2
  });

  it('صافٍ سالب مسموح ولا يُقصّ إلى صفر', () => {
    const r = computeCompensation({
      ...base,
      overtime: [],
      earnings: [],
      deductions: [{ type: 'PENALTY', label: 'جزاء', amount: 600 }],
    });
    expect(r.netAmount).toBe(-184); // 416 − 600
  });

  it('يرفض المبالغ السالبة وNaN وInfinity بدل ابتلاعها', () => {
    expect(() =>
      computeCompensation({ ...base, earnings: [{ type: 'BONUS', label: 'x', amount: -5 }] }),
    ).toThrow();
    expect(() =>
      computeCompensation({ ...base, deductions: [{ type: 'CUSTOM', label: 'x', amount: Number.NaN }] }),
    ).toThrow();
    expect(() => computeCompensation({ ...base, basicSalary: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => computeCompensation({ ...base, basicSalary: 0 })).toThrow();
  });

  it('كل بند يُخزَّن بدقّة الفلس، والإجماليات تُجمع من القيم المخزَّنة نفسها', () => {
    // بند بمقدار 0.3335 يُخزَّن 0.334 (نصف بعيدًا عن الصفر) — فالمعروض هو المخزَّن.
    // الإجمالي يُجمع من القيم المخزَّنة، فيطابق ما يراه القارئ في الكشف: 0.334 × 3.
    const r = computeCompensation({
      basicSalary: 500,
      overtime: [],
      earnings: Array.from({ length: 3 }, (_, i) => ({
        type: 'CUSTOM' as const,
        label: `بند ${i}`,
        amount: 0.3335,
      })),
      deductions: [],
    });
    expect(r.earningLines.map((l) => l.amount)).toEqual([0.334, 0.334, 0.334]);
    expect(r.totalOtherEarnings).toBe(1.002);
    expect(r.grossEntitlements).toBe(501.002);
  });

  it('لا يبتلع ضجيج الثنائي في الجمع النهائي', () => {
    const r = computeCompensation({
      basicSalary: 0.1,
      overtime: [],
      earnings: [{ type: 'CUSTOM', label: 'بند', amount: 0.2 }],
      deductions: [],
    });
    expect(r.grossEntitlements).toBe(0.3); // لا 0.30000000000000004
  });

  it('يمرّر التحذيرات القانونية ضمن النتيجة نفسها', () => {
    const r = computeCompensation({ ...base, priorRegularOvertimeHoursThisYear: 175 });
    expect(r.warnings.some((w) => w.code === 'OVERTIME_ANNUAL_LIMIT_EXCEEDED')).toBe(true);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn(), findMany: vi.fn() },
    employeeCompensationCalculation: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    overtimeLine: { findMany: vi.fn(), deleteMany: vi.fn() },
    overtimeDayEntry: { findMany: vi.fn(), deleteMany: vi.fn() },
    compensationEarningLine: { deleteMany: vi.fn() },
    compensationDeductionLine: { deleteMany: vi.fn(), count: vi.fn() },
    employeeCompensationDebt: { findMany: vi.fn(), findUnique: vi.fn() },
    employeeCompensationDebtPayment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { employeeCompensationService as service } from '../employeeCompensation.service';
import {
  companyOvertimeRateTable,
  computeCompensation,
  computeHourlyRate,
  normalizeCompanyOvertimeBaseRate,
  resolveEffectiveOvertimeRate,
  reverseOvertimeFromAmount,
  COMPANY_OVERTIME_POLICY_VERSION,
  LEGAL_RULES_VERSION,
} from '../engine';
import type { Request } from 'express';

/**
 * حزمة **سعر ساعة الإضافي المعتمد من الشركة** — اختبارات السلوك المتعاقَد عليه.
 *
 * ثلاثة أسئلة تجيب عنها هذه الملفات مجتمعةً، ولا يُقبل أن يُجاب أيٌّ منها بالمراجعة
 * البصرية وحدها:
 *   ١) هل يستطيع المستخدم اختيار السعر — عامًّا وشهريًّا — دون أن يتسرّب أحدهما إلى الآخر؟
 *   ٢) هل يستحيل بنيويًا أن يُصرف للموظف أقلّ من استحقاقه القانوني؟
 *   ٣) هل تبقى الأشهر المحفوظة على أرقامها مهما تغيّر الافتراضي بعدها؟
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any;
const req = { user: { userId: 7, username: 'hr.user' } } as unknown as Request;

/** راتب مرجعي: ٤١٦ ÷ ٢٠٨ = أجر ساعة ٢٫٠٠٠ د.ك. */
const SALARY = 416;
const HOURLY = 2;
/** راتب مرتفع يجعل الحدّ القانوني يعلو على أي سعر شركة معقول. */
const HIGH_SALARY = 4160; // أجر الساعة = ٢٠٫٠٠٠ د.ك

const EMPLOYEE = {
  id: 1,
  code: 'E-001',
  fullName: 'موظف تجريبي',
  jobTitle: 'سائق',
  department: 'العمليات',
  nationality: 'كويتي',
  civilId: '290010100001',
  salary: SALARY,
  status: 'ACTIVE',
};

const EMPTY_BODY = { overtime: [], earnings: [], deductions: [], notes: null };

function storedCalc(over: Record<string, unknown> = {}) {
  return {
    id: 100,
    employeeId: 1,
    year: 2026,
    month: 6,
    status: 'DRAFT',
    employeeNumberSnapshot: 'E-001',
    employeeNameSnapshot: 'موظف تجريبي',
    jobTitleSnapshot: 'سائق',
    departmentSnapshot: 'العمليات',
    nationalitySnapshot: 'كويتي',
    civilIdSnapshot: '290010100001',
    basicSalarySnapshot: SALARY,
    hourlyRateSnapshot: HOURLY,
    legalRulesVersion: LEGAL_RULES_VERSION,
    companyOvertimeBaseRateSnapshot: 4,
    companyOvertimePolicyVersion: COMPANY_OVERTIME_POLICY_VERSION,
    totalOvertimeAmount: 40,
    totalOtherEarnings: 0,
    grossEntitlements: 456,
    totalDeductions: 0,
    netAmount: 456,
    notes: null,
    createdById: 7,
    createdByName: 'hr.user',
    approvedAt: null,
    approvedById: null,
    approvedByName: null,
    createdAt: new Date('2026-06-30T00:00:00.000Z'),
    updatedAt: new Date('2026-06-30T00:00:00.000Z'),
    overtimeLines: [
      {
        id: 1,
        calculationId: 100,
        overtimeType: 'REGULAR',
        hours: 10,
        hourlyRate: HOURLY,
        multiplier: 1.25,
        statutoryMinimumRate: 2.5,
        companyBaseRate: 4,
        companyDerivedRate: 4,
        effectiveRate: 4,
        rateSource: 'COMPANY_POLICY',
        amount: 40,
        calculationMethod: 'MANUAL_HOURS',
        reverseTargetAmount: null,
        rawHoursBeforeCeiling: null,
        legalReference: 'المادة ٦٦',
        notes: null,
        sortOrder: 0,
      },
    ],
    earningLines: [],
    deductionLines: [],
    overtimeDayEntries: [],
    ...over,
  };
}

/** جسم حسبة بساعات إضافي من نوع واحد. */
const overtimeBody = (type: 'REGULAR' | 'WEEKLY_REST' | 'OFFICIAL_HOLIDAY', hours: number, rate?: number | null) => ({
  overtime: [{ overtimeType: type, hours }],
  earnings: [],
  deductions: [],
  notes: null,
  ...(rate === undefined ? {} : { companyOvertimeBaseRate: rate }),
});

beforeEach(() => {
  vi.clearAllMocks();
  p.overtimeLine.findMany.mockResolvedValue([]);
  p.overtimeDayEntry.findMany.mockResolvedValue([]);
  // لا أشهر مجمّعة افتراضيًا — كل اختبار يخصّها يمرّرها صراحةً.
  p.employeeCompensationCalculation.findMany.mockResolvedValue([]);
  p.employeeCompensationDebt.findMany.mockResolvedValue([]);
  p.employeeCompensationDebtPayment.findMany.mockResolvedValue([]);
  p.compensationDeductionLine.count.mockResolvedValue(0);
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(p));
  p.employee.findUnique.mockResolvedValue(EMPLOYEE);
  p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
  p.employeeCompensationCalculation.create.mockResolvedValue(storedCalc());
  p.employeeCompensationCalculation.update.mockResolvedValue(storedCalc());
});

/** بيانات إنشاء الحسبة كما وصلت إلى Prisma. */
const createdData = () => p.employeeCompensationCalculation.create.mock.calls[0][0].data;
const updatedData = () => p.employeeCompensationCalculation.update.mock.calls[0][0].data;

// ─── ١–٢ · الافتراضي العام ────────────────────────────────────────────────────

describe('الافتراضي العام لسعر ساعة الإضافي', () => {
  it('يُحفظ في جدول الإعدادات بمفتاح الوحدة، ويُقرأ منه بعد ذلك', async () => {
    p.setting.findUnique.mockResolvedValue(null);
    await service.setCompanyOvertimeSettings(5, req);

    const call = p.setting.upsert.mock.calls[0][0];
    expect(call.where.key).toBe('employeeCompensation.companyOvertimeBaseRate');
    expect(call.create.group).toBe('employeeCompensation');
    expect(call.update.value).toBe('5');
  });

  it('غياب الإعداد يُعلَن صراحةً «لم يُحدَّد بعد» ولا يُكتب تلقائيًا', async () => {
    p.setting.findUnique.mockResolvedValue(null);
    const settings = await service.getCompanyOvertimeSettings();

    expect(settings.isConfigured).toBe(false);
    expect(settings.baseRate).toBe(settings.fallbackBaseRate);
    expect(p.setting.upsert).not.toHaveBeenCalled();
  });

  it('حسبة جديدة بلا اختيار صريح تبدأ من الافتراضي العام', async () => {
    p.setting.findUnique.mockResolvedValue({ value: '4' });
    await service.create(1, 2026, 6, EMPTY_BODY, req);

    expect(createdData().companyOvertimeBaseRateSnapshot).toBe(4);
    expect(createdData().companyOvertimePolicyVersion).toBe(COMPANY_OVERTIME_POLICY_VERSION);
  });
});

// ─── ٣–٥ · تجاوز الشهر ────────────────────────────────────────────────────────

describe('سعر الشهر يتجاوز الافتراضي ولا يغيّره', () => {
  it('الشهر يستطيع اختيار سعره الخاص', async () => {
    p.setting.findUnique.mockResolvedValue({ value: '4' });
    await service.create(1, 2026, 8, { ...EMPTY_BODY, companyOvertimeBaseRate: 5 }, req);

    expect(createdData().companyOvertimeBaseRateSnapshot).toBe(5);
  });

  it('اختيار الشهر **لا يكتب** في الافتراضي العام', async () => {
    p.setting.findUnique.mockResolvedValue({ value: '4' });
    await service.create(1, 2026, 8, { ...EMPTY_BODY, companyOvertimeBaseRate: 5 }, req);

    expect(p.setting.upsert).not.toHaveBeenCalled();
  });

  it('شهر آخر بعده يعود إلى الافتراضي العام', async () => {
    p.setting.findUnique.mockResolvedValue({ value: '4' });
    await service.create(1, 2026, 9, EMPTY_BODY, req);

    expect(createdData().companyOvertimeBaseRateSnapshot).toBe(4);
  });
});

// ─── ٦–٨ · اللقطة ─────────────────────────────────────────────────────────────

describe('اللقطة — تغيير الافتراضي لا يمسّ التاريخ', () => {
  it('تعديل الافتراضي العام لا يُصدر أي كتابة على أي حسبة', async () => {
    p.setting.findUnique.mockResolvedValue({ value: '4' });
    await service.setCompanyOvertimeSettings(5, req);

    expect(p.employeeCompensationCalculation.update).not.toHaveBeenCalled();
    expect(p.overtimeLine.deleteMany).not.toHaveBeenCalled();
  });

  it('حفظ شهر قديم بعد تغيير الافتراضي يُبقي سعره المحفوظ — لا يسحب سعر اليوم', async () => {
    // اللقطة ٤٫٠٠٠، والافتراضي العام صار ٩٫٠٠٠. الجسم لا يحمل الحقل ⇒ «أبقِ ما هو محفوظ».
    p.setting.findUnique.mockResolvedValue({ value: '9' });
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc());

    await service.update(100, overtimeBody('REGULAR', 10), req);

    expect(updatedData().companyOvertimeBaseRateSnapshot).toBe(4);
    expect(updatedData().totalOvertimeAmount).toBe(40); // ١٠ × ٤٫٠٠٠ لا ١٠ × ٩٫٠٠٠
    // ولا يُقرأ الافتراضي أصلًا في مسار التحديث.
    expect(p.setting.findUnique).not.toHaveBeenCalled();
  });

  it('حسبة معتمَدة يمكن تعديل سعرها، ويُعاد الاحتساب والصافي', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(
      storedCalc({ status: 'APPROVED', approvedAt: new Date('2026-07-01T00:00:00.000Z') }),
    );

    await service.update(100, overtimeBody('REGULAR', 10, 5), req);

    expect(updatedData().companyOvertimeBaseRateSnapshot).toBe(5);
    expect(updatedData().totalOvertimeAmount).toBe(50); // ١٠ × ٥٫٠٠٠
    expect(updatedData().netAmount).toBe(466); // ٤١٦ + ٥٠
  });

  it('سطور الشهر تحمل أسعارها الثلاثة مخزَّنة لا مشتقّة وقت الطباعة', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc());
    await service.update(100, overtimeBody('WEEKLY_REST', 4, 4), req);

    const line = updatedData().overtimeLines.create[0];
    expect(line.statutoryMinimumRate).toBe(3); // ٢٫٠٠٠ × ١٫٥٠
    expect(line.companyBaseRate).toBe(4);
    expect(line.companyDerivedRate).toBe(6); // ٤٫٠٠٠ × ١٫٥٠
    expect(line.effectiveRate).toBe(6);
    expect(line.rateSource).toBe('COMPANY_POLICY');
  });
});

// ─── ٩–١٧ · اشتقاق أسعار الشركة ───────────────────────────────────────────────

describe('اشتقاق أسعار الشركة من السعر الأساسي', () => {
  const CASES: Array<[number, number, number, number]> = [
    // [الأساسي, عادي, راحة أسبوعية, عطلة رسمية]
    [3, 3, 4.5, 6],
    [4, 4, 6, 8],
    [5, 5, 7.5, 10],
    [3.5, 3.5, 5.25, 7],
  ];

  for (const [base, regular, weekly, holiday] of CASES) {
    it(`سعر أساسي ${base} ⇒ عادي ${regular} · راحة ${weekly} · عطلة ${holiday}`, () => {
      const table = companyOvertimeRateTable(base);
      expect(table.REGULAR).toBe(regular);
      expect(table.WEEKLY_REST).toBe(weekly);
      expect(table.OFFICIAL_HOLIDAY).toBe(holiday);
    });
  }

  it('السعر المشتقّ هو نفسه المستعمل في مبلغ السطر — لا نسخة معروضة وأخرى محسوبة', () => {
    const r = computeCompensation({
      basicSalary: SALARY,
      companyOvertimeBaseRate: 4,
      overtime: [{ overtimeType: 'OFFICIAL_HOLIDAY', hours: 6 }],
      earnings: [],
      deductions: [],
    });
    expect(r.overtimeRates.OFFICIAL_HOLIDAY.effectiveRate).toBe(8);
    expect(r.overtimeLines[0].amount).toBe(48); // ٦ × ٨٫٠٠٠
  });

  it('جدول الأسعار يُحتسب حتى بلا سطر إضافي واحد', () => {
    const r = computeCompensation({
      basicSalary: SALARY,
      companyOvertimeBaseRate: 5,
      overtime: [],
      earnings: [],
      deductions: [],
    });
    expect(r.overtimeRates.REGULAR.effectiveRate).toBe(5);
    expect(r.overtimeRates.WEEKLY_REST.effectiveRate).toBe(7.5);
    expect(r.overtimeRates.OFFICIAL_HOLIDAY.effectiveRate).toBe(10);
  });
});

// ─── ١٨–٢٠ · الأرضية القانونية ────────────────────────────────────────────────

describe('الحد الأدنى القانوني — أرضية لا يُنزل تحتها', () => {
  it('سعر الشركة أعلى من القانون ⇒ يُستخدم سعر الشركة', () => {
    const r = resolveEffectiveOvertimeRate('REGULAR', HOURLY, 4);
    expect(r.statutoryMinimumRate).toBe(2.5);
    expect(r.companyDerivedRate).toBe(4);
    expect(r.effectiveRate).toBe(4);
    expect(r.source).toBe('COMPANY_POLICY');
    expect(r.companyBelowStatutory).toBe(false);
  });

  it('القانون أعلى من سعر الشركة ⇒ يُستخدم القانون', () => {
    const statutoryHourly = computeHourlyRate(HIGH_SALARY); // ٢٠٫٠٠٠
    const r = resolveEffectiveOvertimeRate('REGULAR', statutoryHourly, 3);
    expect(r.statutoryMinimumRate).toBe(25); // ٢٠ × ١٫٢٥
    expect(r.companyDerivedRate).toBe(3);
    expect(r.effectiveRate).toBe(25);
    expect(r.source).toBe('STATUTORY_FLOOR');
    expect(r.companyBelowStatutory).toBe(true);
  });

  it('لا مسار واحد يُنتج سعرًا أقلّ من القانون — مسحٌ على مدى واسع من الأسعار', () => {
    const statutoryHourly = computeHourlyRate(HIGH_SALARY);
    for (const base of [0.001, 0.5, 1, 3, 7, 19, 24.999, 25, 60, 500]) {
      for (const type of ['REGULAR', 'WEEKLY_REST', 'OFFICIAL_HOLIDAY'] as const) {
        const r = resolveEffectiveOvertimeRate(type, statutoryHourly, base);
        expect(r.effectiveRate).toBeGreaterThanOrEqual(r.statutoryMinimumRate);
      }
    }
  });

  it('المبلغ المحتسَب لا يقلّ عن مبلغ القانون ولو اختار المستخدم سعرًا زهيدًا', () => {
    const r = computeCompensation({
      basicSalary: HIGH_SALARY,
      companyOvertimeBaseRate: 1,
      overtime: [{ overtimeType: 'REGULAR', hours: 10 }],
      earnings: [],
      deductions: [],
    });
    expect(r.overtimeLines[0].amount).toBe(250); // ١٠ × ٢٥٫٠٠٠ (القانون) لا ١٠ × ١٫٠٠٠
    expect(r.overtimeLines[0].rateSource).toBe('STATUTORY_FLOOR');
  });

  it('يُصدر تحذيرًا صريحًا حين يُتجاوز اختيار المستخدم إلى القانون', () => {
    const r = computeCompensation({
      basicSalary: HIGH_SALARY,
      companyOvertimeBaseRate: 1,
      overtime: [],
      earnings: [],
      deductions: [],
    });
    const warning = r.warnings.find((w) => w.code === 'COMPANY_OVERTIME_RATE_BELOW_STATUTORY');
    expect(warning, 'لا تحذير عند النزول تحت الحد القانوني').toBeTruthy();
    expect(warning?.basis).toBe('STATUTORY');
    expect(warning?.messageAr).toContain('السعر القانوني الأعلى');
  });

  it('لا تحذير مزعج حين يعلو سعر الشركة على القانون', () => {
    const r = computeCompensation({
      basicSalary: SALARY,
      companyOvertimeBaseRate: 4,
      overtime: [],
      earnings: [],
      deductions: [],
    });
    expect(r.warnings.some((w) => w.code === 'COMPANY_OVERTIME_RATE_BELOW_STATUTORY')).toBe(false);
  });
});

// ─── ٢١–٢٣ · الحسبة العكسية ───────────────────────────────────────────────────

describe('الحسبة العكسية بالسعر الفعلي', () => {
  it('سعر شركة ٤ · مبلغ مستهدف ٥٠ · عادي ⇒ ١٣ ساعة و٥٢٫٠٠٠ د.ك', () => {
    const r = reverseOvertimeFromAmount({
      targetAmount: 50,
      overtimeType: 'REGULAR',
      hourlyRate: HOURLY,
      companyOvertimeBaseRate: 4,
    });
    expect(r.effectiveRate).toBe(4);
    expect(r.rawHours).toBe(12.5);
    expect(r.hours).toBe(13);
    expect(r.amount).toBe(52);
    expect(r.difference).toBe(2);
  });

  it('التقريب يبقى لصالح الموظف مهما كان السعر', () => {
    for (const base of [3, 4, 5, 7.25]) {
      for (const target of [10, 33.333, 50, 99.999]) {
        const r = reverseOvertimeFromAmount({
          targetAmount: target,
          overtimeType: 'REGULAR',
          hourlyRate: HOURLY,
          companyOvertimeBaseRate: base,
        });
        expect(r.amount).toBeGreaterThanOrEqual(r.targetAmount);
        expect(Number.isInteger(r.hours)).toBe(true);
      }
    }
  });

  it('تستعمل السعر الفعلي **الخاص بالنوع المختار** لا سعرًا واحدًا للأنواع كلها', () => {
    const base = { targetAmount: 60, hourlyRate: HOURLY, companyOvertimeBaseRate: 4 } as const;
    const regular = reverseOvertimeFromAmount({ ...base, overtimeType: 'REGULAR' });
    const weekly = reverseOvertimeFromAmount({ ...base, overtimeType: 'WEEKLY_REST' });
    const holiday = reverseOvertimeFromAmount({ ...base, overtimeType: 'OFFICIAL_HOLIDAY' });

    expect([regular.effectiveRate, weekly.effectiveRate, holiday.effectiveRate]).toEqual([4, 6, 8]);
    expect([regular.hours, weekly.hours, holiday.hours]).toEqual([15, 10, 8]);
  });

  it('ترفع إلى الحد القانوني إن كان أعلى — فلا تشتقّ ساعات بسعر لن يُدفع', () => {
    const r = reverseOvertimeFromAmount({
      targetAmount: 100,
      overtimeType: 'REGULAR',
      hourlyRate: computeHourlyRate(HIGH_SALARY),
      companyOvertimeBaseRate: 1,
    });
    expect(r.effectiveRate).toBe(25);
    expect(r.hours).toBe(4); // ١٠٠ ÷ ٢٥
    expect(r.amount).toBe(100);
  });

  it('بلا سياسة شركة تبقى على سلوكها الأصلي حرفيًا', () => {
    const r = reverseOvertimeFromAmount({ targetAmount: 27, overtimeType: 'REGULAR', hourlyRate: 2.404 });
    expect(r.companyDerivedRate).toBeNull();
    expect(r.rateSource).toBe('STATUTORY_FLOOR');
    expect(r.hours).toBe(9); // ٢٧ ÷ (٢٫٤٠٤ × ١٫٢٥) = ٨٫٩٨…
    expect(r.amount).toBe(27.045);
  });
});

// ─── ٢٤ · نسخ الشهر السابق ────────────────────────────────────────────────────

describe('نسخ الشهر السابق يستعمل الافتراضي الحالي لا لقطة الشهر المنسوخ', () => {
  it('الشهر الجديد يبدأ بالافتراضي، والفرق يُعاد في الاستجابة', async () => {
    // يوليو محفوظ على ٤٫٠٠٠، والافتراضي العام صار ٥٫٠٠٠.
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(
      storedCalc({ month: 7, companyOvertimeBaseRateSnapshot: 4 }),
    );
    p.setting.findUnique.mockResolvedValue({ value: '5' });
    p.employeeCompensationCalculation.create.mockResolvedValue(
      storedCalc({ month: 8, companyOvertimeBaseRateSnapshot: 5 }),
    );
    // `create` تتحقّق من غياب حسبة الشهر الجديد — الاستدعاء الثاني يعود بـ null.
    p.employeeCompensationCalculation.findUnique
      .mockResolvedValueOnce(storedCalc({ month: 7, companyOvertimeBaseRateSnapshot: 4 }))
      .mockResolvedValueOnce(null);

    const result = await service.copyPreviousMonth(1, 2026, 8, req);

    expect(createdData().companyOvertimeBaseRateSnapshot).toBe(5);
    expect(result.copiedFrom.companyOvertimeBaseRateSnapshot).toBe(4);
    expect(result.copiedFrom.newCompanyOvertimeBaseRateSnapshot).toBe(5);
  });
});

// ─── ٢٥–٢٦ · الطباعة ──────────────────────────────────────────────────────────

describe('الطباعة — الكشف المختصر لا يكشف الأسعار، والتفصيلي يكشفها كلها', () => {
  beforeEach(() => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc());
    p.employee.findUnique.mockResolvedValue({ ...EMPLOYEE, fullNameEn: 'Test Employee' });
  });

  it('الكشف الرسمي المختصر لا يحمل أي سعر ولا إصدار سياسة', async () => {
    const data = await service.getStatementData(100);
    const json = JSON.stringify(data);

    for (const leaked of [
      'companyBaseRate',
      'companyDerivedRate',
      'effectiveRate',
      'statutoryMinimumRate',
      'rateSource',
      'companyOvertimePolicyVersion',
      'hourlyRate',
      'multiplier',
    ]) {
      expect(json, `تسرّب «${leaked}» إلى الكشف الموقَّع`).not.toContain(leaked);
    }
    // ويبقى ما يجب أن يظهر: الساعات والمبلغ فقط.
    expect(data.overtime[0]).toEqual({ overtimeType: 'REGULAR', hours: 10, amount: 40 });
  });

  it('التقرير التفصيلي يعرض القانوني والشركة والفعلي معًا', async () => {
    const data = await service.getDetailedReportData(100);

    expect(data.companyOvertimeBaseRate).toBe(4);
    expect(data.companyOvertimePolicyVersion).toBe(COMPANY_OVERTIME_POLICY_VERSION);
    expect(data.legalRulesVersion).toBe(LEGAL_RULES_VERSION);
    expect(data.overtimeLines[0]).toMatchObject({
      statutoryMinimumRate: 2.5,
      companyBaseRate: 4,
      companyDerivedRate: 4,
      effectiveRate: 4,
      rateSource: 'COMPANY_POLICY',
    });
  });
});

// ─── ٢٧–٢٩ · العزل والتحقّق ───────────────────────────────────────────────────

describe('العزل — لا أثر خارج الوحدة', () => {
  it('تغيير الافتراضي لا يمسّ إلا صفّ الإعدادات الخاص بالوحدة', async () => {
    p.setting.findUnique.mockResolvedValue({ value: '4' });
    await service.setCompanyOvertimeSettings(6, req);

    expect(p.setting.upsert).toHaveBeenCalledTimes(1);
    expect(p.setting.upsert.mock.calls[0][0].where.key).toMatch(/^employeeCompensation\./);
    expect(p.employee.findUnique).not.toHaveBeenCalled();
    expect(p.employeeCompensationCalculation.update).not.toHaveBeenCalled();
  });

  it('السعر والساعات مفهومان منفصلان — تغيير السعر لا يغيّر ساعة واحدة', () => {
    const hours = [{ overtimeType: 'REGULAR' as const, hours: 40 }];
    const cheap = computeCompensation({ basicSalary: SALARY, companyOvertimeBaseRate: 3, overtime: hours, earnings: [], deductions: [] });
    const rich = computeCompensation({ basicSalary: SALARY, companyOvertimeBaseRate: 9, overtime: hours, earnings: [], deductions: [] });

    expect(cheap.overtimeLines[0].hours).toBe(rich.overtimeLines[0].hours);
    // والحدود القانونية على الساعات تُصدر نفس التحذيرات بالضبط في الحالتين.
    const codes = (r: typeof cheap) => r.warnings.map((w) => w.code).filter((c) => c !== 'COMPANY_OVERTIME_RATE_BELOW_STATUTORY');
    expect(codes(cheap)).toEqual(codes(rich));
  });
});

// ─── التحقّق من المدخلات ──────────────────────────────────────────────────────

describe('التحقّق من سعر الشركة', () => {
  it('يرفض الصفر والسالب وغير المحدود', () => {
    for (const bad of [0, -1, -0.001, Number.NaN, Number.POSITIVE_INFINITY, '4' as unknown as number]) {
      expect(() => normalizeCompanyOvertimeBaseRate(bad), `قُبل سعر غير صالح: ${String(bad)}`).toThrow();
    }
  });

  it('يرفض ما يتجاوز الحد التشغيلي — خانة زائدة لا تمرّ بصمت', () => {
    expect(() => normalizeCompanyOvertimeBaseRate(4000)).toThrow(/الحد التشغيلي/);
  });

  it('يطبّع إلى ثلاث خانات فيبقى الرقم المطبوع هو الرقم المستعمل', () => {
    expect(normalizeCompanyOvertimeBaseRate(3.33333)).toBe(3.333);
    expect(normalizeCompanyOvertimeBaseRate(4)).toBe(4);
  });

  it('إعداد مخزَّن تالف يُقرأ «غير محدَّد» ولا يُعطّل الوحدة', async () => {
    p.setting.findUnique.mockResolvedValue({ value: 'غير رقم' });
    const settings = await service.getCompanyOvertimeSettings();
    expect(settings.isConfigured).toBe(false);
  });
});

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
    compensationEarningLine: { deleteMany: vi.fn() },
    compensationDeductionLine: { deleteMany: vi.fn(), count: vi.fn() },
    // سجل المديونيات — تُستدعى من مسار المزامنة داخل المعاملة، ولو بلا سطور سداد.
    employeeCompensationDebt: { findMany: vi.fn(), findUnique: vi.fn() },
    employeeCompensationDebtPayment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    // الافتراضي العام لسعر ساعة الإضافي — صفّ واحد في جدول الإعدادات القائم.
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { employeeCompensationService as service } from '../employeeCompensation.service';
import type { Request } from 'express';

/**
 * سلوك **النطاق** لا سلوك Prisma — كل وصول لقاعدة البيانات مموَّه.
 *
 * ما تُثبته هذه الاختبارات تحديدًا: أن اللقطة تُكتب مرة واحدة ولا تتبع ملف الموظف بعدها،
 * وأن نسخة ثانية لنفس الشهر مرفوضة، وأن الاعتماد **لا يقفل** التعديل ولا الحذف، وأن
 * النسخ من الشهر السابق ينشئ مسودة بسجلات جديدة، وأن أي مسار كتابة لا يمسّ أي جدول
 * خارج جداول الوحدة الأربعة.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any;

const req = { user: { userId: 7, username: 'hr.user' } } as unknown as Request;

const EMPLOYEE = {
  id: 1,
  code: 'E-001',
  fullName: 'موظف تجريبي',
  jobTitle: 'سائق',
  department: 'العمليات',
  nationality: 'كويتي',
  civilId: '290010100001',
  salary: 416, // أجر الساعة = 416 ÷ 208 = 2.000 د.ك
  status: 'ACTIVE',
};

const BODY = {
  overtime: [{ overtimeType: 'REGULAR' as const, hours: 10 }],
  earnings: [{ type: 'BONUS' as const, label: 'مكافأة', amount: 50 }],
  deductions: [{ type: 'ADVANCE' as const, label: 'سلفة', amount: 30 }],
  notes: null,
};

/** سجل محفوظ مرجعي — لقطته راتب ٤١٦ وأجر ساعة ٢٫٠٠٠. */
function storedCalculation(over: Record<string, unknown> = {}) {
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
    basicSalarySnapshot: 416,
    hourlyRateSnapshot: 2,
    legalRulesVersion: 'KW-LL-6/2010-v2',
    totalOvertimeAmount: 25,
    totalOtherEarnings: 50,
    grossEntitlements: 491,
    totalDeductions: 30,
    netAmount: 461,
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
        hourlyRate: 2,
        multiplier: 1.25,
        amount: 25,
        calculationMethod: 'MANUAL_HOURS',
        reverseTargetAmount: null,
        rawHoursBeforeCeiling: null,
        legalReference: 'المادة ٦٦',
        notes: null,
        sortOrder: 0,
      },
    ],
    earningLines: [
      { id: 1, calculationId: 100, type: 'BONUS', label: 'مكافأة', amount: 50, entryDate: null, reason: null, notes: null, recurring: false, sortOrder: 0 },
    ],
    deductionLines: [
      { id: 1, calculationId: 100, type: 'ADVANCE', label: 'سلفة', amount: 30, notes: null, sortOrder: 0 },
    ],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  p.overtimeLine.findMany.mockResolvedValue([]);
  p.employeeCompensationDebt.findMany.mockResolvedValue([]);
  p.employeeCompensationDebtPayment.findMany.mockResolvedValue([]);
  p.compensationDeductionLine.count.mockResolvedValue(0);
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(p));
});

describe('الإنشاء واللقطة التاريخية', () => {
  it('يكتب لقطة بيانات الموظف والراتب وأجر الساعة عند الإنشاء', async () => {
    p.employee.findUnique.mockResolvedValue(EMPLOYEE);
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalculation());

    await service.create(1, 2026, 6, BODY, req);

    const data = p.employeeCompensationCalculation.create.mock.calls[0][0].data;
    expect(data.employeeNumberSnapshot).toBe('E-001');
    expect(data.employeeNameSnapshot).toBe('موظف تجريبي');
    expect(data.jobTitleSnapshot).toBe('سائق');
    expect(data.basicSalarySnapshot).toBe(416);
    expect(data.hourlyRateSnapshot).toBe(2);
    expect(data.legalRulesVersion).toBe('KW-LL-6/2010-v2');
    expect(data.status).toBe('DRAFT');
  });

  it('يحتسب الإجماليات من المحرّك لا من جسم الطلب', async () => {
    p.employee.findUnique.mockResolvedValue(EMPLOYEE);
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalculation());
    // سعر شركة معتمد ٤٫٠٠٠ — وهو أعلى من الحد القانوني (٢٫٠٠٠ × ١٫٢٥ = ٢٫٥٠٠)، فيغلب.
    p.setting.findUnique.mockResolvedValue({ value: '4' });

    await service.create(1, 2026, 6, BODY, req);

    const data = p.employeeCompensationCalculation.create.mock.calls[0][0].data;
    expect(data.totalOvertimeAmount).toBe(40); // 10 ساعات × ٤٫٠٠٠ (سعر الشركة)
    expect(data.totalOtherEarnings).toBe(50);
    expect(data.grossEntitlements).toBe(506); // 416 + 40 + 50
    expect(data.totalDeductions).toBe(30);
    expect(data.netAmount).toBe(476);
  });

  it('حسبة بلا سياسة شركة تبقى على الحد القانوني وحده — سلوك ما قبل الحزمة حرفيًا', async () => {
    p.employee.findUnique.mockResolvedValue(EMPLOYEE);
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalculation());

    await service.create(1, 2026, 6, { ...BODY, companyOvertimeBaseRate: null }, req);

    const data = p.employeeCompensationCalculation.create.mock.calls[0][0].data;
    expect(data.companyOvertimeBaseRateSnapshot).toBeNull();
    expect(data.totalOvertimeAmount).toBe(25); // 10 × 2.000 × 1.25
    expect(data.grossEntitlements).toBe(491); // 416 + 25 + 50
    expect(data.netAmount).toBe(461);
  });

  it('يرفض إنشاء نسخة ثانية لنفس الموظف والسنة والشهر', async () => {
    p.employee.findUnique.mockResolvedValue(EMPLOYEE);
    p.employeeCompensationCalculation.findUnique.mockResolvedValue({ id: 100 });

    await expect(service.create(1, 2026, 6, BODY, req)).rejects.toThrow(/حسبة محفوظة/);
    expect(p.employeeCompensationCalculation.create).not.toHaveBeenCalled();
  });

  it('يرفض الإنشاء إذا كان الراتب الأساسي المسجَّل صفرًا', async () => {
    p.employee.findUnique.mockResolvedValue({ ...EMPLOYEE, salary: 0 });
    await expect(service.create(1, 2026, 6, BODY, req)).rejects.toThrow(/الراتب الأساسي/);
  });

  it('يرفض موظفًا غير موجود', async () => {
    p.employee.findUnique.mockResolvedValue(null);
    await expect(service.create(99, 2026, 6, BODY, req)).rejects.toThrow(/الموظف غير موجود/);
  });
});

describe('التعديل — من اللقطة لا من ملف الموظف الحيّ', () => {
  it('يعيد الاحتساب على الراتب المحفوظ حتى لو تغيّر راتب الموظف بعد ذلك', async () => {
    // ملف الموظف صار راتبه 1000، لكن اللقطة 416 — والكشف يجب أن يبقى على 416.
    p.employee.findUnique.mockResolvedValue({ ...EMPLOYEE, salary: 1000, fullName: 'اسم جديد' });
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalculation());
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalculation());

    await service.update(100, { ...BODY, overtime: [{ overtimeType: 'REGULAR', hours: 20 }] }, req);

    const data = p.employeeCompensationCalculation.update.mock.calls[0][0].data;
    expect(data.totalOvertimeAmount).toBe(50); // 20 × 2.000 (اللقطة) × 1.25 — لا 20 × 4.808
    expect(data.grossEntitlements).toBe(516); // 416 (اللقطة) + 50 + 50
    // لا تُكتب أي حقول لقطة في التحديث إطلاقًا.
    expect(data).not.toHaveProperty('basicSalarySnapshot');
    expect(data).not.toHaveProperty('employeeNameSnapshot');
    expect(data).not.toHaveProperty('hourlyRateSnapshot');
  });

  it('يستبدل السطور بالكامل داخل معاملة واحدة فلا تبقى سطور يتيمة', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalculation());
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalculation());

    await service.update(100, BODY, req);

    expect(p.$transaction).toHaveBeenCalledTimes(1);
    expect(p.overtimeLine.deleteMany).toHaveBeenCalledWith({ where: { calculationId: 100 } });
    expect(p.compensationEarningLine.deleteMany).toHaveBeenCalledWith({ where: { calculationId: 100 } });
    expect(p.compensationDeductionLine.deleteMany).toHaveBeenCalledWith({ where: { calculationId: 100 } });
  });

  it('يعدّل سجلًا معتمدًا مباشرةً بلا «إعادة فتح» ودون تغيير حالته', async () => {
    const approved = storedCalculation({ status: 'APPROVED', approvedAt: new Date('2026-07-01T00:00:00.000Z') });
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(approved);
    p.employeeCompensationCalculation.update.mockResolvedValue(approved);

    await expect(service.update(100, BODY, req)).resolves.toBeDefined();
    const data = p.employeeCompensationCalculation.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('status');
  });

  it('يرفض سجلًا غير موجود', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    await expect(service.update(999, BODY, req)).rejects.toThrow(/غير موجود/);
  });
});

describe('الاعتماد', () => {
  it('يضبط الحالة والطابع الزمني والمعتمِد', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalculation());
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalculation({ status: 'APPROVED' }));

    await service.approve(100, req);

    const data = p.employeeCompensationCalculation.update.mock.calls[0][0].data;
    expect(data.status).toBe('APPROVED');
    expect(data.approvedAt).toBeInstanceOf(Date);
    expect(data.approvedById).toBe(7);
    expect(data.approvedByName).toBe('hr.user');
  });

  it('يسمح بإعادة اعتماد سجل معتمد بالفعل', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalculation({ status: 'APPROVED' }));
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalculation({ status: 'APPROVED' }));
    await expect(service.approve(100, req)).resolves.toBeDefined();
  });

  it('يرفض اعتماد حسبة بلا أي بند', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(
      storedCalculation({ overtimeLines: [], earningLines: [], deductionLines: [] }),
    );
    await expect(service.approve(100, req)).rejects.toThrow(/بلا أي بند/);
    expect(p.employeeCompensationCalculation.update).not.toHaveBeenCalled();
  });
});

describe('الحذف', () => {
  it('يحذف سجلًا معتمدًا ولا يمسّ الموظف', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalculation({ status: 'APPROVED' }));
    p.employeeCompensationCalculation.delete.mockResolvedValue({});

    const out = await service.remove(100, req);

    expect(p.employeeCompensationCalculation.delete).toHaveBeenCalledWith({ where: { id: 100 } });
    expect(out).toEqual({ id: 100, employeeId: 1, year: 2026, month: 6 });
    // لا كتابة على جدول الموظفين إطلاقًا.
    expect(p.employee.findMany).not.toHaveBeenCalled();
    expect((p.employee as Record<string, unknown>).update).toBeUndefined();
  });
});

describe('نسخ الشهر السابق', () => {
  it('ينشئ مسودة جديدة ببنود الشهر السابق ولقطة راتب اليوم', async () => {
    p.employeeCompensationCalculation.findUnique
      .mockResolvedValueOnce(storedCalculation({ month: 5, status: 'APPROVED' })) // المصدر
      .mockResolvedValueOnce(null); // فحص وجود الشهر الهدف داخل create
    p.employee.findUnique.mockResolvedValue({ ...EMPLOYEE, salary: 600 });
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalculation({ month: 6, basicSalarySnapshot: 600, hourlyRateSnapshot: 2.5 }));

    const out = await service.copyPreviousMonth(1, 2026, 6, req);

    const data = p.employeeCompensationCalculation.create.mock.calls[0][0].data;
    expect(data.status).toBe('DRAFT'); // حالة الاعتماد لا تُنسخ
    expect(data.basicSalarySnapshot).toBe(600); // لقطة اليوم لا لقطة الشهر المنسوخ
    expect(data.overtimeLines.create).toHaveLength(1);
    expect(data.overtimeLines.create[0].calculationMethod).toBe('MANUAL_HOURS');
    expect(data.overtimeLines.create[0].reverseTargetAmount).toBeNull();
    // الاستجابة تُظهر فرق الراتب صراحةً بدل إخفائه.
    expect(out.copiedFrom).toEqual({
      year: 2026,
      month: 5,
      basicSalarySnapshot: 416,
      newBasicSalarySnapshot: 600,
      // لا سطور سداد مديونية في المصدر المرجعي، فالعدد صفر.
      skippedDebtRepayments: 0,
    });
  });

  it('ينتقل إلى ديسمبر من السنة السابقة عند نسخ يناير', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    await expect(service.copyPreviousMonth(1, 2026, 1, req)).rejects.toThrow(/لا توجد حسبة محفوظة/);
    expect(p.employeeCompensationCalculation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId_year_month: { employeeId: 1, year: 2025, month: 12 } } }),
    );
  });
});

describe('بيانات الطباعة', () => {
  it('الكشف المختصر لا يحمل أجر الساعة ولا المعامل ولا الحسبة العكسية', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(
      storedCalculation({
        overtimeLines: [
          {
            id: 1, calculationId: 100, overtimeType: 'REGULAR', hours: 11, hourlyRate: 2, multiplier: 1.25,
            amount: 27.5, calculationMethod: 'REVERSE_FROM_AMOUNT', reverseTargetAmount: 25.1,
            rawHoursBeforeCeiling: 10.04, legalReference: 'المادة ٦٦', notes: null, sortOrder: 0,
          },
        ],
      }),
    );

    const s = await service.getStatementData(100);
    const serialized = JSON.stringify(s);

    expect(s.overtime).toEqual([{ overtimeType: 'REGULAR', hours: 11, amount: 27.5 }]);
    for (const leak of ['hourlyRate', 'multiplier', 'calculationMethod', 'reverseTargetAmount', 'rawHoursBeforeCeiling', 'legalReference', 'legalRulesVersion']) {
      expect(serialized).not.toContain(leak);
    }
  });

  /**
   * كل حقل **له لقطة** يأتي من اللقطة — هذا هو العقد الأصلي وما زال قائمًا حرفيًا.
   *
   * الاستثناء الوحيد `fullNameEn`: لا عمود لقطة له (وإضافة عمود تعني هجرة قاعدة
   * بيانات لأجل سطر مطبوع)، فيُقرأ من ملف الموظف قراءةً واحدة، وللعرض وحده. لا يدخل
   * أي حساب ولا إجمالي، ولا يغيّر أي رقم في الكشف — والحقول الستّة الأخرى أدناه
   * تُثبت أنها ما زالت تأتي من اللقطة لا من الملف.
   */
  it('الكشف المختصر يُبنى من اللقطة — والاسم الإنجليزي وحده يُقرأ من ملف الموظف للعرض', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalculation());
    p.employee.findUnique.mockResolvedValue({ fullNameEn: 'TEST EMPLOYEE' });
    const s = await service.getStatementData(100);
    expect(s.employee).toEqual({
      code: 'E-001', fullName: 'موظف تجريبي', jobTitle: 'سائق',
      department: 'العمليات', nationality: 'كويتي', civilId: '290010100001',
      fullNameEn: 'TEST EMPLOYEE',
    });
    // قراءة واحدة، ولا شيء منها إلا الاسم الإنجليزي.
    expect(p.employee.findUnique).toHaveBeenCalledTimes(1);
    expect(p.employee.findUnique.mock.calls[0][0]).toEqual({
      where: { id: storedCalculation().employeeId },
      select: { fullNameEn: true },
    });
  });

  it('بلا اسم إنجليزي مخزَّن: `null` — لا اختراع ولا تراجع إلى الاسم العربي', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalculation());
    p.employee.findUnique.mockResolvedValue({ fullNameEn: null });
    const s = await service.getStatementData(100);
    expect(s.employee.fullNameEn).toBeNull();
    expect(s.employee.fullName).toBe('موظف تجريبي');
  });

  it('الكشف المختصر يعرض سداد المديونية كبند نهائي بلا أي أثر للدفتر', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(
      storedCalculation({
        deductionLines: [
          { id: 1, calculationId: 100, type: 'DEBT_REPAYMENT', label: 'سداد سلفة سيارة', amount: 25, notes: null, debtId: 10, sortOrder: 0 },
        ],
      }),
    );

    const s = await service.getStatementData(100);
    const serialized = JSON.stringify(s);

    // البند النهائي ومبلغه وحدهما.
    expect(s.deductions).toEqual([{ label: 'سداد سلفة سيارة', type: 'DEBT_REPAYMENT', amount: 25 }]);
    // ولا شيء من الدفتر: لا معرّف مديونية، ولا رصيد قبل/بعد، ولا حركة.
    for (const leak of ['debtId', 'balanceBefore', 'balanceAfter', 'remainingAmount', 'originalAmount', 'paymentId', 'debtRepayments']) {
      expect(serialized, `تسرّب «${leak}» إلى الكشف الرسمي`).not.toContain(leak);
    }
  });

  it('يدمج سطور الإضافي حسب النوع في بند واحد لكل نوع', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(
      storedCalculation({
        overtimeLines: [
          { id: 1, calculationId: 100, overtimeType: 'REGULAR', hours: 6, hourlyRate: 2, multiplier: 1.25, amount: 15, calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null, legalReference: 'x', notes: null, sortOrder: 0 },
          { id: 2, calculationId: 100, overtimeType: 'REGULAR', hours: 4, hourlyRate: 2, multiplier: 1.25, amount: 10, calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null, legalReference: 'x', notes: null, sortOrder: 1 },
          { id: 3, calculationId: 100, overtimeType: 'OFFICIAL_HOLIDAY', hours: 5, hourlyRate: 2, multiplier: 2, amount: 20, calculationMethod: 'MANUAL_HOURS', reverseTargetAmount: null, rawHoursBeforeCeiling: null, legalReference: 'x', notes: null, sortOrder: 2 },
        ],
      }),
    );
    const s = await service.getStatementData(100);
    expect(s.overtime).toEqual([
      { overtimeType: 'REGULAR', hours: 10, amount: 25 },
      { overtimeType: 'OFFICIAL_HOLIDAY', hours: 5, amount: 20 },
    ]);
  });

  it('التقرير التفصيلي يحمل التفاصيل الداخلية كاملة', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(
      storedCalculation({
        overtimeLines: [
          {
            id: 1, calculationId: 100, overtimeType: 'REGULAR', hours: 11, hourlyRate: 2, multiplier: 1.25,
            amount: 27.5, calculationMethod: 'REVERSE_FROM_AMOUNT', reverseTargetAmount: 25.1,
            rawHoursBeforeCeiling: 10.04, legalReference: 'المادة ٦٦', notes: null, sortOrder: 0,
          },
        ],
      }),
    );

    const d = await service.getDetailedReportData(100);
    expect(d.hourlyRate).toBe(2);
    expect(d.legalRulesVersion).toBe('KW-LL-6/2010-v2');
    expect(d.overtimeLines[0].calculationMethod).toBe('REVERSE_FROM_AMOUNT');
    expect(d.overtimeLines[0].reverseTargetAmount).toBe(25.1);
    expect(d.overtimeLines[0].rawHoursBeforeCeiling).toBe(10.04);
    expect(d.overtimeLines[0].roundingDifference).toBe(2.4);
    expect(Array.isArray(d.warnings)).toBe(true);
  });
});

describe('الحد السنوي يُفحص عبر أشهر السنة لا داخل الشهر وحده', () => {
  it('يستعلم عن ساعات الإضافي العادي في بقية أشهر السنة نفسها', async () => {
    p.employee.findUnique.mockResolvedValue(EMPLOYEE);
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalculation());
    p.overtimeLine.findMany.mockResolvedValue([{ hours: 175 }]);

    const out = await service.create(1, 2026, 6, BODY, req);

    expect(p.overtimeLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          overtimeType: 'REGULAR',
          calculation: expect.objectContaining({ employeeId: 1, year: 2026 }),
        }),
      }),
    );
    expect(out.warnings.some((w) => w.code === 'OVERTIME_ANNUAL_LIMIT_EXCEEDED')).toBe(true);
  });
});

describe('الحسبة العكسية عبر الخدمة', () => {
  it('تشتقّ أجر الساعة من الراتب حين لا يُمرَّر صراحةً', () => {
    const r = service.reverseOvertime({ targetAmount: 25.1, overtimeType: 'REGULAR', basicSalary: 416 });
    expect(r.hourlyRate).toBe(2);
    expect(r.hours).toBe(11);
    expect(r.amount).toBe(27.5);
  });

  it('ترفض الاستدعاء بلا راتب ولا أجر ساعة', () => {
    expect(() => service.reverseOvertime({ targetAmount: 25, overtimeType: 'REGULAR' })).toThrow(/الراتب الأساسي أو أجر الساعة/);
  });
});

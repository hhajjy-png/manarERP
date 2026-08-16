import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => {
  const tx = {
    employee: { findUnique: vi.fn() },
    employeeCompensationCalculation: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    overtimeLine: { findMany: vi.fn(), deleteMany: vi.fn() },
    compensationEarningLine: { deleteMany: vi.fn() },
    compensationDeductionLine: { deleteMany: vi.fn(), count: vi.fn() },
    employeeCompensationDebt: { findMany: vi.fn(), findUnique: vi.fn() },
    employeeCompensationDebtPayment: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    // الافتراضي العام لسعر ساعة الإضافي — يُقرأ عند كل إنشاء حسبة.
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  };
  return { prisma: tx };
});

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { employeeCompensationService as service } from '../employeeCompensation.service';
import type { Request } from 'express';

/**
 * التكامل بين حسبة الشهر ودفتر المديونيات.
 *
 * ما تُثبته: أن سطر سداد المديونية يمرّ بالمحرّك كأي استقطاع (فيدخل معادلة الصافي بلا
 * معادلة ثانية)، وأن الحفظ يتحقّق من الرصيد **قبل** أي كتابة وداخل نفس المعاملة، وأن
 * التعديل يُحدِّث الحركة القائمة، وأن سطرًا بلا مرجع مديونية مرفوض بنيويًا.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any;
const req = { user: { userId: 7, username: 'hr.user' } } as unknown as Request;

const EMPLOYEE = { id: 1, code: 'E-001', fullName: 'موظف', jobTitle: null, department: null, nationality: null, civilId: null, salary: 416, status: 'ACTIVE' };

const DEBT = {
  id: 10, employeeId: 1, type: 'ADVANCE', label: 'سلفة سيارة', originalAmount: 100,
  debtDate: new Date('2026-01-15T00:00:00.000Z'), notes: null, createdById: 7, createdByName: 'hr.user',
  createdAt: new Date(), updatedAt: new Date(), payments: [] as any[],
};

function storedCalc(over: Record<string, unknown> = {}) {
  return {
    id: 100, employeeId: 1, year: 2026, month: 6, status: 'DRAFT',
    employeeNumberSnapshot: 'E-001', employeeNameSnapshot: 'موظف', jobTitleSnapshot: null,
    departmentSnapshot: null, nationalitySnapshot: null, civilIdSnapshot: null,
    basicSalarySnapshot: 416, hourlyRateSnapshot: 2, legalRulesVersion: 'KW-LL-6/2010-v2',
    totalOvertimeAmount: 0, totalOtherEarnings: 0, grossEntitlements: 416, totalDeductions: 25, netAmount: 391,
    notes: null, createdById: 7, createdByName: 'hr.user', approvedAt: null, approvedById: null, approvedByName: null,
    createdAt: new Date(), updatedAt: new Date(),
    overtimeLines: [], earningLines: [],
    deductionLines: [{ id: 900, calculationId: 100, type: 'DEBT_REPAYMENT', label: 'سداد سلفة سيارة', amount: 25, notes: null, debtId: 10, sortOrder: 0 }],
    ...over,
  };
}

const repaymentBody = (amount: number) => ({
  overtime: [],
  earnings: [],
  deductions: [{ type: 'DEBT_REPAYMENT' as const, label: 'سداد سلفة سيارة', amount, debtId: 10 }],
  notes: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  p.employee.findUnique.mockResolvedValue(EMPLOYEE);
  p.overtimeLine.findMany.mockResolvedValue([]);
  p.employeeCompensationDebt.findMany.mockResolvedValue([{ ...DEBT, payments: [] }]);
  p.employeeCompensationDebtPayment.findMany.mockResolvedValue([]);
  p.compensationDeductionLine.count.mockResolvedValue(0);
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => unknown) => fn(p));
});

describe('سداد المديونية داخل حسبة الشهر', () => {
  it('يدخل معادلة الصافي كاستقطاع عادي — بلا معادلة ثانية', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalc());

    await service.create(1, 2026, 6, repaymentBody(25), req);

    const data = p.employeeCompensationCalculation.create.mock.calls[0][0].data;
    expect(data.totalDeductions).toBe(25);
    expect(data.netAmount).toBe(391); // 416 − 25
    expect(data.deductionLines.create[0]).toMatchObject({ type: 'DEBT_REPAYMENT', debtId: 10, amount: 25 });
  });

  it('يُنشئ حركة دفتر مرتبطة بالحسبة وبسطر الاستقطاع', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalc());

    await service.create(1, 2026, 6, repaymentBody(25), req);

    const created = p.employeeCompensationDebtPayment.create.mock.calls[0][0].data;
    expect(created).toMatchObject({
      debtId: 10, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 100, deductionLineId: 900,
    });
    // تاريخ الحركة = آخر يوم في شهر الحسبة، لا لحظة الحفظ.
    expect((created.paymentDate as Date).toISOString().slice(0, 10)).toBe('2026-06-30');
  });

  it('يرفض سدادًا يتجاوز الرصيد **قبل** أي كتابة', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    p.employeeCompensationDebt.findMany.mockResolvedValue([{ ...DEBT, payments: [{ id: 1, amount: 90 }] }]);

    await expect(service.create(1, 2026, 6, repaymentBody(30), req)).rejects.toThrow(/يتجاوز الرصيد/);
    expect(p.employeeCompensationCalculation.create).not.toHaveBeenCalled();
    expect(p.employeeCompensationDebtPayment.create).not.toHaveBeenCalled();
  });

  it('يرفض سطر سداد بلا مرجع مديونية — حارس في المحرّك لا في الواجهة', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    await expect(
      service.create(1, 2026, 6, { overtime: [], earnings: [], deductions: [{ type: 'DEBT_REPAYMENT', label: 'سداد', amount: 5 }], notes: null }, req),
    ).rejects.toThrow(/بلا مرجع/);
  });

  it('يرفض استقطاعًا عاديًا يحمل مرجع مديونية', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(null);
    await expect(
      service.create(1, 2026, 6, { overtime: [], earnings: [], deductions: [{ type: 'ABSENCE', label: 'غياب', amount: 5, debtId: 10 }], notes: null }, req),
    ).rejects.toThrow(/ليس سداد مديونية/);
  });
});

describe('تعديل الحسبة يعدّل نفس حركة الدفتر', () => {
  it('٢٥ ← ١٥ يُحدِّث الحركة القائمة ولا يُنشئ ثانية', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc());
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalc({ totalDeductions: 15, netAmount: 401 }));
    p.employeeCompensationDebt.findMany.mockResolvedValue([
      { ...DEBT, payments: [{ id: 55, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 100 }] },
    ]);
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([
      { id: 55, debtId: 10, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 100 },
    ]);

    await service.update(100, repaymentBody(15), req);

    expect(p.employeeCompensationDebtPayment.create).not.toHaveBeenCalled();
    expect(p.employeeCompensationDebtPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55 }, data: expect.objectContaining({ amount: 15 }) }),
    );
  });

  it('إزالة سطر السداد تحذف الحركة فيرتدّ الرصيد', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc());
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalc({ deductionLines: [], totalDeductions: 0, netAmount: 416 }));
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([
      { id: 55, debtId: 10, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 100 },
    ]);

    await service.update(100, { overtime: [], earnings: [], deductions: [], notes: null }, req);

    expect(p.employeeCompensationDebtPayment.delete).toHaveBeenCalledWith({ where: { id: 55 } });
  });

  it('التعديل يقع كله داخل معاملة واحدة', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc());
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalc());
    await service.update(100, repaymentBody(25), req);
    expect(p.$transaction).toHaveBeenCalledTimes(1);
  });

  it('التحقّق يسبق الحذف: رفضٌ يترك سطور الحسبة كما هي', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc());
    p.employeeCompensationDebt.findMany.mockResolvedValue([{ ...DEBT, payments: [{ id: 1, amount: 100 }] }]);

    await expect(service.update(100, repaymentBody(50), req)).rejects.toThrow(/يتجاوز الرصيد/);
    expect(p.compensationDeductionLine.deleteMany).not.toHaveBeenCalled();
    expect(p.employeeCompensationCalculation.update).not.toHaveBeenCalled();
  });

  it('تعديل سجل **معتمد** يعكس السداد كغيره — الاعتماد لا يقفل شيئًا', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc({ status: 'APPROVED', approvedAt: new Date() }));
    p.employeeCompensationCalculation.update.mockResolvedValue(storedCalc({ status: 'APPROVED' }));
    p.employeeCompensationDebt.findMany.mockResolvedValue([
      { ...DEBT, payments: [{ id: 55, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 100 }] },
    ]);
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([
      { id: 55, debtId: 10, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 100 },
    ]);

    await service.update(100, repaymentBody(15), req);
    expect(p.employeeCompensationDebtPayment.update).toHaveBeenCalled();
  });
});

describe('حذف الحسبة', () => {
  it('يحذف السجل — والحركة تُلغى بالـCascade فيرتدّ الرصيد', async () => {
    p.employeeCompensationCalculation.findUnique.mockResolvedValue(storedCalc({ status: 'APPROVED' }));
    p.employeeCompensationCalculation.delete.mockResolvedValue({});

    await service.remove(100, req);

    // الحذف واحد على الحسبة؛ الحركة مرتبطة بها بـ`onDelete: Cascade` في المخطط،
    // ولا رصيد مخزَّن يحتاج تصحيحًا لأن الرصيد مشتقّ من الدفتر.
    expect(p.employeeCompensationCalculation.delete).toHaveBeenCalledWith({ where: { id: 100 } });
  });
});

describe('نسخ الشهر السابق لا ينسخ سداد المديونية', () => {
  it('يُسقط سطور السداد ويُبلّغ بعددها', async () => {
    p.employeeCompensationCalculation.findUnique
      .mockResolvedValueOnce(storedCalc({ month: 5 })) // المصدر: فيه سطر سداد واحد
      .mockResolvedValueOnce(null);
    p.employeeCompensationCalculation.create.mockResolvedValue(storedCalc({ month: 6, deductionLines: [] }));

    const out = await service.copyPreviousMonth(1, 2026, 6, req);

    const data = p.employeeCompensationCalculation.create.mock.calls[0][0].data;
    expect(data.deductionLines.create).toEqual([]);
    expect(out.copiedFrom?.skippedDebtRepayments).toBe(1);
  });
});

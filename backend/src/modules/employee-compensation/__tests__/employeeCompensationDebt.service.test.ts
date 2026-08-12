import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    employeeCompensationDebt: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    employeeCompensationDebtPayment: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    compensationDeductionLine: { count: vi.fn() },
    employeeCompensationCalculation: { findMany: vi.fn() },
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { employeeCompensationDebtService as service } from '../employeeCompensationDebt.service';
import type { Request } from 'express';

/**
 * سجل المديونيات — سلوك النطاق (كل وصول لقاعدة البيانات مموَّه).
 *
 * ما تُثبته تحديدًا: أن الرصيد يُشتقّ ولا يُكتب، وأن حذف سجل عليه حركات **مرفوض
 * بصوت عالٍ**، وأن مزامنة الشهر تُحدِّث الحركة القائمة ولا تكدّس فوقها، وأن التحقّق
 * يستبعد حركة الشهر نفسه عند التعديل.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
const p = prisma as any;
const req = { user: { userId: 7, username: 'hr.user' } } as unknown as Request;

const debt = (over: Record<string, unknown> = {}) => ({
  id: 10,
  employeeId: 1,
  type: 'ADVANCE',
  label: 'سلفة سيارة',
  originalAmount: 100,
  debtDate: new Date('2026-01-15T00:00:00.000Z'),
  notes: null,
  createdById: 7,
  createdByName: 'hr.user',
  createdAt: new Date('2026-01-15T00:00:00.000Z'),
  updatedAt: new Date('2026-01-15T00:00:00.000Z'),
  payments: [],
  ...over,
});

const payment = (over: Record<string, unknown> = {}) => ({
  id: 100,
  debtId: 10,
  amount: 25,
  paymentDate: new Date('2026-06-30T12:00:00.000Z'),
  sourceType: 'MANUAL_PAYMENT',
  calculationId: null,
  deductionLineId: null,
  notes: null,
  createdById: 7,
  createdByName: 'hr.user',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  p.employee.findUnique.mockResolvedValue({ id: 1, code: 'E-001', fullName: 'موظف', jobTitle: null, status: 'ACTIVE' });
  p.employeeCompensationCalculation.findMany.mockResolvedValue([]);
  p.compensationDeductionLine.count.mockResolvedValue(0);
});

describe('إنشاء السجلات', () => {
  it('ينشئ سلفة برصيد يساوي أصلها', async () => {
    p.employeeCompensationDebt.create.mockResolvedValue(debt());
    const out = await service.create(1, { type: 'ADVANCE', label: 'سلفة سيارة', originalAmount: 100, debtDate: '2026-01-15' }, req);
    expect(out.remainingAmount).toBe(100);
    expect(out.paidAmount).toBe(0);
    expect(out.status).toBe('OPEN');
  });

  it('ينشئ مديونية من نوع DEBT', async () => {
    p.employeeCompensationDebt.create.mockResolvedValue(debt({ type: 'DEBT', label: 'مديونية وقود', originalAmount: 40 }));
    const out = await service.create(1, { type: 'DEBT', label: 'مديونية وقود', originalAmount: 40, debtDate: '2026-02-01' }, req);
    expect(out.type).toBe('DEBT');
    expect(out.remainingAmount).toBe(40);
  });

  it('يرفض مبلغًا صفرًا', async () => {
    await expect(service.create(1, { type: 'ADVANCE', label: 'x', originalAmount: 0, debtDate: '2026-01-01' }, req)).rejects.toThrow();
  });

  it('يرفض موظفًا غير موجود', async () => {
    p.employee.findUnique.mockResolvedValue(null);
    await expect(service.create(99, { type: 'ADVANCE', label: 'x', originalAmount: 10, debtDate: '2026-01-01' }, req)).rejects.toThrow(/الموظف غير موجود/);
  });
});

describe('أكثر من سجل لنفس الموظف، والرصيد مشتقّ', () => {
  it('يجمع سجلات متعددة ويحسب رصيد كل منها على حدة', async () => {
    p.employeeCompensationDebt.findMany.mockResolvedValue([
      debt({ id: 10, originalAmount: 100, payments: [payment({ id: 1, amount: 25 })] }),
      debt({ id: 11, originalAmount: 50, label: 'مديونية', payments: [payment({ id: 2, debtId: 11, amount: 50 })] }),
      debt({ id: 12, originalAmount: 80, label: 'سلفة ثانية', payments: [] }),
    ]);

    const out = await service.listForEmployee(1);

    expect(out.debts.map((d) => d.remainingAmount)).toEqual([75, 0, 80]);
    expect(out.debts.map((d) => d.status)).toEqual(['OPEN', 'SETTLED', 'OPEN']);
    expect(out.summary.openDebts).toBe(2);
    expect(out.summary.totalRemaining).toBe(155);
  });

  it('لا يكتب رصيدًا في قاعدة البيانات إطلاقًا', async () => {
    p.employeeCompensationDebt.findMany.mockResolvedValue([debt({ payments: [payment({ amount: 25 })] })]);
    await service.listForEmployee(1);
    expect(p.employeeCompensationDebt.update).not.toHaveBeenCalled();
  });

  it('المفتوحة وحدها تُعاد لقائمة الاختيار في محرّر الشهر', async () => {
    p.employeeCompensationDebt.findMany.mockResolvedValue([
      debt({ id: 10, originalAmount: 100, payments: [] }),
      debt({ id: 11, originalAmount: 50, payments: [payment({ id: 2, debtId: 11, amount: 50 })] }),
    ]);
    const open = await service.listOpenForEmployee(1);
    expect(open.map((d) => d.id)).toEqual([10]);
  });
});

describe('السداد اليدوي', () => {
  it('يُسجَّل ويخفض الرصيد', async () => {
    p.employeeCompensationDebt.findUnique.mockResolvedValue(debt());
    p.employeeCompensationDebtPayment.create.mockResolvedValue(payment({ amount: 10 }));

    await service.createManualPayment(10, { amount: 10, paymentDate: '2026-03-01' }, req);

    const data = p.employeeCompensationDebtPayment.create.mock.calls[0][0].data;
    expect(data.sourceType).toBe('MANUAL_PAYMENT');
    expect(data.amount).toBe(10);
    expect(data.calculationId).toBeUndefined(); // لا يرتبط بأي حسبة
  });

  it('يرفض سدادًا يتجاوز الرصيد', async () => {
    p.employeeCompensationDebt.findUnique.mockResolvedValue(debt({ payments: [payment({ amount: 90 })] }));
    await expect(service.createManualPayment(10, { amount: 30, paymentDate: '2026-03-01' }, req)).rejects.toThrow(/يتجاوز الرصيد/);
    expect(p.employeeCompensationDebtPayment.create).not.toHaveBeenCalled();
  });

  it('يرفض تعديل حركة ناتجة عن حسبة شهرية من هنا', async () => {
    p.employeeCompensationDebtPayment.findUnique.mockResolvedValue(payment({ sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 }));
    await expect(service.updateManualPayment(100, { amount: 5 }, req)).rejects.toThrow(/حسبة شهرية/);
  });

  it('يرفض حذف حركة ناتجة عن حسبة شهرية من هنا', async () => {
    p.employeeCompensationDebtPayment.findUnique.mockResolvedValue(payment({ sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 }));
    await expect(service.deleteManualPayment(100, req)).rejects.toThrow(/حسبة شهرية/);
    expect(p.employeeCompensationDebtPayment.delete).not.toHaveBeenCalled();
  });
});

describe('تعديل السجل', () => {
  it('يرفض خفض الأصل دون المسدَّد', async () => {
    p.employeeCompensationDebt.findUnique.mockResolvedValue(debt({ payments: [payment({ amount: 80 })] }));
    await expect(service.update(10, { originalAmount: 50 }, req)).rejects.toThrow(/80\.000/);
    expect(p.employeeCompensationDebt.update).not.toHaveBeenCalled();
  });

  it('يسمح برفع الأصل وبتعديل البيان والملاحظات', async () => {
    p.employeeCompensationDebt.findUnique.mockResolvedValue(debt({ payments: [payment({ amount: 80 })] }));
    p.employeeCompensationDebt.update.mockResolvedValue(debt({ originalAmount: 200, label: 'سلفة معدَّلة' }));
    await service.update(10, { originalAmount: 200, label: 'سلفة معدَّلة', notes: 'ملاحظة' }, req);
    const data = p.employeeCompensationDebt.update.mock.calls[0][0].data;
    expect(data.originalAmount).toBe(200);
    expect(data.label).toBe('سلفة معدَّلة');
    // الموظف المالك لا يُنقل — لا حقل employeeId في التحديث إطلاقًا.
    expect(data).not.toHaveProperty('employeeId');
  });
});

describe('حذف السجل — لا حذف صامت', () => {
  it('يحذف سجلًا بلا حركات ولا سطور مرتبطة', async () => {
    p.employeeCompensationDebt.findUnique.mockResolvedValue(debt({ payments: [] }));
    p.employeeCompensationDebt.delete.mockResolvedValue({});
    await expect(service.remove(10, req)).resolves.toEqual({ id: 10, employeeId: 1 });
  });

  it('يرفض حذف سجل عليه حركات، ويذكر عددها ونوعها', async () => {
    p.employeeCompensationDebt.findUnique.mockResolvedValue(
      debt({ payments: [payment({ id: 1, sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 }), payment({ id: 2 })] }),
    );
    await expect(service.remove(10, req)).rejects.toThrow(/2 حركة سداد/);
    expect(p.employeeCompensationDebt.delete).not.toHaveBeenCalled();
  });

  it('يرفض الحذف إن بقي سطر استقطاع مرتبط ولو بلا حركات', async () => {
    p.employeeCompensationDebt.findUnique.mockResolvedValue(debt({ payments: [] }));
    p.compensationDeductionLine.count.mockResolvedValue(1);
    await expect(service.remove(10, req)).rejects.toThrow(/سطر استقطاع/);
    expect(p.employeeCompensationDebt.delete).not.toHaveBeenCalled();
  });
});

describe('التحقّق من سطور سداد الحسبة', () => {
  const tx = () => p;

  it('يقبل سدادًا داخل الرصيد', async () => {
    p.employeeCompensationDebt.findMany.mockResolvedValue([debt()]);
    await expect(
      service.assertDebtDeductionsValid(tx(), { employeeId: 1, calculationId: null, lines: [{ debtId: 10, amount: 25, label: 'سداد' }] }),
    ).resolves.toBeUndefined();
  });

  it('يرفض سدادًا يتجاوز الرصيد', async () => {
    p.employeeCompensationDebt.findMany.mockResolvedValue([debt({ payments: [payment({ amount: 90 })] })]);
    await expect(
      service.assertDebtDeductionsValid(tx(), { employeeId: 1, calculationId: null, lines: [{ debtId: 10, amount: 30, label: 'سداد' }] }),
    ).rejects.toThrow(/يتجاوز الرصيد/);
  });

  it('يستبعد حركة الشهر نفسه عند التعديل — ٨٠ ← ٩٠ مقبول', async () => {
    p.employeeCompensationDebt.findMany.mockResolvedValue([
      debt({ payments: [payment({ id: 55, amount: 80, sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 })] }),
    ]);
    await expect(
      service.assertDebtDeductionsValid(tx(), { employeeId: 1, calculationId: 5, lines: [{ debtId: 10, amount: 90, label: 'سداد' }] }),
    ).resolves.toBeUndefined();
  });

  it('يرفض سدادين لنفس المديونية في الشهر ذاته', async () => {
    await expect(
      service.assertDebtDeductionsValid(tx(), {
        employeeId: 1,
        calculationId: null,
        lines: [{ debtId: 10, amount: 5, label: 'أ' }, { debtId: 10, amount: 5, label: 'ب' }],
      }),
    ).rejects.toThrow(/سدادين لنفس المديونية/);
  });

  it('يرفض مديونية تخصّ موظفًا آخر', async () => {
    p.employeeCompensationDebt.findMany.mockResolvedValue([debt({ employeeId: 2 })]);
    await expect(
      service.assertDebtDeductionsValid(tx(), { employeeId: 1, calculationId: null, lines: [{ debtId: 10, amount: 5, label: 'س' }] }),
    ).rejects.toThrow(/موظفًا آخر/);
  });
});

describe('مزامنة حركات الشهر — تحديث لا تكديس', () => {
  const tx = () => p;
  const base = { calculationId: 5, paymentDate: new Date('2026-06-30T12:00:00.000Z'), actorId: 7, actorName: 'hr.user' };

  it('تُنشئ حركة عند أول حفظ', async () => {
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([]);
    await service.syncDebtPaymentsForCalculation(tx(), { ...base, lines: [{ debtId: 10, amount: 25, deductionLineId: 90, label: 'سداد سلفة' }] });
    expect(p.employeeCompensationDebtPayment.create).toHaveBeenCalledTimes(1);
    expect(p.employeeCompensationDebtPayment.update).not.toHaveBeenCalled();
  });

  it('تُحدِّث **نفس** الحركة عند تعديل المبلغ ٢٥ ← ١٥، ولا تُنشئ ثانية', async () => {
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([payment({ id: 55, debtId: 10, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 })]);
    await service.syncDebtPaymentsForCalculation(tx(), { ...base, lines: [{ debtId: 10, amount: 15, deductionLineId: 91, label: 'سداد سلفة' }] });
    expect(p.employeeCompensationDebtPayment.create).not.toHaveBeenCalled();
    expect(p.employeeCompensationDebtPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 55 }, data: expect.objectContaining({ amount: 15 }) }),
    );
  });

  it('تحذف حركة مديونية أُزيلت من الحسبة فيرتدّ رصيدها', async () => {
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([payment({ id: 55, debtId: 10, sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 })]);
    await service.syncDebtPaymentsForCalculation(tx(), { ...base, lines: [] });
    expect(p.employeeCompensationDebtPayment.delete).toHaveBeenCalledWith({ where: { id: 55 } });
  });

  it('idempotent: إعادة الحفظ بنفس المدخلات لا تُنشئ حركة ثانية', async () => {
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([payment({ id: 55, debtId: 10, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 })]);
    await service.syncDebtPaymentsForCalculation(tx(), { ...base, lines: [{ debtId: 10, amount: 25, deductionLineId: 90, label: 'سداد سلفة' }] });
    expect(p.employeeCompensationDebtPayment.create).not.toHaveBeenCalled();
    expect(p.employeeCompensationDebtPayment.delete).not.toHaveBeenCalled();
  });

  it('تدعم أكثر من مديونية في الشهر نفسه — حركة مستقلة لكل منها', async () => {
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([]);
    await service.syncDebtPaymentsForCalculation(tx(), {
      ...base,
      lines: [
        { debtId: 10, amount: 20, deductionLineId: 90, label: 'سداد سلفة سيارة' },
        { debtId: 11, amount: 10, deductionLineId: 91, label: 'سداد مديونية' },
      ],
    });
    expect(p.employeeCompensationDebtPayment.create).toHaveBeenCalledTimes(2);
  });
});

describe('تفصيل السداد للتقرير الداخلي', () => {
  it('يحسب الرصيد قبل السداد وبعده من الدفتر', async () => {
    p.employeeCompensationDebtPayment.findMany.mockResolvedValue([
      {
        ...payment({ id: 55, amount: 25, sourceType: 'MONTHLY_COMPENSATION', calculationId: 5 }),
        debt: debt({ originalAmount: 100, payments: [payment({ id: 55, amount: 25 }), payment({ id: 56, amount: 10 })] }),
      },
    ]);

    const out = await service.repaymentBreakdownForCalculation(5);

    expect(out[0].balanceBefore).toBe(90); // 100 − 10 (كل الحركات عدا حركة هذا الشهر)
    expect(out[0].paidNow).toBe(25);
    expect(out[0].balanceAfter).toBe(65);
    expect(out[0].status).toBe('OPEN');
  });
});

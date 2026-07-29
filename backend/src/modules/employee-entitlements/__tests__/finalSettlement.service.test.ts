import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    leave: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    employeeEntitlementLedger: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
    employeeFinalSettlement: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    finalSettlementPayment: { aggregate: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { finalSettlementService } from '../finalSettlement.service';
import type { Request } from 'express';

/**
 * التصفية النهائية v1 — سلوك النطاق لا سلوك Prisma (كل الوصول لقاعدة البيانات مموَّه).
 *
 * ما تُثبته هذه الاختبارات تحديدًا: أن التصفية تتكوّن من مكوّنَين فقط، وأن الدفعات السابقة
 * تُخفّض المكوّن النقدي للإجازة وحده، وأن الاعتماد يجمّد النتيجة فعليًا، وأن حالة الموظف
 * لا تُلمس، وأن الدفع لا يُقصّ ولا يتجاوز الإجمالي المعتمد.
 */

const p = prisma as unknown as {
  employee: { findUnique: ReturnType<typeof vi.fn> };
  leave: { findMany: ReturnType<typeof vi.fn> };
  holiday: { findMany: ReturnType<typeof vi.fn> };
  employeeEntitlementLedger: {
    findMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
  };
  employeeFinalSettlement: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  finalSettlementPayment: { aggregate: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const req = { user: { userId: 7 } } as unknown as Request;

/** موظف مرجعي: خدمة تتجاوز 10 سنوات (فنسبة الاستقالة كاملة ≠ صفر)، راتب 520 د.ك. */
const EMPLOYEE = { id: 1, code: 'E-001', fullName: 'موظف تجريبي', salary: 520, hireDate: new Date('2014-01-01T00:00:00.000Z'), status: 'ACTIVE' };
const LWD = new Date('2026-07-29T00:00:00.000Z');

/** يهيّئ قراءات المحرّك (موظف/إجازات/عطلات) ومجموع دفعات بدل الإجازة السابقة. */
function setupReads(o: { employee?: Partial<typeof EMPLOYEE> | null; priorLeavePaid?: number } = {}) {
  const employee = o.employee === null ? null : { ...EMPLOYEE, ...(o.employee ?? {}) };
  p.employee.findUnique.mockResolvedValue(employee);
  p.leave.findMany.mockResolvedValue([]);
  p.holiday.findMany.mockResolvedValue([]);
  p.employeeEntitlementLedger.aggregate.mockResolvedValue({ _sum: { amount: o.priorLeavePaid ?? null } });
}

/** صفّ تصفية مموَّه بالحالة المطلوبة (وباللقطة عند الاعتماد). */
function settlementRow(over: Record<string, unknown> = {}) {
  return {
    id: 9,
    employeeId: 1,
    status: 'DRAFT',
    lastWorkingDay: LWD,
    terminationReason: 'EMPLOYER_TERMINATION',
    approvedAt: null,
    approvedBy: null,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: new Date('2026-07-29T00:00:00.000Z'),
    snapshotHireDate: null,
    snapshotSalaryUsed: null,
    snapshotDailyWage: null,
    snapshotWageDivisor: null,
    snapshotServiceYears: null,
    snapshotServiceMonths: null,
    snapshotServiceDays: null,
    snapshotServiceTotalDays: null,
    snapshotLeaveDays: null,
    snapshotLeaveValue: null,
    snapshotPriorLeavePaid: null,
    snapshotLeaveRemaining: null,
    snapshotEosScenario: null,
    snapshotEosFullAmount: null,
    snapshotEosFraction: null,
    snapshotEosAmount: null,
    snapshotTotalAmount: null,
    payments: [],
    ...over,
  };
}

/** ينفّذ رد الاتصال داخل «معاملة» تشارك نفس العملاء المموَّهين. */
function wireTransaction() {
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
}

beforeEach(() => {
  vi.clearAllMocks();
  p.employeeFinalSettlement.update.mockResolvedValue({});
  p.employeeFinalSettlement.findMany.mockResolvedValue([]);
});

describe('final settlement — draft creation', () => {
  it('creates a draft from only a last working day and a termination reason', async () => {
    setupReads();
    p.employeeFinalSettlement.findFirst
      .mockResolvedValueOnce(null) // فحص عدم وجود تصفية سابقة
      .mockResolvedValue(settlementRow()); // القراءة بعد الإنشاء
    p.employeeFinalSettlement.create.mockResolvedValue(settlementRow());

    const s = await finalSettlementService.createDraft(1, { lastWorkingDay: LWD, terminationReason: 'EMPLOYER_TERMINATION' }, req);

    const data = p.employeeFinalSettlement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ employeeId: 1, status: 'DRAFT', terminationReason: 'EMPLOYER_TERMINATION' });
    // لا مبالغ في المدخلات: المستخدم لا يُدخل أي قيمة محتسَبة.
    expect(Object.keys(data)).toEqual(['employeeId', 'status', 'lastWorkingDay', 'terminationReason', 'createdBy']);
    expect(s!.status).toBe('DRAFT');
    expect(s!.isSnapshot).toBe(false);
  });

  it('rejects a last working day before the hire date', async () => {
    setupReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(null);
    await expect(
      finalSettlementService.createDraft(1, { lastWorkingDay: new Date('2013-01-01T00:00:00.000Z'), terminationReason: 'RESIGNATION' }, req),
    ).rejects.toThrow(/يسبق تاريخ التعيين/);
    expect(p.employeeFinalSettlement.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid last working day', async () => {
    setupReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(null);
    await expect(
      finalSettlementService.createDraft(1, { lastWorkingDay: new Date('not-a-date'), terminationReason: 'RESIGNATION' }, req),
    ).rejects.toThrow(/آخر يوم عمل غير صالح/);
  });

  it('refuses a second ACTIVE settlement for the same employee', async () => {
    setupReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    await expect(
      finalSettlementService.createDraft(1, { lastWorkingDay: LWD, terminationReason: 'RESIGNATION' }, req),
    ).rejects.toThrow(/نشطة/);
    expect(p.employeeFinalSettlement.create).not.toHaveBeenCalled();
  });
});

describe('final settlement — draft calculation', () => {
  it('uses the employer-termination EOS scenario', async () => {
    setupReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow({ terminationReason: 'EMPLOYER_TERMINATION' }));
    const s = await finalSettlementService.getSettlement(1);

    expect(s!.computation.eosScenario).toBe('EMPLOYER_TERMINATION');
    expect(s!.computation.eosFraction).toBe(1);
    expect(s!.computation.eosAmount).toBe(s!.computation.eosFullAmount);
  });

  it('uses the resignation EOS scenario and its reduced fraction', async () => {
    setupReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow({ terminationReason: 'RESIGNATION' }));
    const s = await finalSettlementService.getSettlement(1);

    expect(s!.computation.eosScenario).toBe('RESIGNATION');
    // نفس محرّك المادة 53 القائم — لا صيغة جديدة هنا.
    expect(s!.computation.eosAmount).toBe(
      Math.round(s!.computation.eosFullAmount! * s!.computation.eosFraction! * 1000) / 1000,
    );
  });

  it('calculates the leave component at the last working day', async () => {
    setupReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow({ lastWorkingDay: LWD }));
    const atLwd = await finalSettlementService.getSettlement(1);

    setupReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(
      settlementRow({ lastWorkingDay: new Date('2025-07-29T00:00:00.000Z') }),
    );
    const earlier = await finalSettlementService.getSettlement(1);

    expect(atLwd!.computation.leaveValue!).toBeGreaterThan(earlier!.computation.leaveValue!);
    expect(atLwd!.computation.serviceDuration!.totalDays).toBeGreaterThan(earlier!.computation.serviceDuration!.totalDays);
  });

  it('is deterministic across the whole calendar day of the last working day', async () => {
    const results = [];
    for (const hour of ['T00:00:00.000Z', 'T13:20:00.000Z', 'T23:59:59.999Z']) {
      setupReads();
      p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow({ lastWorkingDay: new Date('2026-07-29' + hour) }));
      results.push((await finalSettlementService.getSettlement(1))!.computation);
    }
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });

  it('total = remaining leave component + EOS, with no third component', async () => {
    setupReads({ priorLeavePaid: 120 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    const c = (await finalSettlementService.getSettlement(1))!.computation;

    expect(c.totalAmount).toBe(Math.round((c.leaveRemaining! + c.eosAmount!) * 1000) / 1000);
  });
});

describe('final settlement — prior entitlement payments', () => {
  it('reduces the leave monetary component only', async () => {
    setupReads({ priorLeavePaid: 0 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    const none = (await finalSettlementService.getSettlement(1))!.computation;

    setupReads({ priorLeavePaid: 200 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    const paid = (await finalSettlementService.getSettlement(1))!.computation;

    expect(paid.priorLeavePaid).toBe(200);
    expect(paid.leaveRemaining).toBe(Math.round((none.leaveValue! - 200) * 1000) / 1000);
    // أيام الإجازة ومكافأة نهاية الخدمة لا تتأثر إطلاقًا بما دُفع سابقًا.
    expect(paid.leaveDays).toBe(none.leaveDays);
    expect(paid.eosAmount).toBe(none.eosAmount);
    expect(paid.leaveValue).toBe(none.leaveValue);
  });

  it('never lets the leave component fall below zero', async () => {
    setupReads({ priorLeavePaid: 999_999 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    const c = (await finalSettlementService.getSettlement(1))!.computation;

    expect(c.leaveRemaining).toBe(0);
    expect(c.totalAmount).toBe(c.eosAmount);
  });

  it('counts prior leave payments only up to the settlement date', async () => {
    setupReads({ priorLeavePaid: 50 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    await finalSettlementService.getSettlement(1);

    const where = p.employeeEntitlementLedger.aggregate.mock.calls[0][0].where;
    expect(where.entryType).toBe('LEAVE_ALLOWANCE');
    expect(where.entryDate).toEqual({ lte: LWD });
  });
});

describe('final settlement — approval freezes the result', () => {
  it('recalculates a draft on read, then writes a full snapshot on approval', async () => {
    setupReads({ priorLeavePaid: 100 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    await finalSettlementService.approve(1, req);

    const data = p.employeeFinalSettlement.update.mock.calls[0][0].data;
    expect(data.status).toBe('APPROVED');
    expect(data.approvedAt).toBeInstanceOf(Date);
    expect(data.snapshotSalaryUsed).toBe(520);
    expect(data.snapshotWageDivisor).toBe(26);
    expect(data.snapshotPriorLeavePaid).toBe(100);
    expect(data.snapshotTotalAmount).toBe(
      Math.round((data.snapshotLeaveRemaining + data.snapshotEosAmount) * 1000) / 1000,
    );
    expect(data.snapshotEosScenario).toBe('EMPLOYER_TERMINATION');
  });

  it('reads an approved settlement from the snapshot — a later salary change does not alter it', async () => {
    const approved = settlementRow({
      status: 'APPROVED',
      approvedAt: new Date('2026-07-29T09:00:00.000Z'),
      snapshotHireDate: EMPLOYEE.hireDate,
      snapshotSalaryUsed: 520,
      snapshotDailyWage: 20,
      snapshotWageDivisor: 26,
      snapshotServiceYears: 12,
      snapshotServiceMonths: 6,
      snapshotServiceDays: 28,
      snapshotServiceTotalDays: 4593,
      snapshotLeaveDays: 377.5,
      snapshotLeaveValue: 7550,
      snapshotPriorLeavePaid: 100,
      snapshotLeaveRemaining: 7450,
      snapshotEosScenario: 'EMPLOYER_TERMINATION',
      snapshotEosFullAmount: 9360,
      snapshotEosFraction: 1,
      snapshotEosAmount: 9360,
      snapshotTotalAmount: 16810,
    });

    // راتب مختلف تمامًا الآن + دفعة إضافية سابقة: لا شيء منهما يمسّ اللقطة.
    setupReads({ employee: { salary: 9999, status: 'TERMINATED' }, priorLeavePaid: 5000 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(approved);
    const s = await finalSettlementService.getSettlement(1);

    expect(s!.isSnapshot).toBe(true);
    expect(s!.computation.salaryUsed).toBe(520);
    expect(s!.computation.priorLeavePaid).toBe(100);
    expect(s!.computation.totalAmount).toBe(16810);
    // لا إعادة احتساب: لم يُستدعَ المحرّك أصلًا عند قراءة تصفية معتمدة.
    expect(p.employee.findUnique).not.toHaveBeenCalled();
  });

  it('refuses to edit or re-approve an approved settlement', async () => {
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow({ status: 'APPROVED' }));
    await expect(
      finalSettlementService.updateDraft(1, { lastWorkingDay: LWD, terminationReason: 'RESIGNATION' }, req),
    ).rejects.toThrow(/لا يمكن تعديل تصفية معتمدة/);

    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow({ status: 'APPROVED' }));
    await expect(finalSettlementService.approve(1, req)).rejects.toThrow(/معتمدة بالفعل/);
  });
});

describe('final settlement — payments', () => {
  const APPROVED = settlementRow({
    status: 'APPROVED',
    approvedAt: new Date('2026-07-20T09:00:00.000Z'),
    snapshotTotalAmount: 1000,
    snapshotLeaveRemaining: 300,
    snapshotEosAmount: 700,
    snapshotEosScenario: 'EMPLOYER_TERMINATION',
  });
  const base = { paymentDate: new Date('2026-07-29T00:00:00.000Z'), paymentMethod: 'CASH' as const };

  /** يهيّئ تصفية معتمدة بمجموع مدفوع سابق محدَّد. */
  function approvedWithPaid(alreadyPaid: number, payments: { id: number; amount: number }[] = []) {
    p.employeeFinalSettlement.findFirst.mockResolvedValue({
      ...APPROVED,
      payments: payments.map((x) => ({ ...APPROVED, ...x, paymentDate: base.paymentDate, paymentMethod: 'CASH', reference: null, notes: null, createdAt: base.paymentDate })),
    });
    // يُستدعى مرتين: حارس عدم التجاوز ثم مزامنة الحالة بعد الإنشاء.
    p.finalSettlementPayment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: alreadyPaid || null } })
      .mockResolvedValue({ _sum: { amount: alreadyPaid + 600 || null } });
    p.finalSettlementPayment.create.mockImplementation(async (arg: { data: Record<string, unknown> }) => ({ id: 50, ...arg.data }));
    wireTransaction();
  }

  it('rejects a payment against a DRAFT settlement', async () => {
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    wireTransaction();
    await expect(finalSettlementService.recordPayment(1, { ...base, amount: 100 }, req)).rejects.toThrow(/اعتماد التصفية/);
    expect(p.finalSettlementPayment.create).not.toHaveBeenCalled();
  });

  it('records a partial payment and derives the remaining balance', async () => {
    approvedWithPaid(0);
    await finalSettlementService.recordPayment(1, { ...base, amount: 400 }, req);
    expect(p.finalSettlementPayment.create.mock.calls[0][0].data.amount).toBe(400);
    // 400 من 1000 لا تُنهي التصفية — تُزامَن الحالة وتبقى «معتمدة».
    expect(p.employeeFinalSettlement.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { status: 'APPROVED' } });
  });

  it('accumulates multiple payments and marks PAID when the balance reaches zero', async () => {
    approvedWithPaid(400, [{ id: 50, amount: 400 }]);
    await finalSettlementService.recordPayment(1, { ...base, amount: 600 }, req);

    expect(p.finalSettlementPayment.create.mock.calls[0][0].data.amount).toBe(600);
    expect(p.employeeFinalSettlement.update).toHaveBeenCalledWith({ where: { id: 9 }, data: { status: 'PAID' } });
  });

  it('rejects an overpayment without clamping it', async () => {
    approvedWithPaid(400);
    await expect(finalSettlementService.recordPayment(1, { ...base, amount: 600.001 }, req)).rejects.toThrow(/يتجاوز المتبقي/);
    expect(p.finalSettlementPayment.create).not.toHaveBeenCalled();
  });

  it('rejects zero, negative, future, and pre-approval payment dates', async () => {
    for (const amount of [0, -10]) {
      approvedWithPaid(0);
      await expect(finalSettlementService.recordPayment(1, { ...base, amount }, req)).rejects.toThrow(/أكبر من صفر/);
    }

    approvedWithPaid(0);
    await expect(
      finalSettlementService.recordPayment(1, { ...base, paymentDate: new Date(Date.now() + 7 * 86_400_000), amount: 10 }, req),
    ).rejects.toThrow(/مستقبلي/);

    approvedWithPaid(0);
    await expect(
      finalSettlementService.recordPayment(1, { ...base, paymentDate: new Date('2026-07-19T00:00:00.000Z'), amount: 10 }, req),
    ).rejects.toThrow(/سابق لاعتماد التصفية/);

    expect(p.finalSettlementPayment.create).not.toHaveBeenCalled();
  });

  it('rejects any further payment once the settlement is PAID', async () => {
    p.employeeFinalSettlement.findFirst.mockResolvedValue({ ...APPROVED, status: 'PAID' });
    wireTransaction();
    await expect(finalSettlementService.recordPayment(1, { ...base, amount: 1 }, req)).rejects.toThrow(/حالتها الحالية/);
    expect(p.finalSettlementPayment.create).not.toHaveBeenCalled();
  });

  it('derives paid and remaining from the persisted payments against the frozen total', async () => {
    p.employeeFinalSettlement.findFirst.mockResolvedValue({
      ...APPROVED,
      payments: [
        { id: 1, paymentDate: base.paymentDate, amount: 400, paymentMethod: 'CASH', reference: null, notes: null, createdAt: base.paymentDate },
        { id: 2, paymentDate: base.paymentDate, amount: 250, paymentMethod: 'CASH', reference: null, notes: null, createdAt: base.paymentDate },
      ],
    });
    const s = await finalSettlementService.getSettlement(1);

    expect(s!.paid).toBe(650);
    expect(s!.remaining).toBe(350);
    expect(s!.payments).toHaveLength(2);
  });
});

describe('final settlement — module boundary', () => {
  it('never mutates employee status, leave records, payroll or accounting', async () => {
    setupReads({ priorLeavePaid: 100 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    await finalSettlementService.approve(1, req);

    // الموظف يُقرأ فقط (findUnique) — لا update متاح أصلًا في العميل المموَّه.
    expect(Object.keys(p.employee)).toEqual(['findUnique']);
    expect(Object.keys(p.leave)).toEqual(['findMany']);
    const clients = Object.keys(prisma as unknown as Record<string, unknown>);
    expect(clients).not.toContain('payroll');
    expect(clients).not.toContain('journalEntry');
    expect(clients).not.toContain('salaryPayment');

    // اللقطة تُكتب على صفّ التصفية وحده.
    expect(p.employeeFinalSettlement.update.mock.calls[0][0].where).toEqual({ id: 9 });
  });

  it('leaves the existing entitlement payment ledger untouched — it is only read', async () => {
    setupReads({ priorLeavePaid: 100 });
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlementRow());
    await finalSettlementService.approve(1, req);

    // لا create/update/delete على سجل دفعات المستحقات: مصدره التاريخي يبقى كما هو.
    expect(Object.keys(p.employeeEntitlementLedger).sort()).toEqual(['aggregate', 'findMany', 'groupBy']);
  });
});

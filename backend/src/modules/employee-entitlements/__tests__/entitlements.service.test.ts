import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    leave: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    employeeEntitlementLedger: {
      findMany: vi.fn(),
      groupBy: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    employeeAllowance: { findMany: vi.fn() },
    employeeFinalSettlement: { findFirst: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { entitlementsService } from '../entitlements.service';
import type { Request } from 'express';

/**
 * سلوك نطاق مستحقات الموظف — المدفوع والمتبقي والتحقق من الدفع.
 *
 * كل الوصول لقاعدة البيانات مُموَّه: ما يُختبَر هنا هو **قواعد النطاق** لا Prisma. تُثبت
 * هذه الاختبارات تحديدًا: أن المدفوع مجموع حركات حقيقية لا رقمًا مُخزَّنًا، أن المتبقي
 * مُشتقّ، أن التجاوز يُرفض ولا يُقصّ صامتًا، وأن الدفع لا يمسّ الرواتب ولا المحاسبة ولا
 * سجلات الإجازة.
 */

const p = prisma as unknown as {
  employee: { findUnique: ReturnType<typeof vi.fn> };
  leave: { findMany: ReturnType<typeof vi.fn> };
  holiday: { findMany: ReturnType<typeof vi.fn> };
  employeeEntitlementLedger: {
    findMany: ReturnType<typeof vi.fn>;
    groupBy: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  employeeAllowance: { findMany: ReturnType<typeof vi.fn> };
  employeeFinalSettlement: { findFirst: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const req = { user: { userId: 7 } } as unknown as Request;

/** موظف قياسي: خدمة طويلة، راتب 500 د.ك، بلا إجازات مستخدَمة. */
const EMPLOYEE = {
  id: 1,
  code: 'E-001',
  fullName: 'موظف تجريبي',
  salary: 500,
  hireDate: new Date('2020-01-01T00:00:00Z'),
  status: 'ACTIVE',
};

const ASOF = new Date('2026-01-01T00:00:00Z');

/** يهيّئ القراءات الافتراضية: موظف موجود، بلا إجازات ولا عطلات ولا دفعات. */
function setupReads(overrides: {
  employee?: Partial<typeof EMPLOYEE> | null;
  payments?: { entryType: string; amount: number }[];
} = {}) {
  const employee = overrides.employee === null ? null : { ...EMPLOYEE, ...(overrides.employee ?? {}) };
  const payments = overrides.payments ?? [];

  p.employee.findUnique.mockResolvedValue(employee);
  p.leave.findMany.mockResolvedValue([]);
  p.holiday.findMany.mockResolvedValue([]);
  p.employeeAllowance.findMany.mockResolvedValue([{ amount: 250 }]); // موجود عمدًا: يجب ألا يُقرأ إطلاقًا
  // لا تصفية نهائية في هذه الاختبارات — سلوك التصفية مُغطّى في ملفها المستقل.
  p.employeeFinalSettlement.findFirst.mockResolvedValue(null);
  p.employeeFinalSettlement.findMany.mockResolvedValue([]);

  const rows = payments.map((pay, i) => ({
    id: i + 1,
    entryType: pay.entryType,
    entryDate: new Date('2025-06-0' + (i + 1) + 'T00:00:00Z'),
    description: null,
    leaveDays: null,
    leaveBalanceSnapshot: null,
    amount: pay.amount,
    paymentMethod: 'CASH',
    notes: null,
    createdAt: new Date('2025-06-0' + (i + 1) + 'T00:00:00Z'),
  }));
  p.employeeEntitlementLedger.findMany.mockResolvedValue(rows);

  const byType = new Map<string, number>();
  for (const pay of payments) byType.set(pay.entryType, (byType.get(pay.entryType) ?? 0) + pay.amount);
  p.employeeEntitlementLedger.groupBy.mockResolvedValue(
    [...byType].map(([entryType, amount]) => ({ entryType, _sum: { amount } })),
  );
  p.employeeEntitlementLedger.aggregate.mockResolvedValue({
    _sum: { amount: [...byType.values()].reduce((a, b) => a + b, 0) || null },
  });
  return { employee, rows };
}

/** ينفّذ رد الاتصال داخل «معاملة» وهمية تشارك نفس عملاء prisma المموَّهين. */
function wireTransaction() {
  p.employeeEntitlementLedger.create.mockImplementation(async (arg: { data: Record<string, unknown> }) => ({
    id: 99,
    createdAt: new Date(),
    ...arg.data,
  }));
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('entitlements statement — calculated position', () => {
  it('uses Employee.salary as the entitlement wage and never reads allowances', async () => {
    setupReads();
    const st = await entitlementsService.getStatement(1, ASOF);

    expect(st.wageBase).toEqual({ baseSalary: 500, total: 500, source: 'EMPLOYEE_SALARY' });
    expect(st.result.gratuity!.approvedWage).toBe(500);
    // البدلات موجودة في التمويه لكن لا يُستدعى مصدرها إطلاقًا — استبعاد بنيوي لا شرطي.
    expect(p.employeeAllowance.findMany).not.toHaveBeenCalled();
  });

it('honours an explicit asOf and defaults to the LOCAL calendar date when none is given', async () => {
    setupReads();
    const explicit = await entitlementsService.getStatement(1, ASOF);
    expect(explicit.asOf).toEqual(ASOF);

    setupReads();
    const fallback = await entitlementsService.getStatement(1);
    const now = new Date();
    // «اليوم» = التاريخ التقويمي المحلي مثبَّتًا عند منتصف ليل UTC — بلا مكوّن وقت.
    expect(fallback.asOf).toEqual(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
    expect(fallback.asOf.getUTCHours()).toBe(0);
  });

  it('normalises an explicit asOf that carries a time component to its calendar day', async () => {
    setupReads();
    const st = await entitlementsService.getStatement(1, new Date('2026-01-01T18:42:11.000Z'));
    expect(st.asOf).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('rejects an invalid asOf instead of silently falling back to today', async () => {
    setupReads();
    await expect(entitlementsService.getStatement(1, new Date('not-a-date'))).rejects.toThrow(/تاريخ الاحتساب/);
  });

  it('reports a missing employee rather than an empty statement', async () => {
    setupReads({ employee: null });
    await expect(entitlementsService.getStatement(1, ASOF)).rejects.toThrow(/غير موجود/);
  });
});

describe('entitlements statement — paid and remaining position', () => {
  it('reports zero paid and remaining == entitlement when no payment exists', async () => {
    setupReads({ payments: [] });
    const st = await entitlementsService.getStatement(1, ASOF);

    expect(st.payments.entries).toHaveLength(0);
    expect(st.balances.leaveAllowance.paid).toBe(0);
    expect(st.balances.leaveAllowance.remaining).toBe(st.balances.leaveAllowance.entitlement);
    expect(st.balances.totalPaid).toBe(0);
    expect(st.balances.totalRemaining).toBe(st.balances.totalPayable);
  });

  it('derives paid and remaining from a single recorded payment', async () => {
    setupReads({ payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 1000 }] });
    const st = await entitlementsService.getStatement(1, ASOF);

    const entitlement = st.balances.leaveAllowance.entitlement!;
    expect(st.balances.leaveAllowance.paid).toBe(1000);
    expect(st.balances.leaveAllowance.remaining).toBe(Math.round((entitlement - 1000) * 1000) / 1000);
  });

  it('aggregates multiple payments and keeps each movement individually in history', async () => {
    setupReads({
      payments: [
        { entryType: 'LEAVE_ALLOWANCE', amount: 1000 },
        { entryType: 'LEAVE_ALLOWANCE', amount: 500 },
      ],
    });
    const st = await entitlementsService.getStatement(1, ASOF);

    expect(st.balances.leaveAllowance.paid).toBe(1500);
    // الحركات محفوظة كوقائع منفصلة — لا يُستبدل التاريخ برقم «مدفوع» واحد قابل للتعديل.
    expect(st.payments.entries.map((e) => e.amount)).toEqual([1000, 500]);
    expect(st.payments.totalRecorded).toBe(1500);
  });

  it('leaves a historical payment untouched when the salary later changes', async () => {
    setupReads({ payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 1000 }] });
    const before = await entitlementsService.getStatement(1, ASOF);

    setupReads({ employee: { salary: 600 }, payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 1000 }] });
    const after = await entitlementsService.getStatement(1, ASOF);

    expect(after.payments.entries[0].amount).toBe(before.payments.entries[0].amount);
    expect(after.balances.leaveAllowance.paid).toBe(1000);
    // الاستحقاق المحتسَب يتغيّر مع الراتب — والدفعة التاريخية لا.
    expect(after.balances.leaveAllowance.entitlement).not.toBe(before.balances.leaveAllowance.entitlement);
  });
});

/**
 * مكافأة نهاية الخدمة تقديرية **دائمًا** في هذه الحزمة.
 *
 * التصحيح الجوهري: كان السلوك السابق يجعلها قابلة للصرف تلقائيًا بمجرد أن تصبح
 * `employee.status !== 'ACTIVE'`. ذلك يخلط بين إجراء إداري (تغيير حقل الحالة) وقرار مالي
 * (اعتماد التسوية النهائية)، فيُنشئ التزامًا قابلًا للدفع بلا أي موافقة صريحة. الاختبارات
 * أدناه تُثبّت أن حالة الموظف — أيًّا كانت — لا تُفعّل الصرف إطلاقًا.
 */
describe('entitlements statement — end of service is always an estimate', () => {
  it('returns the estimate for an active employee and excludes it from the payable balance', async () => {
    setupReads();
    const st = await entitlementsService.getStatement(1, ASOF);

    expect(st.estimatedEndOfService.isEstimate).toBe(true);
    expect(st.estimatedEndOfService.terminationAmount).toBeGreaterThan(0);
    expect(st.estimatedEndOfService.includedInPayable).toBe(false);
    expect(st.estimatedEndOfService.payableNow).toBe(false);
    expect(st.estimatedEndOfService.asOf).toEqual(ASOF);

    expect(st.balances.endOfService.payable).toBe(false);
    expect(st.balances.totalPayable).toBe(st.balances.leaveAllowance.entitlement);
  });

  it('stays an estimate — and stays out of the payable total — for every non-active status', async () => {
    for (const status of ['TERMINATED', 'ON_LEAVE', 'RESIGNED', 'INACTIVE']) {
      setupReads({ employee: { status } });
      const st = await entitlementsService.getStatement(1, ASOF);

      expect(st.estimatedEndOfService.isEstimate).toBe(true);
      expect(st.estimatedEndOfService.payableNow).toBe(false);
      expect(st.balances.endOfService.payable).toBe(false);
      // لا «متبقٍّ للدفع» لتقدير — القيمة المحتسَبة تُعرض، لكن لا رصيد قابل للصرف.
      expect(st.balances.endOfService.remaining).toBeNull();
      // الإجمالي القابل للدفع = بدل الإجازة وحده، مهما كانت الحالة.
      expect(st.balances.totalPayable).toBe(st.balances.leaveAllowance.entitlement);
    }
  });

  it('declares the payable categories explicitly, so no client infers payability from status', async () => {
    setupReads({ employee: { status: 'TERMINATED' } });
    const st = await entitlementsService.getStatement(1, ASOF);

    expect(st.balances.payableCategories).toEqual(['LEAVE_ALLOWANCE']);
    expect(st.estimatedEndOfService.activationRequires).toBe('FINAL_SETTLEMENT');
    expect(st.estimatedEndOfService.scenariosAreHypothetical).toBe(true);
  });

  it('gives an identical payable position for an ACTIVE and a TERMINATED employee', async () => {
    setupReads({ employee: { status: 'ACTIVE' } });
    const active = await entitlementsService.getStatement(1, ASOF);
    setupReads({ employee: { status: 'TERMINATED' } });
    const terminated = await entitlementsService.getStatement(1, ASOF);

    expect(terminated.balances.totalPayable).toBe(active.balances.totalPayable);
    expect(terminated.balances.totalRemaining).toBe(active.balances.totalRemaining);
  });
});

/**
 * التحقق الوظيفي المطلوب قبل الإصدار — بنفس أرقام العيّنة المرصودة على الشاشة.
 * بيانات وهمية بالكامل (Prisma مموَّه): لا تُمسّ أي بيانات فعلية للتحقق.
 */
describe('payment flow — approved sample (150 KWD, hired 23/10/2024, asOf 29/07/2026)', () => {
  const SAMPLE_EMPLOYEE = { salary: 150, hireDate: new Date('2024-10-23T00:00:00.000Z') };
  const SAMPLE_ASOF = new Date('2026-07-29T00:00:00.000Z');
  // القيم المتوقَّعة مُشتقّة من القواعد المعتمدة، لا مكتوبة يدويًا.
  const SERVICE_DAYS = (Date.UTC(2026, 6, 29) - Date.UTC(2024, 9, 23)) / 86_400_000;
  const ACCRUED_DAYS = Math.round(30 * (SERVICE_DAYS / 365) * 100) / 100;
  const ENTITLEMENT = Math.round(ACCRUED_DAYS * (150 / 26) * 1000) / 1000;
  const payBase = { category: 'LEAVE_ALLOWANCE' as const, paymentMethod: 'CASH' as const, paymentDate: SAMPLE_ASOF };

it('starts fully payable with nothing paid', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    const st = await entitlementsService.getStatement(1, SAMPLE_ASOF);

    expect(st.result.duration!.totalDays).toBe(SERVICE_DAYS);
    expect(st.result.remainingLeaveDays).toBe(ACCRUED_DAYS);
    expect(st.balances.leaveAllowance.entitlement).toBe(ENTITLEMENT);
    expect(st.balances.totalPaid).toBe(0);
    expect(st.balances.totalRemaining).toBe(ENTITLEMENT);
  });

  it('returns the same statement at every hour of the calculation day', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    const morning = await entitlementsService.getStatement(1, new Date('2026-07-29T00:30:00.000Z'));
    setupReads({ employee: SAMPLE_EMPLOYEE });
    const evening = await entitlementsService.getStatement(1, new Date('2026-07-29T23:45:00.000Z'));

    expect(evening.asOf).toEqual(morning.asOf);
    expect(evening.result.duration!.totalDays).toBe(morning.result.duration!.totalDays);
    expect(evening.balances.totalRemaining).toBe(morning.balances.totalRemaining);
  });

it('after a 100.000 payment: paid 100.000, remaining = entitlement - 100, leave days unchanged', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    const entry = await entitlementsService.recordPayment(1, { ...payBase, amount: 100 }, req);
    expect(entry.amount).toBe(100);

    setupReads({ employee: SAMPLE_EMPLOYEE, payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 100 }] });
    const st = await entitlementsService.getStatement(1, SAMPLE_ASOF);

    expect(st.balances.totalPaid).toBe(100);
    expect(st.balances.totalRemaining).toBe(Math.round((ENTITLEMENT - 100) * 1000) / 1000);
    expect(st.payments.entries).toHaveLength(1);
    // رصيد الأيام لم يتغيّر بسبب الدفع النقدي — لا تحويل ولا استهلاك.
    expect(st.result.remainingLeaveDays).toBe(ACCRUED_DAYS);
    expect(st.result.usedLeaveDays).toBe(0);
  });

it('after a second 50.000 payment: paid 150.000, remaining = entitlement - 150, two movements', async () => {
    setupReads({
      employee: SAMPLE_EMPLOYEE,
      payments: [
        { entryType: 'LEAVE_ALLOWANCE', amount: 100 },
        { entryType: 'LEAVE_ALLOWANCE', amount: 50 },
      ],
    });
    const st = await entitlementsService.getStatement(1, SAMPLE_ASOF);

    expect(st.balances.totalPaid).toBe(150);
    expect(st.balances.totalRemaining).toBe(Math.round((ENTITLEMENT - 150) * 1000) / 1000);
    expect(st.payments.entries.map((e) => e.amount)).toEqual([100, 50]);
    expect(st.result.remainingLeaveDays).toBe(ACCRUED_DAYS);
  });

it('rejects an amount just above the entitlement without clamping it down', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    const justOver = Math.round((ENTITLEMENT + 0.096) * 1000) / 1000;
    await expect(entitlementsService.recordPayment(1, { ...payBase, amount: justOver }, req)).rejects.toThrow(/يتجاوز المتبقي/);
    expect(p.employeeEntitlementLedger.create).not.toHaveBeenCalled();
  });

  it('never lets the remaining balance go negative', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE, payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: ENTITLEMENT }] });
    const st = await entitlementsService.getStatement(1, SAMPLE_ASOF);

    expect(st.balances.totalRemaining).toBe(0);
    expect(st.balances.leaveAllowance.remaining).toBeGreaterThanOrEqual(0);
  });
});

/**
 * تصحيح سجل الدفعات — تعديل وحذف حركة مسجَّلة.
 *
 * الفكرة المحورية في التعديل: تُستبعد الدفعة المحرَّرة من مجموع المدفوع قبل التحقق، وإلا
 * لصادمت نفسها فبدت كل زيادة تجاوزًا. المتاح لها = الاستحقاق − **باقي** الدفعات فقط.
 */
describe('payment corrections — edit and delete', () => {
  const SAMPLE_EMPLOYEE = { salary: 150, hireDate: new Date('2024-10-23T00:00:00.000Z') };
  const PAY_DATE = new Date('2026-07-29T00:00:00.000Z');
  const SERVICE_DAYS = (Date.UTC(2026, 6, 29) - Date.UTC(2024, 9, 23)) / 86_400_000;
  const ACCRUED_DAYS = Math.round(30 * (SERVICE_DAYS / 365) * 100) / 100;
  const ENTITLEMENT = Math.round(ACCRUED_DAYS * (150 / 26) * 1000) / 1000; // 305.365
  const editBase = { paymentDate: PAY_DATE, paymentMethod: 'CASH' as const };

  /** يجهّز دفعة قائمة مملوكة للموظف 1، مع مجموع «باقي الدفعات» المطلوب للتحقق. */
  function existingPayment(id: number, amount: number, others: number, ownerId: number | null = 1) {
    p.employeeEntitlementLedger.findFirst.mockResolvedValue(
      ownerId === null ? null : { id, employeeId: ownerId, entryType: 'LEAVE_ALLOWANCE', entryDate: PAY_DATE, amount },
    );
    // aggregate يُستدعى مستبعِدًا الدفعة المحرَّرة ⇒ يعيد مجموع الدفعات الأخرى وحدها.
    p.employeeEntitlementLedger.aggregate.mockResolvedValue({ _sum: { amount: others || null } });
    p.employeeEntitlementLedger.update.mockImplementation(
      async (arg: { where: { id: number }; data: Record<string, unknown> }) => ({ id: arg.where.id, entryType: 'LEAVE_ALLOWANCE', ...arg.data }),
    );
    p.employeeEntitlementLedger.delete.mockResolvedValue({ id });
  }

  it('edits 100.000 down to 80.000 and re-derives paid/remaining from the movements', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    existingPayment(5, 100, 0);

    const updated = await entitlementsService.updatePayment(1, 5, { ...editBase, amount: 80 }, req);
    expect(updated.amount).toBe(80);

    // الكشف بعد التعديل: المدفوع 80.000 والمتبقي = الاستحقاق − 80.
    setupReads({ employee: SAMPLE_EMPLOYEE, payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 80 }] });
    const st = await entitlementsService.getStatement(1, PAY_DATE);
    expect(st.balances.totalPaid).toBe(80);
    expect(st.balances.totalRemaining).toBe(Math.round((ENTITLEMENT - 80) * 1000) / 1000); // 225.365
  });

  it('excludes the edited payment from the paid total when validating', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    existingPayment(5, 100, 0);

    // رفع الدفعة إلى كامل الاستحقاق مسموح: لا توجد دفعات أخرى تُزاحمها.
    const updated = await entitlementsService.updatePayment(1, 5, { ...editBase, amount: ENTITLEMENT }, req);
    expect(updated.amount).toBe(ENTITLEMENT);

    const where = p.employeeEntitlementLedger.aggregate.mock.calls[0][0].where;
    expect(where.id).toEqual({ not: 5 });
  });

  it('validates against entitlement minus the OTHER payments when several exist', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    existingPayment(5, 100, 50); // دفعة أخرى بقيمة 50 قائمة

    const available = Math.round((ENTITLEMENT - 50) * 1000) / 1000;

    // ما دون المتاح مقبول…
    const ok = await entitlementsService.updatePayment(1, 5, { ...editBase, amount: available }, req);
    expect(ok.amount).toBe(available);

    // …وأول فلس فوقه مرفوض بلا قصّ.
    existingPayment(5, 100, 50);
    await expect(
      entitlementsService.updatePayment(1, 5, { ...editBase, amount: Math.round((available + 0.001) * 1000) / 1000 }, req),
    ).rejects.toThrow(/يتجاوز المتبقي/);
  });

  it('rejects a zero or negative edited amount', async () => {
    for (const amount of [0, -25]) {
      setupReads({ employee: SAMPLE_EMPLOYEE });
      wireTransaction();
      existingPayment(5, 100, 0);
      await expect(entitlementsService.updatePayment(1, 5, { ...editBase, amount }, req)).rejects.toThrow(/أكبر من صفر/);
      expect(p.employeeEntitlementLedger.update).not.toHaveBeenCalled();
    }
  });

  it('rejects an edited future payment date', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    existingPayment(5, 100, 0);
    const future = new Date(Date.now() + 7 * 86_400_000);
    await expect(
      entitlementsService.updatePayment(1, 5, { ...editBase, paymentDate: future, amount: 50 }, req),
    ).rejects.toThrow(/مستقبلي/);
    expect(p.employeeEntitlementLedger.update).not.toHaveBeenCalled();
  });

  it('refuses to edit a payment that belongs to another employee', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    existingPayment(5, 100, 0, null); // الاستعلام مقيَّد بالموظف ⇒ لا نتيجة

    await expect(entitlementsService.updatePayment(1, 5, { ...editBase, amount: 50 }, req)).rejects.toThrow(/غير موجودة/);
    expect(p.employeeEntitlementLedger.update).not.toHaveBeenCalled();
    // الحارس مقيَّد بالطرفين معًا — لا كشف عن سجلات موظف آخر.
    expect(p.employeeEntitlementLedger.findFirst.mock.calls[0][0].where).toEqual({ id: 5, employeeId: 1 });
  });

  it('deletes a payment and returns the balance to the full entitlement', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    existingPayment(5, 80, 0);

    const res = await entitlementsService.deletePayment(1, 5, req);
    expect(res).toEqual({ id: 5 });
    expect(p.employeeEntitlementLedger.delete).toHaveBeenCalledWith({ where: { id: 5 } });

    setupReads({ employee: SAMPLE_EMPLOYEE, payments: [] });
    const st = await entitlementsService.getStatement(1, PAY_DATE);
    expect(st.payments.entries).toHaveLength(0);
    expect(st.balances.totalPaid).toBe(0);
    expect(st.balances.totalRemaining).toBe(ENTITLEMENT); // 305.365
  });

  it('refuses to delete a payment that belongs to another employee', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    existingPayment(5, 80, 0, null);

    await expect(entitlementsService.deletePayment(1, 5, req)).rejects.toThrow(/غير موجودة/);
    expect(p.employeeEntitlementLedger.delete).not.toHaveBeenCalled();
  });

  it('leaves leave days, payroll, accounting and the EOS estimate untouched', async () => {
    setupReads({ employee: SAMPLE_EMPLOYEE });
    const before = await entitlementsService.getStatement(1, PAY_DATE);

    setupReads({ employee: SAMPLE_EMPLOYEE });
    wireTransaction();
    existingPayment(5, 100, 0);
    await entitlementsService.updatePayment(1, 5, { ...editBase, amount: 80 }, req);

    setupReads({ employee: SAMPLE_EMPLOYEE });
    existingPayment(5, 80, 0);
    await entitlementsService.deletePayment(1, 5, req);

    setupReads({ employee: SAMPLE_EMPLOYEE });
    const after = await entitlementsService.getStatement(1, PAY_DATE);

    // رصيد الأيام والاستحقاق والتقدير — بلا تغيير: التصحيح مالي بحت داخل سجل الدفعات.
    expect(after.result.remainingLeaveDays).toBe(before.result.remainingLeaveDays);
    expect(after.result.usedLeaveDays).toBe(before.result.usedLeaveDays);
    expect(after.estimatedEndOfService).toEqual(before.estimatedEndOfService);
    expect(after.balances.endOfService.payable).toBe(false);

    // العميل المموَّه لا يعرف payroll/journalEntry/salaryPayment أصلًا: أي مساس بها كان
    // سيرمي TypeError ويُسقط الاختبار.
    const clients = Object.keys(prisma as unknown as Record<string, unknown>);
    expect(clients).not.toContain('payroll');
    expect(clients).not.toContain('journalEntry');
    expect(clients).not.toContain('salaryPayment');
    // ولم تُلمس سجلات الإجازة إلا قراءةً.
    expect(Object.keys(p.leave)).toEqual(['findMany']);
  });
});


describe('recordPayment — validation is server-side and never clamps', () => {
  const base = { category: 'LEAVE_ALLOWANCE' as const, paymentMethod: 'CASH' as const, paymentDate: new Date('2025-12-01T00:00:00Z') };

  it('rejects a zero amount', async () => {
    setupReads();
    wireTransaction();
    await expect(entitlementsService.recordPayment(1, { ...base, amount: 0 }, req)).rejects.toThrow(/أكبر من صفر/);
    expect(p.employeeEntitlementLedger.create).not.toHaveBeenCalled();
  });

  it('rejects a negative amount', async () => {
    setupReads();
    wireTransaction();
    await expect(entitlementsService.recordPayment(1, { ...base, amount: -50 }, req)).rejects.toThrow(/أكبر من صفر/);
    expect(p.employeeEntitlementLedger.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid payment date', async () => {
    setupReads();
    wireTransaction();
    await expect(
      entitlementsService.recordPayment(1, { ...base, paymentDate: new Date('nope'), amount: 10 }, req),
    ).rejects.toThrow(/تاريخ الدفعة/);
  });

  it('rejects a future payment date', async () => {
    setupReads();
    wireTransaction();
    const future = new Date(Date.now() + 7 * 86_400_000);
    await expect(entitlementsService.recordPayment(1, { ...base, paymentDate: future, amount: 10 }, req)).rejects.toThrow(
      /مستقبلي/,
    );
  });

  it('rejects an unknown employee', async () => {
    setupReads({ employee: null });
    wireTransaction();
    await expect(entitlementsService.recordPayment(1, { ...base, amount: 10 }, req)).rejects.toThrow(/غير موجود/);
  });

  it('rejects an unsupported entitlement category (no calculated basis)', async () => {
    setupReads();
    wireTransaction();
    await expect(
      entitlementsService.recordPayment(1, { ...base, category: 'OTHER' as 'LEAVE_ALLOWANCE', amount: 10 }, req),
    ).rejects.toThrow(/غير مدعوم/);
    expect(p.employeeEntitlementLedger.create).not.toHaveBeenCalled();
  });

it('rejects an end-of-service payment for EVERY employee status — status is not settlement approval', async () => {
    for (const status of ['ACTIVE', 'TERMINATED', 'ON_LEAVE', 'RESIGNED']) {
      setupReads({ employee: { status } });
      wireTransaction();
      await expect(
        entitlementsService.recordPayment(1, { ...base, category: 'END_OF_SERVICE' as 'LEAVE_ALLOWANCE', amount: 10 }, req),
      ).rejects.toThrow(/تقديرية|التسوية النهائية/);
      expect(p.employeeEntitlementLedger.create).not.toHaveBeenCalled();
    }
  });

  it('rejects an overpayment outright instead of clamping it to the remaining balance', async () => {
    setupReads({ payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 1000 }] });
    wireTransaction();
    await expect(entitlementsService.recordPayment(1, { ...base, amount: 999_999 }, req)).rejects.toThrow(/يتجاوز المتبقي/);
    expect(p.employeeEntitlementLedger.create).not.toHaveBeenCalled();
  });

  it('accepts a payment within the remaining balance', async () => {
    setupReads({ payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 1000 }] });
    wireTransaction();
    const entry = await entitlementsService.recordPayment(1, { ...base, amount: 250, reference: ' REF-1 ' }, req);

    expect(entry.amount).toBe(250);
    expect(entry.entryType).toBe('LEAVE_ALLOWANCE');
    expect(entry.description).toBe('REF-1');
  });
});

describe('recordPayment — module boundary is respected', () => {
  const base = { category: 'LEAVE_ALLOWANCE' as const, paymentMethod: 'CASH' as const, paymentDate: new Date('2025-12-01T00:00:00Z'), amount: 100 };

  it('does not convert the amount into leave days nor consume any leave record', async () => {
    setupReads();
    wireTransaction();
    await entitlementsService.recordPayment(1, base, req);

    const created = p.employeeEntitlementLedger.create.mock.calls[0][0].data;
    expect(created.leaveDays).toBeNull(); // لا تحويل للمبلغ إلى أيام
    // سجلات الإجازة تُقرأ للاحتساب فقط — لا كتابة ولا تعديل عليها.
    expect(Object.keys(p.leave)).toEqual(['findMany']);
  });

  it('writes only to the entitlement ledger — no payroll, salary payment, or journal entry', async () => {
    setupReads();
    wireTransaction();
    await entitlementsService.recordPayment(1, base, req);

    // العميل المموَّه لا يحتوي أصلًا payroll/salaryPayment/journalEntry: أي محاولة مساس بها
    // كانت سترمي TypeError وتُسقط الاختبار.
    expect(p.employeeEntitlementLedger.create).toHaveBeenCalledTimes(1);
    const writes = Object.keys(prisma as unknown as Record<string, unknown>);
    expect(writes).not.toContain('payroll');
    expect(writes).not.toContain('journalEntry');
  });

  it('captures the leave-balance snapshot as a frozen historical fact only', async () => {
    setupReads();
    wireTransaction();
    await entitlementsService.recordPayment(1, base, req);

    const created = p.employeeEntitlementLedger.create.mock.calls[0][0].data;
    expect(typeof created.leaveBalanceSnapshot).toBe('number');
    expect(created.createdBy).toBe(7);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   بيانات **طلب** الإجازة لا تدخل أي احتساب
   (Employee Leave — Full Leave Request Data Capture v1)

   أضافت تلك الحزمة عمودًا واحدًا (`expectedReturnDate`) إلى جدول الإجازات، وأتاحت
   قراءة `reason` معه في نموذج القراءة. كلاهما بيانات مستند مطبوع. هذه الاختبارات
   تثبت أنهما لا يمسّان محرّك الاستحقاقات: نفس المُدخَلات القانونية (النوع، التاريخان،
   الحالة) تُنتج نفس الأرقام سواء حمل السجل هذين الحقلين أم لا.
   ════════════════════════════════════════════════════════════════════════════ */
describe('بيانات طلب الإجازة (السبب / تاريخ العودة) لا تغيّر أي احتساب', () => {
  /** إجازة سنوية معتمدة من خمسة أيام — المُدخَل الوحيد الذي يقرؤه المحرّك. */
  const APPROVED_ANNUAL = { startDate: new Date('2025-03-01T00:00:00Z'), endDate: new Date('2025-03-05T00:00:00Z') };

  async function computeWith(leaveRows: Record<string, unknown>[]) {
    setupReads();
    // المحرّك يقرأ الإجازات مرتين (سنوية ثم مرضية) قبل قراءة سجل العرض.
    p.leave.findMany.mockResolvedValue(leaveRows);
    return entitlementsService.getStatement(1, ASOF);
  }

  it('نفس الأرقام بالضبط مع الحقلين وبدونهما', async () => {
    const withoutRequestData = await computeWith([{ ...APPROVED_ANNUAL }]);
    const withRequestData = await computeWith([
      { ...APPROVED_ANNUAL, reason: 'ظرف عائلي', expectedReturnDate: new Date('2025-03-06T00:00:00Z') },
    ]);

    expect(withRequestData.result).toEqual(withoutRequestData.result);
    expect(withRequestData.leaveExclusionBreakdown).toEqual(withoutRequestData.leaveExclusionBreakdown);
    expect(withRequestData.balances).toEqual(withoutRequestData.balances);
  });

  it('قراءتا الاحتساب تنتقيان التاريخين وحدهما — والثالثة وحدها للعرض', async () => {
    await computeWith([{ ...APPROVED_ANNUAL }]);

    // (1) السنوية للاحتساب (2) المرضية للاستثناء (3) السجل الكامل للعرض والطباعة.
    expect(p.leave.findMany).toHaveBeenCalledTimes(3);
    for (const call of p.leave.findMany.mock.calls.slice(0, 2)) {
      expect(call[0].select).toEqual({ startDate: true, endDate: true });
    }
    const displaySelect = p.leave.findMany.mock.calls[2][0].select;
    expect(displaySelect).toHaveProperty('reason', true);
    expect(displaySelect).toHaveProperty('expectedReturnDate', true);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   رصيد الإجازة القانوني — الاستهلاك المقصوص عند تاريخ الاحتساب
   (Legal Leave Balance & Payments Reconciliation Pack v1)

   العقد: يُخصم من الرصيد **فقط** ما اجتمعت فيه الشروط الثلاثة — إجازة سنوية،
   معتمدة، وواقعة فعلًا حتى `asOf`. وما عدا ذلك سجلّ إداري بلا أثر حسابي.
   ════════════════════════════════════════════════════════════════════════════ */
const D = (s: string) => new Date(s + 'T00:00:00Z');

/** إجازة سنوية معتمدة من عشرة أيام، منتهية قبل تاريخ الاحتساب القياسي. */
const PAST_ANNUAL = {
  id: 1, type: 'ANNUAL', status: 'APPROVED', days: 10,
  startDate: D('2025-03-01'), endDate: D('2025-03-10'),
};

/** يوجّه قراءتَي الاحتساب (السنوية ثم المرضية) وقراءة العرض، بهذا الترتيب. */
async function leaveStatement(opts: {
  annual?: Record<string, unknown>[];
  sick?: Record<string, unknown>[];
  holidays?: Date[];
  asOf?: Date;
  payments?: { entryType: string; amount: number }[];
} = {}) {
  setupReads({ payments: opts.payments });
  p.holiday.findMany.mockResolvedValue((opts.holidays ?? []).map((date) => ({ date })));
  const annual = opts.annual ?? [];
  p.leave.findMany
    .mockResolvedValueOnce(annual)
    .mockResolvedValueOnce(opts.sick ?? [])
    .mockResolvedValueOnce(annual);
  return entitlementsService.getStatement(1, opts.asOf ?? ASOF);
}

describe('الأيام السنوية المستهلكة — الشروط الثلاثة', () => {
  it('١. بلا أي إجازة: المستهلك صفر والرصيد = المستحق كاملًا', async () => {
    const st = await leaveStatement();
    expect(st.result.usedLeaveDays).toBe(0);
    expect(st.result.remainingLeaveDays).toBe(st.result.accruedLeaveDays);
    expect(st.result.overusedLeaveDays).toBe(0);
  });

  it('٢. إجازة مستقبلية معتمدة لا تُخصم — القيد في الاستعلام نفسه', async () => {
    const st = await leaveStatement({ annual: [] });
    expect(st.result.usedLeaveDays).toBe(0);

    const where = p.leave.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ type: 'ANNUAL', status: 'APPROVED' });
    expect(where.startDate).toHaveProperty('lte', ASOF); // القيد الحاسم
  });

  it('٣. في منتصف الإجازة يُخصم الجزء المنقضي فقط', async () => {
    // 20/12/2025 → 20/01/2026 وتاريخ الاحتساب 01/01/2026 ⇒ 13 يومًا منقضية.
    const st = await leaveStatement({
      annual: [{ ...PAST_ANNUAL, startDate: D('2025-12-20'), endDate: D('2026-01-20') }],
    });
    expect(st.result.usedLeaveDays).toBe(13);
    expect(st.leaveExclusionBreakdown.grossAnnualLeaveDays).toBe(13);
  });

  it('٤. بعد انتهائها تُخصم كامل أيامها القانونية', async () => {
    const st = await leaveStatement({ annual: [PAST_ANNUAL] });
    expect(st.result.usedLeaveDays).toBe(10);
    expect(st.result.remainingLeaveDays).toBe(Math.round((st.result.accruedLeaveDays! - 10) * 100) / 100);
  });

  it('٥ و٦ و٧. الاستعلام يحصر الخصم في ANNUAL + APPROVED وحدهما', async () => {
    const st = await leaveStatement({ annual: [] });
    expect(st.result.usedLeaveDays).toBe(0);
    // المعلّقة والمرفوضة والمرضية وبدون راتب والطارئة كلها خارج قراءة الخصم.
    expect(p.leave.findMany.mock.calls[0][0].where).toMatchObject({ type: 'ANNUAL', status: 'APPROVED' });
    // القراءة الثانية تطلب SICK لغرض **الاستثناء** لا الخصم.
    expect(p.leave.findMany.mock.calls[1][0].where).toMatchObject({ type: 'SICK', status: 'APPROVED' });
  });

  it('٨. العطلات الرسمية والمرضية داخل الإجازة تُستثنى (المادة 70)', async () => {
    const st = await leaveStatement({
      annual: [PAST_ANNUAL], // 01/03 → 10/03 = 10 أيام
      holidays: [D('2025-03-03'), D('2025-03-04')],
      sick: [{ startDate: D('2025-03-06'), endDate: D('2025-03-06') }],
    });
    expect(st.leaveExclusionBreakdown).toMatchObject({
      grossAnnualLeaveDays: 10, holidaysExcludedDays: 2, sickExcludedDays: 1, netUsedLeaveDays: 7,
    });
    expect(st.result.usedLeaveDays).toBe(7);
  });

  it('٩ و١٠. التجاوز يُسمّى صراحةً ولا يُصفَّر الرصيد بلا تفسير', async () => {
    const accrued = (await leaveStatement()).result.accruedLeaveDays!;
    const st = await leaveStatement({
      annual: [{ ...PAST_ANNUAL, startDate: D('2020-06-01'), endDate: D('2021-06-01') }],
    });

    expect(st.leaveExclusionBreakdown.netUsedLeaveDays).toBe(st.result.usedLeaveDays);
    expect(st.result.usedLeaveDays).toBeGreaterThan(accrued);
    expect(st.result.remainingLeaveDays).toBe(0);
    expect(st.result.overusedLeaveDays).toBe(Math.round((st.result.usedLeaveDays - accrued) * 100) / 100);
    expect(st.result.leaveAllowanceValue).toBe(0); // لا قيمة سالبة
  });

  it('عدة إجازات تُجمَع، وكلٌّ منها مقصوصة عند تاريخ الاحتساب', async () => {
    const st = await leaveStatement({
      annual: [
        { ...PAST_ANNUAL, startDate: D('2025-03-01'), endDate: D('2025-03-10') },          // 10
        { ...PAST_ANNUAL, id: 2, startDate: D('2025-06-01'), endDate: D('2025-06-05') },   // 5
        { ...PAST_ANNUAL, id: 3, startDate: D('2025-12-28'), endDate: D('2026-01-05') },   // 5 حتى asOf
      ],
    });
    expect(st.result.usedLeaveDays).toBe(20);
  });

  it('١٥. حتمية: نفس البيانات ونفس asOf ⇒ نفس النتيجة', async () => {
    const a = await leaveStatement({ annual: [PAST_ANNUAL] });
    const b = await leaveStatement({ annual: [PAST_ANNUAL] });
    expect(b.result).toEqual(a.result);
    expect(b.leaveExclusionBreakdown).toEqual(a.leaveExclusionBreakdown);
  });

  it('١٢. الاحتساب صحيح لأي asOf — قبل الإجازة وأثناءها وبعدها', async () => {
    const before = await leaveStatement({ annual: [], asOf: D('2025-02-01') });
    const during = await leaveStatement({ annual: [PAST_ANNUAL], asOf: D('2025-03-05') });
    const after = await leaveStatement({ annual: [PAST_ANNUAL], asOf: D('2025-06-01') });

    expect(before.result.usedLeaveDays).toBe(0);
    expect(during.result.usedLeaveDays).toBe(5); // 01→05 مارس
    expect(after.result.usedLeaveDays).toBe(10);
  });
});

describe('التسوية المالية — الأيام شيء والدفعات شيء آخر', () => {
  it('١١. الدفع لا يغيّر عدد الأيام ولا قيمة الاستحقاق', async () => {
    const unpaid = await leaveStatement({ annual: [PAST_ANNUAL] });
    const paid = await leaveStatement({
      annual: [PAST_ANNUAL], payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 500 }],
    });

    expect(paid.result.usedLeaveDays).toBe(unpaid.result.usedLeaveDays);
    expect(paid.result.remainingLeaveDays).toBe(unpaid.result.remainingLeaveDays);
    expect(paid.result.leaveAllowanceDays).toBe(unpaid.result.leaveAllowanceDays);
    expect(paid.balances.leaveAllowance.entitlement).toBe(unpaid.balances.leaveAllowance.entitlement);
  });

  it('١٢. دفعة بدل الإجازة وحدها تخفض الصافي المالي', async () => {
    const st = await leaveStatement({
      annual: [PAST_ANNUAL], payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 500 }],
    });
    const gross = st.balances.leaveAllowance.entitlement!;
    expect(st.balances.leaveAllowance.paid).toBe(500);
    expect(st.balances.leaveAllowance.remaining).toBe(Math.round((gross - 500) * 1000) / 1000);
  });

  it('دفعة نهاية الخدمة لا تُخصم من قيمة رصيد الإجازة', async () => {
    const st = await leaveStatement({
      annual: [PAST_ANNUAL], payments: [{ entryType: 'END_OF_SERVICE', amount: 900 }],
    });
    expect(st.balances.leaveAllowance.paid).toBe(0);
    expect(st.balances.leaveAllowance.remaining).toBe(st.balances.leaveAllowance.entitlement);
  });

  it('١٣. بلا دفعات: الصافي المالي = القيمة الإجمالية', async () => {
    const st = await leaveStatement({ annual: [PAST_ANNUAL] });
    expect(st.balances.leaveAllowance.paid).toBe(0);
    expect(st.balances.leaveAllowance.remaining).toBe(st.balances.leaveAllowance.entitlement);
  });

  it('الأربعة معًا متاحة للمستخدم: أيام · أجر يومي · قيمة · مدفوع · صافٍ', async () => {
    const st = await leaveStatement({
      annual: [PAST_ANNUAL], payments: [{ entryType: 'LEAVE_ALLOWANCE', amount: 200 }],
    });
    expect(st.result.remainingLeaveDays).toBeGreaterThan(0);
    expect(st.result.dailyWage).toBeGreaterThan(0);
    expect(st.balances.leaveAllowance.entitlement).toBeGreaterThan(0);
    expect(st.balances.leaveAllowance.paid).toBe(200);
    expect(st.balances.leaveAllowance.remaining).toBeGreaterThan(0);
  });
});

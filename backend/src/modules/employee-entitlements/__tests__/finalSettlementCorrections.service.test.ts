import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    leave: { findMany: vi.fn() },
    holiday: { findMany: vi.fn() },
    employeeEntitlementLedger: { findMany: vi.fn(), groupBy: vi.fn(), aggregate: vi.fn() },
    employeeFinalSettlement: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    finalSettlementPayment: { findFirst: vi.fn(), aggregate: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';
import { finalSettlementService } from '../finalSettlement.service';
import type { Request } from 'express';

/**
 * حزمة التصحيح والإلغاء — تصحيح الخطأ البشري بعد الاعتماد أو بعد تسجيل الدفعات.
 *
 * الفكرتان المحوريتان: (١) حالة التصفية **مشتقّة** من الإجمالي المجمَّد ومجموع الدفعات
 * الحالية، فتصحيح دفعة يعيد فتح تصفية مسدَّدة تلقائيًا؛ (٢) الإلغاء حالة نهائية تحفظ كل
 * شيء (اللقطة والدفعات) ولا تحذف شيئًا، وتفتح الباب لتصفية جديدة دون المساس بالتاريخ.
 */

const p = prisma as unknown as {
  employee: { findUnique: ReturnType<typeof vi.fn> };
  leave: { findMany: ReturnType<typeof vi.fn> };
  holiday: { findMany: ReturnType<typeof vi.fn> };
  employeeEntitlementLedger: { findMany: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
  employeeFinalSettlement: {
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  finalSettlementPayment: {
    findFirst: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const req = { user: { userId: 7 } } as unknown as Request;
const EMPLOYEE = { id: 1, code: 'E-001', fullName: 'موظف تجريبي', salary: 520, hireDate: new Date('2014-01-01T00:00:00.000Z'), status: 'ACTIVE' };
const APPROVED_AT = new Date('2026-07-20T09:00:00.000Z');
const PAY_DATE = new Date('2026-07-29T00:00:00.000Z');
const TOTAL = 1300;

/** صفّ تصفية معتمدة/مسدَّدة بإجمالي مجمَّد 1,300.000. */
function settlement(status: string, payments: { id: number; amount: number }[] = []) {
  return {
    id: 9,
    employeeId: 1,
    status,
    lastWorkingDay: PAY_DATE,
    terminationReason: 'EMPLOYER_TERMINATION',
    approvedAt: APPROVED_AT,
    approvedBy: 7,
    cancelledAt: null,
    cancelledBy: null,
    cancellationReason: null,
    createdAt: APPROVED_AT,
    snapshotHireDate: EMPLOYEE.hireDate,
    snapshotSalaryUsed: 520,
    snapshotDailyWage: 20,
    snapshotWageDivisor: 26,
    snapshotServiceYears: 12,
    snapshotServiceMonths: 6,
    snapshotServiceDays: 28,
    snapshotServiceTotalDays: 4593,
    snapshotLeaveDays: 15,
    snapshotLeaveValue: 400,
    snapshotPriorLeavePaid: 100,
    snapshotLeaveRemaining: 300,
    snapshotEosScenario: 'EMPLOYER_TERMINATION',
    snapshotEosFullAmount: 1000,
    snapshotEosFraction: 1,
    snapshotEosAmount: 1000,
    snapshotTotalAmount: TOTAL,
    payments: payments.map((x) => ({
      ...x,
      settlementId: 9,
      paymentDate: PAY_DATE,
      paymentMethod: 'CASH',
      reference: null,
      notes: null,
      createdAt: PAY_DATE,
    })),
  };
}

/** يهيّئ تصفية نشطة + مجموع الدفعات الذي سيقرأه الحارس/مزامنة الحالة. */
function setup(status: string, payments: { id: number; amount: number }[] = [], othersSum?: number) {
  p.employeeFinalSettlement.findFirst.mockResolvedValue(settlement(status, payments));
  const total = payments.reduce((s, x) => s + x.amount, 0);
  // aggregate يُستدعى مرتين: حارس التجاوز (يستبعد الدفعة المحرَّرة) ثم مزامنة الحالة.
  p.finalSettlementPayment.aggregate
    .mockResolvedValueOnce({ _sum: { amount: (othersSum ?? total) || null } })
    .mockResolvedValue({ _sum: { amount: total || null } });
  p.finalSettlementPayment.findFirst.mockResolvedValue(
    payments.length ? { ...settlement(status, payments).payments[0] } : null,
  );
  p.finalSettlementPayment.update.mockImplementation(async (a: { where: { id: number }; data: Record<string, unknown> }) => ({ id: a.where.id, ...a.data }));
  p.finalSettlementPayment.delete.mockResolvedValue({ id: payments[0]?.id ?? 0 });
  p.employeeFinalSettlement.update.mockResolvedValue({});
  p.employeeFinalSettlement.findMany.mockResolvedValue([]);
  p.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));
}

/** الحالة التي كُتبت في آخر استدعاء لمزامنة الحالة. */
function lastStatusWrite(): string | undefined {
  const calls = p.employeeFinalSettlement.update.mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    if (calls[i][0].data?.status) return calls[i][0].data.status;
  }
  return undefined;
}

// resetAllMocks (لا clearAllMocks): بعض الاختبارات ترفض قبل استهلاك قيمة
// mockResolvedValueOnce المُجهَّزة، فتتسرّب إلى الاختبار التالي وتفسد ترتيب الاستدعاءات.
beforeEach(() => vi.resetAllMocks());

describe('settlement payment — edit', () => {
  const base = { paymentDate: PAY_DATE, paymentMethod: 'CASH' as const };

  it('edits a payment amount and leaves the frozen snapshot untouched', async () => {
    setup('PAID', [{ id: 50, amount: TOTAL }], 0);
    await finalSettlementService.updatePayment(1, 50, { ...base, amount: 1000 }, req);

    expect(p.finalSettlementPayment.update.mock.calls[0][0].data.amount).toBe(1000);
    // لا كتابة على أي حقل لقطة — التحديث الوحيد على التصفية هو الحالة.
    for (const call of p.employeeFinalSettlement.update.mock.calls) {
      expect(Object.keys(call[0].data)).toEqual(['status']);
    }
  });

  it('excludes the edited payment itself when computing what is available', async () => {
    setup('PAID', [{ id: 50, amount: TOTAL }], 0);
    await finalSettlementService.updatePayment(1, 50, { ...base, amount: TOTAL }, req);

    // الحارس استبعد الدفعة المحرَّرة، وإلا لصادمت نفسها ورُفضت.
    expect(p.finalSettlementPayment.aggregate.mock.calls[0][0].where).toEqual({ settlementId: 9, id: { not: 50 } });
  });

  it('validates against the approved total minus the OTHER payments', async () => {
    setup('APPROVED', [{ id: 50, amount: 400 }, { id: 51, amount: 300 }], 300);
    // المتاح = 1300 − 300 (الدفعة الأخرى) = 1000 ⇒ 1000 مقبولة.
    await finalSettlementService.updatePayment(1, 50, { ...base, amount: 1000 }, req);
    expect(p.finalSettlementPayment.update).toHaveBeenCalled();

    setup('APPROVED', [{ id: 50, amount: 400 }, { id: 51, amount: 300 }], 300);
    await expect(finalSettlementService.updatePayment(1, 50, { ...base, amount: 1000.001 }, req)).rejects.toThrow(/يتجاوز المتبقي/);
  });

  it('rejects zero, negative, future and pre-approval dates', async () => {
    for (const amount of [0, -5]) {
      setup('APPROVED', [{ id: 50, amount: 400 }], 0);
      await expect(finalSettlementService.updatePayment(1, 50, { ...base, amount }, req)).rejects.toThrow(/أكبر من صفر/);
    }
    setup('APPROVED', [{ id: 50, amount: 400 }], 0);
    await expect(
      finalSettlementService.updatePayment(1, 50, { ...base, paymentDate: new Date(Date.now() + 7 * 86_400_000), amount: 10 }, req),
    ).rejects.toThrow(/مستقبلي/);

    setup('APPROVED', [{ id: 50, amount: 400 }], 0);
    await expect(
      finalSettlementService.updatePayment(1, 50, { ...base, paymentDate: new Date('2026-07-19T00:00:00.000Z'), amount: 10 }, req),
    ).rejects.toThrow(/سابق لاعتماد التصفية/);

    expect(p.finalSettlementPayment.update).not.toHaveBeenCalled();
  });

  it('refuses a payment that belongs to another settlement', async () => {
    setup('APPROVED', [{ id: 50, amount: 400 }], 0);
    p.finalSettlementPayment.findFirst.mockResolvedValue(null); // الاستعلام مقيَّد بالتصفية

    await expect(finalSettlementService.updatePayment(1, 999, { ...base, amount: 10 }, req)).rejects.toThrow(/غير موجودة/);
    expect(p.finalSettlementPayment.findFirst.mock.calls[0][0].where).toEqual({ id: 999, settlementId: 9 });
    expect(p.finalSettlementPayment.update).not.toHaveBeenCalled();
  });

  it('refuses edits on a DRAFT settlement', async () => {
    setup('DRAFT');
    await expect(finalSettlementService.updatePayment(1, 50, { ...base, amount: 10 }, req)).rejects.toThrow(/مسودة/);
  });
});

describe('settlement lifecycle — derived from payments after every correction', () => {
  const base = { paymentDate: PAY_DATE, paymentMethod: 'CASH' as const };

  it('PAID → lowering a payment reopens the settlement as APPROVED', async () => {
    // بعد التعديل يصبح المجموع 1000 من أصل 1300 ⇒ يظهر متبقٍّ ⇒ الحالة تعود «معتمدة».
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlement('PAID', [{ id: 50, amount: TOTAL }]));
    p.finalSettlementPayment.findFirst.mockResolvedValue({ id: 50, settlementId: 9, amount: TOTAL, paymentDate: PAY_DATE, paymentMethod: 'CASH' });
    p.finalSettlementPayment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } }) // باقي الدفعات = 0
      .mockResolvedValue({ _sum: { amount: 1000 } }); // بعد التعديل
    p.finalSettlementPayment.update.mockResolvedValue({ id: 50, amount: 1000, paymentDate: PAY_DATE });
    p.employeeFinalSettlement.update.mockResolvedValue({});
    p.employeeFinalSettlement.findMany.mockResolvedValue([]);
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    await finalSettlementService.updatePayment(1, 50, { ...base, amount: 1000 }, req);
    expect(lastStatusWrite()).toBe('APPROVED');
  });

  it('APPROVED → raising a payment to cover the total marks it PAID', async () => {
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlement('APPROVED', [{ id: 50, amount: 1000 }]));
    p.finalSettlementPayment.findFirst.mockResolvedValue({ id: 50, settlementId: 9, amount: 1000, paymentDate: PAY_DATE, paymentMethod: 'CASH' });
    p.finalSettlementPayment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: null } })
      .mockResolvedValue({ _sum: { amount: TOTAL } });
    p.finalSettlementPayment.update.mockResolvedValue({ id: 50, amount: TOTAL, paymentDate: PAY_DATE });
    p.employeeFinalSettlement.update.mockResolvedValue({});
    p.employeeFinalSettlement.findMany.mockResolvedValue([]);
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    await finalSettlementService.updatePayment(1, 50, { ...base, amount: TOTAL }, req);
    expect(lastStatusWrite()).toBe('PAID');
  });

  it('PAID → deleting a payment reopens it as APPROVED with the correct remaining', async () => {
    p.employeeFinalSettlement.findFirst.mockResolvedValue(
      settlement('PAID', [{ id: 50, amount: 1000 }, { id: 51, amount: 300 }]),
    );
    p.finalSettlementPayment.findFirst.mockResolvedValue({ id: 51, settlementId: 9, amount: 300, paymentDate: PAY_DATE, paymentMethod: 'CASH' });
    p.finalSettlementPayment.delete.mockResolvedValue({ id: 51 });
    p.finalSettlementPayment.aggregate.mockResolvedValue({ _sum: { amount: 1000 } }); // بعد الحذف
    p.employeeFinalSettlement.update.mockResolvedValue({});
    p.employeeFinalSettlement.findMany.mockResolvedValue([]);
    p.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma));

    await finalSettlementService.deletePayment(1, 51, req);

    expect(p.finalSettlementPayment.delete).toHaveBeenCalledWith({ where: { id: 51 } });
    expect(lastStatusWrite()).toBe('APPROVED');
  });

  it('derives paid and remaining from the surviving payment rows', async () => {
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlement('APPROVED', [{ id: 50, amount: 1000 }]));
    p.employeeFinalSettlement.findMany.mockResolvedValue([]);
    const s = await finalSettlementService.getSettlement(1);

    expect(s!.paid).toBe(1000);
    expect(s!.remaining).toBe(300);
    expect(s!.computation.totalAmount).toBe(TOTAL);
  });
});

describe('settlement cancellation', () => {
  const cancelInput = { cancellationReason: 'خطأ في تاريخ آخر يوم عمل' };

  it('cancels an APPROVED settlement without deleting anything', async () => {
    setup('APPROVED', [{ id: 50, amount: 400 }]);
    await finalSettlementService.cancel(1, cancelInput, req);

    const data = p.employeeFinalSettlement.update.mock.calls[0][0].data;
    expect(data.status).toBe('CANCELLED');
    expect(data.cancelledAt).toBeInstanceOf(Date);
    expect(data.cancelledBy).toBe(7);
    expect(data.cancellationReason).toBe(cancelInput.cancellationReason);
    // لا حذف للسجل ولا للدفعات، ولا مساس بأي حقل لقطة.
    expect(p.employeeFinalSettlement.delete).not.toHaveBeenCalled();
    expect(p.finalSettlementPayment.delete).not.toHaveBeenCalled();
    expect(Object.keys(data).sort()).toEqual(['cancellationReason', 'cancelledAt', 'cancelledBy', 'status']);
  });

  it('cancels a PAID settlement too', async () => {
    setup('PAID', [{ id: 50, amount: TOTAL }]);
    await finalSettlementService.cancel(1, cancelInput, req);
    expect(p.employeeFinalSettlement.update.mock.calls[0][0].data.status).toBe('CANCELLED');
  });

  it('requires a non-empty cancellation reason', async () => {
    setup('APPROVED');
    await expect(finalSettlementService.cancel(1, { cancellationReason: '   ' }, req)).rejects.toThrow(/سبب الإلغاء/);
    expect(p.employeeFinalSettlement.update).not.toHaveBeenCalled();
  });

  it('refuses to cancel a DRAFT — drafts have their own edit/delete workflow', async () => {
    setup('DRAFT');
    await expect(finalSettlementService.cancel(1, cancelInput, req)).rejects.toThrow(/مسودة/);
  });

  it('keeps a cancelled settlement out of the active slot but readable as history', async () => {
    // لا تصفية نشطة بعد الإلغاء…
    p.employeeFinalSettlement.findFirst.mockResolvedValue(null);
    p.employeeFinalSettlement.findMany.mockResolvedValue([settlement('CANCELLED', [{ id: 50, amount: 400 }])]);

    expect(await finalSettlementService.getSettlement(1)).toBeNull();

    // …لكنها محفوظة كاملةً في التاريخ، بلقطتها ودفعاتها.
    const history = await finalSettlementService.listCancelled(1);
    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('CANCELLED');
    expect(history[0].computation.totalAmount).toBe(TOTAL);
    expect(history[0].payments).toHaveLength(1);
    expect(history[0].paid).toBe(400);
    // لا «متبقٍّ للدفع» لتصفية ملغاة.
    expect(history[0].remaining).toBeNull();
    expect(p.employeeFinalSettlement.findMany.mock.calls[0][0].where).toEqual({ employeeId: 1, status: 'CANCELLED' });
  });

  it('blocks every operation once cancelled', async () => {
    const base = { paymentDate: PAY_DATE, paymentMethod: 'CASH' as const, amount: 10 };
    for (const op of [
      () => finalSettlementService.recordPayment(1, base, req),
      () => finalSettlementService.updatePayment(1, 50, base, req),
      () => finalSettlementService.deletePayment(1, 50, req),
      () => finalSettlementService.approve(1, req),
      () => finalSettlementService.cancel(1, { cancellationReason: 'مرة أخرى' }, req),
    ]) {
      p.employeeFinalSettlement.findFirst.mockResolvedValue(null); // الملغاة ليست نشطة
      await expect(op()).rejects.toThrow(/لا توجد تصفية نهائية نشطة/);
    }
  });
});

describe('one active settlement + cancelled history', () => {
  function setupEngineReads() {
    p.employee.findUnique.mockResolvedValue(EMPLOYEE);
    p.leave.findMany.mockResolvedValue([]);
    p.holiday.findMany.mockResolvedValue([]);
    p.employeeEntitlementLedger.aggregate.mockResolvedValue({ _sum: { amount: null } });
  }

  it('allows a new draft once the previous settlement is cancelled', async () => {
    setupEngineReads();
    p.employeeFinalSettlement.findFirst
      .mockResolvedValueOnce(null) // لا تصفية نشطة (السابقة ملغاة)
      .mockResolvedValue(settlement('DRAFT'));
    p.employeeFinalSettlement.create.mockResolvedValue(settlement('DRAFT'));
    p.employeeFinalSettlement.findMany.mockResolvedValue([]);

    const s = await finalSettlementService.createDraft(1, { lastWorkingDay: PAY_DATE, terminationReason: 'RESIGNATION' }, req);
    expect(p.employeeFinalSettlement.create).toHaveBeenCalled();
    expect(s!.status).toBe('DRAFT');
    // البحث عن الحاجب يقتصر على الحالات النشطة — الملغاة لا تحجب.
    expect(p.employeeFinalSettlement.findFirst.mock.calls[0][0].where).toEqual({
      employeeId: 1,
      status: { in: ['DRAFT', 'APPROVED', 'PAID'] },
    });
  });

  it('still rejects a second ACTIVE settlement', async () => {
    setupEngineReads();
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlement('APPROVED'));
    await expect(
      finalSettlementService.createDraft(1, { lastWorkingDay: PAY_DATE, terminationReason: 'RESIGNATION' }, req),
    ).rejects.toThrow(/نشطة/);
    expect(p.employeeFinalSettlement.create).not.toHaveBeenCalled();
  });

  it('supports several historical cancelled settlements side by side', async () => {
    p.employeeFinalSettlement.findMany.mockResolvedValue([
      { ...settlement('CANCELLED', [{ id: 1, amount: 100 }]), id: 5 },
      { ...settlement('CANCELLED', []), id: 6 },
    ]);
    const history = await finalSettlementService.listCancelled(1);
    expect(history.map((h) => h.id)).toEqual([5, 6]);
  });

  it('never lets cancelled-settlement payments reduce a new settlement', async () => {
    setupEngineReads();
    // تصفية جديدة نشطة بلا دفعات، بينما التاريخ الملغى يحمل دفعة 400.
    p.employeeFinalSettlement.findFirst.mockResolvedValue(settlement('APPROVED', []));
    p.employeeFinalSettlement.findMany.mockResolvedValue([settlement('CANCELLED', [{ id: 1, amount: 400 }])]);

    const active = await finalSettlementService.getSettlement(1);
    expect(active!.paid).toBe(0);
    expect(active!.remaining).toBe(TOTAL);
    // دفعات التصفية الجديدة تُقرأ من علاقتها وحدها — لا تجميع عابر للتصفيات.
    expect(active!.payments).toHaveLength(0);
  });
});

describe('draft handling', () => {
  it('hard-deletes a DRAFT only — it has no snapshot and no payments', async () => {
    setup('DRAFT');
    p.employeeFinalSettlement.delete.mockResolvedValue({ id: 9 });

    const res = await finalSettlementService.deleteDraft(1, req);
    expect(res).toBeNull();
    expect(p.employeeFinalSettlement.delete).toHaveBeenCalledWith({ where: { id: 9 } });
  });

  it('refuses to hard-delete an APPROVED or PAID settlement', async () => {
    for (const status of ['APPROVED', 'PAID']) {
      setup(status);
      await expect(finalSettlementService.deleteDraft(1, req)).rejects.toThrow(/حالتها الحالية/);
      expect(p.employeeFinalSettlement.delete).not.toHaveBeenCalled();
    }
  });
});

describe('audit and module boundary', () => {
  const base = { paymentDate: PAY_DATE, paymentMethod: 'CASH' as const };

  it('audits a payment edit with old and new values', async () => {
    setup('APPROVED', [{ id: 50, amount: 400 }], 0);
    await finalSettlementService.updatePayment(1, 50, { ...base, amount: 500 }, req);

    const call = (recordAudit as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(call.action).toBe('UPDATE');
    expect(call.oldValue.amount).toBe(400);
    expect(call.newValue.amount).toBe(500);
  });

  it('audits a payment delete with the deleted details', async () => {
    setup('APPROVED', [{ id: 50, amount: 400 }]);
    await finalSettlementService.deletePayment(1, 50, req);

    const call = (recordAudit as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(call.action).toBe('DELETE');
    expect(call.oldValue).toMatchObject({ amount: 400, paymentMethod: 'CASH' });
  });

  it('audits a cancellation with its reason', async () => {
    setup('APPROVED');
    await finalSettlementService.cancel(1, { cancellationReason: 'اعتماد بالخطأ' }, req);

    const call = (recordAudit as unknown as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(call.oldValue.finalSettlement).toBe('APPROVED');
    expect(call.newValue).toMatchObject({ finalSettlement: 'CANCELLED', cancellationReason: 'اعتماد بالخطأ' });
  });

  it('touches no payroll, accounting, leave record or employee row', async () => {
    setup('APPROVED', [{ id: 50, amount: 400 }], 0);
    await finalSettlementService.updatePayment(1, 50, { ...base, amount: 500 }, req);
    setup('APPROVED', [{ id: 50, amount: 400 }]);
    await finalSettlementService.cancel(1, { cancellationReason: 'خطأ' }, req);

    expect(Object.keys(p.employee)).toEqual(['findUnique']);
    expect(Object.keys(p.leave)).toEqual(['findMany']);
    // سجل دفعات المستحقات العادية يُقرأ فقط ولا يُكتب إطلاقًا.
    expect(Object.keys(p.employeeEntitlementLedger).sort()).toEqual(['aggregate', 'findMany', 'groupBy']);
    const clients = Object.keys(prisma as unknown as Record<string, unknown>);
    expect(clients).not.toContain('payroll');
    expect(clients).not.toContain('journalEntry');
    expect(clients).not.toContain('salaryPayment');
  });

  it('keeps calendar-date semantics for corrected payment dates', async () => {
    setup('APPROVED', [{ id: 50, amount: 400 }], 0);
    await finalSettlementService.updatePayment(1, 50, { ...base, paymentDate: new Date('2026-07-29T18:42:11.000Z'), amount: 400 }, req);

    // التاريخ يُثبَّت على يومه التقويمي، فلا يغيّر وقت اليوم أي شيء.
    expect(p.finalSettlementPayment.update.mock.calls[0][0].data.paymentDate).toEqual(new Date('2026-07-29T00:00:00.000Z'));
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
//  Incremental payroll generation (RC-2).
//
//  The lock used to be MONTH-WIDE: a single APPROVED payslip anywhere in the period
//  aborted the entire transaction, so an employee who became eligible after the month
//  was generated could not be added without un-approving everyone else. That made the
//  only recovery path for a returning employee unusable.
//
//  The lock is now PER-EMPLOYEE: missing rows are created, DRAFT rows recalculated,
//  APPROVED/PAID rows skipped untouched.
//
//  The July-2026 scenario below fails against the old month-wide lock (it threw
//  'لا يمكن إعادة توليد كشف راتب معتمد أو مدفوع' before writing anything) and passes now.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../config/database', () => {
  const tx = {
    payroll: { findMany: vi.fn(), upsert: vi.fn() },
    payrollLine: { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
  };
  return {
    prisma: {
      employee: { findMany: vi.fn() },
      attendance: { findMany: vi.fn() },
      bonus: { findMany: vi.fn() },
      deduction: { findMany: vi.fn() },
      employeeAllowance: { findMany: vi.fn() },
      employeeRecurringDeduction: { findMany: vi.fn() },
      payrollAdvance: { findMany: vi.fn() },
      payrollLine: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  };
});

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { payrollService } from '../payroll.service';
import { payrollEligibilityWhere } from '../payroll.eligibility';

const p = prisma as unknown as {
  employee: { findMany: ReturnType<typeof vi.fn> };
  attendance: { findMany: ReturnType<typeof vi.fn> };
  bonus: { findMany: ReturnType<typeof vi.fn> };
  deduction: { findMany: ReturnType<typeof vi.fn> };
  employeeAllowance: { findMany: ReturnType<typeof vi.fn> };
  employeeRecurringDeduction: { findMany: ReturnType<typeof vi.fn> };
  payrollAdvance: { findMany: ReturnType<typeof vi.fn> };
  payrollLine: { findMany: ReturnType<typeof vi.fn> };
  __tx: {
    payroll: { findMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    payrollLine: { deleteMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn> };
  };
};

const tx = p.__tx;
const req = { user: { userId: 1 } } as never;

// Employee ids only — never names. 77 is the returning employee (real code 25).
const APPROVED_EMPLOYEE = { id: 10, code: 'E1', fullName: 'معتمد', salary: 150, status: 'ACTIVE' };
const DRAFT_EMPLOYEE = { id: 11, code: 'E2', fullName: 'مسودة', salary: 150, status: 'ACTIVE' };
const RETURNING_EMPLOYEE = { id: 77, code: '25', fullName: 'عائد من إجازة', salary: 150, status: 'ACTIVE' };
const ON_LEAVE_EMPLOYEE = { id: 88, code: '26', fullName: 'في إجازة', salary: 150, status: 'ON_LEAVE' };
const TERMINATED_EMPLOYEE = { id: 99, code: '27', fullName: 'منتهي الخدمة', salary: 150, status: 'TERMINATED' };

/** employeeIds actually written, in call order. */
const upsertedEmployeeIds = () =>
  tx.payroll.upsert.mock.calls.map((c) => c[0].where.employeeId_month_year.employeeId);

beforeEach(() => {
  vi.clearAllMocks();
  p.attendance.findMany.mockResolvedValue([]);
  p.bonus.findMany.mockResolvedValue([]);
  p.deduction.findMany.mockResolvedValue([]);
  p.employeeAllowance.findMany.mockResolvedValue([]);
  p.employeeRecurringDeduction.findMany.mockResolvedValue([]);
  p.payrollAdvance.findMany.mockResolvedValue([]);
  p.payrollLine.findMany.mockResolvedValue([]);
  tx.payrollLine.deleteMany.mockResolvedValue({ count: 0 });
  tx.payrollLine.createMany.mockResolvedValue({ count: 0 });
  tx.payroll.upsert.mockImplementation(async (args: { where: { employeeId_month_year: { employeeId: number } } }) => ({
    id: args.where.employeeId_month_year.employeeId,
    employeeId: args.where.employeeId_month_year.employeeId,
  }));
});

describe('PayrollService.generate — per-employee lock, not month-wide', () => {
  it('F/J. Ahmed regression: creates the missing ACTIVE employee while skipping APPROVED rows', async () => {
    // July 2026 already holds an APPROVED payslip; employee 77 was ON_LEAVE at the
    // original generation so has no row, and is now ACTIVE again.
    p.employee.findMany.mockResolvedValue([APPROVED_EMPLOYEE, RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([{ employeeId: 10, status: 'APPROVED' }]);

    const result = await payrollService.generate({ month: 7, year: 2026 } as never, req);

    // The returning employee is materialized …
    expect(upsertedEmployeeIds()).toEqual([77]);
    expect(result.created).toBe(1);
    // … and the approved payslip is never touched: not upserted, lines not deleted.
    expect(upsertedEmployeeIds()).not.toContain(10);
    expect(result.skippedLocked).toBe(1);
    expect(result.updated).toBe(0);
    expect(tx.payrollLine.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.payrollLine.deleteMany.mock.calls[0][0].where.payrollId).toBe(77);
  });

  it('recalculates an existing DRAFT row and counts it as updated, not created', async () => {
    p.employee.findMany.mockResolvedValue([DRAFT_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([{ employeeId: 11, status: 'DRAFT' }]);

    const result = await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(result).toMatchObject({ created: 0, updated: 1, skippedLocked: 0, generated: 1 });
    expect(upsertedEmployeeIds()).toEqual([11]);
  });

  it('never modifies a PAID payslip', async () => {
    p.employee.findMany.mockResolvedValue([APPROVED_EMPLOYEE, RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([{ employeeId: 10, status: 'PAID' }]);

    const result = await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(upsertedEmployeeIds()).toEqual([77]);
    expect(result.skippedLocked).toBe(1);
  });

  it('classifies a mixed period correctly in one pass', async () => {
    p.employee.findMany.mockResolvedValue([APPROVED_EMPLOYEE, DRAFT_EMPLOYEE, RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([
      { employeeId: 10, status: 'APPROVED' },
      { employeeId: 11, status: 'DRAFT' },
    ]);

    const result = await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(result).toMatchObject({ created: 1, updated: 1, skippedLocked: 1, generated: 2 });
    expect(upsertedEmployeeIds().sort()).toEqual([11, 77]);
  });

  it('G. duplicate protection: writes through upsert keyed on (employeeId, month, year)', async () => {
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(tx.payroll.upsert).toHaveBeenCalledOnce();
    expect(tx.payroll.upsert.mock.calls[0][0].where.employeeId_month_year)
      .toEqual({ employeeId: 77, month: 7, year: 2026 });
  });

  it('G2. re-running after the employee has a DRAFT row still yields exactly one row', async () => {
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([{ employeeId: 77, status: 'DRAFT' }]);

    const result = await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(tx.payroll.upsert).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ created: 0, updated: 1 });
  });

  it('still rejects a deliberate re-generate when EVERY targeted row is locked', async () => {
    // Nothing writable + something locked → the original error, not a silent no-op.
    p.employee.findMany.mockResolvedValue([APPROVED_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([{ employeeId: 10, status: 'APPROVED' }]);

    await expect(payrollService.generate({ month: 7, year: 2026 } as never, req))
      .rejects.toThrow('لا يمكن إعادة توليد كشف راتب معتمد أو مدفوع');
    expect(tx.payroll.upsert).not.toHaveBeenCalled();
  });

  it('H. reverse transition: an ACTIVE→ON_LEAVE employee\'s existing row is never deleted', async () => {
    // Employee 11 went ON_LEAVE after generation, so buildSnapshots no longer targets
    // them. Their existing row is simply not in scope — no delete path exists at all.
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]); // ACTIVE-only snapshot set
    tx.payroll.findMany.mockResolvedValue([]);

    await payrollService.generate({ month: 7, year: 2026 } as never, req);

    // Only the returning employee's lines are rewritten; nothing else is deleted.
    expect(tx.payrollLine.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.payrollLine.deleteMany.mock.calls[0][0].where.payrollId).toBe(77);
    expect(upsertedEmployeeIds()).toEqual([77]);
  });

  it('scopes the lock lookup to the targeted employees and the selected period only', async () => {
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(tx.payroll.findMany.mock.calls[0][0].where).toEqual({
      employeeId: { in: [77] }, month: 7, year: 2026,
    });
  });

  it('single-employee generation targets that employee regardless of the ACTIVE filter', async () => {
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    await payrollService.generate({ month: 7, year: 2026, employeeId: 77 } as never, req);

    expect(p.employee.findMany.mock.calls[0][0].where).toEqual({ id: 77 });
  });

  it('N. bulk generation selects employees with THE shared eligibility rule, not a private copy', async () => {
    // The structural guarantee behind this whole pack: generation and the gap detector
    // read ONE predicate. If either grows its own copy, this assertion fails — which is
    // the only thing that keeps "someone is missing" and "someone would be created" from
    // silently disagreeing again.
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(p.employee.findMany.mock.calls[0][0].where).toEqual(payrollEligibilityWhere(7, 2026));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
//  The ON_LEAVE manual exception — a PRODUCT OWNER DECISION, pinned by test.
//
//  Ruling (Employee ↔ Payroll Eligibility & Status Transition Integrity v1):
//
//                  │ BULK generation │ MANUAL (single employee)
//    ──────────────┼─────────────────┼──────────────────────────
//    ACTIVE        │ included        │ allowed
//    ON_LEAVE      │ EXCLUDED        │ ALLOWED  (paid leave — intended, not a defect)
//    TERMINATED    │ EXCLUDED        │ REFUSED  (no NEW payslip after service ends)
//
//  The two manual rulings pull in opposite directions on the SAME code path, which
//  is exactly why each needs its own test: blocking TERMINATED by reusing the bulk
//  rule would also block ON_LEAVE and silently revoke it. These tests fail the day
//  that happens.
// ─────────────────────────────────────────────────────────────────────────────
describe('PayrollService.generate — manual-path status rulings (Product Owner decisions)', () => {
  it('excludes ON_LEAVE from BULK generation — via the shared rule, not a local check', async () => {
    // The exclusion lives in the predicate sent to the database: ON_LEAVE never matches
    // `status: 'ACTIVE'`, so such an employee is not even fetched into a bulk run.
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]); // what the rule returns
    tx.payroll.findMany.mockResolvedValue([]);

    await payrollService.generate({ month: 7, year: 2026 } as never, req);

    const where = p.employee.findMany.mock.calls[0][0].where;
    expect(where).toEqual(payrollEligibilityWhere(7, 2026));
    expect(where.status).toBe('ACTIVE');
    expect(upsertedEmployeeIds()).not.toContain(ON_LEAVE_EMPLOYEE.id);
  });

  it('DOES generate for an ON_LEAVE employee named explicitly — the approved manual path', async () => {
    p.employee.findMany.mockResolvedValue([ON_LEAVE_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    const result = await payrollService.generate({ month: 7, year: 2026, employeeId: 88 } as never, req);

    // No status predicate is applied on this path — that IS the approved exception.
    expect(p.employee.findMany.mock.calls[0][0].where).toEqual({ id: 88 });
    expect(upsertedEmployeeIds()).toEqual([88]);
    expect(result).toMatchObject({ created: 1, updated: 0, skippedLocked: 0 });
  });

  it('the exception never touches APPROVED or PAID payslips', async () => {
    // Same period already settled for someone else; the manual run is scoped to the one
    // named employee, so no other row is read, rewritten, or has its lines deleted.
    p.employee.findMany.mockResolvedValue([ON_LEAVE_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    await payrollService.generate({ month: 7, year: 2026, employeeId: 88 } as never, req);

    expect(tx.payroll.findMany.mock.calls[0][0].where).toEqual({
      employeeId: { in: [88] }, month: 7, year: 2026,
    });
    expect(upsertedEmployeeIds()).toEqual([88]);
    expect(tx.payrollLine.deleteMany).toHaveBeenCalledTimes(1);
    expect(tx.payrollLine.deleteMany.mock.calls[0][0].where.payrollId).toBe(88);
  });

  it('refuses to overwrite the manually-generated payslip once APPROVED', async () => {
    p.employee.findMany.mockResolvedValue([ON_LEAVE_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([{ employeeId: 88, status: 'APPROVED' }]);

    await expect(payrollService.generate({ month: 7, year: 2026, employeeId: 88 } as never, req))
      .rejects.toThrow('لا يمكن إعادة توليد كشف راتب معتمد أو مدفوع');
    expect(tx.payroll.upsert).not.toHaveBeenCalled();
  });

  it('re-running the manual generation yields exactly one row — no duplicate', async () => {
    p.employee.findMany.mockResolvedValue([ON_LEAVE_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([{ employeeId: 88, status: 'DRAFT' }]);

    const result = await payrollService.generate({ month: 7, year: 2026, employeeId: 88 } as never, req);

    expect(tx.payroll.upsert).toHaveBeenCalledOnce();
    expect(tx.payroll.upsert.mock.calls[0][0].where.employeeId_month_year)
      .toEqual({ employeeId: 88, month: 7, year: 2026 });
    expect(result).toMatchObject({ created: 0, updated: 1 });
  });

  it('REFUSES manual generation for a TERMINATED employee — and writes absolutely nothing', async () => {
    // The refusal is worth nothing if it happens after a write. It is raised while still
    // building snapshots, before the transaction opens: no upsert, no line delete, no
    // line insert — the transaction is never even entered.
    p.employee.findMany.mockResolvedValue([TERMINATED_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    await expect(payrollService.generate({ month: 7, year: 2026, employeeId: 99 } as never, req))
      .rejects.toThrow('لا يمكن إنشاء راتب لموظف منتهي الخدمة.');

    expect(tx.payroll.upsert).not.toHaveBeenCalled();
    expect(tx.payrollLine.deleteMany).not.toHaveBeenCalled();
    expect(tx.payrollLine.createMany).not.toHaveBeenCalled();
  });

  it('the TERMINATED refusal never reads or touches the existing payslips of that employee', async () => {
    // A terminated employee usually HAS history — a final APPROVED or PAID payslip. The
    // guard must not delete, recalculate or even look at it: refusing a new row is the
    // whole of the ruling. Nothing queries the payroll table on this path at all.
    p.employee.findMany.mockResolvedValue([TERMINATED_EMPLOYEE]);

    await expect(payrollService.generate({ month: 7, year: 2026, employeeId: 99 } as never, req))
      .rejects.toThrow('لا يمكن إنشاء راتب لموظف منتهي الخدمة.');

    expect(tx.payroll.findMany).not.toHaveBeenCalled();
    expect(tx.payroll.upsert).not.toHaveBeenCalled();
  });

  it('refuses TERMINATED by NAMED status — not by re-applying the bulk eligibility rule', async () => {
    // The selector must stay `{ id }`. If someone "simplifies" this into
    // payrollEligibilityWhere(), ON_LEAVE would be blocked too — the exception revoked
    // by accident. This pins the query shape, so that refactor fails loudly here.
    p.employee.findMany.mockResolvedValue([TERMINATED_EMPLOYEE]);

    await expect(payrollService.generate({ month: 7, year: 2026, employeeId: 99 } as never, req))
      .rejects.toThrow();

    const where = p.employee.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ id: 99 });
    expect(where.status).toBeUndefined();
  });

  it('the TERMINATED block does not leak into BULK generation of everyone else', async () => {
    // Bulk keeps working unchanged: it never carries an employeeId, so the guard is not
    // even evaluated, and an ACTIVE employee is still materialized normally.
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    const result = await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(upsertedEmployeeIds()).toEqual([77]);
    expect(result).toMatchObject({ created: 1 });
  });

  it('an ACTIVE employee is still generatable one-by-one', async () => {
    p.employee.findMany.mockResolvedValue([RETURNING_EMPLOYEE]);
    tx.payroll.findMany.mockResolvedValue([]);

    const result = await payrollService.generate({ month: 7, year: 2026, employeeId: 77 } as never, req);

    expect(upsertedEmployeeIds()).toEqual([77]);
    expect(result).toMatchObject({ created: 1, updated: 0, skippedLocked: 0 });
  });

  it('the exception does NOT widen: a TERMINATED employee stays out of bulk generation', async () => {
    // Whatever is decided about the manual path, the bulk rule is unaffected — it asks
    // for ACTIVE only, so no non-active status can slip into a bulk run.
    p.employee.findMany.mockResolvedValue([]);
    tx.payroll.findMany.mockResolvedValue([]);

    const result = await payrollService.generate({ month: 7, year: 2026 } as never, req);

    expect(p.employee.findMany.mock.calls[0][0].where.status).toBe('ACTIVE');
    expect(tx.payroll.upsert).not.toHaveBeenCalled();
    expect(result).toMatchObject({ created: 0, updated: 0 });
  });
});

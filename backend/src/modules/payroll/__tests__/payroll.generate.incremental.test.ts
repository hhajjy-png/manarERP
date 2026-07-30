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
});

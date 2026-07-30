import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
//  Payroll eligibility-gap detection (RC-1).
//
//  `payroll` rows are a materialized snapshot frozen at generation time. An employee
//  who was ON_LEAVE at that instant never got a row, and returning to ACTIVE creates
//  nothing — so the grid (which renders rows, not eligibility) simply omits them, with
//  no warning. These tests pin the reconciliation that makes that omission visible.
//
//  Real-world case behind this suite: employee 77 (code 25) was ON_LEAVE when July 2026
//  was generated, later became ACTIVE, and silently never reappeared in Payroll.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('../../../config/database', () => ({
  prisma: {
    payroll: { findMany: vi.fn() },
    salaryPayment: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { findPayrollEligibilityGap } from '../payrollMonth.readModel';

const payrollFindMany = prisma.payroll.findMany as unknown as ReturnType<typeof vi.fn>;
const salaryPaymentFindMany = prisma.salaryPayment.findMany as unknown as ReturnType<typeof vi.fn>;
const employeeFindMany = prisma.employee.findMany as unknown as ReturnType<typeof vi.fn>;

const ACTIVE_EMPLOYEES = [
  { id: 10, code: 'E1', fullName: 'موظف واحد' },
  { id: 11, code: 'E2', fullName: 'موظف اثنان' },
];

beforeEach(() => {
  vi.clearAllMocks();
  employeeFindMany.mockResolvedValue(ACTIVE_EMPLOYEES);
  payrollFindMany.mockResolvedValue([]);
  salaryPaymentFindMany.mockResolvedValue([]);
});

describe('findPayrollEligibilityGap — who the period does not represent', () => {
  it('A. reports an ACTIVE employee that has no payroll row for the period', async () => {
    payrollFindMany.mockResolvedValue([{ employeeId: 10 }]); // only E1 was generated

    const gap = await findPayrollEligibilityGap(7, 2026);

    expect(gap.missingPayrollCount).toBe(1);
    expect(gap.missingPayrollEmployees).toEqual([
      { employeeId: 11, employeeCode: 'E2', employeeName: 'موظف اثنان' },
    ]);
    expect(gap.eligibleCount).toBe(2);
    expect(gap.representedCount).toBe(1);
  });

  it('B. does NOT report an ACTIVE employee whose row is still DRAFT', async () => {
    payrollFindMany.mockResolvedValue([{ employeeId: 10 }, { employeeId: 11 }]);

    const gap = await findPayrollEligibilityGap(7, 2026);

    expect(gap.missingPayrollCount).toBe(0);
    expect(gap.missingPayrollEmployees).toEqual([]);
  });

  it('C. does NOT report an ACTIVE employee whose row is APPROVED', async () => {
    // Representation is row EXISTENCE — the query selects employeeId only, so any
    // workflow status counts. An approved payslip is plainly represented.
    payrollFindMany.mockResolvedValue([{ employeeId: 10 }, { employeeId: 11 }]);

    const gap = await findPayrollEligibilityGap(7, 2026);

    expect(gap.missingPayrollCount).toBe(0);
  });

  it('C2. queries payroll for the period WITHOUT a status filter, so CANCELLED still counts as represented', async () => {
    await findPayrollEligibilityGap(7, 2026);

    const where = payrollFindMany.mock.calls[0][0].where;
    expect(where).toEqual({ month: 7, year: 2026 });
    expect(where.status).toBeUndefined();
  });

  it('D. never reports a non-ACTIVE employee — eligibility is scoped in the query', async () => {
    employeeFindMany.mockResolvedValue([]); // no ACTIVE employees at all
    payrollFindMany.mockResolvedValue([]);

    const gap = await findPayrollEligibilityGap(7, 2026);

    expect(gap.missingPayrollCount).toBe(0);
    expect(employeeFindMany.mock.calls[0][0].where).toEqual({ status: 'ACTIVE' });
  });

  it('E. treats an imported bank transfer as representation — no duplicate gap for settled history', async () => {
    // E2 has no computed payroll row, but a historical bank transfer settles the month.
    payrollFindMany.mockResolvedValue([{ employeeId: 10 }]);
    salaryPaymentFindMany.mockResolvedValue([
      { id: 1, beneficiaryName: 'موظف اثنان', civilId: '222', beneficiaryAccount: 'ACC2', amount: 300, bankName: 'NBK', paymentDate: null, transactionId: 'T1' },
    ]);
    // resolveImportedRowsForMonth re-queries employees with identity columns.
    employeeFindMany
      .mockResolvedValueOnce(ACTIVE_EMPLOYEES)
      .mockResolvedValueOnce([
        { id: 10, code: 'E1', fullName: 'موظف واحد', department: null, civilId: '111', bankAccount: 'ACC1' },
        { id: 11, code: 'E2', fullName: 'موظف اثنان', department: null, civilId: '222', bankAccount: 'ACC2' },
      ]);

    const gap = await findPayrollEligibilityGap(6, 2025);

    expect(gap.missingPayrollCount).toBe(0);
  });

  it('scopes detection to a single employee when the grid is filtered to one', async () => {
    employeeFindMany.mockResolvedValue([ACTIVE_EMPLOYEES[1]]);
    payrollFindMany.mockResolvedValue([{ employeeId: 10 }]);

    const gap = await findPayrollEligibilityGap(7, 2026, { employeeId: 11 });

    expect(employeeFindMany.mock.calls[0][0].where).toEqual({ status: 'ACTIVE', id: 11 });
    expect(gap.missingPayrollCount).toBe(1);
  });

  it('I. detection is strictly read-only — no create/update/delete/upsert is reachable', async () => {
    // The mocked client exposes ONLY findMany. Any write call would throw
    // "is not a function", so a green run is proof no mutation path was taken.
    payrollFindMany.mockResolvedValue([{ employeeId: 10 }]);

    await findPayrollEligibilityGap(7, 2026);

    expect(Object.keys(prisma.payroll)).toEqual(['findMany']);
    expect(Object.keys(prisma.employee)).toEqual(['findMany']);
  });

  it('J. Ahmed regression — ON_LEAVE at generation, later ACTIVE, is detected as missing', async () => {
    // Employee ids only; no name-based logic anywhere in the implementation.
    const AHMED = { id: 77, code: '25', fullName: 'احمد رمضان احمد على' };
    employeeFindMany.mockResolvedValue([...ACTIVE_EMPLOYEES, AHMED]);
    // July 2026 was generated while he was ON_LEAVE → rows exist for everyone but him.
    payrollFindMany.mockResolvedValue([{ employeeId: 10 }, { employeeId: 11 }]);

    const gap = await findPayrollEligibilityGap(7, 2026);

    expect(gap.missingPayrollCount).toBe(1);
    expect(gap.missingPayrollEmployees[0].employeeId).toBe(77);
  });
});

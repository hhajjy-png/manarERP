import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug C3 regression: a salary advance's `remainingAmount` is only reduced at payment
// time (markPaid). Generating a second month's payroll while the first is still
// DRAFT/APPROVED (unpaid) would deduct the SAME advance again, over-deducting the
// employee. The fix subtracts amounts already committed in other open payrolls from the
// advance's effective remaining before applying it.

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findMany: vi.fn() },
    attendance: { findMany: vi.fn() },
    bonus: { findMany: vi.fn() },
    deduction: { findMany: vi.fn() },
    employeeAllowance: { findMany: vi.fn() },
    employeeRecurringDeduction: { findMany: vi.fn() },
    payrollAdvance: { findMany: vi.fn() },
    payrollLine: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { payrollService } from '../payroll.service';

const p = prisma as unknown as Record<string, { findMany: ReturnType<typeof vi.fn> }>;

const EMPLOYEE = { id: 1, code: 'E1', fullName: 'موظف', salary: 200, status: 'ACTIVE' };
const ADVANCE = { id: 1, employeeId: 1, remainingAmount: 100, status: 'OPEN' };

function advanceLine(snapshot: { lines: Array<{ type: string; sourceId?: number; amount: number }> }) {
  return snapshot.lines.find((l) => l.type === 'ADVANCE');
}

describe('PayrollService — advance not double-deducted across open payrolls (bug C3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    p.employee.findMany.mockResolvedValue([EMPLOYEE]);
    p.attendance.findMany.mockResolvedValue([]);
    p.bonus.findMany.mockResolvedValue([]);
    p.deduction.findMany.mockResolvedValue([]);
    p.employeeAllowance.findMany.mockResolvedValue([]);
    p.employeeRecurringDeduction.findMany.mockResolvedValue([]);
    p.payrollAdvance.findMany.mockResolvedValue([ADVANCE]);
    p.payrollLine.findMany.mockResolvedValue([]); // no prior open commitments by default
  });

  it('applies the full advance when no other open payroll has committed it', async () => {
    const { items } = await payrollService.preview({ month: 7, year: 2026, employeeId: 1 } as any);
    const snap = items[0];
    expect(advanceLine(snap)?.amount).toBe(-100);
    expect(snap.totalAdvances).toBe(100);
    expect(snap.netSalary).toBe(100); // 200 base − 100 advance
  });

  it('does NOT re-deduct an advance already committed in another open (DRAFT/APPROVED) payroll', async () => {
    // The July payroll (a different month) already committed 100 of this advance.
    p.payrollLine.findMany.mockResolvedValue([{ sourceId: 1, amount: -100 }]);

    const { items } = await payrollService.preview({ month: 8, year: 2026, employeeId: 1 } as any);
    const snap = items[0];
    expect(advanceLine(snap)).toBeUndefined();     // no ADVANCE line at all
    expect(snap.totalAdvances).toBe(0);
    expect(snap.netSalary).toBe(200);              // full base salary — no double deduction
  });

  it('applies only the remaining effective amount when the advance is partially committed elsewhere', async () => {
    // 60 of the 100 advance already committed in another open payroll → 40 left.
    p.payrollLine.findMany.mockResolvedValue([{ sourceId: 1, amount: -60 }]);

    const { items } = await payrollService.preview({ month: 8, year: 2026, employeeId: 1 } as any);
    const snap = items[0];
    expect(advanceLine(snap)?.amount).toBe(-40);
    expect(snap.totalAdvances).toBe(40);
    expect(snap.netSalary).toBe(160);
  });

  it('queries open commitments excluding the period being (re)generated', async () => {
    await payrollService.preview({ month: 8, year: 2026, employeeId: 1 } as any);

    expect(p.payrollLine.findMany).toHaveBeenCalledOnce();
    const where = p.payrollLine.findMany.mock.calls[0][0].where;
    expect(where.sourceType).toBe('ADVANCE');
    expect(where.payroll.status.in).toEqual(['DRAFT', 'APPROVED']);
    expect(where.payroll.NOT).toEqual({ month: 8, year: 2026 });
  });
});

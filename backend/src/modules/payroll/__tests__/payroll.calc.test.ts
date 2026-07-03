import { describe, it, expect } from 'vitest';
import {
  round3,
  monthRange,
  inPeriod,
  computePayroll,
  computeRegularHours,
  WORK_HOURS_PER_DAY,
} from '../payroll.calc';

// ── round3 ───────────────────────────────────────────────────────────────────

describe('round3', () => {
  it('rounds up at the third decimal place', () => {
    expect(round3(1.2345)).toBe(1.235);
  });

  it('rounds down at the third decimal place', () => {
    expect(round3(1.2344)).toBe(1.234);
  });

  it('returns 0 for 0', () => {
    expect(round3(0)).toBe(0);
  });

  it('returns integer values unchanged', () => {
    expect(round3(100)).toBe(100);
  });

  it('handles null/undefined-like via coercion', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(round3(null as any)).toBe(0);
  });

  it('handles KWD precision correctly (0.001 fils)', () => {
    expect(round3(0.0005)).toBe(0.001);
  });
});

// ── monthRange ───────────────────────────────────────────────────────────────

describe('monthRange', () => {
  it('returns 31 days for January 2026', () => {
    const { days } = monthRange(1, 2026);
    expect(days).toBe(31);
  });

  it('returns 28 days for February 2026 (non-leap year)', () => {
    const { days } = monthRange(2, 2026);
    expect(days).toBe(28);
  });

  it('returns 29 days for February 2024 (leap year)', () => {
    const { days } = monthRange(2, 2024);
    expect(days).toBe(29);
  });

  it('returns 30 days for June 2026', () => {
    const { days } = monthRange(6, 2026);
    expect(days).toBe(30);
  });

  it('start is the first day of the month at midnight', () => {
    const { start } = monthRange(3, 2026);
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(2); // 0-indexed
    expect(start.getDate()).toBe(1);
  });

  it('end is the last day of the month at 23:59:59', () => {
    const { end } = monthRange(3, 2026);
    expect(end.getDate()).toBe(31);
    expect(end.getHours()).toBe(23);
    expect(end.getSeconds()).toBe(59);
  });
});

// ── inPeriod ─────────────────────────────────────────────────────────────────

describe('inPeriod', () => {
  const start = new Date(2026, 5, 1);  // Jun 1
  const end   = new Date(2026, 5, 30); // Jun 30

  it('returns true when both startsAt and endsAt are null', () => {
    expect(inPeriod({ startsAt: null, endsAt: null }, start, end)).toBe(true);
  });

  it('returns true when startsAt is before month end and endsAt is null', () => {
    expect(inPeriod({ startsAt: new Date(2026, 4, 1), endsAt: null }, start, end)).toBe(true);
  });

  it('returns true when startsAt is null and endsAt is after month start', () => {
    expect(inPeriod({ startsAt: null, endsAt: new Date(2026, 6, 1) }, start, end)).toBe(true);
  });

  it('returns false when endsAt is before the month starts', () => {
    expect(inPeriod({ startsAt: null, endsAt: new Date(2026, 4, 31) }, start, end)).toBe(false);
  });

  it('returns false when startsAt is after the month ends', () => {
    expect(inPeriod({ startsAt: new Date(2026, 6, 1), endsAt: null }, start, end)).toBe(false);
  });
});

// ── computePayroll ───────────────────────────────────────────────────────────

describe('computePayroll — base salary only', () => {
  it('sets netSalary equal to baseSalary when no attendance or adjustments', () => {
    const result = computePayroll(1, 300, 6, 2026, [], [], [], [], [], []);
    expect(result.baseSalary).toBe(300);
    expect(result.netSalary).toBe(300);
    expect(result.grossSalary).toBe(300);
    expect(result.totalAllowances).toBe(0);
    expect(result.totalDeductions).toBe(0);
    expect(result.totalAdvances).toBe(0);
    expect(result.overtimeAmount).toBe(0);
  });

  it('includes a BASE line as the first payroll line', () => {
    const result = computePayroll(5, 500, 6, 2026, [], [], [], [], [], []);
    const baseLine = result.lines.find((l) => l.type === 'BASE');
    expect(baseLine).toBeDefined();
    expect(baseLine!.amount).toBe(500);
    expect(baseLine!.employeeId).toBe(5);
  });
});

describe('computePayroll — absence deduction', () => {
  const buildAbsent = (n: number) =>
    Array.from({ length: n }, () => ({ status: 'ABSENT', workHours: 0 }));

  it('deducts the correct pro-rated amount for 3 absent days in June (30 days)', () => {
    // baseSalary 300, 30 days → daily rate 10, 3 absences → deduction 30
    const result = computePayroll(1, 300, 6, 2026, buildAbsent(3), [], [], [], [], []);
    expect(result.totalDeductions).toBe(30);
    expect(result.netSalary).toBe(270);
  });

  it('produces no deduction when all attendance is PRESENT', () => {
    const attendance = Array.from({ length: 20 }, () => ({ status: 'PRESENT', workHours: 8 }));
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.totalDeductions).toBe(0);
    expect(result.absentDays).toBe(0);
  });

  it('counts absent days correctly', () => {
    const attendance = [
      { status: 'PRESENT', workHours: 8 },
      { status: 'ABSENT', workHours: 0 },
      { status: 'ABSENT', workHours: 0 },
    ];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.absentDays).toBe(2);
  });
});

describe('computePayroll — overtime', () => {
  it('calculates overtime for hours beyond regular (8h/day × present days)', () => {
    // 1 present day × 8h = 8 regular hours. 10 actual hours → 2 OT hours.
    // Daily rate = 300/30 = 10. Hourly rate = 10/8 = 1.25. OT rate = 1.25 × 1.25 = 1.5625
    // OT amount = 2 × 1.5625 = 3.125 → round3 = 3.125
    const attendance = [{ status: 'PRESENT', workHours: 10 }];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.overtimeHours).toBe(2);
    expect(result.overtimeAmount).toBeGreaterThan(0);
    const expectedOtRate = round3((300 / 30 / 8) * 1.25);
    expect(result.overtimeRate).toBe(expectedOtRate);
    expect(result.overtimeAmount).toBe(round3(2 * expectedOtRate));
  });

  it('produces zero overtime when actual hours equal regular hours', () => {
    const attendance = [{ status: 'PRESENT', workHours: 8 }];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.overtimeHours).toBe(0);
    expect(result.overtimeAmount).toBe(0);
  });

  it('adds an OVERTIME line when overtime is positive', () => {
    const attendance = [{ status: 'PRESENT', workHours: 10 }];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.lines.some((l) => l.type === 'OVERTIME')).toBe(true);
  });

  it('does NOT add an OVERTIME line when there is no overtime', () => {
    const attendance = [{ status: 'PRESENT', workHours: 8 }];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.lines.some((l) => l.type === 'OVERTIME')).toBe(false);
  });

  it('overtime increases grossSalary but not by more than overtime amount', () => {
    const attendance = [{ status: 'PRESENT', workHours: 10 }];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.grossSalary).toBe(round3(result.baseSalary + result.overtimeAmount));
  });
});

describe('computePayroll — allowances', () => {
  const june2026 = { startsAt: null, endsAt: null };

  it('adds allowance to net and gross salary', () => {
    const allowances = [{ id: 1, name: 'Housing', amount: 50, notes: null, ...june2026 }];
    const result = computePayroll(1, 300, 6, 2026, [], allowances, [], [], [], []);
    expect(result.totalAllowances).toBe(50);
    expect(result.netSalary).toBe(350);
    expect(result.grossSalary).toBe(350);
  });

  it('accumulates multiple allowances', () => {
    const allowances = [
      { id: 1, name: 'Housing', amount: 50, notes: null, ...june2026 },
      { id: 2, name: 'Transport', amount: 30, notes: null, ...june2026 },
    ];
    const result = computePayroll(1, 300, 6, 2026, [], allowances, [], [], [], []);
    expect(result.totalAllowances).toBe(80);
    expect(result.netSalary).toBe(380);
  });

  it('excludes allowances whose period does not overlap the month', () => {
    const future = new Date(2026, 11, 1); // Dec 2026 — outside June
    const allowances = [{ id: 1, name: 'Housing', amount: 50, notes: null, startsAt: future, endsAt: null }];
    const result = computePayroll(1, 300, 6, 2026, [], allowances, [], [], [], []);
    expect(result.totalAllowances).toBe(0);
  });
});

describe('computePayroll — one-off bonuses', () => {
  it('adds bonus amount to net salary via ALLOWANCE line', () => {
    const bonuses = [{ id: 1, reason: 'Performance', amount: 100 }];
    const result = computePayroll(1, 300, 6, 2026, [], [], bonuses, [], [], []);
    expect(result.netSalary).toBe(400);
    const bonusLine = result.lines.find((l) => l.sourceType === 'BONUS');
    expect(bonusLine?.amount).toBe(100);
  });
});

describe('computePayroll — deductions', () => {
  const june2026 = { startsAt: null, endsAt: null };

  it('subtracts one-off deduction from net salary', () => {
    const deductions = [{ id: 1, reason: 'Damage', amount: 20 }];
    const result = computePayroll(1, 300, 6, 2026, [], [], [], deductions, [], []);
    expect(result.totalDeductions).toBe(20);
    expect(result.netSalary).toBe(280);
  });

  it('subtracts recurring deduction from net salary', () => {
    const recurring = [{ id: 1, name: 'Social insurance', amount: 15, notes: null, ...june2026 }];
    const result = computePayroll(1, 300, 6, 2026, [], [], [], [], recurring, []);
    expect(result.totalDeductions).toBe(15);
    expect(result.netSalary).toBe(285);
  });

  it('does not apply recurring deduction outside its active period', () => {
    const past = new Date(2025, 0, 1);
    const pastEnd = new Date(2025, 11, 31);
    const recurring = [{ id: 1, name: 'Old insurance', amount: 15, notes: null, startsAt: past, endsAt: pastEnd }];
    const result = computePayroll(1, 300, 6, 2026, [], [], [], [], recurring, []);
    expect(result.totalDeductions).toBe(0);
  });

  it('deductions do not affect grossSalary', () => {
    const deductions = [{ id: 1, reason: 'Damage', amount: 50 }];
    const result = computePayroll(1, 300, 6, 2026, [], [], [], deductions, [], []);
    expect(result.grossSalary).toBe(300); // gross = base + allowances + OT only
    expect(result.netSalary).toBe(250);
  });
});

describe('computePayroll — salary advances', () => {
  it('deducts advance from net salary when employee has remaining advance', () => {
    const advances = [{ id: 1, remainingAmount: 50 }];
    const result = computePayroll(1, 300, 6, 2026, [], [], [], [], [], advances);
    expect(result.totalAdvances).toBe(50);
    expect(result.netSalary).toBe(250);
  });

  it('deducts only up to the current gross (does not go below zero)', () => {
    // baseSalary 100, advance remaining 500 → should deduct only 100
    const advances = [{ id: 1, remainingAmount: 500 }];
    const result = computePayroll(1, 100, 6, 2026, [], [], [], [], [], advances);
    expect(result.totalAdvances).toBe(100);
    expect(result.netSalary).toBe(0);
  });

  it('stops deducting advances when gross reaches zero', () => {
    // Two advances: first clears salary, second should not deduct anything
    const advances = [
      { id: 1, remainingAmount: 300 },
      { id: 2, remainingAmount: 100 },
    ];
    const result = computePayroll(1, 300, 6, 2026, [], [], [], [], [], advances);
    const advanceLines = result.lines.filter((l) => l.type === 'ADVANCE');
    expect(advanceLines).toHaveLength(1);
    expect(result.totalAdvances).toBe(300);
    expect(result.netSalary).toBe(0);
  });
});

describe('computePayroll — combined scenario', () => {
  it('computes correct net for base + allowance + deduction + absent days', () => {
    // base: 300, 30-day month (June 2026)
    // allowance: 50 housing
    // deduction: 20 damage
    // 3 absent days → 30 KD deducted
    // net = 300 + 50 - 20 - 30 = 300
    const allowances = [{ id: 1, name: 'Housing', amount: 50, notes: null, startsAt: null, endsAt: null }];
    const deductions = [{ id: 1, reason: 'Damage', amount: 20 }];
    const attendance = Array.from({ length: 3 }, () => ({ status: 'ABSENT', workHours: 0 }));
    const result = computePayroll(1, 300, 6, 2026, attendance, allowances, [], deductions, [], []);
    expect(result.netSalary).toBe(300);
  });

  it('KWD values are rounded to 3 decimal places', () => {
    // base: 1 KWD, 30 days, 1 absent → 1/30 deduction = 0.033333... → round3 = 0.033
    const attendance = [{ status: 'ABSENT', workHours: 0 }];
    const result = computePayroll(1, 1, 6, 2026, attendance, [], [], [], [], []);
    expect(result.netSalary).toBe(round3(1 - 1 / 30));
    expect(Number.isFinite(result.netSalary)).toBe(true);
  });
});

// ── C2 regression: LATE days must NOT become overtime ─────────────────────────

describe('computeRegularHours (bug C2)', () => {
  it('counts PRESENT days at 8h each', () => {
    expect(computeRegularHours(20, 0)).toBe(20 * WORK_HOURS_PER_DAY);
  });

  it('counts LATE days as normal working days (8h each), not overtime', () => {
    expect(computeRegularHours(20, 2)).toBe(22 * WORK_HOURS_PER_DAY);
  });

  it('is zero when there are no worked days', () => {
    expect(computeRegularHours(0, 0)).toBe(0);
  });
});

describe('computePayroll — LATE days and overtime (bug C2)', () => {
  const present = (n: number, hours = 8) =>
    Array.from({ length: n }, () => ({ status: 'PRESENT', workHours: hours }));
  const late = (n: number, hours = 8) =>
    Array.from({ length: n }, () => ({ status: 'LATE', workHours: hours }));

  it('20 PRESENT + 2 LATE, all 8h → overtime is ZERO (Phase B reproduction)', () => {
    const attendance = [...present(20), ...late(2)];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.presentDays).toBe(20);
    expect(result.lateDays).toBe(2);
    expect(result.actualHours).toBe(176);
    expect(result.regularHours).toBe(176); // includes the 2 LATE days
    expect(result.overtimeHours).toBe(0);
    expect(result.overtimeAmount).toBe(0);
    expect(result.netSalary).toBe(300); // base only — no phantom overtime
  });

  it('does NOT add an OVERTIME line when LATE days only fill the regular baseline', () => {
    const attendance = [...present(20), ...late(2)];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.lines.some((l) => l.type === 'OVERTIME')).toBe(false);
  });

  it('only genuine hours ABOVE the regular baseline count as overtime', () => {
    // 20 PRESENT×8 + 2 LATE×8 = 176 regular baseline (22 days).
    // One PRESENT day works 12h instead of 8 → +4 real overtime hours.
    const attendance = [...present(19), { status: 'PRESENT', workHours: 12 }, ...late(2)];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.presentDays).toBe(20);
    expect(result.lateDays).toBe(2);
    expect(result.regularHours).toBe(176);
    expect(result.actualHours).toBe(180);
    expect(result.overtimeHours).toBe(4);
    expect(result.overtimeAmount).toBeGreaterThan(0);
  });

  it('a LATE day with fewer than 8 logged hours never produces negative/overtime hours', () => {
    // 1 LATE day, only 5 hours worked. Regular baseline = 8. actual = 5. OT = max(0, 5-8) = 0.
    const attendance = [{ status: 'LATE', workHours: 5 }];
    const result = computePayroll(1, 300, 6, 2026, attendance, [], [], [], [], []);
    expect(result.overtimeHours).toBe(0);
    expect(result.overtimeAmount).toBe(0);
  });
});

// Pure payroll calculation functions — no Prisma, no side effects.
// Extracted from payroll.service.ts to enable unit testing.

export const WORK_HOURS_PER_DAY = 8;
export const OVERTIME_MULTIPLIER = 1.25;

export function round3(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 1000) / 1000;
}

export function monthRange(month: number, year: number) {
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  return { start, end, days: end.getDate() };
}

export function inPeriod(
  item: { startsAt?: Date | null; endsAt?: Date | null },
  start: Date,
  end: Date,
): boolean {
  return (!item.startsAt || item.startsAt <= end) && (!item.endsAt || item.endsAt >= start);
}

export type AttendanceEntry = { status: string; workHours?: number | null };
export type AllowanceEntry = {
  id: number;
  name: string;
  amount: number;
  notes?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};
export type BonusEntry = { id: number; reason?: string | null; amount: number };
export type DeductionEntry = { id: number; reason?: string | null; amount: number };
export type RecurringDeductionEntry = {
  id: number;
  name: string;
  amount: number;
  notes?: string | null;
  startsAt?: Date | null;
  endsAt?: Date | null;
};
export type AdvanceEntry = { id: number; remainingAmount: number };

export type PayrollLineDraft = {
  employeeId: number;
  type: string;
  sourceType?: string;
  sourceId?: number;
  label: string;
  amount: number;
  quantity?: number;
  rate?: number;
  notes?: string;
};

export type PayrollCalcResult = {
  baseSalary: number;
  regularWorkDays: number;
  presentDays: number;
  absentDays: number;
  leaveDays: number;
  lateDays: number;
  regularHours: number;
  actualHours: number;
  overtimeHours: number;
  overtimeRate: number;
  overtimeAmount: number;
  totalAllowances: number;
  totalDeductions: number;
  totalAdvances: number;
  grossSalary: number;
  netSalary: number;
  lines: PayrollLineDraft[];
};

/** Computes a full payroll snapshot from raw data — no DB calls. */
export function computePayroll(
  employeeId: number,
  baseSalaryRaw: number,
  month: number,
  year: number,
  attendance: AttendanceEntry[],
  allowances: AllowanceEntry[],
  bonuses: BonusEntry[],
  deductions: DeductionEntry[],
  recurringDeductions: RecurringDeductionEntry[],
  advances: AdvanceEntry[],
): PayrollCalcResult {
  const { start, end, days } = monthRange(month, year);
  const lines: PayrollLineDraft[] = [];
  const baseSalary = round3(baseSalaryRaw);
  lines.push({ employeeId, type: 'BASE', sourceType: 'EMPLOYEE', sourceId: employeeId, label: 'Base salary', amount: baseSalary });

  const presentDays = attendance.filter((a) => a.status === 'PRESENT').length;
  const absentDays  = attendance.filter((a) => a.status === 'ABSENT').length;
  const leaveDays   = attendance.filter((a) => a.status === 'LEAVE').length;
  const lateDays    = attendance.filter((a) => a.status === 'LATE').length;
  const actualHours  = round3(attendance.reduce((sum, a) => sum + Number(a.workHours ?? 0), 0));
  const regularHours = round3(presentDays * WORK_HOURS_PER_DAY);
  const overtimeHours = round3(Math.max(0, actualHours - regularHours));
  const hourlyRate    = days > 0 ? baseSalary / days / WORK_HOURS_PER_DAY : 0;
  const overtimeRate  = round3(hourlyRate * OVERTIME_MULTIPLIER);
  const overtimeAmount = round3(overtimeHours * overtimeRate);

  if (overtimeAmount > 0) {
    lines.push({
      employeeId, type: 'OVERTIME', sourceType: 'ATTENDANCE', label: 'Overtime',
      amount: overtimeAmount, quantity: overtimeHours, rate: overtimeRate,
    });
  }

  const absenceDeduction = round3((baseSalary / days) * absentDays);
  if (absenceDeduction > 0) {
    lines.push({
      employeeId, type: 'ATTENDANCE', sourceType: 'ATTENDANCE', label: 'Absence deduction',
      amount: -absenceDeduction, quantity: absentDays, rate: round3(baseSalary / days),
    });
  }

  for (const a of allowances.filter((x) => inPeriod(x, start, end))) {
    lines.push({ employeeId, type: 'ALLOWANCE', sourceType: 'RECURRING_ALLOWANCE', sourceId: a.id, label: a.name, amount: round3(a.amount), notes: a.notes ?? undefined });
  }
  for (const b of bonuses) {
    lines.push({ employeeId, type: 'ALLOWANCE', sourceType: 'BONUS', sourceId: b.id, label: b.reason || 'Bonus', amount: round3(b.amount) });
  }
  for (const d of recurringDeductions.filter((x) => inPeriod(x, start, end))) {
    lines.push({ employeeId, type: 'DEDUCTION', sourceType: 'RECURRING_DEDUCTION', sourceId: d.id, label: d.name, amount: -round3(d.amount), notes: d.notes ?? undefined });
  }
  for (const d of deductions) {
    lines.push({ employeeId, type: 'DEDUCTION', sourceType: 'DEDUCTION', sourceId: d.id, label: d.reason || 'Deduction', amount: -round3(d.amount) });
  }

  let grossBeforeAdvances = round3(lines.reduce((sum, l) => sum + l.amount, 0));
  for (const advance of advances) {
    if (grossBeforeAdvances <= 0) break;
    const applied = round3(Math.min(advance.remainingAmount, grossBeforeAdvances));
    if (applied <= 0) continue;
    lines.push({ employeeId, type: 'ADVANCE', sourceType: 'ADVANCE', sourceId: advance.id, label: 'Advance deduction', amount: -applied });
    grossBeforeAdvances = round3(grossBeforeAdvances - applied);
  }

  const totalAllowances = round3(lines.filter((l) => l.type === 'ALLOWANCE').reduce((s, l) => s + l.amount, 0));
  const totalDeductions  = round3(Math.abs(lines.filter((l) => l.type === 'DEDUCTION' || l.type === 'ATTENDANCE').reduce((s, l) => s + Math.min(0, l.amount), 0)));
  const totalAdvances    = round3(Math.abs(lines.filter((l) => l.type === 'ADVANCE').reduce((s, l) => s + Math.min(0, l.amount), 0)));
  const grossSalary = round3(baseSalary + totalAllowances + overtimeAmount);
  const netSalary   = round3(lines.reduce((sum, l) => sum + l.amount, 0));

  return {
    baseSalary, regularWorkDays: days,
    presentDays, absentDays, leaveDays, lateDays,
    regularHours, actualHours, overtimeHours, overtimeRate, overtimeAmount,
    totalAllowances, totalDeductions, totalAdvances,
    grossSalary, netSalary, lines,
  };
}

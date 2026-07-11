import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    payroll: { findMany: vi.fn() },
    salaryPayment: { findMany: vi.fn() },
    employee: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import {
  resolveImportedRowsForMonth,
  buildUnifiedMonthRows,
  parsePayrollRouteId,
  isImportedRowId,
} from '../payrollMonth.readModel';

const payrollFindMany = prisma.payroll.findMany as unknown as ReturnType<typeof vi.fn>;
const salaryPaymentFindMany = prisma.salaryPayment.findMany as unknown as ReturnType<typeof vi.fn>;
const employeeFindMany = prisma.employee.findMany as unknown as ReturnType<typeof vi.fn>;

// civilId 'DUP' is shared by two employees → ambiguous → never auto-merged.
const EMPLOYEES = [
  { id: 10, code: 'E1', fullName: 'أحمد', department: 'A', civilId: '111', bankAccount: 'ACC1' },
  { id: 11, code: 'E2', fullName: 'خالد', department: 'B', civilId: '222', bankAccount: 'ACC2' },
  { id: 12, code: 'E3', fullName: 'سعد', department: null, civilId: 'DUP', bankAccount: 'ACC3' },
  { id: 13, code: 'E4', fullName: 'علي', department: null, civilId: 'DUP', bankAccount: 'ACC4' },
];

const PAYMENTS = [
  { id: 1, beneficiaryName: 'أحمد', civilId: '111', beneficiaryAccount: 'ACC1', amount: 400.5, bankName: 'NBK', paymentDate: new Date('2025-06-30T00:00:00Z'), transactionId: 'T1' },
  { id: 2, beneficiaryName: 'مستفيد مجهول', civilId: null, beneficiaryAccount: null, amount: 300, bankName: null, paymentDate: null, transactionId: 'T2' },
  { id: 3, beneficiaryName: 'سعد', civilId: 'DUP', beneficiaryAccount: 'ACC3', amount: 250, bankName: 'KFH', paymentDate: null, transactionId: 'T3' },
  { id: 4, beneficiaryName: 'علي', civilId: 'DUP', beneficiaryAccount: 'UNKNOWN', amount: 260, bankName: 'KFH', paymentDate: null, transactionId: 'T4' },
];

beforeEach(() => {
  vi.clearAllMocks();
  employeeFindMany.mockResolvedValue(EMPLOYEES);
  // Distinguish the two payroll.findMany call shapes: detailed (include) vs precedence (select).
  payrollFindMany.mockResolvedValue([]);
});

describe('resolveImportedRowsForMonth — historical month with only salary_payments', () => {
  beforeEach(() => {
    salaryPaymentFindMany.mockResolvedValue(PAYMENTS);
    payrollFindMany.mockResolvedValue([]); // no computed rows for the period
  });

  it('maps the selected month/year to the sourceMonth register key', async () => {
    await resolveImportedRowsForMonth(6, 2025);
    expect(salaryPaymentFindMany).toHaveBeenCalledTimes(1);
    expect(salaryPaymentFindMany.mock.calls[0][0].where).toEqual({ sourceMonth: 'Jun-25' });
  });

  it('returns every imported transfer as a read-only, breakdown-less row with the net amount', async () => {
    const rows = await resolveImportedRowsForMonth(6, 2025);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.source).toBe('IMPORTED_TRANSFER');
      expect(r.isReadOnly).toBe(true);
      expect(r.breakdownAvailable).toBe(false);
      expect(r.status).toBe('IMPORTED_TRANSFER');
      expect(r.grossSalary).toBeNull();
      expect(r.baseSalary).toBeNull();
      expect(r.totalDeductions).toBeNull();
      expect(typeof r.id).toBe('string');
      expect(isImportedRowId(String(r.id))).toBe(true);
    }
    const byTxn = Object.fromEntries(rows.map((r) => [r.transactionId, r]));
    expect(byTxn['T1'].netSalary).toBe(400.5);
    expect(byTxn['T1'].month).toBe(6);
    expect(byTxn['T1'].year).toBe(2025);
  });

  it('resolves identity by civilId, falling back to bank account', async () => {
    const rows = await resolveImportedRowsForMonth(6, 2025);
    const byTxn = Object.fromEntries(rows.map((r) => [r.transactionId, r]));
    expect(byTxn['T1'].employeeId).toBe(10); // civilId 111
    expect(byTxn['T3'].employeeId).toBe(12); // civilId DUP ambiguous → bank ACC3
  });

  it('keeps an unmatched beneficiary visible rather than dropping it', async () => {
    const rows = await resolveImportedRowsForMonth(6, 2025);
    const t2 = rows.find((r) => r.transactionId === 'T2')!;
    expect(t2.employeeId).toBeNull();
    expect(t2.employeeName).toBe('مستفيد مجهول');
    expect(t2.netSalary).toBe(300);
  });

  it('does not merge an ambiguous identity into a real employee', async () => {
    const rows = await resolveImportedRowsForMonth(6, 2025);
    const t4 = rows.find((r) => r.transactionId === 'T4')!; // civilId DUP + unknown account
    expect(t4.employeeId).toBeNull();
  });
});

describe('resolveImportedRowsForMonth — precedence', () => {
  beforeEach(() => salaryPaymentFindMany.mockResolvedValue(PAYMENTS));

  it('suppresses the imported transfer when a non-cancelled computed payroll row exists', async () => {
    payrollFindMany.mockResolvedValue([{ employeeId: 10, status: 'APPROVED' }]);
    const rows = await resolveImportedRowsForMonth(6, 2025);
    expect(rows.find((r) => r.employeeId === 10)).toBeUndefined(); // T1 suppressed
    expect(rows).toHaveLength(3);
  });

  it('does NOT suppress when the only computed row for that employee is CANCELLED', async () => {
    payrollFindMany.mockResolvedValue([{ employeeId: 10, status: 'CANCELLED' }]);
    const rows = await resolveImportedRowsForMonth(6, 2025);
    expect(rows.find((r) => r.transactionId === 'T1')?.employeeId).toBe(10);
    expect(rows).toHaveLength(4);
  });

  it('applies an employeeId filter to resolved identity only', async () => {
    payrollFindMany.mockResolvedValue([]);
    const rows = await resolveImportedRowsForMonth(6, 2025, { employeeId: 10 });
    expect(rows).toHaveLength(1);
    expect(rows[0].employeeId).toBe(10);
  });
});

describe('resolveImportedRowsForMonth — empty period', () => {
  it('returns [] fast and never touches employee/payroll lookups', async () => {
    salaryPaymentFindMany.mockResolvedValue([]);
    const rows = await resolveImportedRowsForMonth(4, 2025);
    expect(rows).toEqual([]);
    expect(payrollFindMany).not.toHaveBeenCalled();
    expect(employeeFindMany).not.toHaveBeenCalled();
  });

  it('malformed/absent register data does not throw', async () => {
    salaryPaymentFindMany.mockResolvedValue([]);
    await expect(resolveImportedRowsForMonth(13 as unknown as number, 2025)).resolves.toEqual([]);
  });
});

describe('buildUnifiedMonthRows — mixed sources', () => {
  it('computed payroll takes precedence with no duplicate employee row', async () => {
    salaryPaymentFindMany.mockResolvedValue(PAYMENTS);
    payrollFindMany.mockImplementation((args: { include?: unknown }) => {
      if (args?.include) {
        return Promise.resolve([
          {
            id: 500, employeeId: 10, month: 6, year: 2025,
            employee: { id: 10, code: 'E1', fullName: 'أحمد', department: 'A' },
            baseSalary: 400, snapshotBaseSalary: 400, grossSalary: 450, netSalary: 430,
            totalAllowances: 50, totalDeductions: 20, totalAdvances: 0, overtimeHours: 0, overtimeAmount: 0,
            status: 'PAID', paidAt: new Date('2025-06-30T00:00:00Z'), lines: [],
          },
        ]);
      }
      return Promise.resolve([{ employeeId: 10, status: 'PAID' }]); // precedence set
    });

    const rows = await buildUnifiedMonthRows(6, 2025, {});
    const emp10 = rows.filter((r) => r.employeeId === 10);
    expect(emp10).toHaveLength(1);
    expect(emp10[0].source).toBe('COMPUTED');
    expect(emp10[0].id).toBe(500);
    // The other three imported transfers still appear.
    expect(rows.filter((r) => r.source === 'IMPORTED_TRANSFER')).toHaveLength(3);
  });

  it('omits imported rows entirely when a workflow-status filter is applied', async () => {
    salaryPaymentFindMany.mockResolvedValue(PAYMENTS);
    payrollFindMany.mockResolvedValue([]); // detailed computed empty
    const rows = await buildUnifiedMonthRows(6, 2025, { status: 'DRAFT' });
    expect(rows.every((r) => r.source === 'COMPUTED')).toBe(true);
    expect(salaryPaymentFindMany).not.toHaveBeenCalled();
  });
});

describe('parsePayrollRouteId — mutation safety', () => {
  it('accepts a positive integer id', () => {
    expect(parsePayrollRouteId('5')).toBe(5);
  });

  it('rejects an imported read-model id', () => {
    expect(() => parsePayrollRouteId('imported:3')).toThrow();
  });

  it('rejects non-numeric, zero, negative, and fractional ids', () => {
    expect(() => parsePayrollRouteId('abc')).toThrow();
    expect(() => parsePayrollRouteId('0')).toThrow();
    expect(() => parsePayrollRouteId('-2')).toThrow();
    expect(() => parsePayrollRouteId('5.5')).toThrow();
    expect(() => parsePayrollRouteId('')).toThrow();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    payroll: { findUnique: vi.fn() },
    account: { upsert: vi.fn(), findMany: vi.fn() },
    journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { postPayrollToGL, reversePayrollGL } from '../payroll.accounting';
import {
  SYSTEM_ACCOUNT_CODES,
  clearAccountCache,
} from '../../accounting/accounting.accounts';

// Account rows — must include SALARIES_PAYABLE (2100) added in Phase D
const ACCOUNT_ROWS = [
  { id: 10, code: SYSTEM_ACCOUNT_CODES.CASH },
  { id: 20, code: SYSTEM_ACCOUNT_CODES.BANK },
  { id: 30, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE },
  { id: 40, code: SYSTEM_ACCOUNT_CODES.INVENTORY },
  { id: 50, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE },
  { id: 60, code: SYSTEM_ACCOUNT_CODES.SALARIES_PAYABLE },
  { id: 70, code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE },
  { id: 80, code: SYSTEM_ACCOUNT_CODES.PURCHASES },
  { id: 90, code: SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE },
  { id: 100, code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE },
];

const mockTx = {
  payroll: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn() },
};

const basePayroll = {
  id: 1,
  employeeId: 10,
  month: 6,
  year: 2026,
  netSalary: 450.000,
  paymentMethod: 'BANK',
  employee: { fullName: 'أحمد محمد' },
};

type JournalLine = { accountId: number; debit: number; credit: number; description: string };

function lineTotals(call: ReturnType<typeof vi.fn>) {
  const lines = call.mock.calls[0][0].data.lines.create as JournalLine[];
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return { lines, totalDebit, totalCredit };
}

describe('Payroll GL Posting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.payroll.findUnique.mockResolvedValue(basePayroll);
  });

  it('creates a balanced journal entry when payroll is paid (BANK)', async () => {
    await postPayrollToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create;
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(450.000, 3);
    expect(call.mock.calls[0][0].data.referenceType).toBe('PAYROLL');
    expect(call.mock.calls[0][0].data.referenceId).toBe(1);
    expect(call.mock.calls[0][0].data.status).toBe('POSTED');
  });

  it('debits PAYROLL_EXPENSE (5100) always', async () => {
    await postPayrollToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines } = lineTotals(call);
    const expLine = lines.find((l) => l.accountId === 90); // PAYROLL_EXPENSE id=90
    expect(expLine).toBeDefined();
    expect(expLine!.debit).toBeCloseTo(450.000, 3);
    expect(expLine!.credit).toBe(0);
  });

  it('credits BANK (1010, id=20) when paymentMethod is BANK', async () => {
    await postPayrollToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines } = lineTotals(call);
    const bankLine = lines.find((l) => l.accountId === 20); // BANK id=20
    expect(bankLine).toBeDefined();
    expect(bankLine!.credit).toBeCloseTo(450.000, 3);
    expect(bankLine!.debit).toBe(0);
  });

  it('credits CASH (1000, id=10) when paymentMethod is CASH', async () => {
    mockTx.payroll.findUnique.mockResolvedValue({ ...basePayroll, paymentMethod: 'CASH' });

    await postPayrollToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    const cashLine = lines.find((l) => l.accountId === 10); // CASH id=10
    expect(cashLine).toBeDefined();
    expect(cashLine!.credit).toBeCloseTo(450.000, 3);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
  });

  it('credits SALARIES_PAYABLE (2100, id=60) when paymentMethod is ACCOUNTS_PAYABLE', async () => {
    mockTx.payroll.findUnique.mockResolvedValue({ ...basePayroll, paymentMethod: 'ACCOUNTS_PAYABLE' });

    await postPayrollToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    const spLine = lines.find((l) => l.accountId === 60); // SALARIES_PAYABLE id=60
    expect(spLine).toBeDefined();
    expect(spLine!.credit).toBeCloseTo(450.000, 3);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
  });

  it('defaults to BANK when paymentMethod is absent (null)', async () => {
    mockTx.payroll.findUnique.mockResolvedValue({ ...basePayroll, paymentMethod: null });

    await postPayrollToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines } = lineTotals(call);
    const bankLine = lines.find((l) => l.accountId === 20);
    expect(bankLine).toBeDefined();
    expect(bankLine!.credit).toBeCloseTo(450.000, 3);
  });

  it('does not post if a GL entry already exists (double posting guard)', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 99 });

    await postPayrollToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('skips posting for a zero net-salary payroll', async () => {
    mockTx.payroll.findUnique.mockResolvedValue({ ...basePayroll, netSalary: 0 });

    await postPayrollToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('GL entry is balanced for various KWD amounts (3dp precision)', async () => {
    const amounts = [300, 1250.500, 750.750, 0.001, 4999.999];
    for (const netSalary of amounts) {
      vi.clearAllMocks();
      clearAccountCache();
      mockTx.journalEntry.findFirst.mockResolvedValue(null);
      mockTx.journalEntry.count.mockResolvedValue(0);
      mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
      mockTx.account.upsert.mockResolvedValue({});
      mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
      mockTx.payroll.findUnique.mockResolvedValue({ ...basePayroll, netSalary });

      await postPayrollToGL(mockTx as any, 1);

      const call = mockTx.journalEntry.create;
      const { totalDebit, totalCredit } = lineTotals(call);
      expect(totalDebit).toBeCloseTo(totalCredit, 3);
      expect(totalDebit).toBeCloseTo(netSalary, 3);
    }
  });
});

describe('Payroll GL Reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 2, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('creates a swapped reversal entry (PAYROLL_REVERSAL)', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [
          { accountId: 90, debit: 450.000, credit: 0, description: 'مصروف راتب' },
          { accountId: 20, debit: 0, credit: 450.000, description: 'تحويل بنكي' },
        ],
      })
      .mockResolvedValueOnce(null); // no existing reversal

    await reversePayrollGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create;
    const data = call.mock.calls[0][0].data;
    expect(data.referenceType).toBe('PAYROLL_REVERSAL');
    expect(data.referenceId).toBe(1);

    const { lines, totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    // BANK line should now be DEBIT (reversed)
    const bankLine = lines.find((l) => l.accountId === 20)!;
    expect(bankLine.debit).toBeCloseTo(450.000, 3);
    expect(bankLine.credit).toBe(0);
    // PAYROLL_EXPENSE line should now be CREDIT (reversed)
    const expLine = lines.find((l) => l.accountId === 90)!;
    expect(expLine.credit).toBeCloseTo(450.000, 3);
    expect(expLine.debit).toBe(0);
  });

  it('does not create reversal if payroll was never posted to GL', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null);

    await reversePayrollGL(mockTx as any, 999);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not create a duplicate reversal', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [{ accountId: 90, debit: 300, credit: 0, description: '' }],
      })
      .mockResolvedValueOnce({ id: 88 }); // reversal already exists

    await reversePayrollGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('reversal entry is always balanced', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [
          { accountId: 90, debit: 1234.567, credit: 0, description: '' },
          { accountId: 60, debit: 0, credit: 1234.567, description: '' },
        ],
      })
      .mockResolvedValueOnce(null);

    await reversePayrollGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(1234.567, 3);
  });
});

describe('Payroll GL — account codes distinctness', () => {
  it('PAYROLL_EXPENSE (5100) is distinct from GENERAL_EXPENSE (5200)', () => {
    expect(SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE).toBe('5100');
    expect(SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE).toBe('5200');
    expect(SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE).not.toBe(SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE);
  });

  it('SALARIES_PAYABLE (2100) is distinct from ACCOUNTS_PAYABLE (2000)', () => {
    expect(SYSTEM_ACCOUNT_CODES.SALARIES_PAYABLE).toBe('2100');
    expect(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE).toBe('2000');
    expect(SYSTEM_ACCOUNT_CODES.SALARIES_PAYABLE).not.toBe(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE);
  });
});

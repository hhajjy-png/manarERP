import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postSalaryPaymentToGL, reverseSalaryPaymentGL } from '../salaryPayment.accounting';
import { SYSTEM_ACCOUNT_CODES, clearAccountCache } from '../../accounting/accounting.accounts';

const ACCOUNT_ROWS = [
  { id: 10, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE },
  { id: 20, code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE },
  { id: 30, code: SYSTEM_ACCOUNT_CODES.CASH },
  { id: 40, code: SYSTEM_ACCOUNT_CODES.BANK },
  { id: 50, code: SYSTEM_ACCOUNT_CODES.INVENTORY },
  { id: 60, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE },
  { id: 65, code: SYSTEM_ACCOUNT_CODES.SALARIES_PAYABLE },
  { id: 70, code: SYSTEM_ACCOUNT_CODES.PURCHASES },
  { id: 80, code: SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE },  // 5100
  { id: 90, code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE },
];

const mockTx = {
  salaryPayment: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), create: vi.fn() },
};

function lineTotals(call: any) {
  const lines = call.data.lines.create as { accountId: number; debit: number; credit: number }[];
  return {
    lines,
    totalDebit: lines.reduce((s, l) => s + l.debit, 0),
    totalCredit: lines.reduce((s, l) => s + l.credit, 0),
  };
}

const basePayment = {
  id: 1,
  beneficiaryName: 'أحمد السائق',
  amount: 320.750,
  paymentDate: new Date('2026-03-31'),
  createdAt: new Date('2026-04-02'),
  sourceMonth: 'Mar-26',
  duplicateFlag: null,
  status: 'PROCESSED',
};

describe('postSalaryPaymentToGL — Dr Payroll Expense / Cr Bank', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1 });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.salaryPayment.findUnique.mockResolvedValue(basePayment);
  });

  it('posts a balanced entry: debit PAYROLL_EXPENSE (5100), credit BANK (1010)', async () => {
    await postSalaryPaymentToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(320.750, 3);

    const payrollLine = lines.find((l) => l.accountId === 80)!; // PAYROLL_EXPENSE
    const bankLine = lines.find((l) => l.accountId === 40)!;    // BANK
    expect(payrollLine.debit).toBeCloseTo(320.750, 3);
    expect(payrollLine.credit).toBe(0);
    expect(bankLine.credit).toBeCloseTo(320.750, 3);
    expect(bankLine.debit).toBe(0);

    expect(call.data.referenceType).toBe('SALARY_PAYMENT');
    expect(call.data.referenceId).toBe(1);
    expect(call.data.status).toBe('POSTED');
    expect(call.data.date).toEqual(basePayment.paymentDate); // accounting date = payment date
  });

  it('is idempotent — skips when a SALARY_PAYMENT entry already exists', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 99 });
    await postSalaryPaymentToGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('skips a zero-amount payment', async () => {
    mockTx.salaryPayment.findUnique.mockResolvedValue({ ...basePayment, amount: 0 });
    await postSalaryPaymentToGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('skips a payment flagged as a duplicate (no double-counting of salary)', async () => {
    mockTx.salaryPayment.findUnique.mockResolvedValue({ ...basePayment, duplicateFlag: 'DUPLICATE' });
    await postSalaryPaymentToGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('falls back to createdAt when paymentDate is null (never today)', async () => {
    mockTx.salaryPayment.findUnique.mockResolvedValue({ ...basePayment, paymentDate: null });
    await postSalaryPaymentToGL(mockTx as any, 1);
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    expect(call.data.date).toEqual(basePayment.createdAt);
  });

  it('does nothing when the payment does not exist', async () => {
    mockTx.salaryPayment.findUnique.mockResolvedValue(null);
    await postSalaryPaymentToGL(mockTx as any, 999);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('reverseSalaryPaymentGL — audit-preserving reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.create.mockResolvedValue({ id: 2 });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('creates a swapped reversal entry for a posted salary payment', async () => {
    mockTx.journalEntry.findFirst.mockImplementation(async (args: any) => {
      if (args?.where?.entryNumber) return null;
      if (args?.where?.referenceType === 'SALARY_PAYMENT_REVERSAL') return null;
      if (args?.where?.referenceType === 'SALARY_PAYMENT') {
        return {
          id: 5, revision: 1, status: 'POSTED', entryNumber: 'JRN-2026-00010',
          lines: [
            { accountId: 80, debit: 320.750, credit: 0, description: 'مصروف راتب' },
            { accountId: 40, debit: 0, credit: 320.750, description: 'تحويل بنكي' },
          ],
        };
      }
      return null;
    });

    await reverseSalaryPaymentGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    expect(call.data.referenceType).toBe('SALARY_PAYMENT_REVERSAL');
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    // bank line is now a debit (money back), payroll expense a credit (expense reversed)
    expect(lines.find((l) => l.accountId === 40)!.debit).toBeCloseTo(320.750, 3);
    expect(lines.find((l) => l.accountId === 80)!.credit).toBeCloseTo(320.750, 3);
  });
});

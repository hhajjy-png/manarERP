import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  postExpenseToGL,
  reverseExpenseFromGL,
  createBalancedJournalEntry,
} from '../expenses.accounting';
import {
  SYSTEM_ACCOUNT_CODES,
  clearAccountCache,
} from '../../accounting/accounting.accounts';

// Account IDs — must include ALL system codes for ensureSystemAccounts completeness check
const ACCOUNT_ROWS = [
  { id: 10, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE },
  { id: 20, code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE },
  { id: 30, code: SYSTEM_ACCOUNT_CODES.CASH },
  { id: 40, code: SYSTEM_ACCOUNT_CODES.BANK },
  { id: 50, code: SYSTEM_ACCOUNT_CODES.INVENTORY },
  { id: 60, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE },
  { id: 70, code: SYSTEM_ACCOUNT_CODES.PURCHASES },
  { id: 80, code: SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE },
  { id: 90, code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE },
];

const mockTx = {
  expense: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
};

function lineTotals(call: any) {
  const lines = call.data.lines.create as { debit: number; credit: number }[];
  const totalDebit = lines.reduce((s: number, l: any) => s + l.debit, 0);
  const totalCredit = lines.reduce((s: number, l: any) => s + l.credit, 0);
  return { lines, totalDebit, totalCredit };
}

const baseExpense = {
  id: 1,
  code: 'EXP-2026-00001',
  category: 'FUEL',
  description: 'وقود المركبات',
  amount: 250.500,
  date: new Date('2026-06-01'),
  status: 'APPROVED',
};

describe('Expense GL Posting (double-entry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.expense.findUnique.mockResolvedValue(baseExpense);
  });

  // Test 1: Expense approval creates a balanced JournalEntry
  it('creates a balanced journal entry when expense is approved', async () => {
    await postExpenseToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(250.500, 3);
    expect(call.data.referenceType).toBe('EXPENSE');
    expect(call.data.referenceId).toBe(1);
    expect(call.data.status).toBe('POSTED');
  });

  // Test 2: Debit = GENERAL_EXPENSE (5200), Credit = CASH (1000)
  it('debits GENERAL_EXPENSE and credits CASH', async () => {
    await postExpenseToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create.mock.calls[0][0];
    const { lines } = lineTotals(call);
    const expLine = lines.find((l: any) => l.accountId === 90)!; // GENERAL_EXPENSE id=90
    const cashLine = lines.find((l: any) => l.accountId === 30)!; // CASH id=30
    expect(expLine.debit).toBeCloseTo(250.500, 3);
    expect(expLine.credit).toBe(0);
    expect(cashLine.credit).toBeCloseTo(250.500, 3);
    expect(cashLine.debit).toBe(0);
  });

  // Test 3: Duplicate posting prevented — code-level guard
  it('does not post if a journal entry already exists for the expense (duplicate guard)', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 99 }); // already posted

    await postExpenseToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  // Test 4: Re-approve does not duplicate — calling postExpenseToGL twice
  it('calling postExpenseToGL twice creates only one journal entry', async () => {
    // First call: no existing entry
    mockTx.journalEntry.findFirst.mockResolvedValueOnce(null);
    await postExpenseToGL(mockTx as any, 1);

    // Second call: entry now exists (simulate DB state after first call)
    clearAccountCache();
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.journalEntry.findFirst.mockResolvedValueOnce({ id: 1 });
    await postExpenseToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce(); // only once
  });

  // Test 5: Zero-amount expense is skipped
  it('skips posting for a zero-amount expense', async () => {
    mockTx.expense.findUnique.mockResolvedValue({ ...baseExpense, amount: 0 });

    await postExpenseToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  // Test 6: Unbalanced entry is rejected — createBalancedJournalEntry guard
  it('rejects an unbalanced journal entry and writes nothing', async () => {
    await expect(
      createBalancedJournalEntry(mockTx as any, {
        date: new Date(),
        description: 'test',
        referenceType: 'EXPENSE',
        referenceId: 1,
        lines: [
          { accountId: 90, debit: 100, credit: 0, description: 'مصروف' },
          { accountId: 30, debit: 0, credit: 50, description: 'صندوق' }, // 50 ≠ 100
        ],
      }),
    ).rejects.toThrow('غير متوازن');
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('Expense GL Reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 2, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  // Test 7: Reversal creates opposite (swapped debit/credit) journal entry
  it('creates a swapped reversal entry for a cancelled approved expense', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [
          { accountId: 90, debit: 250.500, credit: 0, description: 'مصروف عام — وقود' },
          { accountId: 30, debit: 0, credit: 250.500, description: 'صرف نقدي — EXP-001' },
        ],
      })
      .mockResolvedValueOnce(null); // no existing reversal

    await reverseExpenseFromGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    expect(call.data.referenceType).toBe('EXPENSE_REVERSAL');
    expect(call.data.referenceId).toBe(1);
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    // CASH line is now DEBIT (reversed)
    const cashLine = lines.find((l: any) => l.accountId === 30)!;
    expect(cashLine.debit).toBeCloseTo(250.500, 3);
    expect(cashLine.credit).toBe(0);
    // GENERAL_EXPENSE line is now CREDIT (reversed)
    const expLine = lines.find((l: any) => l.accountId === 90)!;
    expect(expLine.credit).toBeCloseTo(250.500, 3);
    expect(expLine.debit).toBe(0);
  });

  // Test 8: No reversal created if expense was never posted to GL
  it('does not create a reversal if the expense was never posted to GL', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null); // no original entry

    await reverseExpenseFromGL(mockTx as any, 999);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  // Test 9: Duplicate reversal prevented
  it('does not create a duplicate reversal', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [{ accountId: 90, debit: 100, credit: 0, description: '' }],
      })
      .mockResolvedValueOnce({ id: 77 }); // reversal already exists

    await reverseExpenseFromGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  // Test 10: Reversal is balanced
  it('reversal entry is always balanced', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [
          { accountId: 90, debit: 1234.567, credit: 0, description: '' },
          { accountId: 30, debit: 0, credit: 1234.567, description: '' },
        ],
      })
      .mockResolvedValueOnce(null);

    await reverseExpenseFromGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create.mock.calls[0][0];
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(1234.567, 3);
  });
});

describe('Existing systems unchanged', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  // Test 11: GENERAL_EXPENSE account is distinct from PAYROLL_EXPENSE — no cross-contamination
  it('GENERAL_EXPENSE (5200) is distinct from PAYROLL_EXPENSE (5100)', () => {
    expect(SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE).toBe('5200');
    expect(SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE).toBe('5100');
    expect(SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE).not.toBe(SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE);
  });

  // Test 12: postExpenseToGL is balanced across various KWD amounts
  it('GL posting is balanced for various KWD amounts (3dp precision)', async () => {
    const amounts = [100, 500.5, 1234.123, 0.001, 7.005];
    for (const amount of amounts) {
      vi.clearAllMocks();
      clearAccountCache();
      mockTx.journalEntry.findFirst.mockResolvedValue(null);
      mockTx.journalEntry.count.mockResolvedValue(0);
      mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
      mockTx.account.upsert.mockResolvedValue({});
      mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
      mockTx.expense.findUnique.mockResolvedValue({ ...baseExpense, amount });

      await postExpenseToGL(mockTx as any, 1);

      const call = mockTx.journalEntry.create.mock.calls[0][0];
      const { totalDebit, totalCredit } = lineTotals(call);
      expect(totalDebit).toBeCloseTo(totalCredit, 3);
      expect(totalDebit).toBeCloseTo(amount, 3);
    }
  });
});

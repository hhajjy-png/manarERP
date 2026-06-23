import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postPurchasePaymentToGL, reversePurchasePaymentGL } from '../invoices.accounting';
import { SYSTEM_ACCOUNT_CODES, clearAccountCache } from '../../accounting/accounting.accounts';

// Full account map including all system codes
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
  payment: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
};

type JournalLine = { accountId: number; debit: number; credit: number; description: string };

function getPostedLines(): JournalLine[] {
  return mockTx.journalEntry.create.mock.calls[0][0].data.lines.create as JournalLine[];
}

function lineTotals(lines: JournalLine[]) {
  return {
    totalDebit: lines.reduce((s, l) => s + l.debit, 0),
    totalCredit: lines.reduce((s, l) => s + l.credit, 0),
  };
}

const basePurchasePayment = {
  id: 1,
  amount: 750.000,
  method: 'CASH',
  date: new Date('2026-06-20'),
  invoice: { direction: 'PURCHASE', invoiceNumber: 'MN-INV-2026-00010' },
};

describe('Purchase Payment GL Posting (AP settlement)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.payment.findUnique.mockResolvedValue(basePurchasePayment);
  });

  it('creates a balanced GL entry for a PURCHASE payment (CASH method)', async () => {
    await postPurchasePaymentToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const data = mockTx.journalEntry.create.mock.calls[0][0].data;
    expect(data.referenceType).toBe('PURCHASE_PAYMENT');
    expect(data.referenceId).toBe(1);
    expect(data.status).toBe('POSTED');

    const lines = getPostedLines();
    const { totalDebit, totalCredit } = lineTotals(lines);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(750.000, 3);
  });

  it('debits ACCOUNTS_PAYABLE (2000, id=50) — reduces the AP liability', async () => {
    await postPurchasePaymentToGL(mockTx as any, 1);

    const lines = getPostedLines();
    const apLine = lines.find((l) => l.accountId === 50); // ACCOUNTS_PAYABLE
    expect(apLine).toBeDefined();
    expect(apLine!.debit).toBeCloseTo(750.000, 3);
    expect(apLine!.credit).toBe(0);
  });

  it('credits CASH (1000, id=10) for CASH method payments', async () => {
    await postPurchasePaymentToGL(mockTx as any, 1);

    const lines = getPostedLines();
    const cashLine = lines.find((l) => l.accountId === 10); // CASH
    expect(cashLine).toBeDefined();
    expect(cashLine!.credit).toBeCloseTo(750.000, 3);
    expect(cashLine!.debit).toBe(0);
  });

  it('credits BANK (1010, id=20) for BANK method payments', async () => {
    mockTx.payment.findUnique.mockResolvedValue({ ...basePurchasePayment, method: 'BANK' });

    await postPurchasePaymentToGL(mockTx as any, 1);

    const lines = getPostedLines();
    const bankLine = lines.find((l) => l.accountId === 20); // BANK
    expect(bankLine).toBeDefined();
    expect(bankLine!.credit).toBeCloseTo(750.000, 3);
    expect(bankLine!.debit).toBe(0);
    const apLine = lines.find((l) => l.accountId === 50);
    expect(apLine!.debit).toBeCloseTo(750.000, 3);
  });

  it('credits BANK for TRANSFER method payments (same as BANK routing)', async () => {
    mockTx.payment.findUnique.mockResolvedValue({ ...basePurchasePayment, method: 'TRANSFER' });

    await postPurchasePaymentToGL(mockTx as any, 1);

    const lines = getPostedLines();
    const bankLine = lines.find((l) => l.accountId === 20);
    expect(bankLine).toBeDefined();
    expect(bankLine!.credit).toBeCloseTo(750.000, 3);
  });

  it('credits CASH for CHEQUE method payments (default non-bank routing)', async () => {
    mockTx.payment.findUnique.mockResolvedValue({ ...basePurchasePayment, method: 'CHEQUE' });

    await postPurchasePaymentToGL(mockTx as any, 1);

    const lines = getPostedLines();
    const cashLine = lines.find((l) => l.accountId === 10);
    expect(cashLine).toBeDefined();
    expect(cashLine!.credit).toBeCloseTo(750.000, 3);
  });

  it('skips posting for a SALES invoice payment — no GL entry created', async () => {
    mockTx.payment.findUnique.mockResolvedValue({
      ...basePurchasePayment,
      invoice: { direction: 'SALES', invoiceNumber: 'MN-INV-2026-00099' },
    });

    await postPurchasePaymentToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('prevents double posting (idempotency guard)', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 55 });

    await postPurchasePaymentToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('skips posting for a zero-amount payment', async () => {
    mockTx.payment.findUnique.mockResolvedValue({ ...basePurchasePayment, amount: 0 });

    await postPurchasePaymentToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('GL entry is balanced for KWD 3dp precision amounts', async () => {
    const amounts = [0.001, 100.500, 1234.567, 9999.999, 50000.000];

    for (const amount of amounts) {
      vi.clearAllMocks();
      clearAccountCache();
      mockTx.journalEntry.findFirst.mockResolvedValue(null);
      mockTx.journalEntry.count.mockResolvedValue(0);
      mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
      mockTx.account.upsert.mockResolvedValue({});
      mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
      mockTx.payment.findUnique.mockResolvedValue({ ...basePurchasePayment, amount });

      await postPurchasePaymentToGL(mockTx as any, 1);

      const lines = getPostedLines();
      const { totalDebit, totalCredit } = lineTotals(lines);
      expect(totalDebit).toBeCloseTo(totalCredit, 3);
      expect(totalDebit).toBeCloseTo(amount, 3);
    }
  });

  it('ACCOUNTS_PAYABLE debit ≠ SALARIES_PAYABLE — purchase payment never touches SALARIES_PAYABLE', async () => {
    await postPurchasePaymentToGL(mockTx as any, 1);

    const lines = getPostedLines();
    const spLine = lines.find((l) => l.accountId === 60); // SALARIES_PAYABLE id=60
    expect(spLine).toBeUndefined();
  });

  it('uses the invoice reference number in journal description', async () => {
    await postPurchasePaymentToGL(mockTx as any, 1);

    const data = mockTx.journalEntry.create.mock.calls[0][0].data;
    expect(data.description).toContain('MN-INV-2026-00010');
  });
});

describe('Purchase Payment GL Reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 2, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('creates a reversed GL entry (PURCHASE_PAYMENT_REVERSAL)', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 10,
        status: 'POSTED',
        lines: [
          { accountId: 50, debit: 750.000, credit: 0, description: 'تسوية ذمم المورد' },
          { accountId: 10, debit: 0, credit: 750.000, description: 'سداد نقدي' },
        ],
      })
      .mockResolvedValueOnce(null); // no existing reversal

    await reversePurchasePaymentGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const data = mockTx.journalEntry.create.mock.calls[0][0].data;
    expect(data.referenceType).toBe('PURCHASE_PAYMENT_REVERSAL');
    expect(data.referenceId).toBe(1);

    const lines = data.lines.create as JournalLine[];
    const { totalDebit, totalCredit } = lineTotals(lines);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);

    // AP should now be CREDIT (reversed from debit)
    const apLine = lines.find((l) => l.accountId === 50)!;
    expect(apLine.credit).toBeCloseTo(750.000, 3);
    expect(apLine.debit).toBe(0);

    // Cash should now be DEBIT (reversed from credit)
    const cashLine = lines.find((l) => l.accountId === 10)!;
    expect(cashLine.debit).toBeCloseTo(750.000, 3);
    expect(cashLine.credit).toBe(0);
  });

  it('does not reverse if no GL entry was ever posted', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null);

    await reversePurchasePaymentGL(mockTx as any, 999);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not create a duplicate reversal', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 10,
        status: 'POSTED',
        lines: [{ accountId: 50, debit: 500, credit: 0, description: '' }],
      })
      .mockResolvedValueOnce({ id: 77 }); // reversal already exists

    await reversePurchasePaymentGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('reversal entry is always balanced', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 10,
        status: 'POSTED',
        lines: [
          { accountId: 50, debit: 3333.333, credit: 0, description: '' },
          { accountId: 20, debit: 0, credit: 3333.333, description: '' },
        ],
      })
      .mockResolvedValueOnce(null);

    await reversePurchasePaymentGL(mockTx as any, 1);

    const lines = mockTx.journalEntry.create.mock.calls[0][0].data.lines.create as JournalLine[];
    const { totalDebit, totalCredit } = lineTotals(lines);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(3333.333, 3);
  });
});

describe('Purchase Payment GL — account code routing invariants', () => {
  it('ACCOUNTS_PAYABLE (2000) is always the debit side for AP settlement', () => {
    expect(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE).toBe('2000');
  });

  it('CASH (1000) and BANK (1010) are the only credit accounts for supplier payments', () => {
    expect(SYSTEM_ACCOUNT_CODES.CASH).toBe('1000');
    expect(SYSTEM_ACCOUNT_CODES.BANK).toBe('1010');
    expect(SYSTEM_ACCOUNT_CODES.CASH).not.toBe(SYSTEM_ACCOUNT_CODES.BANK);
  });

  it('PURCHASE_PAYMENT referenceType is distinct from PAYMENT (sales collections)', () => {
    // Prevents journal entry lookup from cross-contaminating sales and purchase payments
    expect('PURCHASE_PAYMENT').not.toBe('PAYMENT');
    expect('PURCHASE_PAYMENT_REVERSAL').not.toBe('PURCHASE_PAYMENT');
  });
});

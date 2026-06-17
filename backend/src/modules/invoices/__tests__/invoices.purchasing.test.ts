import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    account: { upsert: vi.fn(), findMany: vi.fn() },
    journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
  },
}));

import { postPurchaseInvoiceToGL, reversePurchaseInvoiceGL } from '../invoices.accounting';
import {
  SYSTEM_ACCOUNT_CODES,
  clearAccountCache,
} from '../../accounting/accounting.accounts';

// All system accounts including SALARIES_PAYABLE added in Phase D
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
  invoice: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
};

const basePurchaseInvoice = {
  id: 1,
  invoiceNumber: 'INV-2026-00001',
  direction: 'PURCHASE',
  status: 'ACTIVE',
  total: 1500.000,
  paymentMethod: 'ACCOUNTS_PAYABLE',
  issueDate: new Date('2026-06-17'),
};

type JournalLine = { accountId: number; debit: number; credit: number; description: string };

function lineTotals(call: ReturnType<typeof vi.fn>) {
  const lines = call.mock.calls[0][0].data.lines.create as JournalLine[];
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return { lines, totalDebit, totalCredit };
}

describe('Purchase Invoice GL Posting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.invoice.findUnique.mockResolvedValue(basePurchaseInvoice);
  });

  it('creates a balanced GL entry for a PURCHASE invoice', async () => {
    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create;
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(1500.000, 3);
    expect(call.mock.calls[0][0].data.referenceType).toBe('PURCHASE_INVOICE');
    expect(call.mock.calls[0][0].data.referenceId).toBe(1);
    expect(call.mock.calls[0][0].data.status).toBe('POSTED');
  });

  it('debits PURCHASES (5000, id=80) always', async () => {
    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines } = lineTotals(call);
    const purchaseLine = lines.find((l) => l.accountId === 80); // PURCHASES id=80
    expect(purchaseLine).toBeDefined();
    expect(purchaseLine!.debit).toBeCloseTo(1500.000, 3);
    expect(purchaseLine!.credit).toBe(0);
  });

  it('credits ACCOUNTS_PAYABLE (2000, id=50) when paymentMethod is ACCOUNTS_PAYABLE', async () => {
    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines } = lineTotals(call);
    const apLine = lines.find((l) => l.accountId === 50); // ACCOUNTS_PAYABLE id=50
    expect(apLine).toBeDefined();
    expect(apLine!.credit).toBeCloseTo(1500.000, 3);
    expect(apLine!.debit).toBe(0);
  });

  it('defaults to ACCOUNTS_PAYABLE when paymentMethod is null', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...basePurchaseInvoice, paymentMethod: null });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    const apLine = lines.find((l) => l.accountId === 50);
    expect(apLine).toBeDefined();
    expect(apLine!.credit).toBeCloseTo(1500.000, 3);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
  });

  it('credits CASH (1000, id=10) when paymentMethod is CASH', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...basePurchaseInvoice, paymentMethod: 'CASH' });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    const cashLine = lines.find((l) => l.accountId === 10);
    expect(cashLine).toBeDefined();
    expect(cashLine!.credit).toBeCloseTo(1500.000, 3);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
  });

  it('credits BANK (1010, id=20) when paymentMethod is BANK', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...basePurchaseInvoice, paymentMethod: 'BANK' });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    const bankLine = lines.find((l) => l.accountId === 20);
    expect(bankLine).toBeDefined();
    expect(bankLine!.credit).toBeCloseTo(1500.000, 3);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
  });

  it('does not post for a SALES invoice', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...basePurchaseInvoice, direction: 'SALES' });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not post for a CANCELLED invoice', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...basePurchaseInvoice, status: 'CANCELLED' });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not post if GL entry already exists (double posting guard)', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 55 });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('skips posting for a zero-total invoice', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...basePurchaseInvoice, total: 0 });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('GL entry is balanced for various KWD amounts (3dp precision)', async () => {
    const amounts = [500, 2500.500, 100.001, 9999.999, 0.001];
    for (const total of amounts) {
      vi.clearAllMocks();
      clearAccountCache();
      mockTx.journalEntry.findFirst.mockResolvedValue(null);
      mockTx.journalEntry.count.mockResolvedValue(0);
      mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
      mockTx.account.upsert.mockResolvedValue({});
      mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
      mockTx.invoice.findUnique.mockResolvedValue({ ...basePurchaseInvoice, total });

      await postPurchaseInvoiceToGL(mockTx as any, 1);

      const call = mockTx.journalEntry.create;
      const { totalDebit, totalCredit } = lineTotals(call);
      expect(totalDebit).toBeCloseTo(totalCredit, 3);
      expect(totalDebit).toBeCloseTo(total, 3);
    }
  });

  it('ACCOUNTS_PAYABLE (2000) ≠ SALARIES_PAYABLE (2100) — purchase route never hits SALARIES_PAYABLE', async () => {
    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { lines } = lineTotals(call);
    const spLine = lines.find((l) => l.accountId === 60); // SALARIES_PAYABLE id=60
    expect(spLine).toBeUndefined();
  });
});

describe('Purchase Invoice GL Reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 2, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('creates a swapped reversal entry (PURCHASE_INVOICE_REVERSAL)', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 9,
        status: 'POSTED',
        lines: [
          { accountId: 80, debit: 1500.000, credit: 0, description: 'مشتريات' },
          { accountId: 50, debit: 0, credit: 1500.000, description: 'ذمم مورد' },
        ],
      })
      .mockResolvedValueOnce(null); // no existing reversal

    await reversePurchaseInvoiceGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create;
    const data = call.mock.calls[0][0].data;
    expect(data.referenceType).toBe('PURCHASE_INVOICE_REVERSAL');
    expect(data.referenceId).toBe(1);

    const { lines, totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    // ACCOUNTS_PAYABLE should now be DEBIT (reversed)
    const apLine = lines.find((l) => l.accountId === 50)!;
    expect(apLine.debit).toBeCloseTo(1500.000, 3);
    expect(apLine.credit).toBe(0);
    // PURCHASES should now be CREDIT (reversed)
    const purchLine = lines.find((l) => l.accountId === 80)!;
    expect(purchLine.credit).toBeCloseTo(1500.000, 3);
    expect(purchLine.debit).toBe(0);
  });

  it('does not create reversal if invoice was never posted to GL', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null);

    await reversePurchaseInvoiceGL(mockTx as any, 999);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not create a duplicate reversal', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 9,
        status: 'POSTED',
        lines: [{ accountId: 80, debit: 800, credit: 0, description: '' }],
      })
      .mockResolvedValueOnce({ id: 77 }); // reversal already exists

    await reversePurchaseInvoiceGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('reversal entry is always balanced', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 9,
        status: 'POSTED',
        lines: [
          { accountId: 80, debit: 3333.333, credit: 0, description: '' },
          { accountId: 50, debit: 0, credit: 3333.333, description: '' },
        ],
      })
      .mockResolvedValueOnce(null);

    await reversePurchaseInvoiceGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create;
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(3333.333, 3);
  });
});

describe('Purchase Invoice GL — account codes routing', () => {
  it('PURCHASES (5000) is the correct debit account for purchase invoices', () => {
    expect(SYSTEM_ACCOUNT_CODES.PURCHASES).toBe('5000');
  });

  it('ACCOUNTS_PAYABLE (2000) is the default credit for AP-method purchase invoices', () => {
    expect(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE).toBe('2000');
  });

  it('ACCOUNTS_PAYABLE (2000) and SALARIES_PAYABLE (2100) are distinct accounts', () => {
    expect(SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE).not.toBe(SYSTEM_ACCOUNT_CODES.SALARIES_PAYABLE);
    expect(SYSTEM_ACCOUNT_CODES.SALARIES_PAYABLE).toBe('2100');
  });
});

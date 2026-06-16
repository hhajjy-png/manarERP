import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  postInvoiceToGL,
  postPaymentToGL,
  reverseInvoiceFromGL,
  createBalancedJournalEntry,
} from '../invoices.accounting';
import {
  SYSTEM_ACCOUNT_CODES,
  clearAccountCache,
} from '../../accounting/accounting.accounts';

// Account ids returned by the mocked chart of accounts.
// Must include ALL system codes so ensureSystemAccounts() completeness check passes.
const ACCOUNT_ROWS = [
  { id: 10, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE },
  { id: 20, code: SYSTEM_ACCOUNT_CODES.SALES_REVENUE },
  { id: 30, code: SYSTEM_ACCOUNT_CODES.CASH },
  { id: 40, code: SYSTEM_ACCOUNT_CODES.BANK },
  { id: 50, code: SYSTEM_ACCOUNT_CODES.INVENTORY },
  { id: 60, code: SYSTEM_ACCOUNT_CODES.ACCOUNTS_PAYABLE },
  { id: 70, code: SYSTEM_ACCOUNT_CODES.PURCHASES },
  { id: 80, code: SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE },
];

const mockTx = {
  invoice: { findUnique: vi.fn() },
  payment: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
};

function lineTotals(call: any) {
  const lines = call.data.lines.create as { debit: number; credit: number }[];
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  return { lines, totalDebit, totalCredit };
}

describe('Invoice GL Posting (double-entry)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null); // no existing entry
    mockTx.journalEntry.count.mockResolvedValue(0); // entry numbering
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('creates a balanced journal entry for a SALES invoice', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 1,
      direction: 'SALES',
      status: 'UNPAID',
      total: 1000,
      invoiceNumber: 'INV-2026-00001',
      issueDate: new Date('2026-01-01'),
    });

    await postInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(1000);
    expect(call.data.referenceType).toBe('INVOICE');
    expect(call.data.referenceId).toBe(1);
    expect(call.data.status).toBe('POSTED');
    expect(typeof call.data.entryNumber).toBe('string');
  });

  it('debits Accounts Receivable and credits Sales Revenue for SALES invoice', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 2, direction: 'SALES', status: 'UNPAID', total: 500, invoiceNumber: 'INV-2026-00002', issueDate: new Date(),
    });

    await postInvoiceToGL(mockTx as any, 2);

    const { lines } = lineTotals(mockTx.journalEntry.create.mock.calls[0][0]);
    const ar = lines.find((l: any) => l.accountId === 10)!;
    const rev = lines.find((l: any) => l.accountId === 20)!;
    expect(ar.debit).toBe(500);
    expect(ar.credit).toBe(0);
    expect(rev.credit).toBe(500);
    expect(rev.debit).toBe(0);
  });

  it('purchase invoice is created but GL posting is skipped', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 2,
      direction: 'PURCHASE',
      totalAmount: 500,
      issueDate: new Date(),
    });

    // Should NOT throw — purchase invoices skip GL posting silently
    await expect(postInvoiceToGL(mockTx as any, 2)).resolves.toBeUndefined();

    // Must NOT create any journal entry
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('rejects an unbalanced journal entry and writes nothing', async () => {
    await expect(
      createBalancedJournalEntry(mockTx as any, {
        date: new Date(),
        description: 'test',
        referenceType: 'INVOICE',
        referenceId: 99,
        lines: [
          { accountId: 1, debit: 100, credit: 0, description: '' },
          { accountId: 2, debit: 0, credit: 50, description: '' }, // 50 ≠ 100
        ],
      }),
    ).rejects.toThrow('غير متوازن');
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not post a CANCELLED invoice', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 4, direction: 'SALES', status: 'CANCELLED', total: 800, invoiceNumber: 'INV-2026-00004', issueDate: new Date(),
    });

    await postInvoiceToGL(mockTx as any, 4);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not post a zero-total invoice', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 5, direction: 'SALES', status: 'UNPAID', total: 0, invoiceNumber: 'INV-2026-00005', issueDate: new Date(),
    });

    await postInvoiceToGL(mockTx as any, 5);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('prevents double posting for the same invoice', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 99 }); // already posted
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 1, direction: 'SALES', status: 'UNPAID', total: 500, invoiceNumber: 'INV-2026-00001', issueDate: new Date(),
    });

    await postInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('creates a balanced journal entry for a CASH payment (debits Cash)', async () => {
    mockTx.payment.findUnique.mockResolvedValue({
      id: 5,
      amount: 300,
      method: 'CASH',
      date: new Date('2026-01-15'),
      invoice: { direction: 'SALES', invoiceNumber: 'INV-2026-00001' },
    });

    await postPaymentToGL(mockTx as any, 5);

    const call = mockTx.journalEntry.create.mock.calls[0][0];
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBe(300);
    expect(call.data.referenceType).toBe('PAYMENT');
    expect(call.data.referenceId).toBe(5);
    const cash = lines.find((l: any) => l.accountId === 30)!; // CASH
    const ar = lines.find((l: any) => l.accountId === 10)!; // AR
    expect(cash.debit).toBe(300);
    expect(ar.credit).toBe(300);
  });

  it('debits the Bank account for a BANK payment', async () => {
    mockTx.payment.findUnique.mockResolvedValue({
      id: 6, amount: 250, method: 'BANK', date: new Date(),
      invoice: { direction: 'SALES', invoiceNumber: 'INV-2026-00002' },
    });

    await postPaymentToGL(mockTx as any, 6);

    const { lines } = lineTotals(mockTx.journalEntry.create.mock.calls[0][0]);
    expect(lines.find((l: any) => l.accountId === 40)!.debit).toBe(250); // BANK
  });

  it('does not post a payment for a PURCHASE invoice in Phase 1', async () => {
    mockTx.payment.findUnique.mockResolvedValue({
      id: 7, amount: 100, method: 'CASH', date: new Date(),
      invoice: { direction: 'PURCHASE', invoiceNumber: 'PINV-2026-00001' },
    });

    await postPaymentToGL(mockTx as any, 7);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('prevents double posting for the same payment', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 88 });
    mockTx.payment.findUnique.mockResolvedValue({
      id: 5, amount: 300, method: 'CASH', date: new Date(),
      invoice: { direction: 'SALES', invoiceNumber: 'INV-2026-00001' },
    });

    await postPaymentToGL(mockTx as any, 5);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('creates a swapped reversal entry for a cancelled invoice', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 1,
        lines: [
          { accountId: 10, debit: 1000, credit: 0, description: 'AR' },
          { accountId: 20, debit: 0, credit: 1000, description: 'Revenue' },
        ],
      })
      .mockResolvedValueOnce(null); // no existing reversal

    await reverseInvoiceFromGL(mockTx as any, 1);

    const call = mockTx.journalEntry.create.mock.calls[0][0];
    expect(call.data.referenceType).toBe('INVOICE_REVERSAL');
    const { lines, totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBe(totalCredit);
    expect(lines[0].debit).toBe(0);
    expect(lines[0].credit).toBe(1000);
    expect(lines[1].debit).toBe(1000);
    expect(lines[1].credit).toBe(0);
  });

  it('does not reverse an invoice that was never posted', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null); // no original entry

    await reverseInvoiceFromGL(mockTx as any, 999);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does not create a duplicate reversal', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({ id: 1, lines: [{ accountId: 10, debit: 100, credit: 0, description: 'AR' }] })
      .mockResolvedValueOnce({ id: 77 }); // reversal already exists

    await reverseInvoiceFromGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('keeps debit total equal to credit total across many amounts (invariant)', async () => {
    const amounts = [100, 500.5, 1234.123, 0.001, 7.005];
    for (const amount of amounts) {
      vi.clearAllMocks();
      clearAccountCache();
      mockTx.journalEntry.findFirst.mockResolvedValue(null);
      mockTx.journalEntry.count.mockResolvedValue(0);
      mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
      mockTx.account.upsert.mockResolvedValue({});
      mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
      mockTx.invoice.findUnique.mockResolvedValue({
        id: 1, direction: 'SALES', status: 'UNPAID', total: amount, invoiceNumber: 'INV-X', issueDate: new Date(),
      });

      await postInvoiceToGL(mockTx as any, 1);

      const { totalDebit, totalCredit } = lineTotals(mockTx.journalEntry.create.mock.calls[0][0]);
      expect(totalDebit).toBeCloseTo(totalCredit, 3);
      expect(totalDebit).toBeCloseTo(amount, 3);
    }
  });
});

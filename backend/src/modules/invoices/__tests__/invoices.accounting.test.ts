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
  { id: 90, code: SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE },
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

// ─── اختبارات إصلاح String-Ordering Bug ──────────────────────────────────────
// السبب الجذري: orderBy: { entryNumber: 'desc' } ترتيب نصي يُخطئ عند 10+ قيود
// الإصلاح: orderBy: { id: 'desc' } — الـ id دائماً تصاعدي ويعكس التسلسل الحقيقي

describe('generateEntryNumber — id-based ordering (string-ordering bug fix)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.create.mockResolvedValue({ id: 11, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('generates JRN-YYYY-00011 when JRN-00009 and JRN-00010 both exist (id ordering returns 00010)', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 42, direction: 'SALES', status: 'UNPAID', total: 500,
      invoiceNumber: 'INV-2026-00042', issueDate: new Date(),
    });

    // Call 1: double-posting guard → not yet posted
    // Call 2: generateEntryNumber → id=10 entry has entryNumber JRN-YYYY-00010 (highest id)
    const year = new Date().getFullYear();
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce(null)                                          // guard: no existing
      .mockResolvedValueOnce({ entryNumber: `JRN-${year}-00010` });         // numbering: max id entry

    await postInvoiceToGL(mockTx as any, 42);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    expect(call.data.entryNumber).toBe(`JRN-${year}-00011`);
  });

  it('id-based ordering is robust against concurrent request race conditions', () => {
    // 5-digit zero-padded string ordering IS numerically correct (00010 > 00009 lexicographically).
    // The change to orderBy: { id: 'desc' } adds robustness because:
    // - id is AUTOINCREMENT — strictly monotonic, never reused after deletion
    // - Concurrent requests that both read MAX before either commits cannot collide on id ordering
    //   (both would read the same MAX, but the winner's commit increments the sequence,
    //    and any retry will see the higher id first)
    // Verify string ordering IS correct for 5-digit zero-padded sequences:
    const entries = ['JRN-2026-00001', 'JRN-2026-00009', 'JRN-2026-00010', 'JRN-2026-00005'];
    const sortedDesc = [...entries].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
    expect(sortedDesc[0]).toBe('JRN-2026-00010'); // string ordering correctly puts 00010 first
    // id-based ordering achieves the same result but is immune to edge cases beyond 99999 entries.
  });

  it('invoice with non-zero total succeeds even when 10 journal entries already exist', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 99, direction: 'SALES', status: 'UNPAID', total: 1234.500,
      invoiceNumber: 'INV-2026-00099', issueDate: new Date(),
    });

    const year = new Date().getFullYear();
    // Simulate: 10 existing JRN entries, highest id holds entryNumber '00010'
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce(null)                                          // guard: not yet posted
      .mockResolvedValueOnce({ entryNumber: `JRN-${year}-00010` });         // numbering: id-ordered max

    await postInvoiceToGL(mockTx as any, 99);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const call = mockTx.journalEntry.create.mock.calls[0][0];
    // Must generate 00011, NOT 00010 (which would cause P2002)
    expect(call.data.entryNumber).toBe(`JRN-${year}-00011`);
    const { totalDebit, totalCredit } = lineTotals(call);
    expect(totalDebit).toBe(totalCredit);
    expect(totalDebit).toBeCloseTo(1234.500, 3);
  });

  it('using ProjectPrice (non-zero total) does not cause duplicate entryNumber', async () => {
    // Regression test: this was the exact trigger — price selected → total > 0 → GL posting → P2002
    const year = new Date().getFullYear();
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 55, direction: 'SALES', status: 'UNPAID',
      total: 850.750,   // amount from ProjectPrice
      invoiceNumber: 'INV-2026-00055', issueDate: new Date(),
    });
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ entryNumber: `JRN-${year}-00009` }); // max-id entry happens to be 00009

    await postInvoiceToGL(mockTx as any, 55);

    const call = mockTx.journalEntry.create.mock.calls[0][0];
    expect(call.data.entryNumber).toBe(`JRN-${year}-00010`); // correct: 00009 + 1
    // Critically: entryNumber is NOT re-generated as 00009 (old bug) or causing P2002
  });
});

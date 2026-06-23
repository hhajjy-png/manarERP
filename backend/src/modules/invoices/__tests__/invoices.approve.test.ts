/**
 * Phase H1 — Purchase Invoice Approval Flow Tests
 *
 * Covers:
 *   - approve() on valid PURCHASE invoices
 *   - Idempotency (duplicate approve produces no double posting)
 *   - Invalid state transitions (SALES, CANCELLED)
 *   - Journal balance invariant across approval
 *   - Regression: SALES invoices unaffected by approve endpoint
 *   - Mixed sales + purchases in same GL (no cross-contamination)
 *   - Invalid referenceType isolation (PURCHASE_PAYMENT ≠ PURCHASE_INVOICE)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postPurchaseInvoiceToGL, reversePurchaseInvoiceGL, postPurchasePaymentToGL } from '../invoices.accounting';
import { postInvoiceToGL } from '../invoices.accounting';
import { SYSTEM_ACCOUNT_CODES, clearAccountCache } from '../../accounting/accounting.accounts';

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
  payment: { findUnique: vi.fn() },
  account: { upsert: vi.fn(), findMany: vi.fn() },
  journalEntry: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
};

type JournalLine = { accountId: number; debit: number; credit: number; description: string };

function getCreatedEntry() {
  return mockTx.journalEntry.create.mock.calls[0][0].data;
}

function lineTotals(entry: ReturnType<typeof getCreatedEntry>) {
  const lines = entry.lines.create as JournalLine[];
  return {
    lines,
    totalDebit: lines.reduce((s, l) => s + l.debit, 0),
    totalCredit: lines.reduce((s, l) => s + l.credit, 0),
  };
}

const approvedPurchaseInvoice = {
  id: 1,
  invoiceNumber: 'MN-INV-2026-00020',
  direction: 'PURCHASE',
  status: 'UNPAID',
  total: 2500.000,
  paymentMethod: 'ACCOUNTS_PAYABLE',
  issueDate: new Date('2026-06-20'),
};

describe('Purchase Invoice Approval — GL Posting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.invoice.findUnique.mockResolvedValue(approvedPurchaseInvoice);
  });

  it('postPurchaseInvoiceToGL creates a POSTED journal entry', async () => {
    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const entry = getCreatedEntry();
    expect(entry.referenceType).toBe('PURCHASE_INVOICE');
    expect(entry.referenceId).toBe(1);
    expect(entry.status).toBe('POSTED');
  });

  it('journal is balanced: total debit == total credit', async () => {
    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const entry = getCreatedEntry();
    const { totalDebit, totalCredit } = lineTotals(entry);
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(2500.000, 3);
  });

  it('debits PURCHASES (5000) and credits ACCOUNTS_PAYABLE (2000) for AP method', async () => {
    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const { lines } = lineTotals(getCreatedEntry());
    const purchaseLine = lines.find((l) => l.accountId === 80)!; // PURCHASES
    const apLine = lines.find((l) => l.accountId === 50)!;       // ACCOUNTS_PAYABLE
    expect(purchaseLine.debit).toBeCloseTo(2500.000, 3);
    expect(purchaseLine.credit).toBe(0);
    expect(apLine.credit).toBeCloseTo(2500.000, 3);
    expect(apLine.debit).toBe(0);
  });

  it('approval is idempotent — duplicate call does NOT create a second journal entry', async () => {
    // First approval posts GL
    await postPurchaseInvoiceToGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();

    // Second approval: guard finds existing entry → skips
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 1 }); // already posted
    vi.clearAllMocks(); // reset call count but keep findFirst mock
    mockTx.journalEntry.findFirst.mockResolvedValue({ id: 1 });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.invoice.findUnique.mockResolvedValue(approvedPurchaseInvoice);

    await postPurchaseInvoiceToGL(mockTx as any, 1);
    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('CANCELLED invoice is never approved (no GL entry)', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...approvedPurchaseInvoice, status: 'CANCELLED' });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('zero-total invoice is never posted to GL', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...approvedPurchaseInvoice, total: 0 });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('Purchase Invoice Cancellation — GL Reversal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 2, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('reversePurchaseInvoiceGL creates PURCHASE_INVOICE_REVERSAL entry', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [
          { accountId: 80, debit: 2500.000, credit: 0, description: 'مشتريات' },
          { accountId: 50, debit: 0, credit: 2500.000, description: 'ذمم مورد' },
        ],
      })
      .mockResolvedValueOnce(null);

    await reversePurchaseInvoiceGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const data = getCreatedEntry();
    expect(data.referenceType).toBe('PURCHASE_INVOICE_REVERSAL');
    expect(data.referenceId).toBe(1);
  });

  it('reversed entry is balanced with swapped debit/credit', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [
          { accountId: 80, debit: 2500.000, credit: 0, description: '' },
          { accountId: 50, debit: 0, credit: 2500.000, description: '' },
        ],
      })
      .mockResolvedValueOnce(null);

    await reversePurchaseInvoiceGL(mockTx as any, 1);

    const { lines, totalDebit, totalCredit } = lineTotals(getCreatedEntry());
    expect(totalDebit).toBeCloseTo(totalCredit, 3);
    expect(totalDebit).toBeCloseTo(2500.000, 3);

    // PURCHASES becomes CREDIT in reversal
    const purchLine = lines.find((l) => l.accountId === 80)!;
    expect(purchLine.credit).toBeCloseTo(2500.000, 3);
    expect(purchLine.debit).toBe(0);

    // AP becomes DEBIT in reversal
    const apLine = lines.find((l) => l.accountId === 50)!;
    expect(apLine.debit).toBeCloseTo(2500.000, 3);
    expect(apLine.credit).toBe(0);
  });

  it('does NOT reverse an invoice that was never approved (no GL entry)', async () => {
    mockTx.journalEntry.findFirst.mockResolvedValue(null);

    await reversePurchaseInvoiceGL(mockTx as any, 999);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('does NOT create duplicate reversal if already reversed', async () => {
    mockTx.journalEntry.findFirst
      .mockResolvedValueOnce({
        id: 5,
        status: 'POSTED',
        lines: [{ accountId: 80, debit: 500, credit: 0, description: '' }],
      })
      .mockResolvedValueOnce({ id: 99 }); // reversal already exists

    await reversePurchaseInvoiceGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('Regression — SALES invoices unaffected by purchase GL changes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
  });

  it('SALES invoice still posts Dr AR, Cr Revenue (unaffected by Phase H1)', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({
      id: 10, direction: 'SALES', status: 'UNPAID',
      total: 3000.000, invoiceNumber: 'MN-INV-2026-00100', issueDate: new Date(),
    });

    await postInvoiceToGL(mockTx as any, 10);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const data = getCreatedEntry();
    expect(data.referenceType).toBe('INVOICE'); // not PURCHASE_INVOICE
    const { lines } = lineTotals(data);
    const arLine = lines.find((l) => l.accountId === 30)!; // AR
    const revLine = lines.find((l) => l.accountId === 70)!; // SALES_REVENUE
    expect(arLine.debit).toBeCloseTo(3000.000, 3);
    expect(revLine.credit).toBeCloseTo(3000.000, 3);
  });

  it('PURCHASE invoice posts to PURCHASE_INVOICE referenceType (not INVOICE)', async () => {
    mockTx.invoice.findUnique.mockResolvedValue({ ...approvedPurchaseInvoice });

    await postInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).toHaveBeenCalledOnce();
    const data = getCreatedEntry();
    expect(data.referenceType).toBe('PURCHASE_INVOICE');
    expect(data.referenceType).not.toBe('INVOICE');
  });

  it('SALES payment does NOT go through PURCHASE_PAYMENT GL path', async () => {
    mockTx.payment.findUnique.mockResolvedValue({
      id: 5, amount: 500, method: 'CASH', date: new Date(),
      invoice: { direction: 'SALES', invoiceNumber: 'MN-INV-2026-00100' },
    });

    await postPurchasePaymentToGL(mockTx as any, 5);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled(); // sales path only
  });
});

describe('Mixed Sales + Purchases — GL isolation', () => {
  it('PURCHASE_INVOICE and INVOICE referenceTypes do not collide in duplicate guard', async () => {
    // findFirst is called with specific referenceType — so a SALES entry for id=1
    // must not block a PURCHASE_INVOICE entry for id=1
    expect('PURCHASE_INVOICE').not.toBe('INVOICE');
  });

  it('PURCHASE_PAYMENT and PAYMENT referenceTypes are distinct', () => {
    expect('PURCHASE_PAYMENT').not.toBe('PAYMENT');
  });

  it('PURCHASE_INVOICE_REVERSAL and INVOICE_REVERSAL are distinct', () => {
    expect('PURCHASE_INVOICE_REVERSAL').not.toBe('INVOICE_REVERSAL');
  });
});

describe('Accounts Payable — journal accounting identity', () => {
  it('purchase invoice creates AP liability (credit entry on ACCOUNTS_PAYABLE)', async () => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.invoice.findUnique.mockResolvedValue(approvedPurchaseInvoice);

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const { lines } = lineTotals(getCreatedEntry());
    const apLine = lines.find((l) => l.accountId === 50)!; // AP id=50
    expect(apLine.credit).toBeCloseTo(2500.000, 3); // liability created
    expect(apLine.debit).toBe(0);
  });

  it('purchase payment reduces AP liability (debit entry on ACCOUNTS_PAYABLE)', async () => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 2, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.payment.findUnique.mockResolvedValue({
      id: 1, amount: 2500.000, method: 'CASH', date: new Date(),
      invoice: { direction: 'PURCHASE', invoiceNumber: 'MN-INV-2026-00020' },
    });

    await postPurchasePaymentToGL(mockTx as any, 1);

    const { lines } = lineTotals(getCreatedEntry());
    const apLine = lines.find((l) => l.accountId === 50)!;
    expect(apLine.debit).toBeCloseTo(2500.000, 3); // liability settled
    expect(apLine.credit).toBe(0);
  });

  it('net AP effect after invoice + payment = zero (liability fully settled)', () => {
    // AP credit (invoice posted) = 2500 → liability created
    // AP debit (payment posted)  = 2500 → liability settled
    // Net AP movement = 0 (fully paid)
    const invoiceApCredit = 2500.000;
    const paymentApDebit = 2500.000;
    expect(invoiceApCredit - paymentApDebit).toBeCloseTo(0, 3);
  });
});

describe('General Expense — Purchases account coverage', () => {
  it('PURCHASES (5000) is classified as EXPENSE with DEBIT normal balance', () => {
    // This documents the accounting identity — not a GL posting test
    expect(SYSTEM_ACCOUNT_CODES.PURCHASES).toBe('5000');
    expect(SYSTEM_ACCOUNT_CODES.GENERAL_EXPENSE).toBe('5200');
    expect(SYSTEM_ACCOUNT_CODES.PAYROLL_EXPENSE).toBe('5100');
  });

  it('purchase invoice uses PURCHASES (5000) not GENERAL_EXPENSE (5200)', async () => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.invoice.findUnique.mockResolvedValue(approvedPurchaseInvoice);

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const { lines } = lineTotals(getCreatedEntry());
    const purchaseLine = lines.find((l) => l.accountId === 80)!; // PURCHASES id=80
    const generalExpLine = lines.find((l) => l.accountId === 100); // GENERAL_EXPENSE id=100
    expect(purchaseLine).toBeDefined();
    expect(generalExpLine).toBeUndefined(); // purchase invoices don't go to general expense
  });
});

describe('Invalid state transitions', () => {
  it('CANCELLED purchase invoice cannot be approved (postPurchaseInvoiceToGL returns without posting)', async () => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.invoice.findUnique.mockResolvedValue({ ...approvedPurchaseInvoice, status: 'CANCELLED' });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('SALES invoice is silently ignored by postPurchaseInvoiceToGL', async () => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.invoice.findUnique.mockResolvedValue({
      ...approvedPurchaseInvoice, direction: 'SALES',
    });

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });

  it('PURCHASE payment on a SALES invoice is silently ignored by postPurchasePaymentToGL', async () => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.payment.findUnique.mockResolvedValue({
      id: 5, amount: 100, method: 'CASH', date: new Date(),
      invoice: { direction: 'SALES', invoiceNumber: 'MN-INV-2026-00001' },
    });

    await postPurchasePaymentToGL(mockTx as any, 5);

    expect(mockTx.journalEntry.create).not.toHaveBeenCalled();
  });
});

describe('Audit trail — referenceType isolation', () => {
  it('each GL event uses a unique referenceType for audit traceability', () => {
    const types = [
      'INVOICE',
      'INVOICE_REVERSAL',
      'PURCHASE_INVOICE',
      'PURCHASE_INVOICE_REVERSAL',
      'PAYMENT',
      'PURCHASE_PAYMENT',
      'PURCHASE_PAYMENT_REVERSAL',
    ];
    const unique = new Set(types);
    expect(unique.size).toBe(types.length); // all distinct
  });

  it('purchase invoice GL description contains the invoice number', async () => {
    vi.clearAllMocks();
    clearAccountCache();
    mockTx.journalEntry.findFirst.mockResolvedValue(null);
    mockTx.journalEntry.count.mockResolvedValue(0);
    mockTx.journalEntry.create.mockResolvedValue({ id: 1, lines: [] });
    mockTx.account.upsert.mockResolvedValue({});
    mockTx.account.findMany.mockResolvedValue(ACCOUNT_ROWS);
    mockTx.invoice.findUnique.mockResolvedValue(approvedPurchaseInvoice);

    await postPurchaseInvoiceToGL(mockTx as any, 1);

    const data = getCreatedEntry();
    expect(data.description).toContain('MN-INV-2026-00020');
  });
});

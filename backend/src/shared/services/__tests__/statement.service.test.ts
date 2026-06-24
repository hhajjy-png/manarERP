import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildStatement } from '../statement.service';
import type { StatementInput } from '../statement.types';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../../../config/database', () => ({
  prisma: {
    customer: { findUniqueOrThrow: vi.fn() },
    supplier: { findUniqueOrThrow: vi.fn() },
    invoice: { findMany: vi.fn(), aggregate: vi.fn() },
    expense: { findMany: vi.fn(), aggregate: vi.fn() },
    payment: { findMany: vi.fn(), aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';

// ── Helpers ────────────────────────────────────────────────────────────

const mockCustomer = { name: 'شركة الاختبار', code: 'CUST-001' };
const mockSupplier = { name: 'مورد الاختبار', code: 'SUPP-001' };

function makeDate(y: number, m: number, d: number) {
  return new Date(y, m - 1, d);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Customer Statement ─────────────────────────────────────────────────

describe('Customer Statement', () => {
  it('returns empty statement when no transactions', async () => {
    (prisma.customer.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.invoice.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { total: null } });
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.payment.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { amount: null } });

    const input: StatementInput = {
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    };
    const result = await buildStatement(input);

    expect(result.entries).toHaveLength(0);
    expect(result.openingBalance).toBe(0);
    expect(result.summary.closingBalance).toBe(0);
    expect(result.summary.transactionCount).toBe(0);
  });

  it('includes sales invoices as debit entries and payments as credit entries', async () => {
    (prisma.customer.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        invoiceNumber: 'MN-INV-2026-001',
        issueDate: makeDate(2026, 1, 10),
        total: 1000,
        status: 'UNPAID',
        notes: null,
      },
    ]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        date: makeDate(2026, 1, 20),
        amount: 400,
        reference: 'REC-001',
        notes: null,
        invoice: { invoiceNumber: 'MN-INV-2026-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    });

    expect(result.entries).toHaveLength(2);

    const invEntry = result.entries.find((e) => e.referenceType === 'INVOICE');
    expect(invEntry).toBeDefined();
    expect(invEntry!.debit).toBe(1000);
    expect(invEntry!.credit).toBe(0);

    const pmtEntry = result.entries.find((e) => e.referenceType === 'PAYMENT');
    expect(pmtEntry).toBeDefined();
    expect(pmtEntry!.debit).toBe(0);
    expect(pmtEntry!.credit).toBe(400);
  });

  it('computes running balance correctly across multiple entries', async () => {
    (prisma.customer.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, invoiceNumber: 'INV-001', issueDate: makeDate(2026, 1, 1), total: 500, status: 'PARTIAL', notes: null },
      { id: 2, invoiceNumber: 'INV-002', issueDate: makeDate(2026, 1, 5), total: 300, status: 'UNPAID', notes: null },
    ]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        date: makeDate(2026, 1, 3),
        amount: 200,
        reference: null,
        notes: null,
        invoice: { invoiceNumber: 'INV-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    });

    // Sorted by date: INV-001 (Jan 1), PMT (Jan 3), INV-002 (Jan 5)
    // Running balance: 0+500=500, 500-200=300, 300+300=600
    expect(result.entries[0].runningBalance).toBe(500);
    expect(result.entries[1].runningBalance).toBe(300);
    expect(result.entries[2].runningBalance).toBe(600);
    expect(result.summary.closingBalance).toBe(600);
  });

  it('computes opening balance from transactions before fromDate', async () => {
    (prisma.customer.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockCustomer);
    // Before fromDate: 1000 invoice - 400 payment = 600 opening
    (prisma.invoice.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { total: 1000 } });
    (prisma.payment.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { amount: 400 } });
    // In range: one invoice
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 2, invoiceNumber: 'INV-002', issueDate: makeDate(2026, 2, 5), total: 200, status: 'UNPAID', notes: null },
    ]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: { fromDate: makeDate(2026, 2, 1) },
    });

    expect(result.openingBalance).toBe(600);
    expect(result.entries[0].runningBalance).toBe(800); // 600 + 200
    expect(result.summary.closingBalance).toBe(800);
  });

  it('excludes entries outside date range (Prisma returns empty arrays)', async () => {
    (prisma.customer.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockCustomer);
    (prisma.invoice.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { total: null } });
    (prisma.payment.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { amount: null } });
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: { fromDate: makeDate(2026, 3, 1), toDate: makeDate(2026, 3, 31) },
    });

    expect(result.entries).toHaveLength(0);
  });

  it('filters entries by referenceType (INVOICE only)', async () => {
    (prisma.customer.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, invoiceNumber: 'INV-001', issueDate: makeDate(2026, 1, 1), total: 500, status: 'PARTIAL', notes: null },
    ]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        date: makeDate(2026, 1, 5),
        amount: 200,
        reference: null,
        notes: null,
        invoice: { invoiceNumber: 'INV-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: { referenceType: 'INVOICE' },
    });

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].referenceType).toBe('INVOICE');
  });

  it('returns correct summary totals (totalDebit, totalCredit, closingBalance, transactionCount)', async () => {
    (prisma.customer.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockCustomer);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, invoiceNumber: 'INV-001', issueDate: makeDate(2026, 1, 1), total: 1000, status: 'PARTIAL', notes: null },
    ]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        date: makeDate(2026, 1, 5),
        amount: 300,
        reference: null,
        notes: null,
        invoice: { invoiceNumber: 'INV-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'CUSTOMER',
      entityId: 1,
      filters: {},
    });

    expect(result.summary.totalDebit).toBe(1000);
    expect(result.summary.totalCredit).toBe(300);
    expect(result.summary.closingBalance).toBe(700);
    expect(result.summary.transactionCount).toBe(2);
  });
});

// ── Supplier Statement ─────────────────────────────────────────────────

describe('Supplier Statement', () => {
  it('includes purchase invoices and expenses as credit, payments as debit', async () => {
    (prisma.supplier.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupplier);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 10, invoiceNumber: 'PO-001', issueDate: makeDate(2026, 1, 5), total: 800, status: 'UNPAID', notes: null },
    ]);
    (prisma.expense.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 5, code: 'EXP-005', date: makeDate(2026, 1, 8), amount: 200, description: 'وقود', status: 'APPROVED' },
    ]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 3,
        date: makeDate(2026, 1, 15),
        amount: 500,
        reference: null,
        notes: null,
        invoice: { invoiceNumber: 'PO-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId: 1,
      filters: {},
    });

    const invEntry = result.entries.find((e) => e.referenceType === 'INVOICE');
    expect(invEntry).toBeDefined();
    expect(invEntry!.debit).toBe(0);
    expect(invEntry!.credit).toBe(800);

    const expEntry = result.entries.find((e) => e.referenceType === 'EXPENSE');
    expect(expEntry).toBeDefined();
    expect(expEntry!.debit).toBe(0);
    expect(expEntry!.credit).toBe(200);

    const pmtEntry = result.entries.find((e) => e.referenceType === 'PAYMENT');
    expect(pmtEntry).toBeDefined();
    expect(pmtEntry!.debit).toBe(500);
    expect(pmtEntry!.credit).toBe(0);
  });

  it('computes supplier opening balance: invoices + expenses - payments before fromDate', async () => {
    (prisma.supplier.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupplier);
    // Before fromDate: 1000 invoice + 200 expense - 300 payment = 900 opening
    (prisma.invoice.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { total: 1000 } });
    (prisma.expense.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { amount: 200 } });
    (prisma.payment.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({ _sum: { amount: 300 } });
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.expense.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId: 1,
      filters: { fromDate: makeDate(2026, 3, 1) },
    });

    expect(result.openingBalance).toBe(900);
  });

  it('supplier running balance decreases with payments', async () => {
    (prisma.supplier.findUniqueOrThrow as ReturnType<typeof vi.fn>).mockResolvedValue(mockSupplier);
    (prisma.invoice.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, invoiceNumber: 'PO-001', issueDate: makeDate(2026, 1, 1), total: 600, status: 'UNPAID', notes: null },
    ]);
    (prisma.expense.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.payment.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        id: 1,
        date: makeDate(2026, 1, 10),
        amount: 250,
        reference: null,
        notes: null,
        invoice: { invoiceNumber: 'PO-001' },
      },
    ]);

    const result = await buildStatement({
      entityType: 'SUPPLIER',
      entityId: 1,
      filters: {},
    });

    // Supplier formula: balance = balance - debit + credit
    // Invoice (credit=600, debit=0): runningBalance = 0 - 0 + 600 = 600
    // Payment (debit=250, credit=0): runningBalance = 600 - 250 + 0 = 350
    // closingBalance = openingBalance(0) - totalDebit(250) + totalCredit(600) = 350
    expect(result.entries[0].runningBalance).toBe(600); // after invoice (credit 600)
    expect(result.entries[1].runningBalance).toBe(350); // after payment (debit 250)
    expect(result.summary.closingBalance).toBe(350);
  });
});

// ── Error Handling ─────────────────────────────────────────────────────

describe('Error handling', () => {
  it('throws for unsupported entity type', async () => {
    await expect(
      buildStatement({ entityType: 'UNKNOWN' as any, entityId: 1, filters: {} }),
    ).rejects.toThrow('Unsupported entity type');
  });
});

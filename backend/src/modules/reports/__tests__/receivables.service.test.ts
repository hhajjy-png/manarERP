import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    customer:     { findUnique: vi.fn() },
    invoice:      { findMany: vi.fn(), aggregate: vi.fn() },
    payment:      { findMany: vi.fn() },
    // stubs for other report types routed through build()
    transaction:  { aggregate: vi.fn() },
    contract:     { findMany: vi.fn().mockResolvedValue([]) },
    expense:      { findMany: vi.fn().mockResolvedValue([]) },
    equipment:    { findMany: vi.fn().mockResolvedValue([]) },
    employee:     { findMany: vi.fn().mockResolvedValue([]) },
    payroll:      { findMany: vi.fn().mockResolvedValue([]) },
    attendance:   { findMany: vi.fn().mockResolvedValue([]) },
    supplier:     { findMany: vi.fn().mockResolvedValue([]) },
    projectPrice: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '../../../config/database';
import { reportsService } from '../reports.service';

// ─── shared mock helpers ─────────────────────────────────────────────────────

const mockPrisma = prisma as unknown as {
  customer:  { findUnique: ReturnType<typeof vi.fn> };
  invoice:   { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
  payment:   { findMany: ReturnType<typeof vi.fn> };
};

function makeCustomer(override = {}) {
  return { id: 1, code: 'C-001', name: 'شركة الاختبار', ...override };
}

function makeInvoice(override = {}) {
  return {
    id: 1,
    invoiceNumber: 'MN-INV-2026-0001',
    issueDate: new Date('2026-01-15'),
    dueDate: null,
    total: 1000.000,
    paidAmount: 0,
    status: 'UNPAID',
    notes: null,
    direction: 'SALES',
    customerId: 1,
    customer: { id: 1, name: 'شركة الاختبار' },
    payments: [],
    ...override,
  };
}

function makePayment(override = {}) {
  return {
    id: 1,
    invoiceId: 1,
    date: new Date('2026-02-01'),
    amount: 400.000,
    method: 'CASH',
    reference: null,
    notes: null,
    invoice: { invoiceNumber: 'MN-INV-2026-0001', customer: { name: 'شركة الاختبار' } },
    ...override,
  };
}

// ─── Customer Statement ──────────────────────────────────────────────────────

describe('customerStatement', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws 400 when customerId is missing', async () => {
    await expect(reportsService.build('customer-statement', {})).rejects.toThrow('يجب تحديد العميل');
  });

  it('throws 404 when customer does not exist', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.payment.findMany.mockResolvedValue([]);
    await expect(reportsService.build('customer-statement', { customerId: '99' })).rejects.toThrow('العميل غير موجود');
  });

  it('invoice creates debit row, payment creates credit row', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(makeCustomer());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice()]);
    mockPrisma.payment.findMany.mockResolvedValue([makePayment()]);

    const report = await reportsService.build('customer-statement', { customerId: '1' });

    const invRow = report.rows.find((r) => r['type'] === 'فاتورة');
    const payRow = report.rows.find((r) => r['type'] === 'دفعة');
    expect(invRow?.['debit']).toBeCloseTo(1000, 3);
    expect(invRow?.['credit']).toBe(0);
    expect(payRow?.['credit']).toBeCloseTo(400, 3);
    expect(payRow?.['debit']).toBe(0);
  });

  it('running balance accumulates correctly: invoice then payment', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(makeCustomer());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 1000 })]);
    mockPrisma.payment.findMany.mockResolvedValue([makePayment({ amount: 300 })]);

    const report = await reportsService.build('customer-statement', { customerId: '1' });

    const rows = report.rows;
    // invoice row balance = 0 + 1000 - 0 = 1000
    expect(rows[0]['balance']).toBeCloseTo(1000, 3);
    // payment row balance = 1000 + 0 - 300 = 700
    expect(rows[1]['balance']).toBeCloseTo(700, 3);
    // totalsRow closingBalance = 700
    expect(report.totalsRow?.['balance']).toBeCloseTo(700, 3);
  });

  it('calculates opening balance from invoices before `from` minus payments before `from`', async () => {
    // Before 2026-02-01: invoice 1000, payment 250 → opening = 750
    mockPrisma.customer.findUnique.mockResolvedValue(makeCustomer());
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { total: 1000 } });
    // payment.findMany called twice: once for opening balance, once for statement rows
    mockPrisma.payment.findMany
      .mockResolvedValueOnce([{ amount: 250 }])  // opening balance payments
      .mockResolvedValueOnce([]);                 // statement period payments
    mockPrisma.invoice.findMany.mockResolvedValue([]); // no invoices in range

    const report = await reportsService.build('customer-statement', { customerId: '1', from: '2026-02-01' });

    // subtitle should mention opening balance 750.000
    expect(report.subtitle).toContain('750.000');
    // no rows in range
    expect(report.rows).toHaveLength(0);
    // closingBalance = 750 (opening) + 0 debit - 0 credit
    expect(report.totalsRow?.['balance']).toBeCloseTo(750, 3);
  });

  it('excludes CANCELLED invoices from opening balance calculation', async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(makeCustomer());
    // status: { not: 'CANCELLED' } is baked into the aggregate where clause
    // We just verify the query was called and returns the right aggregate
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { total: 500 } });
    mockPrisma.payment.findMany
      .mockResolvedValueOnce([])  // opening balance payments
      .mockResolvedValueOnce([]); // statement period payments
    mockPrisma.invoice.findMany.mockResolvedValue([]);

    const report = await reportsService.build('customer-statement', { customerId: '1', from: '2026-03-01' });

    // The aggregate where should filter out CANCELLED — verify the call arg
    const aggregateCall = mockPrisma.invoice.aggregate.mock.calls[0][0];
    expect(aggregateCall.where.status).toEqual({ not: 'CANCELLED' });
    expect(report.totalsRow?.['balance']).toBeCloseTo(500, 3);
  });
});

// ─── Receivables Aging ───────────────────────────────────────────────────────

describe('receivablesAging', () => {
  beforeEach(() => vi.clearAllMocks());

  it('invoice with no dueDate and future issueDate goes into current bucket', async () => {
    // asOfDate = today, issueDate = today → daysOverdue = 0 → current
    const today = new Date();
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ issueDate: today, dueDate: null, total: 500, paidAmount: 0, status: 'UNPAID', payments: [] }),
    ]);

    const report = await reportsService.build('receivables-aging', {});
    const row = report.rows[0];
    expect(row['current']).toBeCloseTo(500, 3);
    expect(row['bucket0_30']).toBe(0);
  });

  it('1-30 days overdue goes into bucket0_30', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 15); // 15 days ago
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate, total: 200, paidAmount: 0, status: 'OVERDUE', payments: [] }),
    ]);

    const report = await reportsService.build('receivables-aging', {});
    const row = report.rows[0];
    expect(row['bucket0_30']).toBeCloseTo(200, 3);
    expect(row['current']).toBe(0);
  });

  it('31-60 days overdue goes into bucket31_60', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 45);
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate, total: 300, paidAmount: 0, status: 'OVERDUE', payments: [] }),
    ]);

    const report = await reportsService.build('receivables-aging', {});
    expect(report.rows[0]['bucket31_60']).toBeCloseTo(300, 3);
  });

  it('61-90 days overdue goes into bucket61_90', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 75);
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate, total: 400, paidAmount: 0, status: 'OVERDUE', payments: [] }),
    ]);

    const report = await reportsService.build('receivables-aging', {});
    expect(report.rows[0]['bucket61_90']).toBeCloseTo(400, 3);
  });

  it('over 90 days overdue goes into bucket90Plus', async () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() - 120);
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ dueDate, total: 600, paidAmount: 0, status: 'OVERDUE', payments: [] }),
    ]);

    const report = await reportsService.build('receivables-aging', {});
    expect(report.rows[0]['bucket90Plus']).toBeCloseTo(600, 3);
  });

  it('invoice with paidAmount equal to total is skipped (outstanding = 0)', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ total: 500, paidAmount: 500, status: 'PAID', payments: [] }),
    ]);

    const report = await reportsService.build('receivables-aging', {});
    expect(report.rows).toHaveLength(0);
    expect(report.totalsRow?.['totalOutstanding']).toBe(0);
  });

  it('totals row sums all buckets correctly', async () => {
    const d15 = new Date(); d15.setDate(d15.getDate() - 15);
    const d45 = new Date(); d45.setDate(d45.getDate() - 45);
    const customer2 = { id: 2, name: 'عميل ثانٍ' };
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ customer: { id: 1, name: 'عميل أول' }, dueDate: d15, total: 200, paidAmount: 0, status: 'OVERDUE', payments: [] }),
      makeInvoice({ id: 2, customerId: 2, customer: customer2, dueDate: d45, total: 300, paidAmount: 0, status: 'OVERDUE', payments: [] }),
    ]);

    const report = await reportsService.build('receivables-aging', {});
    expect(report.totalsRow?.['bucket0_30']).toBeCloseTo(200, 3);
    expect(report.totalsRow?.['bucket31_60']).toBeCloseTo(300, 3);
    expect(report.totalsRow?.['totalOutstanding']).toBeCloseTo(500, 3);
  });
});

// ─── Customer Balances ───────────────────────────────────────────────────────

describe('customerBalances', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty rows when no invoices', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    const report = await reportsService.build('customer-balances', {});
    expect(report.rows).toHaveLength(0);
  });

  it('aggregates totalInvoiced and totalPaid per customer', async () => {
    const inv1 = makeInvoice({ total: 1000, paidAmount: 400, status: 'PARTIAL', payments: [] });
    const inv2 = makeInvoice({ id: 2, total: 500, paidAmount: 500, status: 'PAID', payments: [] });
    mockPrisma.invoice.findMany.mockResolvedValue([inv1, inv2]);

    const report = await reportsService.build('customer-balances', {});
    const row = report.rows[0];
    expect(row['totalInvoiced']).toBeCloseTo(1500, 3);
    expect(row['totalPaid']).toBeCloseTo(900, 3);
    expect(row['balance']).toBeCloseTo(600, 3);
    expect(row['invoiceCount']).toBe(2);
    expect(row['unpaidCount']).toBe(1); // PARTIAL counts as unpaid
  });

  it('balance = totalInvoiced - totalPaid in totalsRow', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ total: 2000, paidAmount: 800, status: 'PARTIAL', payments: [] }),
    ]);
    const report = await reportsService.build('customer-balances', {});
    expect(report.totalsRow?.['balance']).toBeCloseTo(1200, 3);
  });

  it('CANCELLED invoices are excluded (where clause)', async () => {
    // CANCELLED filtered at DB level (where status: { not: 'CANCELLED' })
    // We just verify non-cancelled invoice is included
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ total: 300, paidAmount: 0, status: 'UNPAID', payments: [] }),
    ]);
    const report = await reportsService.build('customer-balances', {});
    expect(report.rows[0]['totalInvoiced']).toBeCloseTo(300, 3);
    // Verify the findMany where arg excludes CANCELLED
    const whereArg = mockPrisma.invoice.findMany.mock.calls[0][0].where;
    expect(whereArg.status).toEqual({ not: 'CANCELLED' });
  });
});

// ─── Collections Summary ─────────────────────────────────────────────────────

describe('collectionsSummary', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty rows and 0 total when no payments', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    const report = await reportsService.build('collections-summary', {});
    expect(report.rows).toHaveLength(0);
    expect(report.totalsRow?.['amount']).toBe(0);
  });

  it('totals all payment amounts', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      makePayment({ amount: 500 }),
      makePayment({ id: 2, amount: 300 }),
    ]);
    const report = await reportsService.build('collections-summary', {});
    expect(report.totalsRow?.['amount']).toBeCloseTo(800, 3);
    expect(report.rows).toHaveLength(2);
  });

  it('date range applies endOfDay to `to` parameter', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    await reportsService.build('collections-summary', { from: '2026-01-01', to: '2026-06-30' });
    const whereArg = mockPrisma.payment.findMany.mock.calls[0][0].where;
    // The `date` field should have gte and lte
    expect(whereArg.date.gte).toEqual(new Date('2026-01-01'));
    // lte should be end of day (23:59:59)
    const lte: Date = whereArg.date.lte;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
  });

  it('subtitle includes date range when from/to provided', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([]);
    const report = await reportsService.build('collections-summary', { from: '2026-01-01', to: '2026-03-31' });
    expect(report.subtitle).toContain('2026-01-01');
    expect(report.subtitle).toContain('2026-03-31');
  });

  it('maps payment method to Arabic label', async () => {
    mockPrisma.payment.findMany.mockResolvedValue([
      makePayment({ method: 'BANK' }),
    ]);
    const report = await reportsService.build('collections-summary', {});
    expect(report.rows[0]['method']).toBe('تحويل بنكي');
  });
});

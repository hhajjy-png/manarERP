import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../config/database', () => ({ prisma: {} }));

import {
  getRevenue,
  getExpenses,
  getCollections,
  getAccountsReceivable,
  getOperationalProfitAndLoss,
  getMonthlyOperationalProfitAndLoss,
  getOperationalSummary,
} from '../operational.reporting';

function makeClient(overrides: {
  invoiceSum?: number;
  paymentSum?: number;
  expenseSum?: number;
} = {}) {
  return {
    invoice: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { total: overrides.invoiceSum ?? 0 } }),
    },
    payment: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: overrides.paymentSum ?? 0 } }),
    },
    expense: {
      aggregate: vi.fn().mockResolvedValue({ _sum: { amount: overrides.expenseSum ?? 0 } }),
    },
  };
}

describe('getRevenue', () => {
  it('sums SALES invoice totals excluding CANCELLED', async () => {
    const client = makeClient({ invoiceSum: 1000 });
    const revenue = await getRevenue({}, client as never);
    expect(revenue).toBe(1000);
    const where = client.invoice.aggregate.mock.calls[0][0].where;
    expect(where.direction).toBe('SALES');
    expect(where.status).toEqual({ not: 'CANCELLED' });
  });

  it('applies the date range on issueDate', async () => {
    const client = makeClient();
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 31);
    await getRevenue({ from, to }, client as never);
    const where = client.invoice.aggregate.mock.calls[0][0].where;
    expect(where.issueDate).toEqual({ gte: from, lte: to });
  });

  it('scopes by customerId and contractId when provided', async () => {
    const client = makeClient();
    await getRevenue({ customerId: 7, contractId: 3 }, client as never);
    const where = client.invoice.aggregate.mock.calls[0][0].where;
    expect(where.customerId).toBe(7);
    expect(where.contractId).toBe(3);
  });

  it('treats a null sum as zero', async () => {
    const client = {
      invoice: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
    };
    expect(await getRevenue({}, client as never)).toBe(0);
  });
});

describe('getExpenses', () => {
  it('filters to APPROVED status only — the single official operational definition', async () => {
    const client = makeClient({ expenseSum: 500 });
    const expenses = await getExpenses({}, client as never);
    expect(expenses).toBe(500);
    expect(client.expense.aggregate.mock.calls[0][0].where.status).toBe('APPROVED');
  });

  it('applies the date range on the expense date', async () => {
    const client = makeClient();
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 31);
    await getExpenses({ from, to }, client as never);
    expect(client.expense.aggregate.mock.calls[0][0].where.date).toEqual({ gte: from, lte: to });
  });

  it('scopes by contractId and supplierId when provided', async () => {
    const client = makeClient();
    await getExpenses({ contractId: 4, supplierId: 9 }, client as never);
    const where = client.expense.aggregate.mock.calls[0][0].where;
    expect(where.contractId).toBe(4);
    expect(where.supplierId).toBe(9);
  });
});

describe('getCollections', () => {
  it('defaults to SALES-direction payments (customer collections)', async () => {
    const client = makeClient({ paymentSum: 250 });
    const collected = await getCollections({}, client as never);
    expect(collected).toBe(250);
    const where = client.payment.aggregate.mock.calls[0][0].where;
    expect(where.invoice.direction).toBe('SALES');
    expect(where.invoice.status).toEqual({ not: 'CANCELLED' });
  });

  it('supports PURCHASE direction for supplier payments', async () => {
    const client = makeClient();
    await getCollections({ direction: 'PURCHASE' }, client as never);
    expect(client.payment.aggregate.mock.calls[0][0].where.invoice.direction).toBe('PURCHASE');
  });

  it('applies the date range on the payment date', async () => {
    const client = makeClient();
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 31);
    await getCollections({ from, to }, client as never);
    expect(client.payment.aggregate.mock.calls[0][0].where.date).toEqual({ gte: from, lte: to });
  });
});

describe('getAccountsReceivable', () => {
  it('computes Invoice total minus Payment total as of a date, not the paidAmount snapshot', async () => {
    const client = makeClient({ invoiceSum: 1000, paymentSum: 400 });
    const asOfDate = new Date(2026, 5, 30);
    const balance = await getAccountsReceivable({ asOfDate }, client as never);
    expect(balance).toBe(600);

    const invoiceWhere = client.invoice.aggregate.mock.calls[0][0].where;
    expect(invoiceWhere.issueDate).toEqual({ lte: asOfDate });
    expect(invoiceWhere.direction).toBe('SALES');

    const paymentWhere = client.payment.aggregate.mock.calls[0][0].where;
    expect(paymentWhere.date).toEqual({ lte: asOfDate });
    expect(paymentWhere.invoice.direction).toBe('SALES');
  });

  it('defaults asOfDate to now when omitted', async () => {
    const client = makeClient();
    await getAccountsReceivable({}, client as never);
    expect(client.invoice.aggregate.mock.calls[0][0].where.issueDate.lte).toBeInstanceOf(Date);
  });

  it('never returns negative balances silently masked — reflects the true difference', async () => {
    const client = makeClient({ invoiceSum: 100, paymentSum: 150 });
    expect(await getAccountsReceivable({}, client as never)).toBe(-50);
  });
});

describe('getOperationalProfitAndLoss', () => {
  it('derives netProfit as revenue minus expenses from the two operational sources', async () => {
    const client = makeClient({ invoiceSum: 1000, expenseSum: 300 });
    const pl = await getOperationalProfitAndLoss({}, client as never);
    expect(pl).toEqual({ revenue: 1000, expenses: 300, netProfit: 700 });
  });

  it('propagates contractId scope to both revenue and expenses', async () => {
    const client = makeClient();
    await getOperationalProfitAndLoss({ contractId: 11 }, client as never);
    expect(client.invoice.aggregate.mock.calls[0][0].where.contractId).toBe(11);
    expect(client.expense.aggregate.mock.calls[0][0].where.contractId).toBe(11);
  });
});

describe('getMonthlyOperationalProfitAndLoss', () => {
  it('computes one P&L bucket per month window', async () => {
    const client = makeClient({ invoiceSum: 100, expenseSum: 40 });
    const months = [
      { label: '2026-01', start: new Date(2026, 0, 1), end: new Date(2026, 0, 31) },
      { label: '2026-02', start: new Date(2026, 1, 1), end: new Date(2026, 1, 28) },
    ];
    const result = await getMonthlyOperationalProfitAndLoss(months, {}, client as never);
    expect(result).toEqual([
      { label: '2026-01', revenue: 100, expense: 40, net: 60 },
      { label: '2026-02', revenue: 100, expense: 40, net: 60 },
    ]);
  });
});

describe('getOperationalSummary', () => {
  it('composes all five metrics from the existing methods — normal case', async () => {
    const client = makeClient({ invoiceSum: 1000, paymentSum: 300, expenseSum: 400 });
    const summary = await getOperationalSummary({}, client as never);
    expect(summary).toEqual({
      revenue: 1000,
      expenses: 400,
      collections: 300,
      accountsReceivable: 700, // 1000 - 300
      netProfit: 600, // 1000 - 400, via getOperationalProfitAndLoss
    });
  });

  it('returns all zeros against an empty database', async () => {
    const client = {
      invoice: { aggregate: vi.fn().mockResolvedValue({ _sum: { total: null } }) },
      payment: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }) },
      expense: { aggregate: vi.fn().mockResolvedValue({ _sum: { amount: null } }) },
    };
    const summary = await getOperationalSummary({}, client as never);
    expect(summary).toEqual({
      revenue: 0,
      expenses: 0,
      collections: 0,
      accountsReceivable: 0,
      netProfit: 0,
    });
  });

  it('propagates the date range to revenue, expenses, and collections (and P&L internally)', async () => {
    const client = makeClient();
    const from = new Date(2026, 0, 1);
    const to = new Date(2026, 0, 31);
    await getOperationalSummary({ from, to }, client as never);

    // direct getRevenue call (index 0) and the P&L-internal getRevenue call (index 2)
    expect(client.invoice.aggregate.mock.calls[0][0].where.issueDate).toEqual({ gte: from, lte: to });
    expect(client.invoice.aggregate.mock.calls[2][0].where.issueDate).toEqual({ gte: from, lte: to });
    // direct getExpenses call (index 0) and the P&L-internal getExpenses call (index 1)
    expect(client.expense.aggregate.mock.calls[0][0].where.date).toEqual({ gte: from, lte: to });
    expect(client.expense.aggregate.mock.calls[1][0].where.date).toEqual({ gte: from, lte: to });
    // direct getCollections call
    expect(client.payment.aggregate.mock.calls[0][0].where.date).toEqual({ gte: from, lte: to });
  });

  it('defaults accountsReceivable asOfDate to the range "to" when asOfDate is omitted', async () => {
    const client = makeClient();
    const to = new Date(2026, 0, 31);
    await getOperationalSummary({ to }, client as never);
    // AR's invoice call is call index 1 (after the direct revenue call)
    expect(client.invoice.aggregate.mock.calls[1][0].where.issueDate).toEqual({ lte: to });
  });

  it('propagates contractId to every underlying metric, including netProfit', async () => {
    const client = makeClient();
    await getOperationalSummary({ contractId: 42 }, client as never);

    expect(client.invoice.aggregate.mock.calls[0][0].where.contractId).toBe(42); // revenue
    expect(client.expense.aggregate.mock.calls[0][0].where.contractId).toBe(42); // expenses
    expect(client.payment.aggregate.mock.calls[0][0].where.invoice.contractId).toBe(42); // collections
    expect(client.invoice.aggregate.mock.calls[1][0].where.contractId).toBe(42); // AR
    expect(client.invoice.aggregate.mock.calls[2][0].where.contractId).toBe(42); // P&L-internal revenue
    expect(client.expense.aggregate.mock.calls[1][0].where.contractId).toBe(42); // P&L-internal expenses
  });

  it('propagates customerId to revenue/collections/accountsReceivable, but never to expenses or netProfit (unsupported dimension)', async () => {
    const client = makeClient();
    await getOperationalSummary({ customerId: 5 }, client as never);

    expect(client.invoice.aggregate.mock.calls[0][0].where.customerId).toBe(5); // revenue
    expect(client.payment.aggregate.mock.calls[0][0].where.invoice.customerId).toBe(5); // collections
    expect(client.invoice.aggregate.mock.calls[1][0].where.customerId).toBe(5); // AR (invoice side)
    expect(client.payment.aggregate.mock.calls[1][0].where.invoice.customerId).toBe(5); // AR (payment side)

    // Expense has no customer dimension in the schema — must never receive customerId.
    expect(client.expense.aggregate.mock.calls[0][0].where.customerId).toBeUndefined();
    // netProfit's internal revenue call goes through ProfitAndLossFilter, which has no
    // customerId — this is the documented scope asymmetry, not an oversight.
    expect(client.invoice.aggregate.mock.calls[2][0].where.customerId).toBeUndefined();
  });
});

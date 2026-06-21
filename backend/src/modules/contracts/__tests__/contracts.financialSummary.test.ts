import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    contract: { findUnique: vi.fn() },
    invoice:  { findMany: vi.fn() },
    expense:  { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { contractsService } from '../contracts.service';

const mockPrisma = prisma as unknown as {
  contract: { findUnique: ReturnType<typeof vi.fn> };
  invoice:  { findMany: ReturnType<typeof vi.fn> };
  expense:  { findMany: ReturnType<typeof vi.fn> };
};

function makeContract(override = {}) {
  return {
    id: 1,
    code: 'CNT-001',
    asphaltPlant: 'مصنع الأسفلت الأول',
    location: 'الكويت',
    status: 'ACTIVE',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    monthlyTransportValue: 5000,
    price: 2.5,
    unitName: 'طن',
    companyName: 'شركة الاختبار',
    customer: { id: 1, name: 'عميل الاختبار', type: 'GOVERNMENT' },
    ...override,
  };
}

function makeInvoice(override = {}) {
  return {
    id: 1,
    total: 10000,
    paidAmount: 0,
    issueDate: new Date('2026-03-15'),
    status: 'UNPAID',
    payments: [],
    ...override,
  };
}

function makeExpense(override = {}) {
  return {
    id: 1,
    amount: 3000,
    date: new Date('2026-03-20'),
    ...override,
  };
}

beforeEach(() => vi.clearAllMocks());

describe('getFinancialSummary', () => {
  it('throws 404 when contract does not exist', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(null);
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([]);
    await expect(contractsService.getFinancialSummary(999)).rejects.toThrow('العقد غير موجود');
  });

  it('contract with no invoices returns all-zero revenue and collections', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.revenue.totalInvoiced).toBe(0);
    expect(result.revenue.invoiceCount).toBe(0);
    expect(result.collections.totalCollected).toBe(0);
    expect(result.collections.outstanding).toBe(0);
    expect(result.collections.collectionRate).toBeNull();
    expect(result.collections.lastPaymentDate).toBeNull();
    expect(result.collections.avgCollectionDays).toBeNull();
    expect(result.monthlyData).toHaveLength(0);
  });

  it('contract with no expenses returns zero totalExpenses', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 5000, paidAmount: 2000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.expenses.totalExpenses).toBe(0);
    expect(result.expenses.expenseCount).toBe(0);
    expect(result.expenses.lastExpenseDate).toBeNull();
  });

  it('contract with no payments has outstanding = totalInvoiced', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 8000, paidAmount: 0 })]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.collections.totalCollected).toBe(0);
    expect(result.collections.outstanding).toBeCloseTo(8000, 3);
    expect(result.collections.collectionRate).toBe(0);
  });

  it('profit = totalInvoiced - totalExpenses (profitable contract)', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 10000, paidAmount: 8000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 3000 })]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.profitability.revenue).toBeCloseTo(10000, 3);
    expect(result.profitability.expenses).toBeCloseTo(3000, 3);
    expect(result.profitability.profit).toBeCloseTo(7000, 3);
    expect(result.profitability.profitMargin).toBeCloseTo(70, 2);
    expect(result.profitability.profitStatus).toBe('GREEN');
  });

  it('loss contract has RED profit status and negative profit', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 5000, paidAmount: 5000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 7000 })]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.profitability.profit).toBeCloseTo(-2000, 3);
    expect(result.profitability.profitStatus).toBe('RED');
  });

  it('profitMargin 10-25% gives YELLOW status', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 10000, paidAmount: 5000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 8500 })]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.profitability.profitMargin).toBeCloseTo(15, 1);
    expect(result.profitability.profitStatus).toBe('YELLOW');
  });

  it('profitMargin < 10% and positive gives ORANGE status', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 10000, paidAmount: 5000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 9500 })]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.profitability.profitMargin).toBeCloseTo(5, 1);
    expect(result.profitability.profitStatus).toBe('ORANGE');
  });

  it('profitMargin % = profit / totalInvoiced * 100', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 20000, paidAmount: 15000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 5000 })]);

    const result = await contractsService.getFinancialSummary(1);

    const expected = ((20000 - 5000) / 20000) * 100;
    expect(result.profitability.profitMargin).toBeCloseTo(expected, 2);
  });

  it('outstanding = totalInvoiced - totalCollected', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ total: 5000, paidAmount: 2000 }),
      makeInvoice({ id: 2, total: 3000, paidAmount: 1500 }),
    ]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.collections.totalCollected).toBeCloseTo(3500, 3);
    expect(result.collections.outstanding).toBeCloseTo(4500, 3);
  });

  it('collectionRate % = collected / invoiced * 100', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 10000, paidAmount: 7500 })]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.collections.collectionRate).toBeCloseTo(75, 2);
  });

  it('billingProgress % = invoiced / estimatedContractValue * 100', async () => {
    // Contract: 5000/month × 12 months = 60000 estimated
    const contract = makeContract({
      monthlyTransportValue: 5000,
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
    });
    mockPrisma.contract.findUnique.mockResolvedValue(contract);
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 30000, paidAmount: 30000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    // billingProgress = 30000 / estimatedValue * 100
    expect(result.progress.billingProgress).toBeGreaterThan(0);
    expect(result.progress.billingProgress).toBeLessThanOrEqual(100);
  });

  it('billingProgress is null when monthlyTransportValue is missing', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract({ monthlyTransportValue: null }));
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 5000, paidAmount: 0 })]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.progress.billingProgress).toBeNull();
  });

  it('negative profit: profitStatus is RED', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 1000, paidAmount: 1000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 2000 })]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.profitability.profit).toBeLessThan(0);
    expect(result.profitability.profitStatus).toBe('RED');
  });

  it('monthly data aggregates invoices and expenses by month', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ id: 1, total: 5000, paidAmount: 0, issueDate: new Date('2026-01-15'), payments: [] }),
      makeInvoice({ id: 2, total: 3000, paidAmount: 0, issueDate: new Date('2026-02-10'), payments: [] }),
    ]);
    mockPrisma.expense.findMany.mockResolvedValue([
      makeExpense({ id: 1, amount: 1000, date: new Date('2026-01-20') }),
      makeExpense({ id: 2, amount: 800,  date: new Date('2026-02-05') }),
    ]);

    const result = await contractsService.getFinancialSummary(1);

    const jan = result.monthlyData.find((m) => m.month === '2026-01');
    const feb = result.monthlyData.find((m) => m.month === '2026-02');
    expect(jan?.invoiced).toBeCloseTo(5000, 3);
    expect(jan?.expenses).toBeCloseTo(1000, 3);
    expect(feb?.invoiced).toBeCloseTo(3000, 3);
    expect(feb?.expenses).toBeCloseTo(800, 3);
  });

  it('payment amounts are aggregated into monthly collected for the payment month', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({
        id: 1, total: 10000, paidAmount: 6000, issueDate: new Date('2026-01-10'),
        payments: [
          { id: 1, amount: 4000, date: new Date('2026-02-01') },
          { id: 2, amount: 2000, date: new Date('2026-03-05') },
        ],
      }),
    ]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    const feb = result.monthlyData.find((m) => m.month === '2026-02');
    const mar = result.monthlyData.find((m) => m.month === '2026-03');
    expect(feb?.collected).toBeCloseTo(4000, 3);
    expect(mar?.collected).toBeCloseTo(2000, 3);
  });

  it('zero invoices with expenses: profitMargin and collectionRate are null, no NaN/Infinity', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 5000 })]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.profitability.profitMargin).toBeNull();
    expect(result.collections.collectionRate).toBeNull();
    expect(result.progress.collectionProgress).toBeNull();
    expect(result.progress.expenseRatio).toBeNull();
    expect(Number.isNaN(result.profitability.profit)).toBe(false);
    expect(Number.isFinite(result.profitability.profit)).toBe(true);
  });

  it('over-collection: collectionRate > 100 is valid, no NaN', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([
      makeInvoice({ total: 5000, paidAmount: 6000 }),
    ]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.collections.collectionRate).not.toBeNull();
    expect(result.collections.collectionRate as number).toBeGreaterThan(100);
    expect(Number.isNaN(result.collections.collectionRate)).toBe(false);
  });

  it('loss detail: expenses > invoiced gives negative profitMargin and RED status', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(makeContract());
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 4000, paidAmount: 4000 })]);
    mockPrisma.expense.findMany.mockResolvedValue([makeExpense({ amount: 6000 })]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.profitability.profit).toBeLessThan(0);
    expect(result.profitability.profitMargin).not.toBeNull();
    expect(result.profitability.profitMargin as number).toBeLessThan(0);
    expect(result.profitability.profitStatus).toBe('RED');
  });

  it('billingProgress is null when estimatedContractValue is null (no dates)', async () => {
    mockPrisma.contract.findUnique.mockResolvedValue(
      makeContract({ startDate: null, endDate: null }),
    );
    mockPrisma.invoice.findMany.mockResolvedValue([makeInvoice({ total: 5000, paidAmount: 0 })]);
    mockPrisma.expense.findMany.mockResolvedValue([]);

    const result = await contractsService.getFinancialSummary(1);

    expect(result.progress.billingProgress).toBeNull();
  });
});

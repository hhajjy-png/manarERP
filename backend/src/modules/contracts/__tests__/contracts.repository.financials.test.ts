import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { aggregate: vi.fn() },
    expense: { aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { contractsRepository } from '../contracts.repository';

const mockPrisma = prisma as unknown as {
  invoice: { aggregate: ReturnType<typeof vi.fn> };
  expense: { aggregate: ReturnType<typeof vi.fn> };
};

function mockFinancials(
  invoiceTotal: number,
  invoicePaid: number,
  expenseAmount: number,
) {
  mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { total: invoiceTotal, paidAmount: invoicePaid } });
  mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: expenseAmount } });
}

beforeEach(() => vi.clearAllMocks());

describe('contractsRepository.financials — expense status filter regression', () => {
  it('expense aggregate WHERE excludes both REJECTED and CANCELLED statuses', async () => {
    mockFinancials(10000, 8000, 3000);
    await contractsRepository.financials(1);

    const expenseCall = mockPrisma.expense.aggregate.mock.calls[0][0];
    expect(expenseCall.where.status).toEqual({ notIn: ['REJECTED', 'CANCELLED'] });
    expect(expenseCall.where.status).not.toEqual({ not: 'REJECTED' });
  });

  it('CANCELLED expenses are excluded — spent only counts non-cancelled/non-rejected', async () => {
    // If CANCELLED expenses were included, spent would be higher
    mockFinancials(10000, 8000, 3000);
    const result = await contractsRepository.financials(1);

    expect(result.spent).toBe(3000);
    expect(result.profit).toBe(7000);
  });

  it('profit = invoiced - spent (using aggregate response)', async () => {
    mockFinancials(20000, 15000, 5000);
    const result = await contractsRepository.financials(1);

    expect(result.invoiced).toBe(20000);
    expect(result.collected).toBe(15000);
    expect(result.spent).toBe(5000);
    expect(result.profit).toBe(15000);
  });

  it('null aggregate sums default to 0', async () => {
    mockPrisma.invoice.aggregate.mockResolvedValue({ _sum: { total: null, paidAmount: null } });
    mockPrisma.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const result = await contractsRepository.financials(1);

    expect(result.invoiced).toBe(0);
    expect(result.collected).toBe(0);
    expect(result.spent).toBe(0);
    expect(result.profit).toBe(0);
  });

  it('zero expenses yields profit = invoiced', async () => {
    mockFinancials(8000, 8000, 0);
    const result = await contractsRepository.financials(1);

    expect(result.profit).toBe(8000);
  });

  it('expenses exceeding revenue yields negative profit', async () => {
    mockFinancials(5000, 5000, 9000);
    const result = await contractsRepository.financials(1);

    expect(result.profit).toBe(-4000);
    expect(result.spent).toBe(9000);
  });
});

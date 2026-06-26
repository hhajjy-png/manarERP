import { prisma } from '@config/database';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const n  = (v: unknown) => Number(v ?? 0);
const safe = (num: number, den: number): number | null =>
  den > 0 ? r3((num / den) * 100) : null;

export interface ContractProfitRow {
  id: number;
  code: string;
  asphaltPlant: string;
  customerName: string | null;
  revenue: number;
  collected: number;
  expenses: number;
  profit: number;
  profitMargin: number | null;
  collectionRate: number | null;
}

export interface ExpenseCategoryRow {
  category: string;
  total: number;
  count: number;
  pct: number;
}

export interface CustomerAnalyticsRow {
  id: number;
  name: string;
  code: string;
  revenue: number;
  collected: number;
  outstanding: number;
  invoiceCount: number;
  collectionRate: number | null;
}

export class FinancialExecService {
  async contractProfitability(): Promise<ContractProfitRow[]> {
    const [contracts, invGroups, expGroups] = await Promise.all([
      prisma.contract.findMany({
        select: {
          id: true, code: true, asphaltPlant: true,
          customer: { select: { name: true } },
        },
        orderBy: { id: 'desc' },
      }),
      prisma.invoice.groupBy({
        by: ['contractId'],
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, contractId: { not: null } },
        _sum: { total: true, paidAmount: true },
      }),
      prisma.expense.groupBy({
        by: ['contractId'],
        where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] }, contractId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const invMap = new Map(invGroups.map(g => [g.contractId!, { rev: n(g._sum.total), col: n(g._sum.paidAmount) }]));
    const expMap = new Map(expGroups.map(g => [g.contractId!, n(g._sum.amount)]));

    return contracts.map(c => {
      const inv  = invMap.get(c.id) ?? { rev: 0, col: 0 };
      const exp  = expMap.get(c.id) ?? 0;
      const profit = r3(inv.rev - exp);
      return {
        id: c.id,
        code: c.code,
        asphaltPlant: c.asphaltPlant,
        customerName: c.customer?.name ?? null,
        revenue: inv.rev,
        collected: inv.col,
        expenses: exp,
        profit,
        profitMargin: safe(profit, inv.rev),
        collectionRate: safe(inv.col, inv.rev),
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }

  async expenseBreakdown(): Promise<ExpenseCategoryRow[]> {
    const groups = await prisma.expense.groupBy({
      by: ['category'],
      where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const grandTotal = groups.reduce((acc, g) => acc + n(g._sum.amount), 0);

    return groups.map(g => ({
      category: g.category,
      total:    r3(n(g._sum.amount)),
      count:    g._count._all,
      pct:      grandTotal > 0 ? r3((n(g._sum.amount) / grandTotal) * 100) : 0,
    }));
  }

  async customerAnalytics(): Promise<CustomerAnalyticsRow[]> {
    const [customers, invGroups] = await Promise.all([
      prisma.customer.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.invoice.groupBy({
        by: ['customerId'],
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, customerId: { not: null } },
        _sum: { total: true, paidAmount: true },
        _count: { _all: true },
      }),
    ]);

    const invMap = new Map(
      invGroups.map(g => [
        g.customerId!,
        { rev: n(g._sum.total), col: n(g._sum.paidAmount), cnt: g._count._all },
      ]),
    );

    return customers
      .map(c => {
        const inv = invMap.get(c.id) ?? { rev: 0, col: 0, cnt: 0 };
        const outstanding = r3(inv.rev - inv.col);
        return {
          id: c.id, name: c.name, code: c.code,
          revenue: inv.rev, collected: inv.col, outstanding,
          invoiceCount: inv.cnt,
          collectionRate: safe(inv.col, inv.rev),
        };
      })
      .sort((a, b) => b.revenue - a.revenue);
  }
}

export const financialExecService = new FinancialExecService();

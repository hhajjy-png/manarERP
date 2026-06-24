import { prisma } from '@config/database';
import { normalizeMoney } from './balance.utils';
import type { DashboardSummary, TopEntitySummary } from './financial.types';

let cache: { data: DashboardSummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 45_000;

class DashboardSummaryService {
  async getSummary(): Promise<DashboardSummary> {
    if (cache && Date.now() < cache.expiresAt) return cache.data;
    const data = await this.computeSummary();
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  }

  private async computeSummary(): Promise<DashboardSummary> {
    const today     = new Date();
    const thirtyAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    const [arData, apData, topCustomers, topSuppliers, collections30, payments30, accountsCount, arCritical, apCritical] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] } },
          _sum: { total: true, paidAmount: true }, _count: { customerId: true },
        }),
        prisma.invoice.aggregate({
          where: { direction: 'PURCHASE', status: { notIn: ['PAID', 'CANCELLED'] } },
          _sum: { total: true, paidAmount: true }, _count: { supplierId: true },
        }),
        // ⚠️ M3: All $queryRaw calls use tagged template literals — NEVER string concatenation.
        prisma.$queryRaw<TopEntitySummary[]>`
          SELECT c.id as id, c.name as name,
                 ROUND(SUM(i.total - i.paidAmount), 3) as outstanding
          FROM Invoice i
          JOIN Customer c ON i.customerId = c.id
          WHERE i.direction = 'SALES'
            AND i.status NOT IN ('PAID','CANCELLED')
            AND (i.total - i.paidAmount) > 0
          GROUP BY c.id
          ORDER BY outstanding DESC
          LIMIT 5
        `,
        prisma.$queryRaw<TopEntitySummary[]>`
          SELECT s.id as id, s.name as name,
                 ROUND(SUM(i.total - i.paidAmount), 3) as outstanding
          FROM Invoice i
          JOIN Supplier s ON i.supplierId = s.id
          WHERE i.direction = 'PURCHASE'
            AND i.status NOT IN ('PAID','CANCELLED')
            AND (i.total - i.paidAmount) > 0
          GROUP BY s.id
          ORDER BY outstanding DESC
          LIMIT 5
        `,
        prisma.payment.aggregate({
          where: { date: { gte: thirtyAgo }, invoice: { direction: 'SALES' } },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: { date: { gte: thirtyAgo }, invoice: { direction: 'PURCHASE' } },
          _sum: { amount: true },
        }),
        prisma.account.count({ where: { isActive: true } }),
        prisma.invoice.aggregate({
          where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: ninetyAgo } },
          _sum: { total: true, paidAmount: true },
        }),
        prisma.invoice.aggregate({
          where: { direction: 'PURCHASE', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: ninetyAgo } },
          _sum: { total: true, paidAmount: true },
        }),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      arSummary: {
        totalOutstanding: normalizeMoney((arData._sum.total ?? 0) - (arData._sum.paidAmount ?? 0)),
        criticalOver90:   normalizeMoney((arCritical._sum.total ?? 0) - (arCritical._sum.paidAmount ?? 0)),
        entityCount:      arData._count.customerId ?? 0,
      },
      apSummary: {
        totalOutstanding: normalizeMoney((apData._sum.total ?? 0) - (apData._sum.paidAmount ?? 0)),
        criticalOver90:   normalizeMoney((apCritical._sum.total ?? 0) - (apCritical._sum.paidAmount ?? 0)),
        entityCount:      apData._count.supplierId ?? 0,
      },
      topCustomers:      topCustomers.map(r => ({ id: Number(r.id), name: r.name, outstanding: normalizeMoney(Number(r.outstanding)) })),
      topSuppliers:      topSuppliers.map(r => ({ id: Number(r.id), name: r.name, outstanding: normalizeMoney(Number(r.outstanding)) })),
      collectionsLast30: normalizeMoney(collections30._sum.amount ?? 0),
      paymentsLast30:    normalizeMoney(payments30._sum.amount    ?? 0),
      activeAccountsCount: accountsCount,
    };
  }
}

export const dashboardSummaryService = new DashboardSummaryService();

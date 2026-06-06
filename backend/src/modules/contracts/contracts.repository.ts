import { BaseRepository } from '../../shared/repositories/BaseRepository';
import { prisma } from '../../config/database';

class ContractsRepository extends BaseRepository<{ id: number }> {
  protected readonly model = 'contract';

  listWithRelations(where: object, skip: number, take: number) {
    return Promise.all([
      prisma.contract.findMany({
        where,
        skip,
        take,
        orderBy: { id: 'desc' },
        include: {
          customer: { select: { id: true, name: true } },
          manager: { select: { id: true, fullName: true } },
        },
      }),
      prisma.contract.count({ where }),
    ]);
  }

  findFull(id: number) {
    return prisma.contract.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, name: true, type: true } },
        manager: { select: { id: true, fullName: true } },
        documents: true,
        _count: { select: { invoices: true, expenses: true } },
      },
    });
  }

  /** مجاميع مالية للعقد (الفواتير والمصروفات المرتبطة). */
  async financials(id: number) {
    const [salesAgg, expenseAgg] = await Promise.all([
      prisma.invoice.aggregate({
        where: { contractId: id, direction: 'SALES', status: { not: 'CANCELLED' } },
        _sum: { total: true, paidAmount: true },
      }),
      prisma.expense.aggregate({
        where: { contractId: id, status: { not: 'REJECTED' } },
        _sum: { amount: true },
      }),
    ]);
    const invoiced = salesAgg._sum.total ?? 0;
    const collected = salesAgg._sum.paidAmount ?? 0;
    const spent = expenseAgg._sum.amount ?? 0;
    return { invoiced, collected, spent, profit: invoiced - spent };
  }
}

export const contractsRepository = new ContractsRepository();

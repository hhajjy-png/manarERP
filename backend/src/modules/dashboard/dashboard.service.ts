import { prisma } from '../../config/database';

/** تجميع بيانات لوحة التحكم الرئيسية في استعلام واحد. */
export class DashboardService {
  async overview() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      contractsTotal,
      contractsActive,
      contractsMonthlyAgg,
      customersCount,
      governmentCustomers,
      employeesActive,
      equipmentTotal,
      equipmentNotWorking,
      revenueAgg,
      expenseAgg,
      dueInvoices,
      monthlyExpenseAgg,
    ] = await Promise.all([
      prisma.contract.count(),
      prisma.contract.count({ where: { status: 'ACTIVE' } }),
      prisma.contract.aggregate({ where: { status: 'ACTIVE' }, _sum: { monthlyTransportValue: true } }),
      prisma.customer.count({ where: { isArchived: false } }),
      prisma.customer.count({ where: { isArchived: false, type: 'GOVERNMENT' } }),
      prisma.employee.count({ where: { status: 'ACTIVE' } }),
      prisma.equipment.count(),
      prisma.equipment.count({ where: { status: 'NOT_WORKING' } }),
      prisma.transaction.aggregate({ where: { type: 'REVENUE' }, _sum: { credit: true } }),
      prisma.transaction.aggregate({ where: { type: 'EXPENSE' }, _sum: { debit: true } }),
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        _sum: { total: true, paidAmount: true },
        _count: { _all: true },
      }),
      prisma.expense.aggregate({ where: { status: 'APPROVED', date: { gte: monthStart } }, _sum: { amount: true } }),
    ]);

    const totalRevenue = revenueAgg._sum.credit ?? 0;
    const totalExpense = expenseAgg._sum.debit ?? 0;
    const dueTotal = (dueInvoices._sum.total ?? 0) - (dueInvoices._sum.paidAmount ?? 0);

    return {
      contracts: {
        total: contractsTotal,
        active: contractsActive,
        monthlyTransportTotal: contractsMonthlyAgg._sum.monthlyTransportValue ?? 0,
      },
      customers: { total: customersCount, government: governmentCustomers, private: customersCount - governmentCustomers },
      employees: { active: employeesActive },
      equipment: { total: equipmentTotal, notWorking: equipmentNotWorking },
      finance: {
        totalRevenue,
        totalExpense,
        netProfit: totalRevenue - totalExpense,
        monthlyExpense: monthlyExpenseAgg._sum.amount ?? 0,
        dueInvoicesAmount: dueTotal,
        dueInvoicesCount: dueInvoices._count._all,
      },
    };
  }

  /** سلسلة الإيرادات/المصروفات لآخر 6 أشهر. */
  async monthlyTrend() {
    const now = new Date();
    const months: { label: string; year: number; month: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    const result = [];
    for (const m of months) {
      const start = new Date(m.year, m.month - 1, 1);
      const end = new Date(m.year, m.month, 0, 23, 59, 59);
      const [rev, exp] = await Promise.all([
        prisma.transaction.aggregate({ where: { type: 'REVENUE', date: { gte: start, lte: end } }, _sum: { credit: true } }),
        prisma.transaction.aggregate({ where: { type: 'EXPENSE', date: { gte: start, lte: end } }, _sum: { debit: true } }),
      ]);
      result.push({ label: m.label, revenue: rev._sum.credit ?? 0, expense: exp._sum.debit ?? 0 });
    }
    return result;
  }

  /** توزيع حالة المشاريع للرسم الدائري. */
  async contractStatusBreakdown() {
    const grouped = await prisma.contract.groupBy({ by: ['status'], _count: { _all: true } });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  /** أحدث العمليات من سجل التدقيق. */
  async recentActivity(limit = 8) {
    return prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { user: { select: { fullName: true } } },
    });
  }
}

export const dashboardService = new DashboardService();

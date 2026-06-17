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

  /**
   * لوحة تحكم تنفيذية موحّدة — استدعاء واحد يُرجع جميع KPIs والرسوم والقوائم.
   * يستبدل 4+ استدعاءات منفصلة بطلب HTTP واحد.
   */
  async executive() {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd   = new Date(todayStart.getTime() + 86_400_000);

    // آخر 6 أشهر (نطاق بداية/نهاية لكل شهر)
    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    });

    // ── جميع الاستعلامات الأساسية بشكل متوازٍ ──────────────────────────────
    const [core, trend] = await Promise.all([
      Promise.all([
        prisma.customer.count({ where: { isArchived: false } }),
        prisma.contract.count(),
        prisma.contract.count({ where: { status: 'ACTIVE' } }),
        prisma.invoice.count(),
        prisma.invoice.count({ where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } } }),
        prisma.invoice.aggregate({
          where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
          _sum: { total: true, paidAmount: true },
        }),
        prisma.expense.aggregate({ where: { status: 'APPROVED' }, _count: { _all: true }, _sum: { amount: true } }),
        prisma.employee.count(),
        prisma.employee.count({ where: { status: 'ACTIVE' } }),
        prisma.equipment.count(),
        prisma.equipment.count({ where: { status: 'WORKING' } }),
        prisma.transaction.aggregate({ where: { type: 'REVENUE' }, _sum: { credit: true } }),
        prisma.transaction.aggregate({ where: { type: 'EXPENSE' }, _sum: { debit: true } }),
        prisma.attendance.groupBy({
          by: ['status'],
          where: { date: { gte: todayStart, lt: todayEnd } },
          _count: { _all: true },
        }),
        prisma.contract.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.invoice.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.invoice.findMany({
          orderBy: { issueDate: 'desc' },
          take: 5,
          select: {
            id: true, invoiceNumber: true, direction: true, status: true,
            total: true, paidAmount: true, issueDate: true,
            customer: { select: { name: true } },
            supplier: { select: { name: true } },
          },
        }),
        prisma.expense.findMany({
          orderBy: { date: 'desc' },
          take: 5,
          select: { id: true, code: true, category: true, description: true, amount: true, date: true, status: true },
        }),
        prisma.contract.findMany({
          orderBy: { id: 'desc' },
          take: 5,
          select: {
            id: true, code: true, asphaltPlant: true, location: true,
            monthlyTransportValue: true, status: true, startDate: true, endDate: true,
            customer: { select: { name: true } },
          },
        }),
      ] as const),

      // اتجاه الإيرادات والمصروفات لآخر 6 أشهر (بشكل متوازٍ مع الاستعلامات الأساسية)
      Promise.all(
        months.map(async (m) => {
          const [rev, exp] = await Promise.all([
            prisma.transaction.aggregate({ where: { type: 'REVENUE', date: { gte: m.start, lte: m.end } }, _sum: { credit: true } }),
            prisma.transaction.aggregate({ where: { type: 'EXPENSE', date: { gte: m.start, lte: m.end } }, _sum: { debit: true } }),
          ]);
          return { label: m.label, revenue: rev._sum.credit ?? 0, expense: exp._sum.debit ?? 0 };
        }),
      ),
    ]);

    const [
      customersTotal, contractsTotal, contractsActive,
      invoicesTotal, invoicesUnpaidCount, invoicesUnpaidAgg,
      expensesAgg,
      employeesTotal, employeesActive,
      equipmentTotal, equipmentActive,
      revenueAgg, expenseTransAgg,
      attendanceGroups, contractStatusGroups, invoiceStatusGroups,
      latestInvoices, latestExpenses, latestContracts,
    ] = core;

    // معالجة حضور اليوم
    const attMap: Record<string, number> = {};
    attendanceGroups.forEach((g) => { attMap[g.status] = g._count._all; });

    const totalRevenue  = revenueAgg._sum.credit ?? 0;
    const totalExpense  = expenseTransAgg._sum.debit ?? 0;
    const unpaidAmount  = (invoicesUnpaidAgg._sum.total ?? 0) - (invoicesUnpaidAgg._sum.paidAmount ?? 0);

    return {
      kpis: {
        customers:  { total: customersTotal },
        contracts:  { total: contractsTotal, active: contractsActive },
        invoices:   { total: invoicesTotal, unpaid: invoicesUnpaidCount, unpaidAmount },
        expenses:   { count: expensesAgg._count._all, totalAmount: expensesAgg._sum.amount ?? 0 },
        employees:  { total: employeesTotal, active: employeesActive },
        equipment:  { total: equipmentTotal, active: equipmentActive },
        finance:    { totalRevenue, totalExpense, netProfit: totalRevenue - totalExpense },
      },
      attendance: {
        present: attMap['PRESENT'] ?? 0,
        absent:  attMap['ABSENT']  ?? 0,
        late:    attMap['LATE']    ?? 0,
        leave:   attMap['LEAVE']   ?? 0,
        total:   Object.values(attMap).reduce((s, v) => s + v, 0),
      },
      trend,
      contractStatus: contractStatusGroups.map((g) => ({ status: g.status, count: g._count._all })),
      invoiceStatus:  invoiceStatusGroups.map((g) => ({ status: g.status, count: g._count._all })),
      latestInvoices,
      latestExpenses,
      latestContracts,
    };
  }
}

export const dashboardService = new DashboardService();

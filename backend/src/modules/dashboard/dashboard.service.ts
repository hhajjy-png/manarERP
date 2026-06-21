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

    return Promise.all(
      months.map(async (m) => {
        const start = new Date(m.year, m.month - 1, 1);
        const end = new Date(m.year, m.month, 0, 23, 59, 59);
        const [rev, exp] = await Promise.all([
          prisma.transaction.aggregate({ where: { type: 'REVENUE', date: { gte: start, lte: end } }, _sum: { credit: true } }),
          prisma.transaction.aggregate({ where: { type: 'EXPENSE', date: { gte: start, lte: end } }, _sum: { debit: true } }),
        ]);
        return { label: m.label, revenue: rev._sum.credit ?? 0, expense: exp._sum.debit ?? 0 };
      }),
    );
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

  /**
   * ملخص مالي تنفيذي متقدم — تحصيلات الشهر، كبار المدينين، تحليل الذمم، ربحية العقود.
   * مصدر بيانات Part 1 (Dashboard V2) + Part 3 (Receivables Widgets).
   */
  async executiveFinancialV2() {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const r3 = (v: number) => Math.round(v * 1000) / 1000;
    const n = (v: unknown) => Number(v ?? 0);

    const months = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      return {
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    });

    const [
      collectionsThisMonthAgg,
      expensesThisMonthAgg,
      outstandingInvoices,
      invByContract,
      expByContract,
      activeContracts,
      collectionTrendRaw,
    ] = await Promise.all([
      prisma.payment.aggregate({
        where: { date: { gte: monthStart }, invoice: { direction: 'SALES', status: { not: 'CANCELLED' } } },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { status: 'APPROVED', date: { gte: monthStart } },
        _sum: { amount: true },
      }),
      prisma.invoice.findMany({
        where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] }, customerId: { not: null } },
        select: {
          customerId: true, total: true, paidAmount: true, issueDate: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      prisma.invoice.groupBy({
        by: ['contractId'],
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, contractId: { not: null } },
        _sum: { total: true },
      }),
      prisma.expense.groupBy({
        by: ['contractId'],
        where: { status: { notIn: ['REJECTED', 'CANCELLED'] }, contractId: { not: null } },
        _sum: { amount: true },
      }),
      prisma.contract.findMany({
        where: { status: 'ACTIVE' },
        take: 50,
        orderBy: { id: 'desc' },
        select: { id: true, code: true, asphaltPlant: true },
      }),
      Promise.all(
        months.map(async (m) => {
          const agg = await prisma.payment.aggregate({
            where: {
              date: { gte: m.start, lte: m.end },
              invoice: { direction: 'SALES', status: { not: 'CANCELLED' } },
            },
            _sum: { amount: true },
          });
          return { label: m.label, collected: r3(n(agg._sum.amount)) };
        }),
      ),
    ]);

    // ── Top Debtors ────────────────────────────────────────────────────────────
    const debtorMap = new Map<number, { name: string; outstanding: number }>();
    for (const inv of outstandingInvoices) {
      if (!inv.customerId || !inv.customer) continue;
      const outstanding = Math.max(0, n(inv.total) - n(inv.paidAmount));
      if (outstanding <= 0) continue;
      const entry = debtorMap.get(inv.customerId) ?? { name: inv.customer.name, outstanding: 0 };
      entry.outstanding = r3(entry.outstanding + outstanding);
      debtorMap.set(inv.customerId, entry);
    }
    const topDebtors = [...debtorMap.entries()]
      .map(([customerId, d]) => ({ customerId, name: d.name, outstanding: d.outstanding }))
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5);

    // ── Aging Summary ──────────────────────────────────────────────────────────
    let b0_30 = 0, b31_60 = 0, b61_90 = 0, b90plus = 0;
    for (const inv of outstandingInvoices) {
      const outstanding = Math.max(0, n(inv.total) - n(inv.paidAmount));
      if (outstanding <= 0) continue;
      const days = Math.floor((now.getTime() - new Date(inv.issueDate).getTime()) / 86_400_000);
      if (days <= 30)      b0_30   += outstanding;
      else if (days <= 60) b31_60  += outstanding;
      else if (days <= 90) b61_90  += outstanding;
      else                 b90plus += outstanding;
    }
    const agingSummary = {
      bucket0_30:  r3(b0_30),
      bucket31_60: r3(b31_60),
      bucket61_90: r3(b61_90),
      bucket90Plus: r3(b90plus),
      totalOutstanding: r3(b0_30 + b31_60 + b61_90 + b90plus),
    };

    // ── Contract Profitability ─────────────────────────────────────────────────
    const invMap = new Map(invByContract.map((r) => [r.contractId as number, n(r._sum.total)]));
    const expMap = new Map(expByContract.map((r) => [r.contractId as number, n(r._sum.amount)]));

    const contractProfits = activeContracts
      .map((c) => {
        const revenue  = invMap.get(c.id) ?? 0;
        const expenses = expMap.get(c.id) ?? 0;
        const profit   = r3(revenue - expenses);
        const profitMargin = revenue > 0 ? Math.round((profit / revenue) * 100 * 10) / 10 : null;
        return { id: c.id, code: c.code, asphaltPlant: c.asphaltPlant, revenue: r3(revenue), expenses: r3(expenses), profit, profitMargin };
      })
      .filter((c) => c.revenue > 0);

    const byMarginDesc = [...contractProfits].sort((a, b) => (b.profitMargin ?? -Infinity) - (a.profitMargin ?? -Infinity));
    const topProfitableContracts = byMarginDesc.slice(0, 5);
    const lowestProfitContracts  = [...byMarginDesc].reverse().slice(0, 5);

    // ── Financial Alerts ───────────────────────────────────────────────────────
    const financialAlerts: { type: string; level: 'warning' | 'danger'; messageAr: string }[] = [];
    if (agingSummary.bucket90Plus > 0) {
      financialAlerts.push({ type: 'aging_90plus', level: 'danger',  messageAr: `مديونيات متأخرة أكثر من 90 يوم: ${agingSummary.bucket90Plus.toFixed(3)} د.ك` });
    }
    if (agingSummary.bucket61_90 > 0) {
      financialAlerts.push({ type: 'aging_61_90', level: 'warning', messageAr: `مديونيات 61–90 يوم: ${agingSummary.bucket61_90.toFixed(3)} د.ك` });
    }

    return {
      collectionsThisMonth:   r3(n(collectionsThisMonthAgg._sum.amount)),
      expensesThisMonth:      r3(n(expensesThisMonthAgg._sum.amount)),
      topDebtors,
      agingSummary,
      collectionTrend:        collectionTrendRaw,
      topProfitableContracts,
      lowestProfitContracts,
      financialAlerts,
    };
  }

  /** ملخص العمليات المعلّقة — للشريط التحذيري في لوحة التحكم. */
  async operationalSummary() {
    const now = new Date();
    const in30Days = new Date(now);
    in30Days.setDate(in30Days.getDate() + 30);

    const [
      pendingExpensesAgg,
      draftPayrollCount,
      unprintedChequesCount,
      outstandingInvoicesAgg,
      expiringAgreementsCount,
    ] = await Promise.all([
      prisma.expense.aggregate({ where: { status: 'PENDING' }, _count: { _all: true }, _sum: { amount: true } }),
      prisma.payroll.count({ where: { status: 'DRAFT' } }),
      prisma.cheque.count({ where: { status: 'DRAFT' } }),
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        _count: { _all: true },
        _sum: { total: true, paidAmount: true },
      }),
      prisma.projectPrice.count({
        where: { isArchived: false, validUntil: { gte: now, lte: in30Days } },
      }),
    ]);

    const outstandingTotal =
      (outstandingInvoicesAgg._sum.total ?? 0) - (outstandingInvoicesAgg._sum.paidAmount ?? 0);

    return {
      pendingExpensesCount: pendingExpensesAgg._count._all,
      pendingExpensesTotal: pendingExpensesAgg._sum.amount ?? 0,
      draftPayrollCount,
      unprintedChequesCount,
      outstandingInvoicesCount: outstandingInvoicesAgg._count._all,
      outstandingInvoicesTotal: outstandingTotal,
      expiringAgreementsCount,
    };
  }
}

export const dashboardService = new DashboardService();

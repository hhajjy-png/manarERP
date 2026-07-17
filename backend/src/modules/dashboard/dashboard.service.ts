import { prisma } from '../../config/database';
import { roundMoney } from '../../shared/utils/money';
import { formatCurrency, formatPercent } from '../../shared/utils/currency';
import { ytdMonths } from '../../core/utils/dateWindows';
import { glProfitAndLoss, glMonthlyProfitAndLoss } from '../../shared/services/gl.reporting';

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
      dueInvoices,
      pl,
      plMonth,
    ] = await Promise.all([
      prisma.contract.count(),
      prisma.contract.count({ where: { status: 'ACTIVE' } }),
      prisma.contract.aggregate({ where: { status: 'ACTIVE' }, _sum: { monthlyTransportValue: true } }),
      prisma.customer.count({ where: { isArchived: false } }),
      prisma.customer.count({ where: { isArchived: false, type: 'GOVERNMENT' } }),
      prisma.employee.count({ where: { status: 'ACTIVE' } }),
      prisma.equipment.count(),
      prisma.equipment.count({ where: { status: 'NOT_WORKING' } }),
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
        _sum: { total: true, paidAmount: true },
        _count: { _all: true },
      }),
      // المصدر المحاسبي الوحيد: الإيراد/المصروف/الربح من الأستاذ العام (بدل الدفتر القديم).
      glProfitAndLoss(),
      glProfitAndLoss({ from: monthStart }),
    ]);

    const totalRevenue = pl.revenue;
    const totalExpense = pl.expenses;
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
        netProfit: pl.netProfit,
        monthlyExpense: plMonth.expenses,
        dueInvoicesAmount: dueTotal,
        dueInvoicesCount: dueInvoices._count._all,
      },
    };
  }

  /** سلسلة الإيرادات/المصروفات — منذ بداية السنة حتى الشهر الحالي (YTD، تتضمّن يناير). */
  async monthlyTrend() {
    // المصدر المحاسبي الوحيد: الاتجاه الشهري من الأستاذ العام (بدل الدفتر القديم).
    const months = ytdMonths();
    const rows = await glMonthlyProfitAndLoss(months);
    return rows.map((r) => ({ label: r.label, revenue: r.revenue, expense: r.expense }));
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

    // منذ بداية السنة حتى الشهر الحالي (YTD) — نافذة موحّدة تتضمّن يناير دائمًا
    const months = ytdMonths(now);

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
        // المصدر المحاسبي الوحيد: إجمالي الإيراد/المصروف من الأستاذ العام.
        glProfitAndLoss(),
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

      // اتجاه الإيرادات والمصروفات (YTD) من الأستاذ العام — المصدر المحاسبي الوحيد.
      glMonthlyProfitAndLoss(months).then((rows) =>
        rows.map((r) => ({ label: r.label, revenue: r.revenue, expense: r.expense })),
      ),
    ]);

    const [
      customersTotal, contractsTotal, contractsActive,
      invoicesTotal, invoicesUnpaidCount, invoicesUnpaidAgg,
      expensesAgg,
      employeesTotal, employeesActive,
      equipmentTotal, equipmentActive,
      pl,
      attendanceGroups, contractStatusGroups, invoiceStatusGroups,
      latestInvoices, latestExpenses, latestContracts,
    ] = core;

    // معالجة حضور اليوم
    const attMap: Record<string, number> = {};
    attendanceGroups.forEach((g) => { attMap[g.status] = g._count._all; });

    const totalRevenue  = pl.revenue;
    const totalExpense  = pl.expenses;
    const unpaidAmount  = (invoicesUnpaidAgg._sum.total ?? 0) - (invoicesUnpaidAgg._sum.paidAmount ?? 0);

    return {
      kpis: {
        customers:  { total: customersTotal },
        contracts:  { total: contractsTotal, active: contractsActive },
        invoices:   { total: invoicesTotal, unpaid: invoicesUnpaidCount, unpaidAmount },
        expenses:   { count: expensesAgg._count._all, totalAmount: expensesAgg._sum.amount ?? 0 },
        employees:  { total: employeesTotal, active: employeesActive },
        equipment:  { total: equipmentTotal, active: equipmentActive },
        finance:    { totalRevenue, totalExpense, netProfit: pl.netProfit },
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
    const n = (v: unknown) => Number(v ?? 0);

    // منذ بداية السنة حتى الشهر الحالي (YTD) — نافذة موحّدة تتضمّن يناير دائمًا
    const months = ytdMonths(now);

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
          return { label: m.label, collected: roundMoney(n(agg._sum.amount)) };
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
      entry.outstanding = roundMoney(entry.outstanding + outstanding);
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
      bucket0_30:  roundMoney(b0_30),
      bucket31_60: roundMoney(b31_60),
      bucket61_90: roundMoney(b61_90),
      bucket90Plus: roundMoney(b90plus),
      totalOutstanding: roundMoney(b0_30 + b31_60 + b61_90 + b90plus),
    };

    // ── Contract Profitability ─────────────────────────────────────────────────
    const invMap = new Map(invByContract.map((r) => [r.contractId as number, n(r._sum.total)]));
    const expMap = new Map(expByContract.map((r) => [r.contractId as number, n(r._sum.amount)]));

    const contractProfits = activeContracts
      .map((c) => {
        const revenue  = invMap.get(c.id) ?? 0;
        const expenses = expMap.get(c.id) ?? 0;
        const profit   = roundMoney(revenue - expenses);
        const profitMargin = revenue > 0 ? Math.round((profit / revenue) * 100 * 10) / 10 : null;
        return { id: c.id, code: c.code, asphaltPlant: c.asphaltPlant, revenue: roundMoney(revenue), expenses: roundMoney(expenses), profit, profitMargin };
      })
      .filter((c) => c.revenue > 0);

    const byMarginDesc = [...contractProfits].sort((a, b) => (b.profitMargin ?? -Infinity) - (a.profitMargin ?? -Infinity));
    const topProfitableContracts = byMarginDesc.slice(0, 5);
    const lowestProfitContracts  = [...byMarginDesc].reverse().slice(0, 5);

    // ── Financial Alerts ───────────────────────────────────────────────────────
    const financialAlerts: { type: string; level: 'warning' | 'danger'; messageAr: string }[] = [];
    if (agingSummary.bucket90Plus > 0) {
      financialAlerts.push({ type: 'aging_90plus', level: 'danger',  messageAr: `مديونيات متأخرة أكثر من 90 يوم: ${formatCurrency(agingSummary.bucket90Plus)}` });
    }
    if (agingSummary.bucket61_90 > 0) {
      financialAlerts.push({ type: 'aging_61_90', level: 'warning', messageAr: `مديونيات 61–90 يوم: ${formatCurrency(agingSummary.bucket61_90)}` });
    }

    return {
      collectionsThisMonth:   roundMoney(n(collectionsThisMonthAgg._sum.amount)),
      expensesThisMonth:      roundMoney(n(expensesThisMonthAgg._sum.amount)),
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
  /**
   * الاتجاه الشهري (إيراد/مصروف/تحصيل/ربح) مُجمَّعًا في قاعدة البيانات.
   *
   * يستبدل جلب آلاف الصفوف ثم تصنيفها في الذاكرة بـ aggregate واحد لكل مقياس لكل شهر.
   * عدد الأشهر ≤ 12 (YTD)، والاستعلامات تتوازى، فلا اقتطاع ولا حِمل ذاكرة كبير.
   * النمط ذاته المستخدم في `executive.kpiTimeline`.
   */
  private async monthlyTrendYTD(
    months: { label: string; start: Date; end: Date }[],
  ): Promise<{ month: string; revenue: number; expenses: number; collections: number; profit: number }[]> {
    const n = (v: unknown) => Number(v ?? 0);

    return Promise.all(
      months.map(async (m) => {
        const [revAgg, expAgg, colAgg] = await Promise.all([
          prisma.invoice.aggregate({
            where: { direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { gte: m.start, lte: m.end } },
            _sum: { total: true },
          }),
          prisma.expense.aggregate({
            where: { status: { notIn: ['REJECTED', 'CANCELLED'] }, date: { gte: m.start, lte: m.end } },
            _sum: { amount: true },
          }),
          prisma.payment.aggregate({
            where: { date: { gte: m.start, lte: m.end }, invoice: { direction: 'SALES' } },
            _sum: { amount: true },
          }),
        ]);
        const revenue = roundMoney(n(revAgg._sum.total));
        const expenses = roundMoney(n(expAgg._sum.amount));
        const collections = roundMoney(n(colAgg._sum.amount));
        return { month: m.label, revenue, expenses, collections, profit: roundMoney(revenue - expenses) };
      }),
    );
  }

  /**
   * حزمة الذكاء التنفيذي V2 — تنبيهات + توقعات + اتجاهات + مقارنات KPI + صحة العقود + توصيات.
   * Read-only. لا يكتب أي شيء. لا migration.
   */
  async executiveIntelligenceV2() {
    const now = new Date();
    const n  = (v: unknown) => Number(v ?? 0);
    const sp = (num: number, den: number): number | null => {
      if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
      return Math.round((num / den) * 100 * 1000) / 1000;
    };

    // منذ بداية السنة حتى الشهر الحالي (YTD) — نافذة الاتجاهات الموحّدة (تتضمّن يناير).
    // yearStart يطابق أول شهر في `months` فتتوافق نافذة الجلب مع أوعية التجميع (لا تُجلب يناير ثم تُهمَل).
    const months = ytdMonths(now);
    const yearStart = months[0].start;
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const thirtyDaysAgo  = new Date(now.getTime() - 30 * 86_400_000);

    const [
      activeContracts,
      invByContract,
      expByContract,
      outstandingInvoices,
      monthlyTrends,
      thisMonthRevAgg,
      lastMonthRevAgg,
      thisMonthExpAgg,
      lastMonthExpAgg,
      thisMonthColAgg,
      lastMonthColAgg,
      recentActivity,
    ] = await Promise.all([
      // كل العقود النشطة — بلا take. تغذّي إحصاءات العقود وصحّتها وتنبيهات الخسارة،
      // فاقتطاعها كان يُسقط عقودًا من مؤشرات KPI. مجموعة محدودة بطبعها (عقود نشطة).
      prisma.contract.findMany({
        where: { status: 'ACTIVE' }, orderBy: { id: 'desc' },
        select: { id: true, code: true, asphaltPlant: true, startDate: true, customer: { select: { id: true, name: true } } },
      }),
      prisma.invoice.groupBy({
        by: ['contractId'],
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, contractId: { not: null } },
        _sum: { total: true, paidAmount: true },
      }),
      prisma.expense.groupBy({
        by: ['contractId'],
        where: { status: { notIn: ['REJECTED', 'CANCELLED'] }, contractId: { not: null } },
        _sum: { amount: true },
      }),
      // الذمم المفتوحة كاملةً — بلا take. مجموعة عاملة محدودة (الفواتير تُسدَّد وتغادرها)،
      // والاقتطاع كان يُنقص المدينين والأعمار والتوقّع. orderBy حتمي للثبات.
      prisma.invoice.findMany({
        where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] }, customerId: { not: null } },
        orderBy: [{ issueDate: 'asc' }, { id: 'asc' }],
        select: {
          customerId: true, total: true, paidAmount: true, issueDate: true, dueDate: true,
          contractId: true, customer: { select: { id: true, name: true } },
        },
      }),
      // الاتجاه الشهري يُحسب في قاعدة البيانات (aggregate لكل شهر) لا بجلب صفوف مقتطعة.
      this.monthlyTrendYTD(months),
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { gte: thisMonthStart } },
        _sum: { total: true },
      }),
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { total: true },
      }),
      prisma.expense.aggregate({
        where: { status: { notIn: ['REJECTED', 'CANCELLED'] }, date: { gte: thisMonthStart } },
        _sum: { amount: true },
      }),
      prisma.expense.aggregate({
        where: { status: { notIn: ['REJECTED', 'CANCELLED'] }, date: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { date: { gte: thisMonthStart }, invoice: { direction: 'SALES' } },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { date: { gte: lastMonthStart, lte: lastMonthEnd }, invoice: { direction: 'SALES' } },
        _sum: { amount: true },
      }),
      // مجموعة عضوية تزيينية فقط (`recentSet.has(id)` → علم "نشاط حديث") — غير مالية،
      // لا تدخل أي KPI. الحد مقبول هنا: 500 عقد نشط خلال 90 يومًا يفوق أي واقع تشغيلي،
      // و orderBy يثبّت أي عناصر تُقتطع نظريًا.
      prisma.invoice.findMany({
        where: {
          direction: 'SALES', status: { not: 'CANCELLED' },
          contractId: { not: null }, issueDate: { gte: ninetyDaysAgo },
        },
        take: 500,
        orderBy: { issueDate: 'desc' },
        select: { contractId: true },
        distinct: ['contractId'],
      }),
    ]);

    // ── Contract stats ─────────────────────────────────────────────────────
    const invMap = new Map(invByContract.map(r => [r.contractId as number, { total: n(r._sum.total), paid: n(r._sum.paidAmount) }]));
    const expMap = new Map(expByContract.map(r => [r.contractId as number, n(r._sum.amount)]));
    const recentSet = new Set(recentActivity.map(r => r.contractId as number));

    const contractStats = activeContracts.map(c => {
      const inv = invMap.get(c.id) ?? { total: 0, paid: 0 };
      const exp = expMap.get(c.id) ?? 0;
      const revenue    = roundMoney(inv.total);
      const collected  = roundMoney(inv.paid);
      const expenses   = roundMoney(exp);
      const outstanding = roundMoney(Math.max(0, revenue - collected));
      const profit     = roundMoney(revenue - expenses);
      const isNew  = c.startDate !== null && c.startDate > thirtyDaysAgo;
      const noData = (revenue === 0 && expenses === 0 && collected === 0) || isNew;
      return {
        id: c.id, code: c.code, asphaltPlant: c.asphaltPlant,
        customerName: c.customer?.name ?? '—',
        revenue, collected, expenses, outstanding, profit,
        profitMargin:   sp(profit, revenue),
        collectionRate: sp(collected, revenue),
        expenseRatio:   sp(expenses, revenue),
        hasRecentActivity: recentSet.has(c.id),
        noData,
      };
    });

    const noDataContractIds = new Set(contractStats.filter(c => c.noData).map(c => c.id));

    // ── Debtor map ─────────────────────────────────────────────────────────
    const debtorMap = new Map<number, { name: string; outstanding: number; oldestDays: number }>();
    for (const inv of outstandingInvoices) {
      if (!inv.customerId || !inv.customer) continue;
      const os = Math.max(0, n(inv.total) - n(inv.paidAmount));
      if (os <= 0) continue;
      const days = Math.floor((now.getTime() - new Date(inv.issueDate).getTime()) / 86_400_000);
      const e = debtorMap.get(inv.customerId) ?? { name: inv.customer.name, outstanding: 0, oldestDays: 0 };
      e.outstanding = roundMoney(e.outstanding + os);
      if (days > e.oldestDays) e.oldestDays = days;
      debtorMap.set(inv.customerId, e);
    }
    const debtorList = [...debtorMap.entries()].map(([id, d]) => ({ customerId: id, ...d }));

    // ── Part 1: Alerts ─────────────────────────────────────────────────────
    const overdueCustomers = debtorList
      .filter(d => d.oldestDays > 90)
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5)
      .map(d => ({
        id: `overdue-${d.customerId}`,
        severity: (d.oldestDays > 180 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
        type: 'OVERDUE_CUSTOMER', title: `ذمة متأخرة: ${d.name}`,
        description: `مديونية متأخرة ${d.oldestDays} يوم`,
        amount: d.outstanding, relatedId: d.customerId, relatedType: 'CUSTOMER',
        actionLabel: 'متابعة التحصيل',
      }));

    const highOutstanding = debtorList
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 5)
      .map(d => ({
        id: `high-os-${d.customerId}`,
        severity: (d.outstanding > 10000 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
        type: 'HIGH_OUTSTANDING', title: `مديونية عالية: ${d.name}`,
        description: `إجمالي الذمم المستحقة`,
        amount: d.outstanding, relatedId: d.customerId, relatedType: 'CUSTOMER',
        actionLabel: 'مراجعة الحساب',
      }));

    const lossMaking = contractStats
      .filter(c => c.revenue > 0 && c.profit < 0)
      .sort((a, b) => a.profit - b.profit)
      .slice(0, 5)
      .map(c => ({
        id: `loss-${c.id}`,
        severity: 'HIGH' as 'HIGH' | 'MEDIUM' | 'LOW',
        type: 'LOSS_CONTRACT', title: `عقد خاسر: ${c.code}`,
        description: `هامش ربح سلبي — ${c.asphaltPlant}`,
        amount: Math.abs(c.profit), relatedId: c.id, relatedType: 'CONTRACT',
        actionLabel: 'مراجعة المصروفات',
      }));

    const lowCollection = contractStats
      .filter(c => c.revenue > 0 && (c.collectionRate ?? 100) < 50)
      .sort((a, b) => (a.collectionRate ?? 0) - (b.collectionRate ?? 0))
      .slice(0, 5)
      .map(c => ({
        id: `low-col-${c.id}`,
        severity: ((c.collectionRate ?? 0) < 25 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
        type: 'LOW_COLLECTION', title: `تحصيل منخفض: ${c.code}`,
        description: `نسبة التحصيل ${formatPercent(c.collectionRate ?? 0, 1)}`,
        amount: c.outstanding, relatedId: c.id, relatedType: 'CONTRACT',
        actionLabel: 'متابعة التحصيل',
      }));

    const highExpenseRatio = contractStats
      .filter(c => c.revenue > 0 && (c.expenseRatio ?? 0) > 80)
      .sort((a, b) => (b.expenseRatio ?? 0) - (a.expenseRatio ?? 0))
      .slice(0, 5)
      .map(c => ({
        id: `high-exp-${c.id}`,
        severity: ((c.expenseRatio ?? 0) > 100 ? 'HIGH' : 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
        type: 'HIGH_EXPENSE_RATIO', title: `مصروفات مرتفعة: ${c.code}`,
        description: `نسبة المصروفات ${formatPercent(c.expenseRatio ?? 0, 1)}`,
        amount: c.expenses, relatedId: c.id, relatedType: 'CONTRACT',
        actionLabel: 'مراجعة المصروفات',
      }));

    const noActivity = activeContracts
      .filter(c => !recentSet.has(c.id) && !noDataContractIds.has(c.id))
      .slice(0, 5)
      .map(c => ({
        id: `no-act-${c.id}`,
        severity: 'LOW' as 'HIGH' | 'MEDIUM' | 'LOW',
        type: 'NO_INVOICE_ACTIVITY', title: `لا نشاط: ${c.code}`,
        description: `لا فواتير منذ أكثر من 90 يوم — ${c.asphaltPlant}`,
        amount: null as number | null, relatedId: c.id, relatedType: 'CONTRACT',
        actionLabel: 'مراجعة العقد',
      }));

    const alerts = [...overdueCustomers, ...highOutstanding, ...lossMaking, ...lowCollection, ...highExpenseRatio, ...noActivity];

    // ── Part 2: Forecast ───────────────────────────────────────────────────
    // تقدير التحصيلات المتوقّعة حسب أجل الاستحقاق. المستحقّات المتأخّرة (تجاوزت تاريخ
    // استحقاقها) تُحتسب ضمن نافذة الـ 30 يومًا القادمة — فهي أقرب ما يُتوقّع تحصيله (افتراض
    // تدفّق نقدي قاعدي معتاد)، وإلا لظلّ التوقّع صفرًا لأي محفظة ذمم متأخّرة بالكامل.
    let exp30 = 0, exp60 = 0, exp90 = 0;
    for (const inv of outstandingInvoices) {
      const os = Math.max(0, n(inv.total) - n(inv.paidAmount));
      if (os <= 0) continue;
      // Use dueDate if set; fallback: issueDate + 30 day default payment term
      const refDate = inv.dueDate
        ?? new Date(new Date(inv.issueDate).getTime() + 30 * 86_400_000);
      const daysUntilDue = Math.ceil((new Date(refDate).getTime() - now.getTime()) / 86_400_000);
      if (daysUntilDue <= 30)  exp30 += os;      // متأخّر أو مستحق خلال 0–30 يومًا
      else if (daysUntilDue <= 60) exp60 += os;  // مستحق خلال 31–60 يومًا
      else if (daysUntilDue <= 90) exp90 += os;  // مستحق خلال 61–90 يومًا
      // > 90 يومًا: خارج نطاق التوقّع (المرحلة 1)
    }

    const thisCol  = n(thisMonthColAgg._sum.amount);
    const thisExp  = n(thisMonthExpAgg._sum.amount);
    const thisRev  = n(thisMonthRevAgg._sum.total);
    const lastCol  = n(lastMonthColAgg._sum.amount);
    const lastExp  = n(lastMonthExpAgg._sum.amount);
    const lastRev  = n(lastMonthRevAgg._sum.total);
    const totalOs  = roundMoney(exp30 + exp60 + exp90);

    let riskScore = 0;
    if (totalOs > thisCol * 3) riskScore += 2; else if (totalOs > thisCol) riskScore += 1;
    if (thisExp > thisCol)       riskScore += 2; else if (thisExp > thisCol * 0.8) riskScore += 1;
    if (exp90 > totalOs * 0.4)   riskScore += 1;
    const cashRisk: 'LOW' | 'MEDIUM' | 'HIGH' = riskScore >= 4 ? 'HIGH' : riskScore >= 2 ? 'MEDIUM' : 'LOW';

    const forecast = {
      expectedCollections30: roundMoney(exp30),
      expectedCollections60: roundMoney(exp60),
      expectedCollections90: roundMoney(exp90),
      cashRisk,
      next30DaysSummary: {
        expectedCollections: roundMoney(exp30),
        netThisMonth: roundMoney(thisRev - thisExp),
        cashRisk,
      },
    };

    // ── Part 3: Monthly Trends ─────────────────────────────────────────────
    // مُجمَّعة في قاعدة البيانات عبر `monthlyTrendYTD` — لا اقتطاع ولا تجميع في الذاكرة.

    // ── Part 4: KPI Comparisons ────────────────────────────────────────────
    const thisProfit = roundMoney(thisRev - thisExp);
    const lastProfit = roundMoney(lastRev - lastExp);
    const kpiComparisons = {
      revenueChangePct:     sp(thisRev - lastRev, lastRev),
      expensesChangePct:    sp(thisExp - lastExp, lastExp),
      collectionsChangePct: sp(thisCol - lastCol, lastCol),
      profitChangePct:      sp(thisProfit - lastProfit, Math.abs(lastProfit)),
      thisMonth:  { revenue: roundMoney(thisRev), expenses: roundMoney(thisExp), collections: roundMoney(thisCol), profit: thisProfit },
      lastMonth:  { revenue: roundMoney(lastRev), expenses: roundMoney(lastExp), collections: roundMoney(lastCol), profit: lastProfit },
    };

    // ── Part 5: Contract Health ────────────────────────────────────────────
    const healthScores = contractStats.map(c => {
      // New or no-data contracts must not be classified as RISK
      if (c.noData) {
        return {
          contractId: c.id, code: c.code, asphaltPlant: c.asphaltPlant, customerName: c.customerName,
          score: 100, status: 'HEALTHY' as const, profitMargin: null, collectionRate: null,
          outstanding: 0, reason: 'عقد جديد أو لا توجد بيانات مالية كافية بعد',
        };
      }
      // Profit margin (0-25)
      let ps = 0;
      if (c.profitMargin !== null) {
        ps = c.profitMargin >= 30 ? 25 : c.profitMargin >= 20 ? 20 : c.profitMargin >= 10 ? 15 : c.profitMargin >= 0 ? 5 : 0;
      } else { ps = c.revenue === 0 ? 10 : 0; }

      // Collection (0-25)
      let cs = 0;
      if (c.collectionRate !== null) {
        cs = c.collectionRate >= 90 ? 25 : c.collectionRate >= 70 ? 20 : c.collectionRate >= 50 ? 13 : c.collectionRate >= 25 ? 7 : 0;
      } else { cs = c.revenue === 0 ? 10 : 0; }

      // Expense ratio (0-25)
      let es = 0;
      if (c.expenseRatio !== null) {
        es = c.expenseRatio <= 50 ? 25 : c.expenseRatio <= 65 ? 18 : c.expenseRatio <= 80 ? 10 : c.expenseRatio <= 100 ? 3 : 0;
      } else { es = c.revenue === 0 ? 10 : 0; }

      // Activity (0-25)
      const as_ = c.hasRecentActivity ? 25 : c.revenue > 0 ? 12 : 5;

      const score = ps + cs + es + as_;
      const status: 'HEALTHY' | 'WATCH' | 'RISK' = score >= 80 ? 'HEALTHY' : score >= 60 ? 'WATCH' : 'RISK';

      const reasons: string[] = [];
      if (c.profit < 0) reasons.push('ربح سلبي');
      if (c.revenue > 0 && (c.collectionRate ?? 100) < 50) reasons.push('تحصيل منخفض');
      if (c.revenue > 0 && (c.expenseRatio ?? 0) > 80) reasons.push('مصروفات مرتفعة');
      if (!c.hasRecentActivity) reasons.push('لا نشاط مؤخراً');

      return {
        contractId: c.id, code: c.code, asphaltPlant: c.asphaltPlant, customerName: c.customerName,
        score, status, profitMargin: c.profitMargin, collectionRate: c.collectionRate,
        outstanding: c.outstanding, reason: reasons.join(' · ') || 'أداء جيد',
      };
    });

    const riskContracts  = [...healthScores].filter(h => h.status === 'RISK').sort((a, b) => a.score - b.score).slice(0, 5);
    const watchContracts = [...healthScores].filter(h => h.status === 'WATCH').sort((a, b) => a.score - b.score).slice(0, 5);
    const contractHealth = {
      riskContracts, watchContracts,
      summary: {
        healthy: healthScores.filter(h => h.status === 'HEALTHY').length,
        watch:   healthScores.filter(h => h.status === 'WATCH').length,
        risk:    healthScores.filter(h => h.status === 'RISK').length,
        total:   healthScores.length,
      },
    };

    // ── Part 6: Smart Recommendations ─────────────────────────────────────
    type Rec = { id: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; title: string; message: string; metric: string; actionHint: string };
    const recs: Rec[] = [];

    overdueCustomers.slice(0, 2).forEach(a => recs.push({
      id: `rec-${a.id}`, priority: 'HIGH',
      title: 'متابعة ذمة متأخرة',
      message: `${a.title.replace('ذمة متأخرة: ', '')} لديه ذمم متأخرة بقيمة ${formatCurrency(a.amount)} منذ أكثر من 90 يوم.`,
      metric: formatCurrency(a.amount), actionHint: 'أرسل كشف حساب محدث وتواصل مع العميل.',
    }));

    lossMaking.slice(0, 2).forEach(a => recs.push({
      id: `rec-${a.id}`, priority: 'HIGH',
      title: 'عقد يحقق خسارة',
      message: `العقد ${a.title.replace('عقد خاسر: ', '')} يظهر هامش ربح سلبي.`,
      metric: `خسارة ${formatCurrency(a.amount)}`, actionHint: 'راجع تفاصيل المصروفات للعقد.',
    }));

    lowCollection.slice(0, 1).forEach(a => recs.push({
      id: `rec-${a.id}`, priority: 'MEDIUM',
      title: 'نسبة تحصيل منخفضة',
      message: `العقد ${a.title.replace('تحصيل منخفض: ', '')} — ${a.description}.`,
      metric: a.description, actionHint: 'راجع الفواتير المستحقة لهذا العقد.',
    }));

    const colChg = kpiComparisons.collectionsChangePct;
    if (colChg !== null && colChg < -10) recs.push({
      id: 'rec-col-drop', priority: 'HIGH',
      title: 'انخفاض التحصيلات',
      message: `التحصيل هذا الشهر أقل من الشهر السابق بنسبة ${formatPercent(Math.abs(colChg), 1)}.`,
      metric: `${formatPercent(Math.abs(colChg), 1)} انخفاض`, actionHint: 'راجع الفواتير المستحقة وتابع مع العملاء.',
    });

    const expChg = kpiComparisons.expensesChangePct;
    if (expChg !== null && expChg > 15) recs.push({
      id: 'rec-exp-surge', priority: 'MEDIUM',
      title: 'ارتفاع المصاريف',
      message: `المصاريف هذا الشهر أعلى من الشهر السابق بنسبة ${formatPercent(expChg, 1)}.`,
      metric: `${formatPercent(expChg, 1)} ارتفاع`, actionHint: 'راجع المصاريف المرتفعة وقارن مع الميزانية.',
    });

    highExpenseRatio.slice(0, 1).forEach(a => recs.push({
      id: `rec-${a.id}`, priority: 'MEDIUM',
      title: 'نسبة مصروفات مرتفعة',
      message: `العقد ${a.title.replace('مصروفات مرتفعة: ', '')} — ${a.description}.`,
      metric: a.description, actionHint: 'راجع بنود المصروفات وقارن مع العقد الأصلي.',
    }));

    if (noActivity.length > 0) recs.push({
      id: 'rec-no-act', priority: 'LOW',
      title: 'عقود بدون نشاط',
      message: `${noActivity.length} عقود نشطة لم تُصدر لها فواتير منذ أكثر من 90 يوم.`,
      metric: `${noActivity.length} عقود`, actionHint: 'تأكد من مستوى الأعمال في هذه العقود.',
    });

    return { alerts, forecast, monthlyTrends, kpiComparisons, contractHealth, recommendations: recs.slice(0, 8) };
  }
}

export const dashboardService = new DashboardService();

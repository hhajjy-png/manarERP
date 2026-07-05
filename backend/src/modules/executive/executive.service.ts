import { prisma } from '../../config/database';
import { formatCurrency, formatPercent } from '../../shared/utils/currency';

// ── Shared helpers ─────────────────────────────────────────────────────────
const r3 = (v: number) => Math.round(v * 1000) / 1000;
const n  = (v: unknown) => Number(v ?? 0);
const safe = (num: number, den: number): number | null => {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null;
  return r3((num / den) * 100);
};

// ── Types ──────────────────────────────────────────────────────────────────

export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type Priority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface DecisionCard {
  id: string;
  title: string;
  value: string;
  explanation: string;
  priority: Priority;
  recommendedAction: string;
  relatedId?: number;
  relatedType?: 'CUSTOMER' | 'CONTRACT';
  amount?: number;
}

export interface ExecutiveAlertV3 {
  id: string;
  severity: AlertSeverity;
  type: string;
  title: string;
  description: string;
  amount: number | null;
  relatedId?: number;
  relatedType?: string;
  actionLabel: string;
}

export interface KPITimelinePoint {
  period: string;
  revenue: number;
  expenses: number;
  collections: number;
  profit: number;
  outstandingEnd: number;
}

export interface HealthScore {
  total: number;
  label: 'EXCELLENT' | 'GOOD' | 'WATCH' | 'RISK';
  labelAr: string;
  components: {
    collections: number;
    profitability: number;
    outstanding: number;
    cashFlow: number;
    contracts: number;
    stability: number;
  };
  explanation: string;
}

export interface ExecutiveRecommendationV2 {
  id: string;
  priority: Priority;
  title: string;
  reason: string;
  expectedImpact: string;
  suggestedAction: string;
  metric?: string;
}

// ── Executive Service ──────────────────────────────────────────────────────

export class ExecutiveService {
  /**
   * Decision Center — all parts in a single parallel query batch.
   * Covers Parts 1, 2, 3, 5, 6 of the spec.
   * Returns: financialSummary, decisionCards, alertsV3, healthScore, recommendations.
   */
  async decisionCenter() {
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    const ninetyDaysAgo  = new Date(now.getTime() - 90 * 86_400_000);
    const thirtyDaysAgo  = new Date(now.getTime() - 30 * 86_400_000);

    // ── Single parallel fetch of all raw data ──────────────────────────────
    const [
      totalRevenueAgg,
      totalExpensesAgg,
      totalCollectionsAgg,
      thisMonthColAgg,
      lastMonthColAgg,
      thisMonthExpAgg,
      lastMonthExpAgg,
      thisMonthRevAgg,
      lastMonthRevAgg,
      outstandingInvoices,
      invByContract,
      expByContract,
      activeContracts,
      totalContracts,
      customersWithPayments,
      recentInvoiceActivity,
      topExpenseContracts,
      contractGroupCounts,
    ] = await Promise.all([
      // Total revenue (all-time, SALES invoices)
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { notIn: ['CANCELLED'] } },
        _sum: { total: true },
      }),
      // Total expenses (all-time, approved)
      prisma.expense.aggregate({
        where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] } },
        _sum: { amount: true },
      }),
      // Total collections (all-time)
      prisma.payment.aggregate({
        where: { invoice: { direction: 'SALES', status: { not: 'CANCELLED' } } },
        _sum: { amount: true },
      }),
      // This month collections
      prisma.payment.aggregate({
        where: { date: { gte: thisMonthStart }, invoice: { direction: 'SALES' } },
        _sum: { amount: true },
      }),
      // Last month collections
      prisma.payment.aggregate({
        where: { date: { gte: lastMonthStart, lte: lastMonthEnd }, invoice: { direction: 'SALES' } },
        _sum: { amount: true },
      }),
      // This month expenses
      prisma.expense.aggregate({
        where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] }, date: { gte: thisMonthStart } },
        _sum: { amount: true },
      }),
      // Last month expenses
      prisma.expense.aggregate({
        where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] }, date: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { amount: true },
      }),
      // This month revenue (invoices issued)
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { gte: thisMonthStart } },
        _sum: { total: true },
      }),
      // Last month revenue
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { gte: lastMonthStart, lte: lastMonthEnd } },
        _sum: { total: true },
      }),
      // All outstanding invoices with customer info
      prisma.invoice.findMany({
        where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] } },
        take: 1000,
        select: {
          id: true, customerId: true, contractId: true,
          total: true, paidAmount: true, issueDate: true, dueDate: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      // Revenue by contract
      prisma.invoice.groupBy({
        by: ['contractId'],
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, contractId: { not: null } },
        _sum: { total: true, paidAmount: true },
      }),
      // Expenses by contract
      prisma.expense.groupBy({
        by: ['contractId'],
        where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] }, contractId: { not: null } },
        _sum: { amount: true },
      }),
      // Active contracts
      prisma.contract.findMany({
        where: { status: 'ACTIVE' },
        take: 200,
        orderBy: { id: 'desc' },
        select: {
          id: true, code: true, asphaltPlant: true, startDate: true,
          customer: { select: { id: true, name: true } },
        },
      }),
      // Total contracts count
      prisma.contract.count(),
      // Customers who had payments in last 90 days
      prisma.payment.findMany({
        where: { date: { gte: ninetyDaysAgo }, invoice: { direction: 'SALES' } },
        take: 500,
        distinct: ['invoiceId'],
        select: { invoice: { select: { customerId: true } } },
      }),
      // Contracts with invoice activity in last 90 days
      prisma.invoice.findMany({
        where: { direction: 'SALES', issueDate: { gte: ninetyDaysAgo }, contractId: { not: null } },
        take: 500,
        distinct: ['contractId'],
        select: { contractId: true },
      }),
      // Top expense contracts (for decision card)
      prisma.expense.groupBy({
        by: ['contractId'],
        where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] }, contractId: { not: null } },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 5,
      }),
      // Contract status breakdown
      prisma.contract.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);

    // ── Compute base values ────────────────────────────────────────────────
    const totalRevenue    = r3(n(totalRevenueAgg._sum.total));
    const totalExpenses   = r3(n(totalExpensesAgg._sum.amount));
    const totalCollected  = r3(n(totalCollectionsAgg._sum.amount));
    const totalOutstanding = r3(Math.max(0, totalRevenue - totalCollected));
    const netProfit       = r3(totalRevenue - totalExpenses);
    const overallProfitMargin = safe(netProfit, totalRevenue);
    const overallCollectionRate = safe(totalCollected, totalRevenue);

    const thisMonthCol = r3(n(thisMonthColAgg._sum.amount));
    const lastMonthCol = r3(n(lastMonthColAgg._sum.amount));
    const thisMonthExp = r3(n(thisMonthExpAgg._sum.amount));
    const lastMonthExp = r3(n(lastMonthExpAgg._sum.amount));
    const thisMonthRev = r3(n(thisMonthRevAgg._sum.total));
    const lastMonthRev = r3(n(lastMonthRevAgg._sum.total));
    const thisMonthProfit = r3(thisMonthRev - thisMonthExp);
    const lastMonthProfit = r3(lastMonthRev - lastMonthExp);

    // ── Build maps ─────────────────────────────────────────────────────────
    const invMap = new Map(invByContract.map(r => [r.contractId as number, { total: n(r._sum.total), paid: n(r._sum.paidAmount) }]));
    const expMap = new Map(expByContract.map(r => [r.contractId as number, n(r._sum.amount)]));
    const recentActivitySet = new Set(recentInvoiceActivity.map(r => r.contractId as number));
    const recentPayerSet = new Set(
      customersWithPayments
        .map(p => p.invoice?.customerId)
        .filter((id): id is number => id != null),
    );

    // Contract profitability per contract
    const contractStats = activeContracts.map(c => {
      const inv = invMap.get(c.id) ?? { total: 0, paid: 0 };
      const exp = expMap.get(c.id) ?? 0;
      const revenue     = r3(inv.total);
      const collected   = r3(inv.paid);
      const expenses    = r3(exp);
      const outstanding = r3(Math.max(0, revenue - collected));
      const profit      = r3(revenue - expenses);
      const isNew = c.startDate !== null && c.startDate > thirtyDaysAgo;
      return {
        id: c.id, code: c.code, asphaltPlant: c.asphaltPlant,
        customerName: c.customer?.name ?? '—',
        customerId: c.customer?.id,
        revenue, collected, expenses, outstanding, profit,
        profitMargin:   safe(profit, revenue),
        collectionRate: safe(collected, revenue),
        hasRecentActivity: recentActivitySet.has(c.id),
        isNew,
      };
    });

    // Debtor map (outstanding by customer)
    const debtorMap = new Map<number, { name: string; outstanding: number; oldestDays: number; lastPaymentDays: number | null }>();
    for (const inv of outstandingInvoices) {
      if (!inv.customerId || !inv.customer) continue;
      const os = Math.max(0, n(inv.total) - n(inv.paidAmount));
      if (os <= 0) continue;
      const days = Math.floor((now.getTime() - new Date(inv.issueDate).getTime()) / 86_400_000);
      const e = debtorMap.get(inv.customerId) ?? { name: inv.customer.name, outstanding: 0, oldestDays: 0, lastPaymentDays: null };
      e.outstanding = r3(e.outstanding + os);
      if (days > e.oldestDays) e.oldestDays = days;
      if (!recentPayerSet.has(inv.customerId)) e.lastPaymentDays = Math.max(e.lastPaymentDays ?? 0, days);
      debtorMap.set(inv.customerId, e);
    }
    const debtorList = [...debtorMap.entries()]
      .map(([id, d]) => ({ customerId: id, ...d }))
      .sort((a, b) => b.outstanding - a.outstanding);

    // ── Part 2: Decision Cards ─────────────────────────────────────────────
    const cards: DecisionCard[] = [];

    // 1. Highest outstanding customer
    const topDebtor = debtorList[0];
    if (topDebtor) {
      cards.push({
        id: 'dc-highest-outstanding',
        title: 'أعلى ذمة مستحقة',
        value: formatCurrency(topDebtor.outstanding),
        explanation: `${topDebtor.name} لديه أعلى رصيد مستحق (${topDebtor.oldestDays} يوم منذ أقدم فاتورة)`,
        priority: topDebtor.outstanding > 5000 ? 'HIGH' : 'MEDIUM',
        recommendedAction: 'إرسال كشف حساب محدث والتواصل المباشر لترتيب جدول السداد',
        relatedId: topDebtor.customerId, relatedType: 'CUSTOMER', amount: topDebtor.outstanding,
      });
    }

    // 2. Largest profit contract
    const largestProfit = [...contractStats].filter(c => c.revenue > 0).sort((a, b) => b.profit - a.profit)[0];
    if (largestProfit) {
      cards.push({
        id: 'dc-largest-profit',
        title: 'أعلى ربحية عقد',
        value: formatCurrency(largestProfit.profit),
        explanation: `العقد ${largestProfit.code} (${largestProfit.asphaltPlant}) — هامش ربح ${formatPercent(largestProfit.profitMargin ?? 0, 1)}`,
        priority: 'LOW',
        recommendedAction: 'دراسة نموذج هذا العقد وتطبيقه على العقود المستقبلية',
        relatedId: largestProfit.id, relatedType: 'CONTRACT', amount: largestProfit.profit,
      });
    }

    // 3. Largest loss contract
    const largestLoss = [...contractStats].filter(c => c.revenue > 0 && c.profit < 0).sort((a, b) => a.profit - b.profit)[0];
    if (largestLoss) {
      cards.push({
        id: 'dc-largest-loss',
        title: 'أكبر عقد خاسر',
        value: `${formatCurrency(Math.abs(largestLoss.profit))} خسارة`,
        explanation: `العقد ${largestLoss.code} (${largestLoss.asphaltPlant}) — هامش ربح ${formatPercent(largestLoss.profitMargin ?? 0, 1)}`,
        priority: 'HIGH',
        recommendedAction: 'مراجعة عاجلة لبنود مصروفات العقد ومقارنتها بالإيرادات',
        relatedId: largestLoss.id, relatedType: 'CONTRACT', amount: Math.abs(largestLoss.profit),
      });
    }

    // 4. Contracts requiring invoicing (no activity > 90 days, not new)
    const needsInvoicing = contractStats.filter(c => !c.hasRecentActivity && !c.isNew && c.revenue > 0);
    if (needsInvoicing.length > 0) {
      cards.push({
        id: 'dc-needs-invoicing',
        title: 'عقود تحتاج فوترة',
        value: `${needsInvoicing.length} عقود`,
        explanation: `عقود نشطة لم تُصدر لها فواتير منذ أكثر من 90 يوم`,
        priority: needsInvoicing.length > 3 ? 'HIGH' : 'MEDIUM',
        recommendedAction: 'مراجعة أوضاع هذه العقود وإصدار الفواتير المستحقة',
      });
    }

    // 5. Contracts with weak collections (< 40%)
    const weakCollections = contractStats.filter(c => c.revenue > 0 && (c.collectionRate ?? 100) < 40);
    if (weakCollections.length > 0) {
      const totalWeakOS = r3(weakCollections.reduce((s, c) => s + c.outstanding, 0));
      cards.push({
        id: 'dc-weak-collections',
        title: 'تحصيل ضعيف',
        value: `${formatCurrency(totalWeakOS)} معلّق`,
        explanation: `${weakCollections.length} عقود بنسبة تحصيل أقل من 40%`,
        priority: 'HIGH',
        recommendedAction: 'متابعة مكثفة لتحصيل الذمم ومراجعة إجراءات الدفع مع العملاء',
        amount: totalWeakOS,
      });
    }

    // 6. Projects with highest expenses
    const topExpContract = topExpenseContracts[0];
    const topExpContractInfo = topExpContract
      ? activeContracts.find(c => c.id === topExpContract.contractId)
      : null;
    if (topExpContract && topExpContractInfo) {
      const expAmt = n(topExpContract._sum.amount);
      cards.push({
        id: 'dc-top-expense-project',
        title: 'أعلى مصروفات عقد',
        value: formatCurrency(r3(expAmt)),
        explanation: `العقد ${topExpContractInfo.code} (${topExpContractInfo.asphaltPlant}) يمثل أعلى مصروفات في النظام`,
        priority: 'MEDIUM',
        recommendedAction: 'مراجعة تفاصيل المصروفات ومدى توافقها مع الميزانية التقديرية',
        relatedId: topExpContractInfo.id, relatedType: 'CONTRACT', amount: r3(expAmt),
      });
    }

    // 7. Customers with no recent payments (outstanding + no payment in 90 days)
    const noRecentPay = debtorList.filter(d => !recentPayerSet.has(d.customerId) && d.outstanding > 0);
    if (noRecentPay.length > 0) {
      cards.push({
        id: 'dc-no-recent-payment',
        title: 'عملاء بدون مدفوعات حديثة',
        value: `${noRecentPay.length} عملاء`,
        explanation: `عملاء لديهم ذمم مستحقة ولم يسددوا شيئاً خلال 90 يوم`,
        priority: noRecentPay.length > 5 ? 'HIGH' : 'MEDIUM',
        recommendedAction: 'التواصل الفوري مع هؤلاء العملاء وترتيب خطط سداد',
      });
    }

    // 8. Top revenue generators
    const revByCustomer = new Map<number, { name: string; revenue: number }>();
    for (const inv of outstandingInvoices) {
      // This is from outstanding invoices — build revenue from contract stats instead
    }
    // Use contract stats to compute per-customer revenue
    const customerRevMap = new Map<number, { name: string; revenue: number; collected: number }>();
    for (const c of contractStats) {
      if (!c.customerId) continue;
      const e = customerRevMap.get(c.customerId) ?? { name: c.customerName, revenue: 0, collected: 0 };
      e.revenue = r3(e.revenue + c.revenue);
      e.collected = r3(e.collected + c.collected);
      customerRevMap.set(c.customerId, e);
    }
    const topRevGenerator = [...customerRevMap.entries()]
      .map(([id, d]) => ({ customerId: id, ...d }))
      .sort((a, b) => b.revenue - a.revenue)[0];
    if (topRevGenerator) {
      const topRevCollectionRate = safe(topRevGenerator.collected, topRevGenerator.revenue);
      cards.push({
        id: 'dc-top-revenue',
        title: 'أعلى مولّد إيرادات',
        value: formatCurrency(topRevGenerator.revenue),
        explanation: `${topRevGenerator.name} — أعلى إجمالي إيرادات، تحصيل ${topRevCollectionRate != null ? formatPercent(topRevCollectionRate, 1) : '—%'}`,
        priority: 'LOW',
        recommendedAction: 'الحفاظ على هذه العلاقة وتطوير التعاون',
        relatedId: topRevGenerator.customerId, relatedType: 'CUSTOMER', amount: topRevGenerator.revenue,
      });
    }

    // ── Part 3: Alerts V3 ──────────────────────────────────────────────────
    const alerts: ExecutiveAlertV3[] = [];
    const alertIds = new Set<string>();
    const addAlert = (a: ExecutiveAlertV3) => {
      if (!alertIds.has(a.id)) { alertIds.add(a.id); alerts.push(a); }
    };

    // Cash flow warning: collections < expenses this month
    if (thisMonthExp > 0 && thisMonthCol < thisMonthExp) {
      addAlert({
        id: 'v3-cashflow-warning',
        severity: thisMonthExp > thisMonthCol * 2 ? 'HIGH' : 'MEDIUM',
        type: 'CASH_FLOW_WARNING',
        title: 'تحذير تدفق نقدي',
        description: `التحصيلات هذا الشهر (${formatCurrency(thisMonthCol)}) أقل من المصروفات (${formatCurrency(thisMonthExp)})`,
        amount: r3(thisMonthExp - thisMonthCol),
        actionLabel: 'تسريع التحصيل',
      });
    }

    // Collection deterioration: this month < last month by > 20%
    if (lastMonthCol > 0 && thisMonthCol < lastMonthCol * 0.8) {
      const drop = safe(lastMonthCol - thisMonthCol, lastMonthCol);
      addAlert({
        id: 'v3-col-deterioration',
        severity: thisMonthCol < lastMonthCol * 0.5 ? 'HIGH' : 'MEDIUM',
        type: 'COLLECTION_DETERIORATION',
        title: 'تراجع التحصيلات',
        description: `انخفاض التحصيل بنسبة ${drop != null ? formatPercent(drop, 1) : '—%'} مقارنة بالشهر الماضي`,
        amount: r3(lastMonthCol - thisMonthCol),
        actionLabel: 'مراجعة ملفات التحصيل',
      });
    }

    // Expense spike: this month > last month by > 25%
    if (lastMonthExp > 0 && thisMonthExp > lastMonthExp * 1.25) {
      const rise = safe(thisMonthExp - lastMonthExp, lastMonthExp);
      addAlert({
        id: 'v3-expense-spike',
        severity: thisMonthExp > lastMonthExp * 1.5 ? 'HIGH' : 'MEDIUM',
        type: 'EXPENSE_SPIKE',
        title: 'ارتفاع غير مألوف في المصروفات',
        description: `المصروفات هذا الشهر أعلى بنسبة ${rise != null ? formatPercent(rise, 1) : '—%'} من الشهر الماضي`,
        amount: r3(thisMonthExp - lastMonthExp),
        actionLabel: 'مراجعة المصروفات',
      });
    }

    // Profitability decline: this month profit < last month by > 25%
    if (lastMonthProfit > 0 && thisMonthProfit < lastMonthProfit * 0.75) {
      const drop = safe(lastMonthProfit - thisMonthProfit, lastMonthProfit);
      addAlert({
        id: 'v3-profit-decline',
        severity: thisMonthProfit < 0 ? 'HIGH' : 'MEDIUM',
        type: 'PROFITABILITY_DECLINE',
        title: 'تراجع الربحية',
        description: `صافي الربح هذا الشهر انخفض بنسبة ${drop != null ? formatPercent(drop, 1) : '—%'}`,
        amount: r3(lastMonthProfit - thisMonthProfit),
        actionLabel: 'تحليل أسباب الانخفاض',
      });
    }

    // High receivables: outstanding > 50% of total revenue
    if (totalRevenue > 0 && totalOutstanding > totalRevenue * 0.5) {
      addAlert({
        id: 'v3-high-receivables',
        severity: totalOutstanding > totalRevenue * 0.7 ? 'HIGH' : 'MEDIUM',
        type: 'HIGH_RECEIVABLES',
        title: 'ذمم مرتفعة',
        description: `إجمالي الذمم المستحقة ${formatPercent((totalOutstanding / totalRevenue) * 100, 1)} من الإيرادات الكلية`,
        amount: totalOutstanding,
        actionLabel: 'مراجعة خطة التحصيل الشاملة',
      });
    }

    // Loss-making contracts
    const lossMakers = contractStats.filter(c => c.revenue > 0 && c.profit < -500).sort((a, b) => a.profit - b.profit).slice(0, 3);
    for (const c of lossMakers) {
      addAlert({
        id: `v3-loss-contract-${c.id}`,
        severity: 'HIGH',
        type: 'LOSS_MAKING_CONTRACT',
        title: `عقد خاسر: ${c.code}`,
        description: `${c.asphaltPlant} — خسارة ${formatCurrency(Math.abs(c.profit))}`,
        amount: Math.abs(c.profit),
        relatedId: c.id, relatedType: 'CONTRACT',
        actionLabel: 'مراجعة المصروفات',
      });
    }

    // Inactive contracts (no invoice in 90 days, not new, has past revenue)
    const inactiveContracts = contractStats.filter(c => !c.hasRecentActivity && !c.isNew && c.revenue > 0).slice(0, 3);
    for (const c of inactiveContracts) {
      addAlert({
        id: `v3-inactive-${c.id}`,
        severity: 'LOW',
        type: 'INACTIVE_CONTRACT',
        title: `عقد غير نشط: ${c.code}`,
        description: `لا فواتير منذ أكثر من 90 يوم — ${c.asphaltPlant}`,
        amount: null,
        relatedId: c.id, relatedType: 'CONTRACT',
        actionLabel: 'مراجعة وضع العقد',
      });
    }

    // Overdue customers (outstanding + oldest invoice > 90 days)
    const overdueDebtors = debtorList.filter(d => d.oldestDays > 90).slice(0, 3);
    for (const d of overdueDebtors) {
      addAlert({
        id: `v3-overdue-cust-${d.customerId}`,
        severity: d.oldestDays > 180 ? 'HIGH' : 'MEDIUM',
        type: 'OVERDUE_CUSTOMER',
        title: `ذمة متأخرة: ${d.name}`,
        description: `مستحق منذ ${d.oldestDays} يوم — ${formatCurrency(d.outstanding)}`,
        amount: d.outstanding,
        relatedId: d.customerId, relatedType: 'CUSTOMER',
        actionLabel: 'متابعة التحصيل',
      });
    }

    // Missing invoice activity
    const missingActivity = contractStats.filter(c => !c.hasRecentActivity && !c.isNew).slice(0, 3);
    for (const c of missingActivity) {
      const alreadyAdded = alertIds.has(`v3-inactive-${c.id}`);
      if (!alreadyAdded) {
        addAlert({
          id: `v3-no-invoice-${c.id}`,
          severity: 'LOW',
          type: 'MISSING_INVOICE_ACTIVITY',
          title: `لا نشاط فوترة: ${c.code}`,
          description: `عقد نشط بدون فواتير منذ أكثر من 90 يوم`,
          amount: null,
          relatedId: c.id, relatedType: 'CONTRACT',
          actionLabel: 'مراجعة العقد',
        });
      }
    }

    // Sort: HIGH first, then MEDIUM, then LOW
    const sevOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    alerts.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

    // ── Part 5: Company Health Score ───────────────────────────────────────
    const healthScore = this._computeHealthScore({
      totalRevenue, totalCollected, totalOutstanding, totalExpenses,
      thisMonthCol, thisMonthExp,
      lastMonthCol, lastMonthExp,
      contractStats,
      activeCount: activeContracts.length,
      totalCount: totalContracts,
      contractGroupCounts,
    });

    // ── Part 1: Executive Financial Summary ────────────────────────────────
    const topDebtors = debtorList.slice(0, 5);
    const topCustomersByRevenue = [...customerRevMap.entries()]
      .map(([id, d]) => ({ customerId: id, ...d }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    const topContractsByProfit = [...contractStats]
      .filter(c => c.revenue > 0)
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)
      .map(c => ({
        id: c.id, code: c.code, asphaltPlant: c.asphaltPlant,
        revenue: c.revenue, expenses: c.expenses, profit: c.profit,
        profitMargin: c.profitMargin, collectionRate: c.collectionRate,
      }));

    const financialSummary = {
      totalRevenue, totalExpenses, netProfit, totalCollected, totalOutstanding,
      overallProfitMargin, overallCollectionRate,
      thisMonth: {
        revenue: thisMonthRev, expenses: thisMonthExp,
        collections: thisMonthCol, profit: thisMonthProfit,
      },
      lastMonth: {
        revenue: lastMonthRev, expenses: lastMonthExp,
        collections: lastMonthCol, profit: lastMonthProfit,
      },
      monthOnMonthChanges: {
        revenue:     safe(thisMonthRev - lastMonthRev, lastMonthRev),
        expenses:    safe(thisMonthExp - lastMonthExp, lastMonthExp),
        collections: safe(thisMonthCol - lastMonthCol, lastMonthCol),
        profit:      lastMonthProfit !== 0 ? safe(thisMonthProfit - lastMonthProfit, Math.abs(lastMonthProfit)) : null,
      },
      topDebtors,
      topCustomersByRevenue,
      topContractsByProfit,
      activeContracts: activeContracts.length,
      totalContracts,
    };

    // ── Part 6: Recommendations V2 ─────────────────────────────────────────
    const recommendations = this._buildRecommendations({
      alerts, contractStats, debtorList,
      thisMonthCol, lastMonthCol, thisMonthExp, lastMonthExp,
      totalOutstanding, totalRevenue,
    });

    return { financialSummary, decisionCards: cards, alertsV3: alerts, healthScore, recommendations };
  }

  /** Company-level health score (0–100) */
  private _computeHealthScore(data: {
    totalRevenue: number; totalCollected: number; totalOutstanding: number; totalExpenses: number;
    thisMonthCol: number; thisMonthExp: number; lastMonthCol: number; lastMonthExp: number;
    contractStats: { revenue: number; profit: number; profitMargin: number | null; collectionRate: number | null }[];
    activeCount: number; totalCount: number;
    contractGroupCounts: { status: string; _count: { _all: number } }[];
  }): HealthScore {
    const { totalRevenue, totalCollected, totalOutstanding, totalExpenses,
      thisMonthCol, thisMonthExp, lastMonthCol, lastMonthExp,
      contractStats, activeCount, totalCount, contractGroupCounts } = data;

    // 1. Collections score (0–20)
    const colRate = totalRevenue > 0 ? (totalCollected / totalRevenue) : 1;
    let colScore = 0;
    if      (colRate >= 0.90) colScore = 20;
    else if (colRate >= 0.75) colScore = 16;
    else if (colRate >= 0.60) colScore = 12;
    else if (colRate >= 0.40) colScore = 7;
    else                      colScore = 2;

    // 2. Profitability score (0–20)
    const profitMargin = totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue) : 0;
    let profScore = 0;
    if      (profitMargin >= 0.30) profScore = 20;
    else if (profitMargin >= 0.20) profScore = 16;
    else if (profitMargin >= 0.10) profScore = 12;
    else if (profitMargin >= 0)    profScore = 7;
    else                           profScore = 0;

    // 3. Outstanding score (0–20): lower outstanding ratio is better
    const osRatio = totalRevenue > 0 ? (totalOutstanding / totalRevenue) : 0;
    let osScore = 0;
    if      (osRatio <= 0.10) osScore = 20;
    else if (osRatio <= 0.25) osScore = 16;
    else if (osRatio <= 0.40) osScore = 12;
    else if (osRatio <= 0.60) osScore = 7;
    else                      osScore = 2;

    // 4. Cash flow score (0–20): this month collections vs expenses
    let cfScore = 10; // neutral default
    if (thisMonthExp > 0) {
      const cfRatio = thisMonthCol / thisMonthExp;
      if      (cfRatio >= 1.5)  cfScore = 20;
      else if (cfRatio >= 1.0)  cfScore = 16;
      else if (cfRatio >= 0.75) cfScore = 10;
      else if (cfRatio >= 0.50) cfScore = 5;
      else                      cfScore = 0;
    } else if (thisMonthCol > 0) {
      cfScore = 20;
    }

    // 5. Contracts score (0–10)
    const riskCount = contractStats.filter(c => c.revenue > 0 && c.profit < 0).length;
    const contractsWithRevenue = contractStats.filter(c => c.revenue > 0).length;
    const riskRatio = contractsWithRevenue > 0 ? (riskCount / contractsWithRevenue) : 0;
    let contScore = 0;
    if      (riskRatio <= 0.05) contScore = 10;
    else if (riskRatio <= 0.15) contScore = 7;
    else if (riskRatio <= 0.30) contScore = 4;
    else                        contScore = 1;

    // 6. Stability score (0–10): month-on-month collection trend
    let stabScore = 5; // neutral
    if (lastMonthCol > 0) {
      const colChange = (thisMonthCol - lastMonthCol) / lastMonthCol;
      if      (colChange >= 0.1)  stabScore = 10;
      else if (colChange >= 0)    stabScore = 7;
      else if (colChange >= -0.1) stabScore = 5;
      else if (colChange >= -0.2) stabScore = 3;
      else                        stabScore = 1;
    }
    if (lastMonthExp > 0) {
      const expChange = (thisMonthExp - lastMonthExp) / lastMonthExp;
      if (expChange > 0.5) stabScore = Math.max(0, stabScore - 3);
      else if (expChange > 0.25) stabScore = Math.max(0, stabScore - 1);
    }

    const total = Math.min(100, Math.max(0, colScore + profScore + osScore + cfScore + contScore + stabScore));

    let label: HealthScore['label'];
    let labelAr: string;
    let explanation: string;
    if      (total >= 80) { label = 'EXCELLENT'; labelAr = 'ممتاز';  explanation = 'الشركة في وضع مالي ممتاز مع تدفق نقدي قوي وربحية عالية.'; }
    else if (total >= 65) { label = 'GOOD';      labelAr = 'جيد';    explanation = 'أداء مالي جيد مع مجال لتحسين التحصيل أو الربحية.'; }
    else if (total >= 50) { label = 'WATCH';     labelAr = 'مراقبة'; explanation = 'بعض المؤشرات تستوجب الانتباه — يُنصح بمراجعة التحصيلات والمصروفات.'; }
    else                  { label = 'RISK';       labelAr = 'خطر';    explanation = 'مؤشرات مالية تحتاج إلى تدخل فوري لتحسين الوضع.'; }

    return {
      total,
      label, labelAr, explanation,
      components: {
        collections:  colScore,
        profitability: profScore,
        outstanding:  osScore,
        cashFlow:     cfScore,
        contracts:    contScore,
        stability:    stabScore,
      },
    };
  }

  /** Rule-based recommendations (max 10) */
  private _buildRecommendations(data: {
    alerts: ExecutiveAlertV3[];
    contractStats: { id: number; code: string; asphaltPlant: string; revenue: number; profit: number; profitMargin: number | null; collectionRate: number | null; outstanding: number; hasRecentActivity: boolean; isNew: boolean }[];
    debtorList: { customerId: number; name: string; outstanding: number; oldestDays: number }[];
    thisMonthCol: number; lastMonthCol: number; thisMonthExp: number; lastMonthExp: number;
    totalOutstanding: number; totalRevenue: number;
  }): ExecutiveRecommendationV2[] {
    const { alerts, contractStats, debtorList, thisMonthCol, lastMonthCol,
      thisMonthExp, lastMonthExp, totalOutstanding, totalRevenue } = data;
    const recs: ExecutiveRecommendationV2[] = [];

    // 1. Collection efforts (HIGH if deterioration alert present or overdue customers)
    const hasColDrop = alerts.some(a => a.type === 'COLLECTION_DETERIORATION');
    const overdueCount = debtorList.filter(d => d.oldestDays > 90).length;
    if (hasColDrop || overdueCount > 0) {
      recs.push({
        id: 'rec-v2-increase-collection',
        priority: hasColDrop ? 'HIGH' : 'MEDIUM',
        title: 'تكثيف جهود التحصيل',
        reason: hasColDrop
          ? `التحصيل هذا الشهر انخفض بمقدار ${formatCurrency(r3(lastMonthCol - thisMonthCol))}`
          : `${overdueCount} عملاء لديهم ذمم متأخرة أكثر من 90 يوم`,
        expectedImpact: `تحسين التدفق النقدي وتقليل الذمم المتراكمة`,
        suggestedAction: 'مراجعة قائمة العملاء المتأخرين يومياً وتعيين مسؤول متابعة مخصص',
        metric: `${overdueCount} عملاء متأخرون`,
      });
    }

    // 2. Review project pricing (if multiple loss contracts)
    const lossMakers = contractStats.filter(c => c.revenue > 0 && c.profit < 0);
    if (lossMakers.length >= 2) {
      recs.push({
        id: 'rec-v2-review-pricing',
        priority: 'HIGH',
        title: 'مراجعة تسعير المشاريع',
        reason: `${lossMakers.length} عقود تحقق خسائر — قد يشير إلى مشكلة في التسعير`,
        expectedImpact: 'تحسين هوامش الربح وتحديد العقود غير المجدية',
        suggestedAction: 'مقارنة أسعار العقود الخاسرة بالتكاليف الفعلية وإعادة التفاوض عند التجديد',
        metric: `${lossMakers.length} عقود خاسرة`,
      });
    }

    // 3. Investigate declining margins
    const hasProfitDecline = alerts.some(a => a.type === 'PROFITABILITY_DECLINE');
    if (hasProfitDecline) {
      recs.push({
        id: 'rec-v2-declining-margins',
        priority: 'HIGH',
        title: 'التحقيق في تراجع الهوامش',
        reason: 'صافي الربح هذا الشهر انخفض بشكل ملحوظ مقارنة بالشهر الماضي',
        expectedImpact: 'تشخيص أسباب التراجع واتخاذ إجراءات تصحيحية سريعة',
        suggestedAction: 'مراجعة بنود المصروفات والمقارنة مع الفترة الماضية لتحديد العناصر المسببة',
      });
    }

    // 4. Issue invoices for completed work
    const needsInvoicingCount = contractStats.filter(c => !c.hasRecentActivity && !c.isNew && c.revenue > 0).length;
    if (needsInvoicingCount > 0) {
      recs.push({
        id: 'rec-v2-issue-invoices',
        priority: needsInvoicingCount > 3 ? 'HIGH' : 'MEDIUM',
        title: 'إصدار فواتير للأعمال المنجزة',
        reason: `${needsInvoicingCount} عقود نشطة بدون فواتير منذ أكثر من 90 يوم`,
        expectedImpact: 'تسريع دورة الإيرادات وتحسين السيولة',
        suggestedAction: 'التحقق من مستوى الأعمال في هذه العقود وإصدار الفواتير المستحقة فوراً',
        metric: `${needsInvoicingCount} عقود بحاجة للمتابعة`,
      });
    }

    // 5. Follow up overdue customers
    const overdueAbove180 = debtorList.filter(d => d.oldestDays > 180);
    if (overdueAbove180.length > 0) {
      recs.push({
        id: 'rec-v2-followup-overdue',
        priority: 'HIGH',
        title: 'متابعة العملاء المتعثرين',
        reason: `${overdueAbove180.length} عملاء لديهم ذمم أكثر من 180 يوم`,
        expectedImpact: 'استرداد الديون المتعثرة وتجنب الشطب',
        suggestedAction: 'التواصل الرسمي مع العملاء المتعثرين وتقييم اللجوء للإجراءات القانونية عند الاقتضاء',
        metric: `${formatCurrency(r3(overdueAbove180.reduce((s, d) => s + d.outstanding, 0)))} متعثرة`,
      });
    }

    // 6. Reduce abnormal expenses
    const hasExpSpike = alerts.some(a => a.type === 'EXPENSE_SPIKE');
    if (hasExpSpike) {
      recs.push({
        id: 'rec-v2-reduce-expenses',
        priority: 'MEDIUM',
        title: 'ضبط المصروفات غير الاعتيادية',
        reason: `المصروفات هذا الشهر أعلى بنسبة ملحوظة من الشهر الماضي`,
        expectedImpact: 'تحسين صافي الربح وإعادة التوازن للتدفق النقدي',
        suggestedAction: 'مراجعة مصروفات الشهر الحالي بالتفصيل وتحديد البنود غير الضرورية',
        metric: `${formatCurrency(r3(thisMonthExp - lastMonthExp))} زيادة`,
      });
    }

    // 7. High receivables action
    if (totalRevenue > 0 && totalOutstanding > totalRevenue * 0.5) {
      recs.push({
        id: 'rec-v2-high-receivables',
        priority: 'HIGH',
        title: 'خطة تحصيل شاملة',
        reason: `الذمم المستحقة تمثل ${formatPercent((totalOutstanding / totalRevenue) * 100, 1)} من إجمالي الإيرادات`,
        expectedImpact: 'تحسين جوهري في السيولة وتقليل مخاطر التعثر',
        suggestedAction: 'وضع خطة تحصيل شاملة مع جدول زمني محدد لكل عميل',
        metric: `${formatCurrency(totalOutstanding)} ذمم`,
      });
    }

    // 8. Weak collection contracts
    const weakCol = contractStats.filter(c => c.revenue > 0 && (c.collectionRate ?? 100) < 40);
    if (weakCol.length > 0) {
      recs.push({
        id: 'rec-v2-weak-collection-contracts',
        priority: 'MEDIUM',
        title: 'تحسين تحصيل عقود ضعيفة',
        reason: `${weakCol.length} عقود بنسبة تحصيل أقل من 40%`,
        expectedImpact: 'تحسين معدل التحصيل الإجمالي للشركة',
        suggestedAction: 'تخصيص فريق متابعة لهذه العقود ووضع اشتراطات دفع واضحة في العقود الجديدة',
        metric: `${weakCol.length} عقود بتحصيل ضعيف`,
      });
    }

    // 9. Cash flow warning action
    const hasCFWarning = alerts.some(a => a.type === 'CASH_FLOW_WARNING');
    if (hasCFWarning) {
      recs.push({
        id: 'rec-v2-cashflow-action',
        priority: 'HIGH',
        title: 'تحسين التدفق النقدي',
        reason: 'المصروفات الشهرية تتجاوز التحصيلات',
        expectedImpact: 'تجنب أزمة سيولة واستمرارية العمليات',
        suggestedAction: 'تسريع تحصيل الذمم وتأجيل المصروفات غير الضرورية حتى تتحسن السيولة',
      });
    }

    // 10. Healthy contracts — recognize and expand
    const healthyContracts = contractStats.filter(c => c.revenue > 0 && (c.profitMargin ?? 0) > 25 && (c.collectionRate ?? 0) > 80);
    if (healthyContracts.length > 0) {
      recs.push({
        id: 'rec-v2-expand-healthy',
        priority: 'LOW',
        title: 'توسيع العقود المربحة',
        reason: `${healthyContracts.length} عقود تحقق هامش ربح ممتاز (>25%) وتحصيل عالٍ (>80%)`,
        expectedImpact: 'زيادة الإيرادات مع الحفاظ على الربحية العالية',
        suggestedAction: 'دراسة إمكانية زيادة حجم العمل في هذه العقود أو تجديدها بشروط مماثلة',
        metric: `${healthyContracts.length} عقود عالية الأداء`,
      });
    }

    return recs.slice(0, 10);
  }

  /**
   * KPI Timeline — Part 4.
   * period: '1m' | '3m' | '6m' | '12m'
   * Returns monthly aggregations.
   */
  async kpiTimeline(period: '1m' | '3m' | '6m' | '12m') {
    const now = new Date();
    const monthCount = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[period];

    const months = Array.from({ length: monthCount }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1 - i), 1);
      return {
        label: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        start: d,
        end: new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999),
      };
    });

    const timeline: KPITimelinePoint[] = await Promise.all(
      months.map(async (m) => {
        const [revAgg, expAgg, colAgg, contractCount, customerCount, invoiceCount] = await Promise.all([
          prisma.invoice.aggregate({
            where: { direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { gte: m.start, lte: m.end } },
            _sum: { total: true },
          }),
          prisma.expense.aggregate({
            where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] }, date: { gte: m.start, lte: m.end } },
            _sum: { amount: true },
          }),
          prisma.payment.aggregate({
            where: { date: { gte: m.start, lte: m.end }, invoice: { direction: 'SALES' } },
            _sum: { amount: true },
          }),
          prisma.contract.count({ where: { status: 'ACTIVE' } }),
          prisma.customer.count({ where: { isArchived: false } }),
          prisma.invoice.count({ where: { direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { gte: m.start, lte: m.end } } }),
        ]);

        const revenue    = r3(n(revAgg._sum.total));
        const expenses   = r3(n(expAgg._sum.amount));
        const collections = r3(n(colAgg._sum.amount));

        // Outstanding at end of period: cumulative outstanding up to m.end
        const osAgg = await prisma.invoice.aggregate({
          where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] }, issueDate: { lte: m.end } },
          _sum: { total: true, paidAmount: true },
        });
        const osEnd = r3(Math.max(0, n(osAgg._sum.total) - n(osAgg._sum.paidAmount)));

        return {
          period: m.label,
          revenue, expenses, collections,
          profit: r3(revenue - expenses),
          outstandingEnd: osEnd,
          contracts: contractCount,
          customers: customerCount,
          invoices: invoiceCount,
        };
      }),
    );

    return timeline;
  }
}

export const executiveService = new ExecutiveService();

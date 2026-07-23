import { prisma } from '@config/database';
import { roundMoney } from '@shared/utils/money';
import { EXPENSE_OPERATIONAL_STATUS, SALES_INVOICE_ACTIVE } from '@shared/services/operational.reporting';

const n  = (v: unknown) => Number(v ?? 0);
const safe = (num: number, den: number): number | null =>
  den > 0 ? roundMoney((num / den) * 100) : null;

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
    // التعريفات التشغيلية الوحيدة (المصدر: محرك التقارير التشغيلية):
    //   الإيراد = Σ Invoice.total على فواتير المبيعات الفعّالة (SALES_INVOICE_ACTIVE).
    //   التحصيل = Σ Payment على تلك الفواتير — لا لقطة paidAmount المخزَّنة.
    //   المصروف = Expense المعتمدة فقط (EXPENSE_OPERATIONAL_STATUS).
    // التحصيل حسب العقد يُجمَّع في الذاكرة لأن Prisma لا يدعم groupBy على حقل علاقة
    // (`payment.invoice.contractId`)؛ الفلتر نفسه هو فلتر المحرك حرفيًا.
    const [contracts, invGroups, payments, expGroups] = await Promise.all([
      prisma.contract.findMany({
        select: {
          id: true, code: true, asphaltPlant: true,
          customer: { select: { name: true } },
        },
        orderBy: { id: 'desc' },
      }),
      prisma.invoice.groupBy({
        by: ['contractId'],
        where: { ...SALES_INVOICE_ACTIVE, contractId: { not: null } },
        _sum: { total: true },
      }),
      prisma.payment.findMany({
        where: { invoice: { ...SALES_INVOICE_ACTIVE, contractId: { not: null } } },
        select: { amount: true, invoice: { select: { contractId: true } } },
      }),
      prisma.expense.groupBy({
        by: ['contractId'],
        where: { status: EXPENSE_OPERATIONAL_STATUS, contractId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const colMap = new Map<number, number>();
    for (const p of payments) {
      const cid = p.invoice.contractId;
      if (cid == null) continue;
      colMap.set(cid, (colMap.get(cid) ?? 0) + n(p.amount));
    }
    const invMap = new Map(invGroups.map(g => [g.contractId!, n(g._sum.total)]));
    const expMap = new Map(expGroups.map(g => [g.contractId!, n(g._sum.amount)]));

    return contracts.map(c => {
      const inv  = { rev: invMap.get(c.id) ?? 0, col: roundMoney(colMap.get(c.id) ?? 0) };
      const exp  = expMap.get(c.id) ?? 0;
      const profit = roundMoney(inv.rev - exp);
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
      where: { status: EXPENSE_OPERATIONAL_STATUS },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const grandTotal = groups.reduce((acc, g) => acc + n(g._sum.amount), 0);

    return groups.map(g => ({
      category: g.category,
      total:    roundMoney(n(g._sum.amount)),
      count:    g._count._all,
      pct:      grandTotal > 0 ? roundMoney((n(g._sum.amount) / grandTotal) * 100) : 0,
    }));
  }

  async customerAnalytics(): Promise<CustomerAnalyticsRow[]> {
    // نفس التعريفات التشغيلية الوحيدة: الإيراد = Σ Invoice.total، التحصيل = Σ Payment
    // (لا لقطة paidAmount)، الذمم = الإيراد − التحصيل. التحصيل حسب العميل يُجمَّع في الذاكرة
    // (Prisma لا يدعم groupBy على `payment.invoice.customerId`).
    const [customers, invGroups, payments] = await Promise.all([
      prisma.customer.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.invoice.groupBy({
        by: ['customerId'],
        where: { ...SALES_INVOICE_ACTIVE, customerId: { not: null } },
        _sum: { total: true },
        _count: { _all: true },
      }),
      prisma.payment.findMany({
        where: { invoice: { ...SALES_INVOICE_ACTIVE, customerId: { not: null } } },
        select: { amount: true, invoice: { select: { customerId: true } } },
      }),
    ]);

    const colMap = new Map<number, number>();
    for (const p of payments) {
      const cid = p.invoice.customerId;
      if (cid == null) continue;
      colMap.set(cid, (colMap.get(cid) ?? 0) + n(p.amount));
    }
    const invMap = new Map(
      invGroups.map(g => [
        g.customerId!,
        { rev: n(g._sum.total), cnt: g._count._all },
      ]),
    );

    return customers
      .map(c => {
        const base = invMap.get(c.id) ?? { rev: 0, cnt: 0 };
        const inv = { rev: base.rev, col: roundMoney(colMap.get(c.id) ?? 0), cnt: base.cnt };
        const outstanding = roundMoney(inv.rev - inv.col);
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

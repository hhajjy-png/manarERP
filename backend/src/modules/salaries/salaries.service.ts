import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';
import { roundMoney, sumMoney } from '../../shared/utils/money';

// القائمة البيضاء للفرز (Enterprise Data Grid Foundation) — سجل صرف الرواتب.
// paymentDate الافتراضي نفسه اختياري → nulls آخرًا عند الفرز الصريح عليه.
const SALARIES_SORTABLE: SortWhitelist = {
  paymentDate: { field: 'paymentDate', nullable: true },
  sourceMonth: { field: 'sourceMonth', nullable: true },
  transactionId: 'transactionId',
  beneficiaryName: 'beneficiaryName',
  bankName: { field: 'bankName', nullable: true },
  amount: 'amount',
  civilId: { field: 'civilId', nullable: true },
  status: { field: 'status', nullable: true },
};
const SALARIES_DEFAULT_ORDER = [{ paymentDate: 'desc' as const }, { id: 'desc' as const }];

export class SalariesService {
  /** قائمة عمليات صرف الرواتب (مرقّمة + بحث/تصفية). */
  async list(query: PaginationQuery & { status?: string; month?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.SalaryPaymentWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.month) where.sourceMonth = query.month;
    if (query.search) {
      where.OR = [
        { beneficiaryName: { contains: query.search } },
        { transactionId: { contains: query.search } },
        { civilId: { contains: query.search } },
        { beneficiaryAccount: { contains: query.search } },
      ];
    }
    const orderBy = buildOrderBy(query, SALARIES_SORTABLE, SALARIES_DEFAULT_ORDER, [{ id: 'desc' }]) as Prisma.SalaryPaymentOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.salaryPayment.findMany({ where, skip: pagination.skip, take: pagination.take, orderBy }),
      prisma.salaryPayment.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  /**
   * ملخص شهري: مصفوفة (موظف × شهر) بمجموع المبالغ، مع إجماليات.
   * الأعمدة تُشتق من البيانات نفسها (حسب شهر تاريخ الدفع YYYY-MM).
   */
  async summary() {
    const rows = await prisma.salaryPayment.findMany({
      select: { beneficiaryName: true, civilId: true, amount: true, paymentDate: true, sourceMonth: true },
    });

    const monthKey = (r: { paymentDate: Date | null; sourceMonth: string | null }) => {
      if (r.paymentDate) {
        const d = new Date(r.paymentDate);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      }
      return r.sourceMonth ?? 'غير محدد';
    };

    const monthsSet = new Set<string>();
    // اسم المستفيد → { civilId, perMonth }
    const byEmp = new Map<string, { name: string; civilId: string | null; perMonth: Record<string, number> }>();

    for (const r of rows) {
      const mk = monthKey(r);
      monthsSet.add(mk);
      const key = r.beneficiaryName;
      if (!byEmp.has(key)) byEmp.set(key, { name: r.beneficiaryName, civilId: r.civilId, perMonth: {} });
      const emp = byEmp.get(key)!;
      emp.perMonth[mk] = roundMoney((emp.perMonth[mk] ?? 0) + (r.amount ?? 0));
    }

    const months = [...monthsSet].sort();
    const employees = [...byEmp.values()]
      .map((e) => {
        const values = months.map((m) => e.perMonth[m] ?? 0);
        const monthsPaid = values.filter((v) => v > 0).length;
        const total = sumMoney(values);
        return { name: e.name, civilId: e.civilId, values, monthsPaid, total };
      })
      .sort((a, b) => b.total - a.total);

    const monthTotals = months.map((_, i) => sumMoney(employees.map((e) => e.values[i])));
    const monthCounts = months.map((_, i) => employees.reduce((s, e) => s + (e.values[i] > 0 ? 1 : 0), 0));
    const grandTotal = sumMoney(employees.map((e) => e.total));

    return { months, employees, monthTotals, monthCounts, grandTotal, employeeCount: employees.length };
  }
}

export const salariesService = new SalariesService();

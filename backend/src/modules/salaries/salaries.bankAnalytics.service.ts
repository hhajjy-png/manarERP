import { prisma } from '../../config/database';
import { formatSourceMonth } from './salaries.bankImport.service';
import { getPagination, buildPaginatedResult } from '../../core/utils/pagination';
import ExcelJS from 'exceljs';

export function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export interface AnalyticsFilters {
  payrollMonth?: number;
  payrollYear?: number;
  employeeId?: number;
}

export interface EmployeeMatch {
  employeeId: number;
  fullName: string;
  civilId: string | null;
  bankAccount: string | null;
  matchedCivilIds: string[];
  matchedAccounts: string[];
}

export interface MonthRow {
  sourceMonth: string;
  year: number;
  month: number;
  totalAmount: number;
  count: number;
  varianceFromPrev: number | null;
}

export interface GlobalAnalytics {
  totalAmount: number;
  totalPayments: number;
  uniqueEmployees: number;
  months: MonthRow[];
  topEmployees: { civilId: string | null; beneficiaryName: string; totalAmount: number; count: number }[];
  latestImport: LatestImport | null;
}

export interface LatestImport {
  importedAt: string;
  batchCount: number;
  totalAmount: number;
}

export interface EmployeeDetailResult {
  employee: {
    id: number;
    code: string;
    fullName: string;
    fullNameEn: string | null;
    civilId: string | null;
    bankAccount: string | null;
    jobTitle: string | null;
    department: string | null;
    status: string;
  };
  stats: {
    totalPayments: number;
    totalAmount: number;
    firstPayment: string | null;
    lastPayment: string | null;
    avgMonthlyAmount: number;
    salaryChangeCount: number;
  };
  monthlyHistory: MonthRow[];
}

export interface TransactionRow {
  id: number;
  transactionId: string;
  sourceMonth: string | null;
  paymentDate: string | null;
  beneficiaryAccount: string | null;
  beneficiaryName: string;
  amount: number;
  currency: string;
  status: string | null;
  civilId: string | null;
  matchedBy: 'رقم مدني' | 'رقم الحساب' | null;
  createdAt: string;
}

function buildWhereClause(filters: AnalyticsFilters, extraCivilIds?: string[], extraAccounts?: string[]) {
  const conditions: object[] = [];

  if (filters.payrollMonth && filters.payrollYear) {
    conditions.push({ sourceMonth: formatSourceMonth(filters.payrollMonth, filters.payrollYear) });
  } else if (filters.payrollYear) {
    const yearSuffix = `-${String(filters.payrollYear).slice(2)}`;
    conditions.push({ sourceMonth: { endsWith: yearSuffix } });
  }

  if (extraCivilIds !== undefined || extraAccounts !== undefined) {
    const orClauses: object[] = [];
    if (extraCivilIds && extraCivilIds.length > 0) orClauses.push({ civilId: { in: extraCivilIds } });
    if (extraAccounts && extraAccounts.length > 0) orClauses.push({ beneficiaryAccount: { in: extraAccounts } });
    if (orClauses.length > 0) conditions.push({ OR: orClauses });
  }

  return conditions.length > 0 ? { AND: conditions } : {};
}

export async function resolveEmployeePayments(employeeId: number): Promise<EmployeeMatch | null> {
  const emp = await prisma.employee.findUnique({
    where: { id: employeeId },
    select: { id: true, fullName: true, civilId: true, bankAccount: true },
  });
  if (!emp) return null;

  const civilId = emp.civilId?.trim() || null;
  const bankAccount = emp.bankAccount?.trim() || null;

  if (civilId) {
    const count = await prisma.salaryPayment.count({ where: { civilId } });
    if (count > 0) {
      return { employeeId: emp.id, fullName: emp.fullName, civilId, bankAccount, matchedCivilIds: [civilId], matchedAccounts: [] };
    }
  }

  if (bankAccount) {
    return { employeeId: emp.id, fullName: emp.fullName, civilId, bankAccount, matchedCivilIds: [], matchedAccounts: [bankAccount] };
  }

  return { employeeId: emp.id, fullName: emp.fullName, civilId, bankAccount, matchedCivilIds: [], matchedAccounts: [] };
}

function parseSourceMonth(sm: string): { year: number; month: number } {
  const MONTHS: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  const parts = sm.toLowerCase().split('-');
  if (parts.length !== 2) return { year: 0, month: 0 };
  const month = MONTHS[parts[0]] ?? 0;
  const year = 2000 + parseInt(parts[1], 10);
  return { year, month };
}

function buildMonthRows(rawGroups: { sourceMonth: string | null; _sum: { amount: number | null }; _count: { id: number } }[]): MonthRow[] {
  const rows = rawGroups
    .filter((g) => g.sourceMonth)
    .map((g) => {
      const { year, month } = parseSourceMonth(g.sourceMonth!);
      return {
        sourceMonth: g.sourceMonth!,
        year,
        month,
        totalAmount: round3(g._sum.amount ?? 0),
        count: g._count.id,
        varianceFromPrev: null as number | null,
      };
    })
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

  for (let i = 1; i < rows.length; i++) {
    rows[i].varianceFromPrev = round3(rows[i].totalAmount - rows[i - 1].totalAmount);
  }
  return rows;
}

class BankAnalyticsService {
  async getAnalytics(filters: AnalyticsFilters): Promise<GlobalAnalytics> {
    let empMatch: EmployeeMatch | null = null;
    if (filters.employeeId) empMatch = await resolveEmployeePayments(filters.employeeId);

    const where = empMatch
      ? buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts)
      : buildWhereClause(filters);

    const [agg, monthGroups, topEmpGroups] = await Promise.all([
      prisma.salaryPayment.aggregate({ where, _sum: { amount: true }, _count: { id: true } }),
      prisma.salaryPayment.groupBy({
        by: ['sourceMonth'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { sourceMonth: 'asc' },
      }),
      prisma.salaryPayment.groupBy({
        by: ['civilId', 'beneficiaryName'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
    ]);

    const uniqueResult = await prisma.salaryPayment.findMany({
      where,
      select: { civilId: true, beneficiaryAccount: true },
      distinct: ['civilId', 'beneficiaryAccount'],
    });
    const uniqueEmployees = new Set(
      uniqueResult.map((r) => r.civilId?.trim() || r.beneficiaryAccount?.trim() || '').filter(Boolean),
    ).size;

    const latestPayment = await prisma.salaryPayment.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    let latestImport: LatestImport | null = null;
    if (latestPayment) {
      const batchWindow = new Date(latestPayment.createdAt.getTime() - 10 * 60 * 1000);
      const [batchCount, batchAgg] = await Promise.all([
        prisma.salaryPayment.count({ where: { createdAt: { gte: batchWindow } } }),
        prisma.salaryPayment.aggregate({ where: { createdAt: { gte: batchWindow } }, _sum: { amount: true } }),
      ]);
      latestImport = { importedAt: latestPayment.createdAt.toISOString(), batchCount, totalAmount: round3(batchAgg._sum.amount ?? 0) };
    }

    return {
      totalAmount: round3(agg._sum.amount ?? 0),
      totalPayments: agg._count.id,
      uniqueEmployees,
      months: buildMonthRows(monthGroups),
      topEmployees: topEmpGroups.map((g) => ({
        civilId: g.civilId,
        beneficiaryName: g.beneficiaryName,
        totalAmount: round3(g._sum.amount ?? 0),
        count: g._count.id,
      })),
      latestImport,
    };
  }

  async getEmployeeDetail(employeeId: number, filters: AnalyticsFilters): Promise<EmployeeDetailResult | null> {
    const empMatch = await resolveEmployeePayments(employeeId);
    if (!empMatch) return null;

    const emp = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, code: true, fullName: true, fullNameEn: true, civilId: true, bankAccount: true, jobTitle: true, department: true, status: true },
    });
    if (!emp) return null;

    const where = buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts);

    const [aggResult, monthGroups, allPayments] = await Promise.all([
      prisma.salaryPayment.aggregate({
        where,
        _sum: { amount: true },
        _count: { id: true },
        _min: { paymentDate: true },
        _max: { paymentDate: true },
      }),
      prisma.salaryPayment.groupBy({
        by: ['sourceMonth'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        orderBy: { sourceMonth: 'asc' },
      }),
      prisma.salaryPayment.findMany({ where, select: { sourceMonth: true, amount: true }, orderBy: { paymentDate: 'asc' } }),
    ]);

    const distinctMonthAmounts = new Map<string, number>();
    for (const p of allPayments) {
      if (p.sourceMonth) distinctMonthAmounts.set(p.sourceMonth, (distinctMonthAmounts.get(p.sourceMonth) ?? 0) + p.amount);
    }
    const sortedAmounts = [...distinctMonthAmounts.values()];
    let salaryChangeCount = 0;
    for (let i = 1; i < sortedAmounts.length; i++) {
      if (Math.abs(sortedAmounts[i] - sortedAmounts[i - 1]) > 0.001) salaryChangeCount++;
    }

    const totalMonths = distinctMonthAmounts.size;
    const totalAmt = round3(aggResult._sum.amount ?? 0);

    return {
      employee: emp,
      stats: {
        totalPayments: aggResult._count.id,
        totalAmount: totalAmt,
        firstPayment: aggResult._min.paymentDate?.toISOString() ?? null,
        lastPayment: aggResult._max.paymentDate?.toISOString() ?? null,
        avgMonthlyAmount: totalMonths > 0 ? round3(totalAmt / totalMonths) : 0,
        salaryChangeCount,
      },
      monthlyHistory: buildMonthRows(monthGroups),
    };
  }

  async getTransactions(filters: AnalyticsFilters, query: Record<string, unknown>) {
    const pagination = getPagination(query as { page?: string; pageSize?: string });

    let empMatch: EmployeeMatch | null = null;
    if (filters.employeeId) empMatch = await resolveEmployeePayments(filters.employeeId);

    const where = empMatch
      ? buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts)
      : buildWhereClause(filters);

    const civilIdSet = new Set(empMatch?.matchedCivilIds ?? []);
    const accountSet = new Set(empMatch?.matchedAccounts ?? []);

    const [rows, total] = await Promise.all([
      prisma.salaryPayment.findMany({ where, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }], skip: pagination.skip, take: pagination.take }),
      prisma.salaryPayment.count({ where }),
    ]);

    const data: TransactionRow[] = rows.map((r) => {
      let matchedBy: TransactionRow['matchedBy'] = null;
      if (empMatch) {
        if (r.civilId && civilIdSet.has(r.civilId)) matchedBy = 'رقم مدني';
        else if (r.beneficiaryAccount && accountSet.has(r.beneficiaryAccount)) matchedBy = 'رقم الحساب';
      }
      return {
        id: r.id,
        transactionId: r.transactionId,
        sourceMonth: r.sourceMonth,
        paymentDate: r.paymentDate?.toISOString() ?? null,
        beneficiaryAccount: r.beneficiaryAccount,
        beneficiaryName: r.beneficiaryName,
        amount: round3(r.amount),
        currency: r.currency,
        status: r.status,
        civilId: r.civilId,
        matchedBy,
        createdAt: r.createdAt.toISOString(),
      };
    });

    return buildPaginatedResult(data, total, pagination);
  }

  async searchEmployees(q: string) {
    if (!q || q.trim().length < 1) return [];
    const term = q.trim();
    return prisma.employee.findMany({
      where: {
        OR: [
          { code: { contains: term } },
          { fullName: { contains: term } },
          { fullNameEn: { contains: term } },
          { civilId: { contains: term } },
        ],
        status: 'active',
      },
      select: { id: true, code: true, fullName: true, fullNameEn: true, civilId: true, bankAccount: true },
      take: 20,
    });
  }

  async exportAnalytics(filters: AnalyticsFilters): Promise<Buffer> {
    let empMatch: EmployeeMatch | null = null;
    if (filters.employeeId) empMatch = await resolveEmployeePayments(filters.employeeId);

    const where = empMatch
      ? buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts)
      : buildWhereClause(filters);

    const rows = await prisma.salaryPayment.findMany({ where, orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }] });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'نظام المنار';

    const metaSheet = wb.addWorksheet('معلومات التصدير');
    metaSheet.addRow(['تاريخ التصدير', new Date().toLocaleString('ar-KW')]);
    if (filters.payrollYear) metaSheet.addRow(['السنة', filters.payrollYear]);
    if (filters.payrollMonth) metaSheet.addRow(['الشهر', filters.payrollMonth]);
    if (empMatch) metaSheet.addRow(['الموظف', empMatch.fullName]);
    metaSheet.addRow(['إجمالي السجلات', rows.length]);
    metaSheet.addRow(['إجمالي المبالغ (د.ك)', round3(rows.reduce((s, r) => s + r.amount, 0))]);

    const dataSheet = wb.addWorksheet('المعاملات');
    dataSheet.addRow(['رقم المعاملة', 'الشهر', 'تاريخ الدفع', 'المستفيد', 'رقم الحساب', 'الرقم المدني', 'المبلغ (د.ك)', 'العملة', 'الحالة']);
    for (const r of rows) {
      dataSheet.addRow([
        r.transactionId,
        r.sourceMonth ?? '',
        r.paymentDate ? r.paymentDate.toLocaleDateString('ar-KW') : '',
        r.beneficiaryName,
        r.beneficiaryAccount ?? '',
        r.civilId ?? '',
        round3(r.amount),
        r.currency,
        r.status ?? '',
      ]);
    }

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}

export const bankAnalyticsService = new BankAnalyticsService();

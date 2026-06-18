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
  dateFrom?: string;
  dateTo?: string;
  amountFrom?: number;
  amountTo?: number;
  transactionId?: string;
  civilId?: string;
  bankAccount?: string;
  status?: string;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
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
  employeeCount?: number;
  avg?: number;
  highest?: number;
  lowest?: number;
}

export interface GlobalAnalytics {
  totalAmount: number;
  totalPayments: number;
  uniqueEmployees: number;
  months: MonthRow[];
  topEmployees: {
    civilId: string | null;
    beneficiaryName: string;
    totalAmount: number;
    count: number;
    avgAmount: number;
    latestPaymentDate: string | null;
    employeeId: number | null;
  }[];
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
    highestPayment: number;
    lowestPayment: number;
    distinctMonths: number;
    salaryChangeAmount: number;
    salaryChangePercent: number;
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

interface RawGroupRow {
  sourceMonth: string | null;
  _sum: { amount: number | null };
  _count: { id: number };
  _avg?: { amount: number | null } | null;
  _min?: { amount: number | null } | null;
  _max?: { amount: number | null } | null;
}

function buildWhereClause(filters: AnalyticsFilters, extraCivilIds?: string[], extraAccounts?: string[]) {
  const conditions: object[] = [];

  if (filters.payrollMonth && filters.payrollYear) {
    conditions.push({ sourceMonth: formatSourceMonth(filters.payrollMonth, filters.payrollYear) });
  } else if (filters.payrollYear) {
    const yearSuffix = `-${String(filters.payrollYear).slice(2)}`;
    conditions.push({ sourceMonth: { endsWith: yearSuffix } });
  }

  if (filters.dateFrom || filters.dateTo) {
    const dateCond: Record<string, Date> = {};
    if (filters.dateFrom) dateCond.gte = new Date(filters.dateFrom);
    if (filters.dateTo) dateCond.lte = new Date(filters.dateTo);
    conditions.push({ paymentDate: dateCond });
  }

  if (filters.amountFrom !== undefined || filters.amountTo !== undefined) {
    const amtCond: Record<string, number> = {};
    if (filters.amountFrom !== undefined) amtCond.gte = filters.amountFrom;
    if (filters.amountTo !== undefined) amtCond.lte = filters.amountTo;
    conditions.push({ amount: amtCond });
  }

  if (filters.transactionId) conditions.push({ transactionId: { contains: filters.transactionId } });
  if (filters.civilId) conditions.push({ civilId: { contains: filters.civilId } });
  if (filters.bankAccount) conditions.push({ beneficiaryAccount: { contains: filters.bankAccount } });
  if (filters.status) conditions.push({ status: filters.status });

  if (filters.search) {
    conditions.push({
      OR: [
        { beneficiaryName: { contains: filters.search } },
        { transactionId: { contains: filters.search } },
        { civilId: { contains: filters.search } },
      ],
    });
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

function buildMonthRows(rawGroups: RawGroupRow[], empCounts?: Map<string, number>): MonthRow[] {
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
        avg: g._avg?.amount != null ? round3(g._avg.amount) : undefined,
        highest: g._max?.amount != null ? round3(g._max.amount) : undefined,
        lowest: g._min?.amount != null ? round3(g._min.amount) : undefined,
        employeeCount: empCounts?.get(g.sourceMonth!) ?? undefined,
      };
    })
    .sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));

  for (let i = 1; i < rows.length; i++) {
    rows[i].varianceFromPrev = round3(rows[i].totalAmount - rows[i - 1].totalAmount);
  }
  return rows;
}

const ALLOWED_SORT = ['paymentDate', 'amount', 'beneficiaryName', 'sourceMonth'] as const;
type SortField = typeof ALLOWED_SORT[number];

class BankAnalyticsService {
  async getAnalytics(filters: AnalyticsFilters): Promise<GlobalAnalytics> {
    let empMatch: EmployeeMatch | null = null;
    if (filters.employeeId) empMatch = await resolveEmployeePayments(filters.employeeId);

    const where = empMatch
      ? buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts)
      : buildWhereClause(filters);

    const [agg, monthGroups, topEmpGroups, allForUnique] = await Promise.all([
      prisma.salaryPayment.aggregate({ where, _sum: { amount: true }, _count: { id: true } }),
      prisma.salaryPayment.groupBy({
        by: ['sourceMonth'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        _avg: { amount: true },
        _min: { amount: true },
        _max: { amount: true },
        orderBy: { sourceMonth: 'asc' },
      }),
      prisma.salaryPayment.groupBy({
        by: ['civilId', 'beneficiaryName'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        _avg: { amount: true },
        _max: { paymentDate: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: 10,
      }),
      prisma.salaryPayment.findMany({
        where,
        select: { sourceMonth: true, civilId: true, beneficiaryAccount: true },
      }),
    ]);

    const globalIdSet = new Set<string>();
    const monthEmpSets = new Map<string, Set<string>>();
    for (const r of allForUnique) {
      const id = r.civilId?.trim() || r.beneficiaryAccount?.trim() || '';
      if (id) {
        globalIdSet.add(id);
        if (r.sourceMonth) {
          if (!monthEmpSets.has(r.sourceMonth)) monthEmpSets.set(r.sourceMonth, new Set());
          monthEmpSets.get(r.sourceMonth)!.add(id);
        }
      }
    }
    const uniqueEmployees = globalIdSet.size;
    const monthEmpCounts = new Map(Array.from(monthEmpSets, ([k, s]) => [k, s.size]));

    const topCivilIds = topEmpGroups.map((g) => g.civilId).filter(Boolean) as string[];
    const topEmpLookup = topCivilIds.length > 0
      ? await prisma.employee.findMany({ where: { civilId: { in: topCivilIds } }, select: { id: true, civilId: true } })
      : [];
    const empIdByCivilId = new Map(topEmpLookup.map((e) => [e.civilId, e.id]));

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
      months: buildMonthRows(monthGroups as RawGroupRow[], monthEmpCounts),
      topEmployees: topEmpGroups.map((g) => ({
        civilId: g.civilId,
        beneficiaryName: g.beneficiaryName,
        totalAmount: round3(g._sum.amount ?? 0),
        count: g._count.id,
        avgAmount: round3(g._avg?.amount ?? 0),
        latestPaymentDate: g._max?.paymentDate?.toISOString() ?? null,
        employeeId: g.civilId ? (empIdByCivilId.get(g.civilId) ?? null) : null,
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
        _min: { paymentDate: true, amount: true },
        _max: { paymentDate: true, amount: true },
      }),
      prisma.salaryPayment.groupBy({
        by: ['sourceMonth'],
        where,
        _sum: { amount: true },
        _count: { id: true },
        _avg: { amount: true },
        _min: { amount: true },
        _max: { amount: true },
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

    const firstAmt = sortedAmounts[0] ?? 0;
    const lastAmt = sortedAmounts[sortedAmounts.length - 1] ?? 0;
    const salaryChangeAmount = round3(lastAmt - firstAmt);
    const salaryChangePercent = firstAmt > 0 ? round3(((lastAmt - firstAmt) / firstAmt) * 100) : 0;
    const distinctMonths = distinctMonthAmounts.size;
    const totalAmt = round3(aggResult._sum.amount ?? 0);

    return {
      employee: emp,
      stats: {
        totalPayments: aggResult._count.id,
        totalAmount: totalAmt,
        firstPayment: aggResult._min.paymentDate?.toISOString() ?? null,
        lastPayment: aggResult._max.paymentDate?.toISOString() ?? null,
        avgMonthlyAmount: distinctMonths > 0 ? round3(totalAmt / distinctMonths) : 0,
        salaryChangeCount,
        highestPayment: round3(aggResult._max.amount ?? 0),
        lowestPayment: round3(aggResult._min.amount ?? 0),
        distinctMonths,
        salaryChangeAmount,
        salaryChangePercent,
      },
      monthlyHistory: buildMonthRows(monthGroups as RawGroupRow[]),
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

    const sortField: SortField = ALLOWED_SORT.includes(filters.sortBy as SortField)
      ? (filters.sortBy as SortField)
      : 'paymentDate';
    const dir: 'asc' | 'desc' = filters.sortDir === 'asc' ? 'asc' : 'desc';
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const orderBy: any[] = [{ [sortField]: dir }, { createdAt: 'desc' }];

    const [rows, total] = await Promise.all([
      prisma.salaryPayment.findMany({ where, orderBy, skip: pagination.skip, take: pagination.take }),
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

# Payroll Bank Analytics Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a read-only analytics page at `/payroll/bank-analytics` over existing `SalaryPayment` data — no schema changes, no new imports, no SalaryPayment mutations.

**Architecture:** A new `salaries.bankAnalytics.service.ts` exposes 5 GET endpoints under `/api/salaries/bank-payments/…` behind the existing `import.read` permission. The frontend `BankSalaryAnalytics.tsx` page calls these endpoints and renders summary cards, a monthly bar chart, an employee autocomplete with profile + timeline, and a paginated transactions table. Excel export builds a 2-sheet workbook directly via ExcelJS without calling `buildExcel()`.

**Tech Stack:** Express/Prisma (backend), React 18 + Recharts + ExcelJS (frontend), Vitest (tests). No new packages.

## Global Constraints

- NO schema migrations — SalaryPayment model is immutable bank transaction history
- NO new permission keys — reuse `import.read` for all 5 routes
- NO new libraries — Recharts and ExcelJS already installed
- KWD amounts: 3 decimal places everywhere (`round3 = Math.round(n*1000)/1000`)
- Offline/Electron-first — no external API calls
- Employee resolution: civilId first, bankAccount fallback (strict sequence, not OR)
- Stop after implementation+validation — do NOT merge to production without user approval
- Feature branch: `feature/payroll-bank-analytics-phase1`

---

### Task 0: Git Setup

**Files:** none

- [ ] **Step 1: Verify clean working tree**

```bash
git status
```
Expected: nothing to commit

- [ ] **Step 2: Create checkpoint tag**

```bash
git tag pre-payroll-bank-analytics-phase1
```

- [ ] **Step 3: Create feature branch**

```bash
git checkout -b feature/payroll-bank-analytics-phase1
```

---

### Task 1: Backend Analytics Service — Types + Helpers

**Files:**
- Create: `backend/src/modules/salaries/salaries.bankAnalytics.service.ts`
- Create: `backend/src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts`

**Interfaces:**
- Produces: `AnalyticsFilters`, `GlobalAnalytics`, `EmployeeMatch`, `MonthRow`, `EmployeeDetailResult`, `TransactionRow`, `LatestImport`
- Consumes: `formatSourceMonth` from `./salaries.bankImport.service`

- [ ] **Step 1: Write failing test for `round3` and `formatSourceMonth` import**

```typescript
// backend/src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findMany: vi.fn(), findUnique: vi.fn() },
    salaryPayment: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { round3, bankAnalyticsService } from '../salaries.bankAnalytics.service';

describe('round3', () => {
  it('rounds to 3 decimal places', () => {
    expect(round3(1.0005)).toBe(1.001);
    expect(round3(100)).toBe(100);
    expect(round3(0.1234567)).toBe(0.123);
  });
});
```

- [ ] **Step 2: Run to verify FAIL**

```bash
cd backend && npx vitest run src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts 2>&1 | tail -20
```
Expected: FAIL — module not found

- [ ] **Step 3: Create the service file with types and helpers**

```typescript
// backend/src/modules/salaries/salaries.bankAnalytics.service.ts
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
  sourceMonth?: string;
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

  if (filters.sourceMonth) {
    conditions.push({ sourceMonth: filters.sourceMonth });
  } else if (filters.payrollMonth && filters.payrollYear) {
    conditions.push({ sourceMonth: formatSourceMonth(filters.payrollMonth, filters.payrollYear) });
  } else if (filters.payrollYear) {
    const yearSuffix = `-${String(filters.payrollYear).slice(2)}`;
    conditions.push({ sourceMonth: { endsWith: yearSuffix } });
  }

  if (extraCivilIds !== undefined || extraAccounts !== undefined) {
    const orClauses: object[] = [];
    if (extraCivilIds && extraCivilIds.length > 0) {
      orClauses.push({ civilId: { in: extraCivilIds } });
    }
    if (extraAccounts && extraAccounts.length > 0) {
      orClauses.push({ beneficiaryAccount: { in: extraAccounts } });
    }
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
      return {
        employeeId: emp.id,
        fullName: emp.fullName,
        civilId,
        bankAccount,
        matchedCivilIds: [civilId],
        matchedAccounts: [],
      };
    }
  }

  if (bankAccount) {
    return {
      employeeId: emp.id,
      fullName: emp.fullName,
      civilId,
      bankAccount,
      matchedCivilIds: [],
      matchedAccounts: [bankAccount],
    };
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

class BankAnalyticsService {
  async getAnalytics(filters: AnalyticsFilters): Promise<GlobalAnalytics> {
    let empMatch: EmployeeMatch | null = null;
    if (filters.employeeId) {
      empMatch = await resolveEmployeePayments(filters.employeeId);
    }

    const where = empMatch
      ? buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts)
      : buildWhereClause(filters);

    const [payments, allMonthGroups, topEmpGroups] = await Promise.all([
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

    const rawMonths = allMonthGroups.filter((g) => g.sourceMonth);
    const monthRows: MonthRow[] = rawMonths
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

    for (let i = 1; i < monthRows.length; i++) {
      monthRows[i].varianceFromPrev = round3(monthRows[i].totalAmount - monthRows[i - 1].totalAmount);
    }

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
      latestImport = {
        importedAt: latestPayment.createdAt.toISOString(),
        batchCount,
        totalAmount: round3(batchAgg._sum.amount ?? 0),
      };
    }

    return {
      totalAmount: round3(payments._sum.amount ?? 0),
      totalPayments: payments._count.id,
      uniqueEmployees,
      months: monthRows,
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

    const [agg, monthGroups, allPayments] = await Promise.all([
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

    const monthRowsRaw = monthGroups.filter((g) => g.sourceMonth).map((g) => {
      const { year, month } = parseSourceMonth(g.sourceMonth!);
      return { sourceMonth: g.sourceMonth!, year, month, totalAmount: round3(g._sum.amount ?? 0), count: g._count.id, varianceFromPrev: null as number | null };
    }).sort((a, b) => a.year * 12 + a.month - (b.year * 12 + b.month));
    for (let i = 1; i < monthRowsRaw.length; i++) {
      monthRowsRaw[i].varianceFromPrev = round3(monthRowsRaw[i].totalAmount - monthRowsRaw[i - 1].totalAmount);
    }

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
    const totalAmt = round3(agg._sum.amount ?? 0);
    const avgMonthlyAmount = totalMonths > 0 ? round3(totalAmt / totalMonths) : 0;

    return {
      employee: emp,
      stats: {
        totalPayments: agg._count.id,
        totalAmount: totalAmt,
        firstPayment: agg._min.paymentDate?.toISOString() ?? null,
        lastPayment: agg._max.paymentDate?.toISOString() ?? null,
        avgMonthlyAmount,
        salaryChangeCount,
      },
      monthlyHistory: monthRowsRaw,
    };
  }

  async getTransactions(filters: AnalyticsFilters, query: Record<string, unknown>) {
    const pagination = getPagination(query as { page?: string; pageSize?: string });

    let empMatch: EmployeeMatch | null = null;
    if (filters.employeeId) {
      empMatch = await resolveEmployeePayments(filters.employeeId);
    }

    const where = empMatch
      ? buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts)
      : buildWhereClause(filters);

    const civilIdSet = new Set(empMatch?.matchedCivilIds ?? []);
    const accountSet = new Set(empMatch?.matchedAccounts ?? []);

    const [rows, total] = await Promise.all([
      prisma.salaryPayment.findMany({
        where,
        orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
        skip: pagination.skip,
        take: pagination.take,
      }),
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
    const employees = await prisma.employee.findMany({
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
    return employees;
  }

  async exportAnalytics(filters: AnalyticsFilters): Promise<Buffer> {
    let empMatch: EmployeeMatch | null = null;
    if (filters.employeeId) {
      empMatch = await resolveEmployeePayments(filters.employeeId);
    }
    const where = empMatch
      ? buildWhereClause(filters, empMatch.matchedCivilIds, empMatch.matchedAccounts)
      : buildWhereClause(filters);

    const rows = await prisma.salaryPayment.findMany({
      where,
      orderBy: [{ paymentDate: 'desc' }, { createdAt: 'desc' }],
    });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'نظام المنار';

    const metaSheet = wb.addWorksheet('معلومات التصدير');
    metaSheet.addRow(['تاريخ التصدير', new Date().toLocaleString('ar-KW')]);
    if (filters.payrollYear) metaSheet.addRow(['السنة', filters.payrollYear]);
    if (filters.payrollMonth) metaSheet.addRow(['الشهر', filters.payrollMonth]);
    if (empMatch) metaSheet.addRow(['الموظف', empMatch.fullName]);
    metaSheet.addRow(['إجمالي السجلات', rows.length]);
    const totalAmt = round3(rows.reduce((s, r) => s + r.amount, 0));
    metaSheet.addRow(['إجمالي المبالغ (د.ك)', totalAmt]);

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

    return wb.xlsx.writeBuffer() as Promise<Buffer>;
  }
}

export const bankAnalyticsService = new BankAnalyticsService();
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd backend && npx vitest run src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts 2>&1 | tail -20
```
Expected: PASS for round3 tests

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/salaries/salaries.bankAnalytics.service.ts backend/src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts
git commit -m "feat(salaries): add bank analytics service with types + helpers"
```

---

### Task 2: Backend Analytics Service — Additional Tests

**Files:**
- Modify: `backend/src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts`

**Interfaces:**
- Consumes: `bankAnalyticsService`, `resolveEmployeePayments` from service

- [ ] **Step 1: Add tests for resolveEmployeePayments and getTransactions**

Append to test file after the `round3` describe block:

```typescript
import { resolveEmployeePayments } from '../salaries.bankAnalytics.service';

describe('resolveEmployeePayments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when employee not found', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    const result = await resolveEmployeePayments(999);
    expect(result).toBeNull();
  });

  it('uses civilId match when payments exist', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 1, fullName: 'أحمد', civilId: '123456789', bankAccount: 'ACC001',
    } as any);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(3);
    const result = await resolveEmployeePayments(1);
    expect(result?.matchedCivilIds).toEqual(['123456789']);
    expect(result?.matchedAccounts).toEqual([]);
  });

  it('falls back to bankAccount when civilId has no payments', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 2, fullName: 'محمد', civilId: '987', bankAccount: 'ACC002',
    } as any);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);
    const result = await resolveEmployeePayments(2);
    expect(result?.matchedCivilIds).toEqual([]);
    expect(result?.matchedAccounts).toEqual(['ACC002']);
  });

  it('returns empty match arrays when employee has no civilId and no bankAccount', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 3, fullName: 'سالم', civilId: null, bankAccount: null,
    } as any);
    const result = await resolveEmployeePayments(3);
    expect(result?.matchedCivilIds).toEqual([]);
    expect(result?.matchedAccounts).toEqual([]);
  });
});

describe('bankAnalyticsService.searchEmployees', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array for empty query', async () => {
    const result = await bankAnalyticsService.searchEmployees('');
    expect(result).toEqual([]);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('calls findMany with contains filter for non-empty query', async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([]);
    await bankAnalyticsService.searchEmployees('أحمد');
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'active' }) }),
    );
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd backend && npx vitest run src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts 2>&1 | tail -30
```
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts
git commit -m "test(salaries): add analytics service tests"
```

---

### Task 3: Register Analytics Routes

**Files:**
- Modify: `backend/src/modules/salaries/salaries.routes.ts`

**Interfaces:**
- Consumes: `bankAnalyticsService` from `./salaries.bankAnalytics.service`

- [ ] **Step 1: Add import and 5 routes**

After the existing imports and before `export default router`, add:

```typescript
import { bankAnalyticsService } from './salaries.bankAnalytics.service';

// analytics routes (import.read permission — read-only)
router.get(
  '/bank-payments/analytics',
  canImportRead,
  asyncHandler(async (req, res) => {
    const filters = {
      payrollMonth: req.query.payrollMonth ? Number(req.query.payrollMonth) : undefined,
      payrollYear: req.query.payrollYear ? Number(req.query.payrollYear) : undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    };
    ok(res, await bankAnalyticsService.getAnalytics(filters));
  }),
);

router.get(
  '/bank-payments/employee/:employeeId',
  canImportRead,
  asyncHandler(async (req, res) => {
    const employeeId = Number(req.params.employeeId);
    const filters = {
      payrollMonth: req.query.payrollMonth ? Number(req.query.payrollMonth) : undefined,
      payrollYear: req.query.payrollYear ? Number(req.query.payrollYear) : undefined,
      employeeId,
    };
    const result = await bankAnalyticsService.getEmployeeDetail(employeeId, filters);
    if (!result) return ok(res, null);
    ok(res, result);
  }),
);

router.get(
  '/bank-payments/transactions',
  canImportRead,
  asyncHandler(async (req, res) => {
    const filters = {
      payrollMonth: req.query.payrollMonth ? Number(req.query.payrollMonth) : undefined,
      payrollYear: req.query.payrollYear ? Number(req.query.payrollYear) : undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    };
    ok(res, await bankAnalyticsService.getTransactions(filters, req.query));
  }),
);

router.get(
  '/bank-payments/employees/search',
  canImportRead,
  asyncHandler(async (req, res) => {
    const q = String(req.query.q ?? '');
    ok(res, await bankAnalyticsService.searchEmployees(q));
  }),
);

router.get(
  '/bank-payments/export',
  canImportRead,
  asyncHandler(async (req, res) => {
    const filters = {
      payrollMonth: req.query.payrollMonth ? Number(req.query.payrollMonth) : undefined,
      payrollYear: req.query.payrollYear ? Number(req.query.payrollYear) : undefined,
      employeeId: req.query.employeeId ? Number(req.query.employeeId) : undefined,
    };
    const buffer = await bankAnalyticsService.exportAnalytics(filters);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="bank-analytics.xlsx"');
    res.send(buffer);
  }),
);
```

- [ ] **Step 2: Type-check backend**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/salaries/salaries.routes.ts
git commit -m "feat(salaries): register 5 bank analytics routes"
```

---

### Task 4: Frontend Page — BankSalaryAnalytics.tsx

**Files:**
- Create: `frontend/src/pages/BankSalaryAnalytics.tsx`

**Interfaces:**
- Consumes: Axios client from `../api/client`, `useAuth` from `../stores/authStore`, Recharts, `useUI` from `../stores/uiStore`

- [ ] **Step 1: Create the page**

```tsx
// frontend/src/pages/BankSalaryAnalytics.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../api/client';
import { useUI } from '../stores/uiStore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

// ── Types ──────────────────────────────────────────────────────────────────────
interface MonthRow { sourceMonth: string; year: number; month: number; totalAmount: number; count: number; varianceFromPrev: number | null; }
interface LatestImport { importedAt: string; batchCount: number; totalAmount: number; }
interface GlobalAnalytics { totalAmount: number; totalPayments: number; uniqueEmployees: number; months: MonthRow[]; topEmployees: { civilId: string | null; beneficiaryName: string; totalAmount: number; count: number }[]; latestImport: LatestImport | null; }
interface Employee { id: number; code: string; fullName: string; fullNameEn: string | null; civilId: string | null; bankAccount: string | null; }
interface EmployeeStats { totalPayments: number; totalAmount: number; firstPayment: string | null; lastPayment: string | null; avgMonthlyAmount: number; salaryChangeCount: number; }
interface EmployeeDetail { employee: Employee & { jobTitle: string | null; department: string | null; status: string; }; stats: EmployeeStats; monthlyHistory: MonthRow[]; }
interface TransactionRow { id: number; transactionId: string; sourceMonth: string | null; paymentDate: string | null; beneficiaryAccount: string | null; beneficiaryName: string; amount: number; currency: string; status: string | null; civilId: string | null; matchedBy: string | null; createdAt: string; }
interface PaginatedResult<T> { data: T[]; meta: { page: number; pageSize: number; total: number; totalPages: number }; }

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmt3 = (n: number) => n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('ar-KW') : '—';

function buildParams(filters: Filters, extra: Record<string, unknown> = {}) {
  const p: Record<string, string> = {};
  if (filters.payrollYear) p.payrollYear = String(filters.payrollYear);
  if (filters.payrollMonth) p.payrollMonth = String(filters.payrollMonth);
  if (filters.employeeId) p.employeeId = String(filters.employeeId);
  for (const [k, v] of Object.entries(extra)) if (v !== undefined) p[k] = String(v);
  return p;
}

// ── Filters state ──────────────────────────────────────────────────────────────
interface Filters { payrollYear?: number; payrollMonth?: number; employeeId?: number; }

const MONTHS_AR = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

export default function BankSalaryAnalytics() {
  const { lang } = useUI();
  const isRtl = lang === 'ar';

  const [filters, setFilters] = useState<Filters>({});
  const [analytics, setAnalytics] = useState<GlobalAnalytics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Employee autocomplete
  const [empQuery, setEmpQuery] = useState('');
  const [empSuggestions, setEmpSuggestions] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [empDetail, setEmpDetail] = useState<EmployeeDetail | null>(null);
  const [empDetailLoading, setEmpDetailLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transactions table
  const [txPage, setTxPage] = useState(1);
  const [txData, setTxData] = useState<PaginatedResult<TransactionRow> | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  // ── Load analytics ─────────────────────────────────────────────────────────
  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/salaries/bank-payments/analytics', { params: buildParams(filters) });
      setAnalytics(res.data.data);
    } catch {
      setError('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadAnalytics(); }, [loadAnalytics]);

  // ── Load transactions ──────────────────────────────────────────────────────
  const loadTransactions = useCallback(async (page: number) => {
    setTxLoading(true);
    try {
      const res = await api.get('/salaries/bank-payments/transactions', {
        params: buildParams(filters, { page, pageSize: 20 }),
      });
      setTxData(res.data.data);
    } catch { /* ignore */ } finally {
      setTxLoading(false);
    }
  }, [filters]);

  useEffect(() => { setTxPage(1); loadTransactions(1); }, [loadTransactions]);
  const handleTxPage = (p: number) => { setTxPage(p); loadTransactions(p); };

  // ── Employee autocomplete ──────────────────────────────────────────────────
  const searchEmployees = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!q.trim()) { setEmpSuggestions([]); return; }
      try {
        const res = await api.get('/salaries/bank-payments/employees/search', { params: { q } });
        setEmpSuggestions(res.data.data ?? []);
      } catch { setEmpSuggestions([]); }
    }, 200);
  }, []);

  const selectEmployee = async (emp: Employee | null) => {
    setSelectedEmployee(emp);
    setEmpSuggestions([]);
    setEmpQuery(emp ? emp.fullName : '');
    setFilters((f) => ({ ...f, employeeId: emp?.id }));
    if (!emp) { setEmpDetail(null); return; }
    setEmpDetailLoading(true);
    try {
      const res = await api.get(`/salaries/bank-payments/employee/${emp.id}`, { params: buildParams(filters) });
      setEmpDetail(res.data.data);
    } catch { setEmpDetail(null); } finally {
      setEmpDetailLoading(false);
    }
  };

  const clearEmployee = () => selectEmployee(null);

  // ── Export ─────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const res = await api.get('/salaries/bank-payments/export', {
        params: buildParams(filters),
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bank-analytics.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('فشل التصدير'); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const cardClass = 'bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border border-neutral-200 dark:border-neutral-700';

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-neutral-800 dark:text-white">تحليلات الرواتب البنكية</h1>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
        >
          <span className="material-symbols-outlined text-base">download</span>
          تصدير Excel
        </button>
      </div>

      {/* Filters */}
      <div className={`${cardClass} flex flex-wrap gap-4 items-end`}>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-500">السنة</label>
          <select
            className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 dark:text-white"
            value={filters.payrollYear ?? ''}
            onChange={(e) => setFilters((f) => ({ ...f, payrollYear: e.target.value ? Number(e.target.value) : undefined, payrollMonth: undefined }))}
          >
            <option value="">كل السنوات</option>
            {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        {filters.payrollYear && (
          <div className="flex flex-col gap-1">
            <label className="text-xs text-neutral-500">الشهر</label>
            <select
              className="border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 dark:text-white"
              value={filters.payrollMonth ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, payrollMonth: e.target.value ? Number(e.target.value) : undefined }))}
            >
              <option value="">كل الأشهر</option>
              {MONTHS_AR.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
        )}

        {/* Employee autocomplete */}
        <div className="flex flex-col gap-1 relative min-w-64">
          <label className="text-xs text-neutral-500">الموظف</label>
          <div className="relative">
            <input
              type="text"
              placeholder="بحث باسم أو رقم مدني…"
              value={empQuery}
              onChange={(e) => { setEmpQuery(e.target.value); searchEmployees(e.target.value); }}
              className="w-full border border-neutral-300 dark:border-neutral-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-neutral-700 dark:text-white"
            />
            {selectedEmployee && (
              <button onClick={clearEmployee} className="absolute top-2 end-2 text-neutral-400 hover:text-red-500">
                <span className="material-symbols-outlined text-base">close</span>
              </button>
            )}
          </div>
          {empSuggestions.length > 0 && (
            <div className="absolute top-full mt-1 w-full bg-white dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
              {empSuggestions.map((e) => (
                <button
                  key={e.id}
                  onClick={() => selectEmployee(e)}
                  className="w-full text-start px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-600 border-b border-neutral-100 dark:border-neutral-600 last:border-0"
                >
                  <div className="font-medium dark:text-white">{e.fullName}</div>
                  <div className="text-xs text-neutral-500">{e.code} · {e.civilId ?? '—'}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {(filters.payrollYear || filters.employeeId) && (
          <button
            onClick={() => { setFilters({}); setEmpQuery(''); setSelectedEmployee(null); setEmpDetail(null); }}
            className="px-3 py-2 text-sm text-neutral-500 hover:text-red-500 border border-neutral-300 dark:border-neutral-600 rounded-lg"
          >
            مسح الفلاتر
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

      {loading ? (
        <div className="text-center py-12 text-neutral-400">جارٍ التحميل…</div>
      ) : analytics && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'إجمالي المبالغ (د.ك)', value: fmt3(analytics.totalAmount), icon: 'payments' },
              { label: 'عدد المعاملات', value: analytics.totalPayments.toLocaleString('ar-KW'), icon: 'receipt_long' },
              { label: 'الموظفون الفريدون', value: analytics.uniqueEmployees.toLocaleString('ar-KW'), icon: 'group' },
              { label: 'عدد الأشهر', value: analytics.months.length.toLocaleString('ar-KW'), icon: 'calendar_month' },
            ].map((c) => (
              <div key={c.label} className={cardClass}>
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-blue-500">{c.icon}</span>
                  <div>
                    <div className="text-xs text-neutral-500">{c.label}</div>
                    <div className="text-xl font-bold dark:text-white">{c.value}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Latest Import Card */}
          {analytics.latestImport && (
            <div className={`${cardClass} flex items-center gap-4`}>
              <span className="material-symbols-outlined text-green-500 text-3xl">cloud_done</span>
              <div>
                <div className="text-xs text-neutral-500">آخر استيراد</div>
                <div className="font-semibold dark:text-white">{fmtDate(analytics.latestImport.importedAt)}</div>
                <div className="text-sm text-neutral-500">{analytics.latestImport.batchCount} سجل · {fmt3(analytics.latestImport.totalAmount)} د.ك</div>
              </div>
            </div>
          )}

          {/* Monthly Chart */}
          {analytics.months.length > 0 && (
            <div className={cardClass}>
              <h2 className="text-base font-semibold mb-4 dark:text-white">الرواتب الشهرية</h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={analytics.months} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="sourceMonth" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`${fmt3(v)} د.ك`, 'المبلغ']} />
                  <Legend />
                  <Bar dataKey="totalAmount" name="المبلغ الإجمالي (د.ك)" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Monthly Table */}
          {analytics.months.length > 0 && (
            <div className={cardClass}>
              <h2 className="text-base font-semibold mb-3 dark:text-white">ملخص شهري</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-neutral-500 border-b dark:border-neutral-600">
                      <th className="text-start pb-2 font-medium">الشهر</th>
                      <th className="text-end pb-2 font-medium">المبلغ (د.ك)</th>
                      <th className="text-end pb-2 font-medium">عدد المعاملات</th>
                      <th className="text-end pb-2 font-medium">الفرق عن السابق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.months.map((m) => (
                      <tr key={m.sourceMonth} className="border-b border-neutral-100 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700">
                        <td className="py-2 dark:text-white">{m.sourceMonth}</td>
                        <td className="py-2 text-end font-mono dark:text-white">{fmt3(m.totalAmount)}</td>
                        <td className="py-2 text-end dark:text-white">{m.count}</td>
                        <td className={`py-2 text-end font-mono ${m.varianceFromPrev === null ? 'text-neutral-400' : m.varianceFromPrev >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {m.varianceFromPrev === null ? '—' : (m.varianceFromPrev >= 0 ? '+' : '') + fmt3(m.varianceFromPrev)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Employee Detail */}
          {selectedEmployee && (
            <div className={cardClass}>
              {empDetailLoading ? (
                <div className="text-center py-6 text-neutral-400">جارٍ تحميل بيانات الموظف…</div>
              ) : empDetail ? (
                <div className="space-y-4">
                  <h2 className="text-base font-semibold dark:text-white">
                    <span className="material-symbols-outlined align-middle me-1 text-base">person</span>
                    {empDetail.employee.fullName}
                  </h2>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                    {[
                      ['الكود', empDetail.employee.code],
                      ['الرقم المدني', empDetail.employee.civilId ?? '—'],
                      ['رقم الحساب', empDetail.employee.bankAccount ?? '—'],
                      ['المسمى الوظيفي', empDetail.employee.jobTitle ?? '—'],
                      ['القسم', empDetail.employee.department ?? '—'],
                      ['الحالة', empDetail.employee.status === 'active' ? 'نشط' : 'غير نشط'],
                    ].map(([k, v]) => (
                      <div key={k} className="bg-neutral-50 dark:bg-neutral-700 rounded-lg p-3">
                        <div className="text-xs text-neutral-500">{k}</div>
                        <div className="font-medium dark:text-white">{v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    {[
                      ['إجمالي المدفوعات', empDetail.stats.totalPayments.toLocaleString('ar-KW')],
                      ['إجمالي المبالغ (د.ك)', fmt3(empDetail.stats.totalAmount)],
                      ['متوسط الشهري (د.ك)', fmt3(empDetail.stats.avgMonthlyAmount)],
                      ['تغييرات الراتب', empDetail.stats.salaryChangeCount.toString()],
                    ].map(([k, v]) => (
                      <div key={k} className={`${cardClass} text-center`}>
                        <div className="text-xs text-neutral-500">{k}</div>
                        <div className="text-lg font-bold dark:text-white">{v}</div>
                      </div>
                    ))}
                  </div>
                  {/* Employee Monthly History */}
                  {empDetail.monthlyHistory.length > 0 && (
                    <div>
                      <h3 className="text-sm font-semibold mb-2 dark:text-white">السجل الشهري</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-neutral-500 border-b dark:border-neutral-600">
                              <th className="text-start pb-2 font-medium">الشهر</th>
                              <th className="text-end pb-2 font-medium">المبلغ (د.ك)</th>
                              <th className="text-end pb-2 font-medium">المعاملات</th>
                              <th className="text-end pb-2 font-medium">الفرق</th>
                            </tr>
                          </thead>
                          <tbody>
                            {empDetail.monthlyHistory.map((m) => (
                              <tr key={m.sourceMonth} className="border-b border-neutral-100 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700">
                                <td className="py-2 dark:text-white">{m.sourceMonth}</td>
                                <td className="py-2 text-end font-mono dark:text-white">{fmt3(m.totalAmount)}</td>
                                <td className="py-2 text-end dark:text-white">{m.count}</td>
                                <td className={`py-2 text-end font-mono ${m.varianceFromPrev === null ? 'text-neutral-400' : m.varianceFromPrev >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                                  {m.varianceFromPrev === null ? '—' : (m.varianceFromPrev >= 0 ? '+' : '') + fmt3(m.varianceFromPrev)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-neutral-400 text-sm">لا توجد مدفوعات لهذا الموظف</div>
              )}
            </div>
          )}

          {/* Top Employees */}
          {!filters.employeeId && analytics.topEmployees.length > 0 && (
            <div className={cardClass}>
              <h2 className="text-base font-semibold mb-3 dark:text-white">أعلى الموظفين مدفوعاتٍ</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-neutral-500 border-b dark:border-neutral-600">
                      <th className="text-start pb-2 font-medium">#</th>
                      <th className="text-start pb-2 font-medium">المستفيد</th>
                      <th className="text-start pb-2 font-medium">الرقم المدني</th>
                      <th className="text-end pb-2 font-medium">المبلغ (د.ك)</th>
                      <th className="text-end pb-2 font-medium">المعاملات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topEmployees.map((e, i) => (
                      <tr key={i} className="border-b border-neutral-100 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700">
                        <td className="py-2 text-neutral-400">{i + 1}</td>
                        <td className="py-2 dark:text-white">{e.beneficiaryName}</td>
                        <td className="py-2 text-neutral-500">{e.civilId ?? '—'}</td>
                        <td className="py-2 text-end font-mono dark:text-white">{fmt3(e.totalAmount)}</td>
                        <td className="py-2 text-end dark:text-white">{e.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Transactions Table */}
          <div className={cardClass}>
            <h2 className="text-base font-semibold mb-3 dark:text-white">المعاملات</h2>
            {txLoading ? (
              <div className="text-center py-6 text-neutral-400">جارٍ التحميل…</div>
            ) : txData && (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-neutral-500 border-b dark:border-neutral-600">
                        <th className="text-start pb-2 font-medium">رقم المعاملة</th>
                        <th className="text-start pb-2 font-medium">الشهر</th>
                        <th className="text-start pb-2 font-medium">تاريخ الدفع</th>
                        <th className="text-start pb-2 font-medium">المستفيد</th>
                        <th className="text-end pb-2 font-medium">المبلغ (د.ك)</th>
                        <th className="text-start pb-2 font-medium">الرقم المدني</th>
                        {filters.employeeId && <th className="text-start pb-2 font-medium">مطابقة بـ</th>}
                        <th className="text-start pb-2 font-medium">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {txData.data.map((row) => (
                        <tr key={row.id} className="border-b border-neutral-100 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-700">
                          <td className="py-2 font-mono text-xs dark:text-white">{row.transactionId}</td>
                          <td className="py-2 dark:text-white">{row.sourceMonth ?? '—'}</td>
                          <td className="py-2 dark:text-white">{fmtDate(row.paymentDate)}</td>
                          <td className="py-2 dark:text-white">{row.beneficiaryName}</td>
                          <td className="py-2 text-end font-mono dark:text-white">{fmt3(row.amount)}</td>
                          <td className="py-2 text-neutral-500">{row.civilId ?? '—'}</td>
                          {filters.employeeId && (
                            <td className="py-2">
                              {row.matchedBy ? (
                                <span className="inline-block px-2 py-0.5 rounded text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200">{row.matchedBy}</span>
                              ) : <span className="text-neutral-300">—</span>}
                            </td>
                          )}
                          <td className="py-2">
                            <span className={`inline-block px-2 py-0.5 rounded text-xs ${row.status === 'PROCESSED' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200' : 'bg-neutral-100 text-neutral-500'}`}>
                              {row.status ?? '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {txData.meta.totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 text-sm text-neutral-500">
                    <span>{txData.meta.total.toLocaleString('ar-KW')} معاملة</span>
                    <div className="flex gap-2">
                      <button disabled={txPage <= 1} onClick={() => handleTxPage(txPage - 1)} className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-600 disabled:opacity-40">السابق</button>
                      <span className="px-3 py-1">{txPage} / {txData.meta.totalPages}</span>
                      <button disabled={txPage >= txData.meta.totalPages} onClick={() => handleTxPage(txPage + 1)} className="px-3 py-1 rounded border border-neutral-300 dark:border-neutral-600 disabled:opacity-40">التالي</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check frontend**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/BankSalaryAnalytics.tsx
git commit -m "feat(salaries): add BankSalaryAnalytics page"
```

---

### Task 5: Wire Nav + Route + i18n

**Files:**
- Modify: `frontend/src/App.tsx` (line 37 area — after BankImport import)
- Modify: `frontend/src/config/modules.tsx` (line 349 area — after bank-import entry)
- Modify: `frontend/src/lib/i18n.ts` (lines 69 and 1267 — after nav.bank_import keys)

**Interfaces:**
- Produces: `/payroll/bank-analytics` route, `nav.bank_analytics` i18n key, sidebar nav entry

- [ ] **Step 1: Add import and route to App.tsx**

After `import BankImport from './pages/BankImport';` add:
```typescript
import BankSalaryAnalytics from './pages/BankSalaryAnalytics';
```

After `<Route path="/payroll/bank-import" element={<BankImport />} />` add:
```tsx
<Route path="/payroll/bank-analytics" element={<BankSalaryAnalytics />} />
```

- [ ] **Step 2: Add nav entry to modules.tsx**

After `{ key: 'payroll/bank-import', label: 'nav.bank_import', icon: 'file_upload', permission: 'import.read' },` add:
```typescript
{ key: 'payroll/bank-analytics', label: 'nav.bank_analytics', icon: 'bar_chart', permission: 'import.read' },
```

- [ ] **Step 3: Add i18n keys to i18n.ts**

In the `ar` block after `'nav.bank_import': 'استيراد الرواتب البنكية',` add:
```
'nav.bank_analytics': 'تحليلات الرواتب البنكية',
```

In the `en` block after `'nav.bank_import': 'Bank Salary Import',` add:
```
'nav.bank_analytics': 'Bank Salary Analytics',
```

- [ ] **Step 4: Type-check frontend**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/config/modules.tsx frontend/src/lib/i18n.ts
git commit -m "feat(salaries): wire bank analytics nav, route, i18n"
```

---

### Task 6: Full Validation

- [ ] **Step 1: Backend type-check**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors

- [ ] **Step 2: Frontend type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```
Expected: 0 errors

- [ ] **Step 3: Run all tests**

```bash
cd backend && npm test 2>&1 | tail -30
```
Expected: all tests pass (≥ 65 tests including new analytics tests)

- [ ] **Step 4: Backend build**

```bash
npm run build:back 2>&1 | tail -20
```
Expected: 0 errors

- [ ] **Step 5: Frontend build**

```bash
npm run build:front 2>&1 | tail -20
```
Expected: 0 errors

- [ ] **Step 6: Prisma validate**

```bash
cd backend && npx prisma validate 2>&1
```
Expected: schema is valid

---

## Deliverables Checklist

- [ ] `backend/src/modules/salaries/salaries.bankAnalytics.service.ts` — 7 exported functions/class
- [ ] `backend/src/modules/salaries/__tests__/salaries.bankAnalytics.test.ts` — ≥ 8 tests
- [ ] `backend/src/modules/salaries/salaries.routes.ts` — 5 new GET routes added
- [ ] `frontend/src/pages/BankSalaryAnalytics.tsx` — complete page with all sections
- [ ] `frontend/src/App.tsx` — import + route added
- [ ] `frontend/src/config/modules.tsx` — nav entry added
- [ ] `frontend/src/lib/i18n.ts` — ar + en keys added
- [ ] All TypeScript validations pass (backend, frontend)
- [ ] All tests pass
- [ ] Both builds succeed (build:back, build:front)
- [ ] NO migrations created
- [ ] NO new permission keys created
- [ ] NO new npm packages installed

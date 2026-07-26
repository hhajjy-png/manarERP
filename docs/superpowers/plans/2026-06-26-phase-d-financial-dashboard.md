# Phase D — Financial Executive Enhancements: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add a dedicated Financial Operations Dashboard page that surfaces contract profitability, expense breakdown by category, customer analytics, and revenue-vs-expense trends — all computed from existing data, with no new data layer.

**Architecture:** A new `FinancialExecService` class (inside the existing `executive` module folder) runs targeted Prisma aggregations. Three new GET endpoints are added to the existing executive router. A new frontend page `FinancialOperationsDashboard.tsx` renders the data using Recharts (already installed). The existing `ExecutiveDecisionCenter` page and `ExecutiveService` are not modified.

**Tech Stack:** Express, Prisma, Zod, Recharts 3.8.1 (existing), React 18, TypeScript.

**See also:** Master plan — `2026-06-26-operations-suite-master-plan.md`

## Global Constraints

- Do NOT modify `ExecutiveService` or `ExecutiveDecisionCenter.tsx`.
- Do NOT duplicate existing `FinancialService` aging queries — call the existing service or replicate only what it can't provide.
- All data computed locally from SQLite; no external calls.
- Route permission reuses `financialdashboard.read` (already seeded for GM, Accountant).
- `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` must pass after every task.

---

## Repository Snapshot

### What already exists (DO NOT REBUILD)

| Existing asset | What it provides |
|---|---|
| `ExecutiveService.decisionCenter()` | topContractsByProfit (top 5), topCustomersByRevenue, topDebtors, KPIs |
| `ExecutiveService.kpiTimeline()` | Monthly revenue/expense/collections trend |
| `FinancialService.getArAging()` | AR aging buckets per customer |
| `FinancialService.getApAging()` | AP aging buckets per supplier |
| `financial.routes.ts` `/ar-aging`, `/ap-aging` | Existing AR/AP aging endpoints |
| `executive.routes.ts` `/decision-center`, `/kpi-timeline` | Existing executive endpoints |

### What is NEW in Phase D

| New asset | What it provides |
|---|---|
| `GET /api/executive/contract-profitability` | All contracts with revenue, expenses, margin, collection rate |
| `GET /api/executive/expense-breakdown` | Expenses grouped by category, sorted by total |
| `GET /api/executive/customer-analytics` | All customers with revenue, collected, outstanding, invoice count |
| `FinancialOperationsDashboard.tsx` | New page combining the above into a tabbed dashboard |

### Files to create

| Path | Purpose |
|---|---|
| `backend/src/modules/executive/financial-exec.service.ts` | New aggregations |
| `backend/src/modules/executive/__tests__/financial-exec.service.test.ts` | Unit tests |
| `frontend/src/pages/FinancialOperationsDashboard.tsx` | New dashboard page |

### Files to modify

| Path | Change |
|---|---|
| `backend/src/modules/executive/executive.routes.ts` | Add 3 new routes |
| `frontend/src/App.tsx` | Add `/financial-ops` route |
| `frontend/src/components/Layout.tsx` | Add sidebar entry |

---

## Task D-1 — FinancialExecService

**Files:**
- Create: `backend/src/modules/executive/financial-exec.service.ts`
- Test: `cd backend && npx tsc --noEmit`

**Interfaces — produces:**
```typescript
export interface ContractProfitRow {
  id: number; code: string; asphaltPlant: string;
  customerName: string | null;
  revenue: number; collected: number; expenses: number;
  profit: number; profitMargin: number | null; collectionRate: number | null;
}
export interface ExpenseCategoryRow {
  category: string; total: number; count: number; pct: number;
}
export interface CustomerAnalyticsRow {
  id: number; name: string; code: string;
  revenue: number; collected: number; outstanding: number;
  invoiceCount: number; collectionRate: number | null;
}
export class FinancialExecService {
  async contractProfitability(): Promise<ContractProfitRow[]>
  async expenseBreakdown(): Promise<ExpenseCategoryRow[]>
  async customerAnalytics(): Promise<CustomerAnalyticsRow[]>
}
```

- [ ] **Step 1:** Create `backend/src/modules/executive/financial-exec.service.ts`:

```typescript
import { prisma } from '@config/database';

const r3 = (v: number) => Math.round(v * 1000) / 1000;
const n  = (v: unknown) => Number(v ?? 0);
const safe = (num: number, den: number): number | null =>
  den > 0 ? r3((num / den) * 100) : null;

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
    const [contracts, invGroups, expGroups] = await Promise.all([
      prisma.contract.findMany({
        select: {
          id: true, code: true, asphaltPlant: true,
          customer: { select: { name: true } },
        },
        orderBy: { id: 'desc' },
      }),
      prisma.invoice.groupBy({
        by: ['contractId'],
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, contractId: { not: null } },
        _sum: { total: true, paidAmount: true },
      }),
      prisma.expense.groupBy({
        by: ['contractId'],
        where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] }, contractId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const invMap = new Map(invGroups.map(g => [g.contractId!, { rev: n(g._sum.total), col: n(g._sum.paidAmount) }]));
    const expMap = new Map(expGroups.map(g => [g.contractId!, n(g._sum.amount)]));

    return contracts.map(c => {
      const inv  = invMap.get(c.id) ?? { rev: 0, col: 0 };
      const exp  = expMap.get(c.id) ?? 0;
      const profit = r3(inv.rev - exp);
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
      where: { status: { notIn: ['REJECTED', 'CANCELLED', 'REVERSED'] } },
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    const grandTotal = groups.reduce((acc, g) => acc + n(g._sum.amount), 0);

    return groups.map(g => ({
      category: g.category,
      total:    r3(n(g._sum.amount)),
      count:    g._count._all,
      pct:      grandTotal > 0 ? r3((n(g._sum.amount) / grandTotal) * 100) : 0,
    }));
  }

  async customerAnalytics(): Promise<CustomerAnalyticsRow[]> {
    const [customers, invGroups] = await Promise.all([
      prisma.customer.findMany({
        where: { isArchived: false },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.invoice.groupBy({
        by: ['customerId'],
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, customerId: { not: null } },
        _sum: { total: true, paidAmount: true },
        _count: { _all: true },
      }),
    ]);

    const invMap = new Map(
      invGroups.map(g => [
        g.customerId!,
        { rev: n(g._sum.total), col: n(g._sum.paidAmount), cnt: g._count._all },
      ]),
    );

    return customers
      .map(c => {
        const inv = invMap.get(c.id) ?? { rev: 0, col: 0, cnt: 0 };
        const outstanding = r3(inv.rev - inv.col);
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
```

- [ ] **Step 2:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit:

```
git add backend/src/modules/executive/financial-exec.service.ts
git commit -m "feat(executive): add FinancialExecService"
```

---

## Task D-2 — New executive routes

**Files:**
- Modify: `backend/src/modules/executive/executive.routes.ts`
- Test: `cd backend && npx tsc --noEmit`

- [ ] **Step 1:** In `executive.routes.ts`, import the new service and add 3 new routes:

```typescript
import { financialExecService } from './financial-exec.service';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';

// Add after existing routes:

router.get(
  '/contract-profitability',
  requirePermission('financialdashboard.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await financialExecService.contractProfitability());
  }),
);

router.get(
  '/expense-breakdown',
  requirePermission('financialdashboard.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await financialExecService.expenseBreakdown());
  }),
);

router.get(
  '/customer-analytics',
  requirePermission('financialdashboard.read'),
  asyncHandler(async (_req, res) => {
    ok(res, await financialExecService.customerAnalytics());
  }),
);
```

- [ ] **Step 2:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit:

```
git add backend/src/modules/executive/executive.routes.ts
git commit -m "feat(executive): add contract-profitability, expense-breakdown, customer-analytics routes"
```

---

## Task D-3 — Backend unit tests

**Files:**
- Create: `backend/src/modules/executive/__tests__/financial-exec.service.test.ts`
- Test: `cd backend && npm test`

- [ ] **Step 1:** Create the test file:

```typescript
import { describe, it, expect } from 'vitest';
import { FinancialExecService } from '../financial-exec.service';

const svc = new FinancialExecService();

describe('FinancialExecService.contractProfitability', () => {
  it('returns an array', async () => {
    const rows = await svc.contractProfitability();
    expect(Array.isArray(rows)).toBe(true);
  });
  it('each row has required fields', async () => {
    const rows = await svc.contractProfitability();
    if (rows.length === 0) return;
    const r = rows[0];
    expect(typeof r.id).toBe('number');
    expect(typeof r.revenue).toBe('number');
    expect(typeof r.profit).toBe('number');
  });
});

describe('FinancialExecService.expenseBreakdown', () => {
  it('returns rows sorted by total descending', async () => {
    const rows = await svc.expenseBreakdown();
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].total).toBeLessThanOrEqual(rows[i - 1].total);
    }
  });
  it('pct values sum to ~100 (or 0 if no data)', async () => {
    const rows = await svc.expenseBreakdown();
    if (rows.length === 0) return;
    const sum = rows.reduce((a, r) => a + r.pct, 0);
    expect(sum).toBeCloseTo(100, 0);
  });
});

describe('FinancialExecService.customerAnalytics', () => {
  it('returns an array', async () => {
    const rows = await svc.customerAnalytics();
    expect(Array.isArray(rows)).toBe(true);
  });
});
```

- [ ] **Step 2:** Run tests:

```
cd backend && npm test
```

Expected: all new tests PASS.

- [ ] **Step 3:** Commit:

```
git add backend/src/modules/executive/__tests__/financial-exec.service.test.ts
git commit -m "test(executive): add FinancialExecService unit tests"
```

---

## Task D-4 — Frontend: FinancialOperationsDashboard page

**Files:**
- Create: `frontend/src/pages/FinancialOperationsDashboard.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/Layout.tsx`
- Test: `cd frontend && npx tsc --noEmit`, visual check

**Interfaces — consumes:**
- `GET /api/executive/contract-profitability` → `ContractProfitRow[]`
- `GET /api/executive/expense-breakdown` → `ExpenseCategoryRow[]`
- `GET /api/executive/customer-analytics` → `CustomerAnalyticsRow[]`
- `GET /api/executive/kpi-timeline?period=12m` → existing shape (reuse for trend chart)

- [ ] **Step 1:** Create `frontend/src/pages/FinancialOperationsDashboard.tsx`. The page must:

  1. Render a tab bar with 4 tabs: "ربحية العقود" / "تحليل المصروفات" / "تحليل العملاء" / "الاتجاهات".
  2. **Tab 1 — Contract Profitability:**
     - Table columns: Code, Contract (asphaltPlant), Customer, Revenue, Expenses, Profit, Margin %, Collection Rate.
     - Margin % colored: green if >20%, amber if 5–20%, red if <5%.
     - Revenue and profit values formatted as KWD with 3 decimals.
  3. **Tab 2 — Expense Breakdown:**
     - Recharts `BarChart` (horizontal) with categories on Y-axis and total on X-axis.
     - Below the chart: a table with columns: Category, Total KWD, Count, %.
     - Category labels translated to Arabic using a lookup map (see below).
  4. **Tab 3 — Customer Analytics:**
     - Table columns: Customer, Code, Revenue, Collected, Outstanding, Invoice Count, Collection Rate.
     - Outstanding colored red if > 0.
  5. **Tab 4 — Trends:**
     - Call `GET /api/executive/kpi-timeline?period=12m`.
     - Render a Recharts `LineChart` with lines for revenue, expenses, profit.

Arabic category labels:
```typescript
const CATEGORY_AR: Record<string, string> = {
  FUEL:           'وقود',
  SALARIES:       'رواتب',
  MAINTENANCE:    'صيانة',
  RENT:           'إيجار',
  PURCHASES:      'مشتريات',
  EQUIPMENT:      'معدات',
  SERVICES:       'خدمات',
  EQUIPMENT_RENT: 'إيجار معدات',
  TRUCK_RENT:     'إيجار شاحنات',
  OTHER:          'أخرى',
};
```

Money formatter:
```typescript
function money(v: number): string {
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} د.ك`;
}
function pct(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}
```

- [ ] **Step 2:** In `frontend/src/App.tsx`, add:

```tsx
import FinancialOperationsDashboard from './pages/FinancialOperationsDashboard';
// Inside ProtectedRoute block:
<Route path="/financial-ops" element={<ProtectedRoute><FinancialOperationsDashboard /></ProtectedRoute>} />
```

- [ ] **Step 3:** In `frontend/src/components/Layout.tsx`, add a sidebar entry for `/financial-ops` under the financial section.

- [ ] **Step 4:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Launch app, navigate to `/financial-ops`. Confirm all 4 tabs load data. Check that the bar chart renders, margin % coloring works, and the trends line chart shows 12 months.

- [ ] **Step 6:** Commit:

```
git add frontend/src/pages/FinancialOperationsDashboard.tsx frontend/src/App.tsx frontend/src/components/Layout.tsx
git commit -m "feat(executive): add FinancialOperationsDashboard page"
```

---

## Phase D Summary

| | Count |
|---|---|
| Files created | 3 |
| Files modified | 3 |
| Estimated new LOC | ~550 |
| Prisma migrations | 0 |
| Backend changes | Yes — new service + 3 routes |
| Electron changes | None |

**Risks:**
- Large datasets (many contracts/customers) may produce slow page loads. The queries use `groupBy` which Prisma executes efficiently; however, if the contract count exceeds 500, add server-side pagination to the contract profitability endpoint.
- The existing `ExecutiveDecisionCenter` also shows `topContractsByProfit` (top 5). This new page shows **all** contracts. There is no duplication — they serve different purposes.

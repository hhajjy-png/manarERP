# Financial Center Phase 2 — Master Specification

**Date:** 2026-06-24
**Status:** Approved for Implementation (Post Self-Review v1.1)
**Scope:** Financial Center (Phase 2) — Statement Center Phase 2, AR/AP Aging, GL Statement, Trial Balance, Journal Book, Financial Reports Tab, Financial Dashboard Tab

---

## Table of Contents

1. [Overview & Scope](#1-overview--scope)
2. [Architecture Principles](#2-architecture-principles)
3. [Folder Structure](#3-folder-structure)
4. [Shared Services Layer](#4-shared-services-layer)
5. [Unified Response Shape](#5-unified-response-shape)
6. [Backend: Financial Module](#6-backend-financial-module)
7. [Frontend: Financial Center](#7-frontend-financial-center)
8. [Frontend: Dashboard.tsx Changes](#8-frontend-dashboardtsx-changes)
9. [Permissions](#9-permissions)
10. [Audit Logging](#10-audit-logging)
11. [Caching](#11-caching)
12. [DrillDown System](#12-drilldown-system)
13. [URL State System](#13-url-state-system)
14. [Export Pipeline](#14-export-pipeline)
15. [Migration Strategy](#15-migration-strategy)
16. [Database](#16-database)
17. [Testing](#17-testing)
18. [Risks](#18-risks)
19. [Future Extensions](#19-future-extensions)

---

## 1. Overview & Scope

### 1.1 Goal

Build the **Financial Center** — a unified professional financial reporting hub for manarERP that rivals SAP Business One and Microsoft Dynamics 365 BC in reporting depth, while maintaining manarERP's offline-first, SQLite/Prisma/Express/React/Electron architecture.

### 1.2 What This Spec Covers

| Feature | Description |
|---------|-------------|
| Statement Center Phase 2 | Hierarchical grouping (Year→Month→Detail), PDF export, Hide Settled, DrillDown |
| AR Aging Center | Receivables aging with configurable buckets, DrillDown, Dashboard cards |
| AP Aging Center | Payables aging, same pattern as AR |
| GL Statement | Journal Entry Lines as source of truth, DrillDown to source documents |
| General Ledger Report | Multi-account GL report with pagination |
| Trial Balance | Dual mode: As-of Date + Period, imbalance warning |
| Journal Book | Paginated, expandable entries, expandAll/collapseAll |
| Financial Reports Tab | Financial Summary, placeholder architecture for future reports |
| Financial Dashboard Tab | New "مالي" tab in existing Dashboard, lightweight cached summary |
| DrillDown System | Navigate to source document, max 3 clicks, state restoration |
| Migration Path | /statements stays, banner phase, redirect phase |

### 1.3 What This Spec Does NOT Cover

- Modification of `/statements`, `/reports`, `/accounting` existing endpoints
- Print Designer integration (deferred)
- Balance Sheet, Cash Flow, P&L full reports (architecture placeholders only)
- Cost Centers (future extension)
- Approval Engine (untouched)
- Statement Engine `buildStatement()` (untouched)

### 1.4 Dependencies (All Existing — No New Libraries)

| Dependency | Usage |
|------------|-------|
| Prisma + SQLite | All new queries |
| ExcelJS (`buildExcel()`) | All Excel exports |
| PDFKit (`buildPdf()`) | All PDF exports |
| Express | New financial module routes |
| Zod | Request validation |
| React + Recharts | Frontend charts |
| React Router (HashRouter) | Navigation + URL state |

---

## 2. Architecture Principles

### 2.1 Financial Module = Orchestrator, Not Owner

The `financial` module **never re-implements** business logic owned by other modules.

| If you need | Use |
|-------------|-----|
| Customer/Supplier statement | Call `buildStatement()` from `statement.service.ts` |
| Journal entry list | Call `accountingService.listJournalEntries()` |
| Financial summary | Call `accountingService.financialSummary()` |
| Aging calculation | Call `calculateAgingBuckets()` from `shared/financial/aging.utils.ts` |
| Running balance | Call `calculateRunningBalances()` from `shared/financial/balance.utils.ts` |
| Excel/PDF export | Call `buildExcel()` / `buildPdf()` from `shared/services/reportEngine/` |

The only case where `financial.service.ts` queries Prisma directly: features that no other module owns (GL Statement queries on `JournalEntryLine`, Trial Balance aggregations, Dashboard Summary aggregations).

### 2.2 No Duplication — Shared Services for Common Logic

If the same logic is needed in two places: **extract to Shared Service**, never copy.

### 2.3 Backward Compatibility is Non-Negotiable

- Existing endpoints (`/statements/*`, `/reports/*`, `/accounting/*`) are untouched
- New endpoints are additive only: `/financial/*`
- Existing Frontend pages are untouched (except minimal `?highlight=` + Return button addition)

### 2.4 Unified Response Shape

All `/financial/*` endpoints return `FinancialResponse<T>` (see Section 5). One exception: GL Report returns `GlReportResponse` (not nested FinancialResponse).

### 2.5 Max 3 Clicks from Report to Source Document

Every financial report must allow reaching the original source document within 3 navigation steps. This is enforced in the DrillDown chain design (see Section 12).

### 2.6 URL = Single Source of Truth for Financial Center State

All tab state, sub-tab state, entity selections, date filters, and mode toggles live in the URL. No React state for top-level navigation. This enables Back/Forward, bookmark sharing, and Refresh-safe state.

---

## 3. Folder Structure

### 3.1 Backend (New Files Only)

```
backend/src/modules/financial/
  financial.routes.ts           ← Express router with authenticate + requirePermission per endpoint
  financial.controller.ts       ← Thin handlers: validate → call service → successResponse
  financial.service.ts          ← Orchestrator: calls existing services + Prisma for GL/Trial
  financial.schema.ts           ← Zod schemas for all query params
  financial.types.ts            ← FinancialResponse<T>, DrillDownRef, all shared types

backend/src/shared/services/financial/
  balance.utils.ts              ← calculateRunningBalances, calculateClosingBalance, sumDebitCredit, normalizeMoney
  aging.utils.ts                ← calculateAgingBuckets (configurable buckets)
  drilldown.utils.ts            ← buildDrillDownRef (referenceType → route + label)
  financial.response.ts         ← wrapFinancialResponse<T>() helper
  summary.utils.ts              ← Financial summary computation helpers
  dashboard-summary.service.ts  ← Aggregation service for Dashboard (with in-memory cache)

backend/src/shared/services/financial/export/
  statement.export.adapter.ts   ← Maps FinancialResponse<StatementRow> → ReportInput
  gl.export.adapter.ts          ← Maps FinancialResponse<GlStatementRow> → ReportInput
  aging.export.adapter.ts       ← Maps FinancialResponse<AgingRow> → ReportInput
  trial.export.adapter.ts       ← Maps TrialBalance data → ReportInput
  journal.export.adapter.ts     ← Maps JournalBook data → ReportInput
  summary.export.adapter.ts     ← Maps Financial Summary → ReportInput
```

### 3.2 Frontend (New Files Only)

```
frontend/src/pages/
  FinancialCenter.tsx           ← Main page, route /financial

frontend/src/api/
  financial.ts                  ← All API calls to /financial/* endpoints

frontend/src/components/financial/
  FinancialTabs.tsx             ← Dynamic tab bar (RBAC-driven, shows only permitted tabs)
  StatementTable.tsx            ← Reusable statement table (extracted, shared)
  SummaryCards.tsx              ← Reusable summary cards row
  FilterBar.tsx                 ← Reusable filter bar (date range, search, entity selector)
  GroupedTable.tsx              ← Year → Month → Detail hierarchical table
  DrillDownLink.tsx             ← Navigate + sessionStorage state save
  ExportBar.tsx                 ← Excel | PDF | Print buttons
  ReturnToReportButton.tsx      ← "العودة إلى التقرير" button (used in 5 existing pages)
  AgingTable.tsx                ← AR/AP aging colored table
  AgingSummaryCards.tsx         ← Aging-specific summary cards
  AgingChart.tsx                ← Recharts bar chart for bucket distribution
  AccountSelector.tsx           ← Dropdown for GL account selection
  TrialBalanceTable.tsx         ← Columns change based on mode
  ModeToggle.tsx                ← Toggle between as-of / period modes
  ImbalanceAlert.tsx            ← Trial Balance imbalance warning banner
  JournalBookTable.tsx          ← Expandable journal entries
  FinancialReportsTab.tsx       ← Financial summary + future report placeholders
  FinancialDashboardTab.tsx     ← "مالي" Tab content for Dashboard

frontend/src/hooks/
  useHighlight.ts               ← ?highlight= URL param handler + scroll + CSS
```

---

## 4. Shared Services Layer

### 4.1 balance.utils.ts

```typescript
export function calculateRunningBalances<T extends { debit: number; credit: number }>(
  openingBalance: number,
  entries: T[]
): (T & { runningBalance: number })[] {
  let balance = openingBalance;
  return entries.map(entry => {
    balance = normalizeMoney(balance + entry.debit - entry.credit);
    return { ...entry, runningBalance: balance };
  });
}

export function calculateClosingBalance(
  openingBalance: number,
  totalDebit: number,
  totalCredit: number
): number {
  return normalizeMoney(openingBalance + totalDebit - totalCredit);
}

export function sumDebitCredit<T extends { debit: number; credit: number }>(
  entries: T[]
): { totalDebit: number; totalCredit: number } {
  return entries.reduce(
    (acc, e) => ({ totalDebit: acc.totalDebit + e.debit, totalCredit: acc.totalCredit + e.credit }),
    { totalDebit: 0, totalCredit: 0 }
  );
}

export function normalizeMoney(value: number): number {
  return Math.round(value * 1000) / 1000;  // KWD: 3 decimal places
}
```

**Rule:** `calculateOpeningBalance()` is NOT a shared utility. Opening balance calculation differs per report type (customer statement: invoices - payments; GL statement: journal lines; supplier: invoices + expenses - payments). Each builder/service computes its own opening balance.

### 4.2 aging.utils.ts

```typescript
export interface AgingBucket {
  key: string;       // e.g. 'current', '0_30', 'over_120'
  min: number;       // inclusive, days overdue (-Infinity for current)
  max: number;       // inclusive, days overdue (Infinity for last bucket)
  label: string;     // display label e.g. '0–30 يوم'
}

export const DEFAULT_AGING_BUCKETS: AgingBucket[] = [
  { key: 'current',   min: -Infinity, max: -1,  label: 'جاري'       },
  { key: '0_30',      min: 0,         max: 30,  label: '0–30 يوم'   },
  { key: '31_60',     min: 31,        max: 60,  label: '31–60 يوم'  },
  { key: '61_90',     min: 61,        max: 90,  label: '61–90 يوم'  },
  { key: '91_120',    min: 91,        max: 120, label: '91–120 يوم' },
  { key: 'over_120',  min: 121,       max: Infinity, label: '+120 يوم' },
];

export type AgingBuckets = Record<string, number> & { total: number };

export function calculateAgingBuckets(
  invoices: { dueDate: Date; outstandingAmount: number }[],
  asOfDate: Date,
  buckets: AgingBucket[] = DEFAULT_AGING_BUCKETS
): AgingBuckets {
  const result: AgingBuckets = { total: 0 };
  for (const b of buckets) result[b.key] = 0;

  for (const inv of invoices) {
    if (inv.outstandingAmount <= 0) continue;  // only include positive outstanding
    const daysOverdue = differenceInDays(asOfDate, inv.dueDate);
    const bucket = buckets.find(b => daysOverdue >= b.min && daysOverdue <= b.max);
    if (bucket) {
      result[bucket.key] = normalizeMoney(result[bucket.key] + inv.outstandingAmount);
      result.total = normalizeMoney(result.total + inv.outstandingAmount);
    }
  }
  return result;
}

function differenceInDays(dateA: Date, dateB: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((dateA.getTime() - dateB.getTime()) / msPerDay);
}
```

**Rule:** Outstanding is determined by `invoice.total - invoice.paidAmount`. The filter `outstanding > 0` is applied by `calculateAgingBuckets` (not by the caller). This is the single point of truth for outstanding amount. If a future Allocation or Credit Note engine is introduced, only the caller's outstanding computation changes — the aging bucket logic is untouched.

### 4.3 drilldown.utils.ts

```typescript
export interface DrillDownRef {
  entityType: 'INVOICE' | 'EXPENSE' | 'PAYMENT' | 'JOURNAL_ENTRY' | 'CONTRACT' | 'CUSTOMER' | 'SUPPLIER' | 'GL_ACCOUNT';
  entityId: number;
  route?: string;    // optional — undefined if page doesn't exist yet
  label: string;
}

const DRILL_DOWN_ROUTES: Partial<Record<DrillDownRef['entityType'], string>> = {
  INVOICE:       '/invoices',
  EXPENSE:       '/expenses',
  PAYMENT:       '/invoices',       // Payment context is within the invoice page
  JOURNAL_ENTRY: '/accounting',
  CONTRACT:      '/contracts',
  CUSTOMER:      '/customers',
  SUPPLIER:      '/suppliers',
  GL_ACCOUNT:    '/financial',      // Internal navigation within Financial Center
};

export function buildDrillDownRef(
  entityType: DrillDownRef['entityType'],
  entityId: number,
  labelOverride?: string
): DrillDownRef {
  return {
    entityType,
    entityId,
    route: DRILL_DOWN_ROUTES[entityType],  // undefined if not in map
    label: labelOverride ?? `${entityType}-${entityId}`,
  };
}
```

### 4.4 financial.response.ts

```typescript
export function wrapFinancialResponse<T extends FinancialRow>(input: {
  reportType: string;
  summary: FinancialSummary;
  metadata?: Record<string, unknown>;
  filters: Record<string, unknown>;
  rows: T[];
  totals?: Partial<T>;
  pagination?: FinancialPagination;
}): FinancialResponse<T> {
  return {
    ...input,
    generatedAt: new Date().toISOString(),
  };
}
```

### 4.5 summary.utils.ts

Helpers for financial summary computation used by `financial.service.ts` when orchestrating `accountingService.financialSummary()`. Keeps formatting and computation logic out of the service.

```typescript
export function formatFinancialSummaryForReport(
  raw: AccountingFinancialSummary,
  filters: { fromDate?: string; toDate?: string }
): FinancialResponse<never> { /* ... */ }
```

### 4.6 dashboard-summary.service.ts

```typescript
// In-memory cache: refreshed every 45 seconds
let cache: { data: DashboardSummary; expiresAt: number } | null = null;
const CACHE_TTL_MS = 45_000;

class DashboardSummaryService {
  async getSummary(): Promise<DashboardSummary> {
    if (cache && Date.now() < cache.expiresAt) return cache.data;
    const data = await this.computeSummary();
    cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
    return data;
  }

  private async computeSummary(): Promise<DashboardSummary> {
    // All aggregation queries run in parallel via Promise.all
    // Returns: arSummary, apSummary, topCustomers, topSuppliers,
    //          collectionsLast30, paymentsLast30, activeAccountsCount
    // ⚠️ M3 FIX: Always use Prisma tagged template literals for $queryRaw.
    //   NEVER use string concatenation: prisma.$queryRaw(`SELECT ... ${userInput}`) is SQL injection.
    //   CORRECT: prisma.$queryRaw`SELECT ... WHERE id = ${safeId}` (tagged template = parameterized)
    // See Section 6 for full query details
  }

  // ⚠️ M7 FIX: No active cache invalidation — time-based TTL only (45 seconds).
  // Active invalidation would require other modules to import financialModule, creating coupling.
  // 45s TTL is acceptable for a Dashboard summary (not real-time data).
  // The 'generatedAt' field in DashboardSummary shows users when data was last computed.
}

export const dashboardSummaryService = new DashboardSummaryService();
```

---

## 5. Unified Response Shape

### 5.1 Core Types

```typescript
// financial.types.ts

export interface DrillDownRef {
  entityType: string;
  entityId: number;
  route?: string;
  label: string;
}

export interface FinancialRow {
  id: string;
  [key: string]: unknown;
  drillDown?: DrillDownRef;
}

export interface FinancialSummary {
  openingBalance?: number;
  totalDebit?: number;
  totalCredit?: number;
  closingBalance?: number;
  transactionCount?: number;
  totalOutstanding?: number;
  criticalOver90?: number;
  [key: string]: number | undefined;
}

export interface FinancialPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface FinancialResponse<T extends FinancialRow = FinancialRow> {
  reportType: string;
  generatedAt: string;                    // ISO timestamp
  filters: Record<string, unknown>;       // Applied filters (for display in exported report)
  summary: FinancialSummary;
  rows: T[];
  totals?: Partial<T>;                    // Optional totals row
  metadata?: Record<string, unknown>;     // Report-specific extra data
  pagination?: FinancialPagination;       // Optional, for Journal Book & GL Report
}
```

### 5.2 GL Report Exception

GL Report does NOT nest `FinancialResponse<FinancialResponse>`. It uses a flat dedicated type:

```typescript
export interface GlReportAccount {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rows: GlStatementRow[];
}

export interface GlReportResponse {
  generatedAt: string;
  filters: Record<string, unknown>;
  accounts: GlReportAccount[];
  summary: { totalAccounts: number; fromDate?: string; toDate?: string };
  pagination: FinancialPagination;
}
```

### 5.3 Row Types Per Report

```typescript
export interface StatementRow extends FinancialRow {
  date: string;
  reference: string;
  referenceType: string;
  referenceId?: number;
  journalEntryId?: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
  entityName?: string;
  entityCode?: string;
}

export interface ArAgingRow extends FinancialRow {
  customerId: number;
  customerCode: string;
  customerName: string;
  current: number;
  '0_30': number;
  '31_60': number;
  '61_90': number;
  '91_120': number;
  over_120: number;
  total: number;
  lastInvoiceDate?: string;
  invoiceCount: number;
}

export interface ApAgingRow extends FinancialRow {
  supplierId: number;
  supplierCode: string;
  supplierName: string;
  current: number;
  '0_30': number;
  '31_60': number;
  '61_90': number;
  '91_120': number;
  over_120: number;
  total: number;
  lastInvoiceDate?: string;
  invoiceCount: number;
}

export interface GlStatementRow extends FinancialRow {
  date: string;
  journalNumber: string;
  journalEntryId: number;
  referenceType: string;
  referenceId?: number;
  description: string;
  debit: number;
  credit: number;
  runningBalance: number;
  status: string;
}

export interface TrialBalanceAsOfRow extends FinancialRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  totalDebit: number;
  totalCredit: number;
  balance: number;
  balanceType: 'DEBIT' | 'CREDIT';
}

export interface TrialBalancePeriodRow extends FinancialRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: 'DEBIT' | 'CREDIT';
  openingBalance: number;
  periodDebit: number;
  periodCredit: number;
  closingBalance: number;
}

export interface JournalBookRow extends FinancialRow {
  entryNumber: string;
  date: string;
  description: string;
  referenceType: string;
  referenceId?: number;
  status: string;
  totalDebit: number;
  totalCredit: number;
  lineCount: number;
  lines: {
    accountCode: string;
    accountName: string;
    description?: string;
    debit: number;
    credit: number;
  }[];
}
```

---

## 6. Backend: Financial Module

### 6.1 Route Registration

```typescript
// backend/src/app.ts — add:
import financialRouter from '@modules/financial/financial.routes';
app.use('/api/financial', financialRouter);
```

### 6.2 All Endpoints

```
# Statement Center Phase 2
GET /financial/statements/:entityType/:id
    Permission: statements.read
    Params:     entityType = 'customer' | 'supplier'
    Query:      fromDate?, toDate?, search?, referenceType?

GET /financial/statements/:entityType/:id/export
    Permission: statements.export
    Query:      format=pdf|excel, + same filters as above

# AR Aging
GET /financial/ar-aging
    Permission: aging.read
    Query:      asOfDate?, search?, customerType?, hideZero?

GET /financial/ar-aging/export
    Permission: aging.export
    Query:      format=pdf|excel, + same filters

# AP Aging
GET /financial/ap-aging
    Permission: aging.read
    Query:      asOfDate?, search?, hideZero?

GET /financial/ap-aging/export
    Permission: aging.export
    Query:      format=pdf|excel, + same filters

# GL Statement (single account)
GET /financial/gl-statement/:accountId
    Permission: gl.read
    Query:      fromDate?, toDate?, search?, status?

GET /financial/gl-statement/:accountId/export
    Permission: gl.export
    Query:      format=pdf|excel, + same filters

# General Ledger Report (all accounts)
GET /financial/gl-report
    Permission: gl.read
    Query:      fromDate?, toDate?, accountType?, page?, pageSize?

GET /financial/gl-report/export
    Permission: gl.export
    Query:      format=pdf|excel, fromDate?, toDate?, accountType?

# Trial Balance
GET /financial/trial-balance
    Permission: trialbalance.read
    Query:      mode=as-of|period (required), asOfDate?, fromDate?, toDate?,
                showZeroBalances?, accountType?

GET /financial/trial-balance/export
    Permission: trialbalance.export
    Query:      format=pdf|excel, + same filters

# Journal Book
GET /financial/journal-book
    Permission: journal.read
    Query:      fromDate?, toDate?, status?, referenceType?, search?, page?, pageSize?

GET /financial/journal-book/export
    Permission: journal.export
    Query:      format=pdf|excel, fromDate?, toDate?, status?, referenceType?, search?

# Financial Summary (Tab 6)
GET /financial/summary
    Permission: finreports.read
    Query:      fromDate?, toDate?

GET /financial/summary/export
    Permission: finreports.export
    Query:      format=pdf|excel, fromDate?, toDate?

# Dashboard Summary (lightweight, cached)
GET /financial/dashboard-summary
    Permission: financialdashboard.read
    Query:      — (always today)
```

### 6.3 financial.service.ts — Service Methods

```typescript
class FinancialService {

  // ── Statement (orchestrates buildStatement) ──────────────────────────────
  async getStatement(entityType, entityId, filters): Promise<FinancialResponse<StatementRow>>
  async exportStatement(entityType, entityId, filters, format): Promise<Buffer>

  // ── AR Aging (queries Prisma directly — no existing service owns this) ──
  async getArAging(filters): Promise<FinancialResponse<ArAgingRow>>
  async exportArAging(filters, format): Promise<Buffer>

  // ── AP Aging (same pattern) ──────────────────────────────────────────────
  async getApAging(filters): Promise<FinancialResponse<ApAgingRow>>
  async exportApAging(filters, format): Promise<Buffer>

  // ── GL Statement (queries JournalEntryLine directly) ────────────────────
  async getGlStatement(accountId, filters): Promise<FinancialResponse<GlStatementRow>>
  async exportGlStatement(accountId, filters, format): Promise<Buffer>

  // ── GL Report (⚠️ M2 FIX: does NOT call getGlStatement N times)
  // Returns account list with totals only. Full lines fetched per-account on expand (frontend request).
  async getGlReport(filters): Promise<GlReportResponse>
  async exportGlReport(filters, format): Promise<Buffer>

  // ── Trial Balance (queries JournalEntryLine via groupBy) ─────────────────
  async getTrialBalance(filters): Promise<FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow>>
  async exportTrialBalance(filters, format): Promise<Buffer>

  // ── Journal Book (orchestrates accounting.service.listJournalEntries) ───
  async getJournalBook(filters): Promise<FinancialResponse<JournalBookRow>>
  async exportJournalBook(filters, format): Promise<Buffer>

  // ── Financial Summary (orchestrates accountingService.financialSummary) ─
  async getFinancialSummary(filters): Promise<FinancialResponse<never>>
  async exportFinancialSummary(filters, format): Promise<Buffer>

  // ── Dashboard Summary (delegates to dashboardSummaryService) ─────────────
  async getDashboardSummary(): Promise<DashboardSummary>
}
```

### 6.4 Statement Method Detail

```typescript
async getStatement(entityType, entityId, filters) {
  // 1. Call buildStatement() from statement.service — NO COPY
  const result = await buildStatement({
    entityType: entityType.toUpperCase(),
    entityId,
    filters: pick(filters, ['fromDate', 'toDate', 'search', 'referenceType']),
  });

  // 2. Add DrillDown refs — orchestration only
  const rows = result.entries.map(entry => ({
    id:             `STMT-${entry.referenceType}-${entry.referenceId}`,
    date:           entry.date.toISOString(),
    reference:      entry.reference,
    referenceType:  entry.referenceType,
    referenceId:    entry.referenceId,
    description:    entry.description,
    debit:          entry.debit,
    credit:         entry.credit,
    runningBalance: entry.runningBalance,
    status:         entry.status,
    // ⚠️ M4 FIX: Use composite ID to avoid 'STMT-INVOICE-undefined' for manual entries
    id: entry.referenceId
      ? `STMT-${entry.referenceType}-${entry.referenceId}`
      : `STMT-${entry.referenceType}-${new Date(entry.date).getTime()}`,
    drillDown:      buildDrillDownRef(entry.referenceType as DrillDownRef['entityType'], entry.referenceId),
  }));

  // 3. Return unified shape
  return wrapFinancialResponse({
    reportType: 'statement',
    summary: result.summary,
    metadata: {
      entityType: result.entityType,
      entityName: result.entityName,
      entityCode: result.entityCode,
      fromDate:   result.fromDate,
      toDate:     result.toDate,
    },
    filters,
    rows,
    totals: {
      id:          'TOTALS',
      description: 'الإجمالي',
      debit:       result.summary.totalDebit,
      credit:      result.summary.totalCredit,
      runningBalance: result.summary.closingBalance,
    },
  });
}
```

### 6.5 GL Statement Method Detail

```typescript
async getGlStatement(accountId, filters) {
  // 1. Account info (throws 404 if not found)
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    include: { parent: { select: { code: true, name: true } } },
  });

  // 2. Opening Balance
  const openingAgg = await prisma.journalEntryLine.aggregate({
    where: {
      accountId,
      journalEntry: {
        status: 'POSTED',
        ...(filters.fromDate && { date: { lt: new Date(filters.fromDate) } }),
      },
    },
    _sum: { debit: true, credit: true },
  });
  const openingBalance = normalizeMoney((openingAgg._sum.debit ?? 0) - (openingAgg._sum.credit ?? 0));

  // 3. Lines in period (account with no movement returns empty array — no 404)
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId,
      journalEntry: {
        status: filters.status ? { in: [filters.status] } : { not: 'CANCELLED' },
        ...(filters.fromDate && { date: { gte: new Date(filters.fromDate) } }),
        ...(filters.toDate   && { date: { lte: new Date(filters.toDate)   } }),
        ...(filters.search && {
          OR: [
            { entryNumber: { contains: filters.search } },
            { description: { contains: filters.search } },
          ],
        }),
      },
    },
    include: {
      journalEntry: {
        select: {
          id: true, entryNumber: true, date: true, description: true,
          referenceType: true, referenceId: true, status: true,
        },
      },
    },
    orderBy: { journalEntry: { date: 'asc' } },
  });

  // 4. Running Balance via shared util
  const flatLines = lines.map(l => ({
    id:             `JEL-${l.id}`,
    date:           l.journalEntry.date.toISOString(),
    journalNumber:  l.journalEntry.entryNumber,
    journalEntryId: l.journalEntry.id,
    referenceType:  l.journalEntry.referenceType ?? 'MANUAL',
    referenceId:    l.journalEntry.referenceId ?? undefined,
    description:    l.description ?? l.journalEntry.description,
    debit:          l.debit,
    credit:         l.credit,
    status:         l.journalEntry.status,
  }));

  const rowsWithBalance = calculateRunningBalances(openingBalance, flatLines);
  const { totalDebit, totalCredit } = sumDebitCredit(flatLines);
  const closingBalance = calculateClosingBalance(openingBalance, totalDebit, totalCredit);

  // 5. DrillDown: MANUAL → Journal Entry; others → source document
  const rows: GlStatementRow[] = rowsWithBalance.map(r => ({
    ...r,
    drillDown: r.referenceType !== 'MANUAL' && r.referenceId
      ? buildDrillDownRef(r.referenceType as DrillDownRef['entityType'], r.referenceId)
      : buildDrillDownRef('JOURNAL_ENTRY', r.journalEntryId),
  }));

  return wrapFinancialResponse({
    reportType: 'gl-statement',
    summary: { openingBalance, totalDebit, totalCredit, closingBalance, transactionCount: rows.length },
    metadata: {
      accountId,
      accountCode:   account.code,
      accountName:   account.name,
      accountType:   account.type,
      normalBalance: account.normalBalance,
    },
    filters,
    rows,
    totals: { id: 'TOTALS', description: 'الإجمالي', debit: totalDebit, credit: totalCredit, runningBalance: closingBalance },
  });
}
```

### 6.6 Trial Balance Method Detail

```typescript
async getTrialBalance(filters) {
  const { mode, asOfDate, fromDate, toDate, showZeroBalances, accountType } = filters;

  if (mode === 'as-of') {
    // Group JournalEntryLine by accountId, sum debit/credit up to asOfDate
    const grouped = await prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: { status: 'POSTED', date: { lte: new Date(asOfDate) } },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await prisma.account.findMany({
      where: {
        id: { in: grouped.map(g => g.accountId) },
        isActive: true,
        ...(accountType && { type: accountType }),
      },
      orderBy: { code: 'asc' },
    });

    const rows: TrialBalanceAsOfRow[] = accounts.map(account => {
      const agg = grouped.find(g => g.accountId === account.id);
      const totalDebit  = normalizeMoney(agg?._sum.debit  ?? 0);
      const totalCredit = normalizeMoney(agg?._sum.credit ?? 0);
      const balance     = normalizeMoney(totalDebit - totalCredit);
      return {
        id: `TB-${account.id}`,
        accountId:     account.id,
        accountCode:   account.code,
        accountName:   account.name,
        accountType:   account.type,
        normalBalance: account.normalBalance as 'DEBIT' | 'CREDIT',
        totalDebit,
        totalCredit,
        balance,
        balanceType: balance >= 0 ? 'DEBIT' : 'CREDIT',
        drillDown: buildDrillDownRef('GL_ACCOUNT', account.id, account.name),
      };
    }).filter(r => showZeroBalances || r.totalDebit !== 0 || r.totalCredit !== 0);

    // Imbalance detection
    const totalD = normalizeMoney(rows.reduce((s, r) => s + r.totalDebit, 0));
    const totalC = normalizeMoney(rows.reduce((s, r) => s + r.totalCredit, 0));
    const isBalanced = Math.abs(totalD - totalC) < 0.001;

    // Accounting validation warnings
    const warnings: string[] = [];
    const accountIds = rows.map(r => r.accountId);
    if (new Set(accountIds).size !== accountIds.length) {
      warnings.push('يوجد حسابات مكررة في النتائج');
    }

    return wrapFinancialResponse({
      reportType: 'trial-balance',
      summary: { totalDebit: totalD, totalCredit: totalC },
      metadata: {
        mode: 'as-of',
        asOfDate,
        isBalanced,
        difference: isBalanced ? 0 : normalizeMoney(Math.abs(totalD - totalC)),
        warnings,
      },
      filters,
      rows,
      totals: { id: 'TOTALS', accountName: 'الإجمالي', totalDebit: totalD, totalCredit: totalC },
    });

  } else {
    // Period mode: opening + period movements + closing
    const [openingGrouped, periodGrouped, accounts] = await Promise.all([
      prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { status: 'POSTED', date: { lt: new Date(fromDate) } } },
        _sum: { debit: true, credit: true },
      }),
      prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { status: 'POSTED', date: { gte: new Date(fromDate), lte: new Date(toDate) } } },
        _sum: { debit: true, credit: true },
      }),
      prisma.account.findMany({
        where: { isActive: true, ...(accountType && { type: accountType }) },
        orderBy: { code: 'asc' },
      }),
    ]);

    const activeIds = new Set([...openingGrouped.map(g => g.accountId), ...periodGrouped.map(g => g.accountId)]);
    const relevantAccounts = accounts.filter(a => showZeroBalances || activeIds.has(a.id));

    const rows: TrialBalancePeriodRow[] = relevantAccounts.map(account => {
      const openD = openingGrouped.find(g => g.accountId === account.id)?._sum.debit  ?? 0;
      const openC = openingGrouped.find(g => g.accountId === account.id)?._sum.credit ?? 0;
      const perD  = periodGrouped.find(g => g.accountId === account.id)?._sum.debit  ?? 0;
      const perC  = periodGrouped.find(g => g.accountId === account.id)?._sum.credit ?? 0;
      const openingBalance = normalizeMoney(openD - openC);
      const periodDebit    = normalizeMoney(perD);
      const periodCredit   = normalizeMoney(perC);
      const closingBalance = calculateClosingBalance(openingBalance, periodDebit, periodCredit);
      return {
        id: `TB-${account.id}`,
        accountId: account.id, accountCode: account.code, accountName: account.name,
        accountType: account.type, normalBalance: account.normalBalance as 'DEBIT' | 'CREDIT',
        openingBalance, periodDebit, periodCredit, closingBalance,
        drillDown: buildDrillDownRef('GL_ACCOUNT', account.id, account.name),
      };
    });

    const totalPD = normalizeMoney(rows.reduce((s, r) => s + r.periodDebit, 0));
    const totalPC = normalizeMoney(rows.reduce((s, r) => s + r.periodCredit, 0));
    const isBalanced = Math.abs(totalPD - totalPC) < 0.001;

    return wrapFinancialResponse({
      reportType: 'trial-balance',
      summary: { totalDebit: totalPD, totalCredit: totalPC },
      metadata: { mode: 'period', fromDate, toDate, isBalanced, difference: isBalanced ? 0 : normalizeMoney(Math.abs(totalPD - totalPC)), warnings: [] },
      filters,
      rows,
      totals: { id: 'TOTALS', accountName: 'الإجمالي', periodDebit: totalPD, periodCredit: totalPC },
    });
  }
}
```

### 6.7 Journal Book Method Detail

```typescript
async getJournalBook(filters) {
  // Orchestrates accounting.service.listJournalEntries() — Orchestrator pattern
  const { data: entries, total } = await accountingService.listJournalEntries({
    page:          filters.page ?? 1,
    pageSize:      filters.pageSize ?? 50,
    status:        filters.status,
    description:   filters.search,
    fromDate:      filters.fromDate,
    toDate:        filters.toDate,
    referenceType: filters.referenceType,
  });

  const rows: JournalBookRow[] = entries.map(entry => ({
    id:            `JE-${entry.id}`,
    entryNumber:   entry.entryNumber,
    date:          entry.date.toISOString(),
    description:   entry.description,
    referenceType: entry.referenceType ?? 'MANUAL',
    referenceId:   entry.referenceId ?? undefined,
    status:        entry.status,
    totalDebit:    normalizeMoney(entry.lines.reduce((s, l) => s + l.debit, 0)),
    totalCredit:   normalizeMoney(entry.lines.reduce((s, l) => s + l.credit, 0)),
    lineCount:     entry.lines.length,
    lines:         entry.lines.map(l => ({
      accountCode: l.account.code,
      accountName: l.account.name,
      description: l.description ?? undefined,
      debit:       l.debit,
      credit:      l.credit,
    })),
    drillDown: entry.referenceType && entry.referenceId
      ? buildDrillDownRef(entry.referenceType as DrillDownRef['entityType'], entry.referenceId)
      : undefined,
  }));

  const pageSize = filters.pageSize ?? 50;
  return wrapFinancialResponse({
    reportType: 'journal-book',
    summary: {
      totalDebit:  normalizeMoney(rows.reduce((s, r) => s + r.totalDebit, 0)),
      totalCredit: normalizeMoney(rows.reduce((s, r) => s + r.totalCredit, 0)),
      transactionCount: total,
    },
    metadata: { fromDate: filters.fromDate, toDate: filters.toDate },
    filters,
    rows,
    pagination: { page: filters.page ?? 1, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}
```

### 6.8 Dashboard Summary Method Detail

```typescript
// dashboard-summary.service.ts
private async computeSummary(): Promise<DashboardSummary> {
  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

  const [arData, apData, topCustomers, topSuppliers, recentCollections, recentPayments, accountsCount, arCritical, apCritical] =
    await Promise.all([
      prisma.invoice.aggregate({ where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] } }, _sum: { total: true, paidAmount: true }, _count: { customerId: true } }),
      prisma.invoice.aggregate({ where: { direction: 'PURCHASE', status: { notIn: ['PAID', 'CANCELLED'] } }, _sum: { total: true, paidAmount: true }, _count: { supplierId: true } }),
      prisma.$queryRaw`SELECT c.id as customerId, c.name as customerName, SUM(i.total - i.paidAmount) as outstanding FROM Invoice i JOIN Customer c ON i.customerId = c.id WHERE i.direction = 'SALES' AND i.status NOT IN ('PAID','CANCELLED') AND (i.total - i.paidAmount) > 0 GROUP BY c.id ORDER BY outstanding DESC LIMIT 5`,
      prisma.$queryRaw`SELECT s.id as supplierId, s.name as supplierName, SUM(i.total - i.paidAmount) as outstanding FROM Invoice i JOIN Supplier s ON i.supplierId = s.id WHERE i.direction = 'PURCHASE' AND i.status NOT IN ('PAID','CANCELLED') AND (i.total - i.paidAmount) > 0 GROUP BY s.id ORDER BY outstanding DESC LIMIT 5`,
      prisma.payment.aggregate({ where: { date: { gte: thirtyDaysAgo }, invoice: { direction: 'SALES' } }, _sum: { amount: true } }),
      prisma.payment.aggregate({ where: { date: { gte: thirtyDaysAgo }, invoice: { direction: 'PURCHASE' } }, _sum: { amount: true } }),
      prisma.account.count({ where: { isActive: true } }),
      prisma.invoice.aggregate({ where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: ninetyDaysAgo } }, _sum: { total: true, paidAmount: true } }),
      prisma.invoice.aggregate({ where: { direction: 'PURCHASE', status: { notIn: ['PAID', 'CANCELLED'] }, dueDate: { lt: ninetyDaysAgo } }, _sum: { total: true, paidAmount: true } }),
    ]);

  return {
    generatedAt: new Date().toISOString(),
    arSummary: {
      totalOutstanding: normalizeMoney((arData._sum.total ?? 0) - (arData._sum.paidAmount ?? 0)),
      criticalOver90:   normalizeMoney((arCritical._sum.total ?? 0) - (arCritical._sum.paidAmount ?? 0)),
      entityCount: arData._count.customerId ?? 0,
    },
    apSummary: {
      totalOutstanding: normalizeMoney((apData._sum.total ?? 0) - (apData._sum.paidAmount ?? 0)),
      criticalOver90:   normalizeMoney((apCritical._sum.total ?? 0) - (apCritical._sum.paidAmount ?? 0)),
      entityCount: apData._count.supplierId ?? 0,
    },
    topCustomers: topCustomers as TopEntitySummary[],
    topSuppliers: topSuppliers as TopEntitySummary[],
    collectionsLast30: normalizeMoney(recentCollections._sum.amount ?? 0),
    paymentsLast30:    normalizeMoney(recentPayments._sum.amount    ?? 0),
    activeAccountsCount: accountsCount,
  };
}
```

### 6.9 Audit Logging for All Exports

```typescript
// In financial.controller.ts — after every export operation:
await recordAudit({
  userId:  req.user.id,
  action:  'REPORT_EXPORT',
  module:  'financial',
  entityId: null,
  newValue: {
    reportType: params.reportType,
    format:     query.format,
    filters:    sanitizedFilters,  // remove PII if any
  },
});
```

---

## 7. Frontend: Financial Center

### 7.1 Route

```typescript
// App.tsx
<Route path="/financial" element={
  <ProtectedRoute anyPermission={[
    'statements.read', 'aging.read', 'gl.read',
    'trialbalance.read', 'journal.read', 'finreports.read'
  ]}>
    <FinancialCenter />
  </ProtectedRoute>
} />
```

### 7.2 Tab Configuration

```typescript
// FinancialCenter.tsx

const FINANCIAL_TABS = [
  {
    key:        'statement',
    label:      'كشف الحساب',
    permission: 'statements.read',
    component:  StatementTab,
  },
  {
    key:        'aging',
    label:      'أعمار الذمم',
    permission: 'aging.read',
    component:  AgingTab,
  },
  {
    key:        'gl',
    label:      'الأستاذ العام',
    permission: 'gl.read',
    component:  GlTab,
  },
  {
    key:        'trial',
    label:      'ميزان المراجعة',
    permission: 'trialbalance.read',
    component:  TrialBalanceTab,
  },
  {
    key:        'journal',
    label:      'دفتر اليومية',
    permission: 'journal.read',
    component:  JournalBookTab,
  },
  {
    key:        'reports',
    label:      'التقارير المالية',
    permission: 'finreports.read',
    component:  FinancialReportsTab,
  },
];
```

### 7.3 URL State Management

```typescript
// FinancialCenter.tsx — all navigation state lives in URL

const [searchParams, setSearchParams] = useSearchParams();

// Read from URL
const activeTab    = searchParams.get('tab')        ?? firstPermittedTab;
const subTab       = searchParams.get('subTab')     ?? '';
const entityType   = searchParams.get('entityType') ?? '';
const entityId     = searchParams.get('entityId')   ?? '';
const accountId    = searchParams.get('accountId')  ?? '';
const mode         = searchParams.get('mode')       ?? 'as-of';
const fromDate     = searchParams.get('fromDate')   ?? '';
const toDate       = searchParams.get('toDate')     ?? '';

// Navigate within center
function setTab(tab: string, extra?: Record<string, string>) {
  setSearchParams({ tab, ...extra });
}

// Example internal DrillDown from Aging → Statement:
// navigate('/financial?tab=statement&entityType=customer&entityId=42')
//   — state is preserved in URL, supports Back button
```

### 7.4 Tab: كشف الحساب (Statement)

```
StatementTab.tsx
  ├── FilterBar: entity type toggle (customer|supplier) + entity selector + date range + referenceType + search
  ├── StatementControls: Grouped/Flat toggle (localStorage key: 'financial.statement.viewMode')
  │     ⚠️ M6 FIX — Smart default applies ONLY on first load (when localStorage has no value).
  │     If localStorage has a value, ALWAYS use that — never override user preference.
  │     Smart default: Grouped if date range > 60 days, Flat otherwise (first-time only).
  ├── Hide Settled toggle (localStorage key: 'financial.statement.hideSettled')
  │     ⚠️ Warning banner: "إخفاء بعض الحركات يؤثر على العرض فقط، ولا يغيّر الأرصدة المحاسبية"
  ├── SummaryCards: opening | totalDebit | totalCredit | closing
  ├── ExportBar: Excel | PDF
  ├── GroupedTable (when grouped mode)
  └── StatementTable (when flat mode)

GroupedTable hierarchy:
  Year header row    → totalDebit, totalCredit, netChange for year
    Month header row → totalDebit, totalCredit, openingBalance, closingBalance for month
      Detail rows    → date, reference, type, description, debit, credit, runningBalance, DrillDownLink
```

### 7.5 Tab: أعمار الذمم (Aging)

```
AgingTab.tsx
  ├── Sub-tabs: [ذمم العملاء (AR)] [ذمم الموردين (AP)]
  ├── FilterBar: asOfDate (default today) + search + customerType (AR only) + hideZero
  ├── AgingSummaryCards: totalOutstanding | criticalOver90 | entityCount | 4th bucket total
  ├── AgingChart: Recharts BarChart, bucket distribution, color-coded
  ├── AgingTable: sortable, color-coded cells, DrillDownLink
  │     Column per bucket, each cell > 0 is clickable
  └── ExportBar: Excel | PDF

Cell DrillDown (bucket amount click):
  saveReturnState() → navigate('/invoices?customerId=X&agingBucket=0_30&status=UNPAID')

Row DrillDown (entity name click):
  navigate('/financial?tab=statement&entityType=customer&entityId=X')
  — internal, no return state needed (stays in Financial Center)
```

### 7.6 Tab: الأستاذ العام (GL)

```
GlTab.tsx
  ├── Sub-tabs: [كشف الحساب] [دفتر الأستاذ]

Sub-tab 1: كشف الحساب
  ├── AccountSelector: searchable dropdown → /accounting/accounts
  │     Shows: code + name + type
  ├── FilterBar: date range + status filter + search
  ├── SummaryCards: opening | totalDebit | totalCredit | closing
  ├── ExportBar: Excel | PDF
  └── StatementTable (reused component)
        Each row: journalNumber column + DrillDownLink to source doc

Sub-tab 2: دفتر الأستاذ
  ├── FilterBar: date range + accountType
  ├── PaginationBar (pagination by account)
  ├── ExportBar: Excel | PDF
  └── GlReportView: for each account → AccountHeader + collapsed StatementTable
```

### 7.7 Tab: ميزان المراجعة (Trial Balance)

```
TrialBalanceTab.tsx
  ├── ModeToggle: [نقطة زمنية] [فترة] — localStorage: 'financial.trialbalance.mode'
  ├── FilterBar:
  │     as-of mode:  asOfDate picker
  │     period mode: fromDate + toDate
  │     + accountType filter + showZeroBalances toggle
  ├── ImbalanceAlert (conditional — only if !metadata.isBalanced):
  │     ⚠️ "ميزان المراجعة غير متوازن — الفرق: {difference} د.ك"
  ├── ExportBar: Excel | PDF
  ├── TrialBalanceTable:
  │     as-of columns:  كود | اسم | نوع | إجمالي مدين | إجمالي دائن | الرصيد | طبيعة
  │     period columns: كود | اسم | رصيد افتتاح | مدين | دائن | رصيد إقفال
  └── Totals row at bottom: إجمالي مدين | إجمالي دائن

DrillDown: click account name → navigate('/financial?tab=gl&subTab=statement&accountId=X')
```

### 7.8 Tab: دفتر اليومية (Journal Book)

```
JournalBookTab.tsx
  ├── FilterBar: date range + status + referenceType + search
  ├── SummaryCards: إجمالي مدين | إجمالي دائن | عدد القيود
  ├── Controls: [فتح الكل] [إغلاق الكل] buttons
  ├── ExportBar: Excel | PDF
  ├── PaginationBar
  └── JournalBookTable: expandable rows
        Collapsed: entryNumber | date | description | referenceType | status | totalDebit | totalCredit | DrillDownLink
        Expanded:  + lines sub-table (accountCode | accountName | description | debit | credit)
```

### 7.9 Tab: التقارير المالية (Financial Reports)

```
FinancialReportsTab.tsx
  ├── FilterBar: fromDate + toDate
  ├── FinancialSummaryCards: إيرادات | تحصيلات | مصاريف | صافي
  ├── ExportBar: Excel | PDF
  └── FutureReportsSection: placeholder cards for coming reports
        Each placeholder: grayed out with "قريباً" badge
        Reports: الميزانية العمومية | التدفقات النقدية | الأرباح والخسائر | مقارنة الميزانية
```

### 7.10 Shared: useHighlight Hook

```typescript
// frontend/src/hooks/useHighlight.ts
export function useHighlight(): string | null {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`row-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-row');
    const timer = setTimeout(() => el.classList.remove('highlight-row'), 3000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return highlightId;
}
```

CSS:
```css
.highlight-row {
  background-color: #fefce8;       /* yellow-50 */
  outline: 2px solid #ca8a04;      /* yellow-600 */
  transition: background-color 3s ease-out, outline 3s ease-out;
}
```

Pages that need `useHighlight()` + `id={`row-${record.id}`}` on each row:
- `Invoices.tsx`
- `Expenses.tsx`
- `Accounting.tsx` (for Journal Entries)
- `Customers.tsx`
- `Suppliers.tsx`

### 7.11 Shared: ReturnToReportButton

```typescript
// frontend/src/components/ReturnToReportButton.tsx
export function ReturnToReportButton() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const highlight = searchParams.get('highlight');

  const returnState = useMemo(() => {
    try {
      const raw = sessionStorage.getItem('app.drilldown.returnState');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  if (!highlight || !returnState) return null;

  function handleReturn() {
    // ⚠️ M5 FIX: Build full URL with params instead of using location.state.
    // location.state is lost on page Refresh. URL params are durable.
    const params = new URLSearchParams();
    params.set('tab', returnState.tab);
    if (returnState.subTab)     params.set('subTab',     returnState.subTab);
    if (returnState.entityType) params.set('entityType', returnState.entityType);
    if (returnState.entityId)   params.set('entityId',   String(returnState.entityId));
    if (returnState.accountId)  params.set('accountId',  String(returnState.accountId));
    if (returnState.fromDate)   params.set('fromDate',   returnState.fromDate);
    if (returnState.toDate)     params.set('toDate',     returnState.toDate);
    if (returnState.mode)       params.set('mode',       returnState.mode);
    sessionStorage.removeItem('app.drilldown.returnState');
    navigate(`${returnState.returnTo}?${params.toString()}`);
    // Scroll restoration: FinancialCenter reads returnState.scrollY from location.state
    // (passed as second arg) and scrolls after mount. scrollY is the only value in location.state.
    // This is fine because scrollY is non-critical — losing it on refresh just means no scroll.
  }

  return (
    <button onClick={handleReturn} className="return-to-report-btn">
      ← العودة إلى {returnState.reportLabel ?? 'التقرير'}
    </button>
  );
}
```

Used in: `Invoices.tsx`, `Expenses.tsx`, `Accounting.tsx`, `Customers.tsx`, `Suppliers.tsx` — placed directly below the page title.

---

## 8. Frontend: Dashboard.tsx Changes

### 8.1 Minimal Change Strategy

Only two things change in `Dashboard.tsx`:
1. A tab bar is added at the top
2. All existing content is wrapped in a `GeneralDashboardContent` component (no internal changes)

```typescript
// Dashboard.tsx

const [dashTab, setDashTab] = useState<'general' | 'financial'>(
  (localStorage.getItem('dashboard.tab') as 'general' | 'financial') ?? 'general'
);

return (
  <div>
    {/* Tab bar */}
    <div className="dashboard-tab-bar">
      <button
        className={dashTab === 'general' ? 'active' : ''}
        onClick={() => { setDashTab('general'); localStorage.setItem('dashboard.tab', 'general'); }}
      >عام</button>
      <button
        className={dashTab === 'financial' ? 'active' : ''}
        onClick={() => { setDashTab('financial'); localStorage.setItem('dashboard.tab', 'financial'); }}
      >مالي</button>
    </div>

    {dashTab === 'general'   && <GeneralDashboardContent />}
    {dashTab === 'financial' && hasPermission('financialdashboard.read') && <FinancialDashboardTab />}
  </div>
);
```

### 8.2 FinancialDashboardTab Content

```
FinancialDashboardTab.tsx
  Fetches: GET /financial/dashboard-summary (once on mount)
  Shows "آخر تحديث: {generatedAt formatted as HH:mm:ss}" on each card

  Row 1 — Summary Cards:
    ذمم العملاء AR:  totalOutstanding + criticalOver90 + "عرض التفاصيل ←"
    ذمم الموردين AP: totalOutstanding + criticalOver90 + "عرض التفاصيل ←"
    تحصيلات 30 يوم:  collectionsLast30
    مدفوعات 30 يوم:  paymentsLast30

  Row 2 — Two tables side by side:
    أعلى 5 عملاء (customerId, customerName, outstanding) + DrillDown link per row
    أعلى 5 موردين (supplierId, supplierName, outstanding) + DrillDown link per row

  Navigation:
    "عرض التفاصيل ←" AR   → navigate('/financial?tab=aging&subTab=ar')
    "عرض التفاصيل ←" AP   → navigate('/financial?tab=aging&subTab=ap')
    Customer row click     → navigate('/financial?tab=statement&entityType=customer&entityId=X')
    Supplier row click     → navigate('/financial?tab=statement&entityType=supplier&entityId=X')
```

---

## 9. Permissions

### 9.1 New Module Names (constants.ts)

Add to `MODULES` array:
```typescript
'aging', 'gl', 'trialbalance', 'journal', 'finreports', 'financial'
```

### 9.2 New Permission Keys

```typescript
// Existing (verify presence, add if missing):
'statements.export'

// New:
'aging.read'
'aging.export'
'gl.read'
'gl.export'
'trialbalance.read'
'trialbalance.export'
'journal.read'
'journal.export'
'finreports.read'
'finreports.export'
'financialdashboard.read'    // Financial Dashboard Tab — separate from statements.read
                              // Allows GM/managers to see Dashboard without full statement access
                              // ⚠️ M1 FIX: Named 'financialdashboard' (not 'financial.dashboard')
                              // to follow project convention of lowercase single-word module names.
```

### 9.3 Role Assignments (seed.ts)

```typescript
const ROLE_PERMISSION_GRANTS = {
  SYSTEM_ADMIN: [
    'statements.export', 'aging.read', 'aging.export',
    'gl.read', 'gl.export', 'trialbalance.read', 'trialbalance.export',
    'journal.read', 'journal.export', 'finreports.read', 'finreports.export',
    'financialdashboard.read',
  ],
  GENERAL_MANAGER: [
    'statements.export', 'aging.read', 'aging.export',
    'gl.read', 'gl.export', 'trialbalance.read', 'trialbalance.export',
    'journal.read', 'journal.export', 'finreports.read', 'finreports.export',
    'financialdashboard.read',
  ],
  ACCOUNTANT: [
    'statements.export', 'aging.read', 'aging.export',
    'gl.read', 'gl.export', 'trialbalance.read', 'trialbalance.export',
    'journal.read', 'journal.export', 'finreports.read', 'finreports.export',
    'financialdashboard.read',
  ],
  PROJECT_MANAGER: [
    'statements.read', 'statements.export',
    'aging.read',
    'financialdashboard.read',
  ],
  STANDARD_USER: [
    'statements.read',
  ],
};
```

### 9.4 RBAC Rules in Financial Center

- If a user has **none** of the Financial Center permissions → `/financial` route is inaccessible (ProtectedRoute redirects)
- `FinancialTabs.tsx` renders ONLY tabs where `hasPermission(tab.permission)` is true
- If rendered tab has 0 visible items → `FinancialCenter` shows "لا توجد صلاحية" (not a blank page)
- Sidebar entry "المحاسبة المالية" is hidden if user has none of the 6 `.read` permissions OR `financialdashboard.read`

---

## 10. Audit Logging

### 10.1 Events to Log

All export operations in the Financial Module log to `AuditLog`:

```typescript
// Action: 'REPORT_EXPORT'
// Module: 'financial'
// Entity: null
// NewValue (JSON):
{
  "reportType": "statement|ar-aging|ap-aging|gl-statement|gl-report|trial-balance|journal-book|financial-summary",
  "format": "pdf|excel",
  "filters": { /* sanitized — no passwords, just dates/types/ids */ }
}
```

### 10.2 Implementation Location

In `financial.controller.ts`, after each successful export (not on failure):

```typescript
// After sending the file response:
recordAudit({
  req,
  action: 'REPORT_EXPORT',
  module: 'financial',
  entityId: undefined,
  newValue: { reportType, format, filters: sanitize(filters) },
}).catch(() => {}); // non-blocking — do not fail the export if audit fails
```

---

## 11. Caching

### 11.1 Dashboard Summary Cache

- **Location:** In-memory within `dashboard-summary.service.ts` singleton
- **TTL:** 45 seconds (balances freshness vs DB load)
- **Key:** Single entry — no per-user caching (summary is not user-specific)
- **Invalidation:** `dashboardSummaryService.invalidateCache()` called:
  - After any Payment is created/updated
  - After any Invoice status changes to PAID
  - After any Expense is approved/reversed
- **Response header:** `X-Cache-Age: {seconds}` so frontend can display "آخر تحديث"

### 11.2 No Other Caches

All other Financial Center endpoints are real-time (no caching). They are read-heavy but not called as frequently as Dashboard.

---

## 12. DrillDown System

### 12.1 The 3-Click Rule

Every financial report must allow reaching the original source document within **3 navigation steps maximum**.

| Chain | Step 1 | Step 2 | Step 3 |
|-------|--------|--------|--------|
| Aging → Invoice | Aging | Statement | Invoice |
| Trial Balance → Invoice | Trial Balance | GL Statement | Invoice |
| GL Statement → Invoice | GL Statement | Invoice | — |
| Journal Book → Invoice | Journal Book | Invoice | — |
| Statement → Journal | Statement | Invoice | Journal Entry |

### 12.2 External DrillDown (leaves Financial Center)

```typescript
// DrillDownLink.tsx
interface DrillDownLinkProps {
  drillDown: DrillDownRef;
  currentState: FinancialDrillDownState;  // complete current page state
  children: React.ReactNode;
}

interface FinancialDrillDownState {
  returnTo:     string;      // '/financial'
  returnLabel:  string;      // 'ميزان المراجعة'
  tab:          string;
  subTab?:      string;
  entityType?:  string;
  entityId?:    number;
  accountId?:   number;
  fromDate?:    string;
  toDate?:      string;
  mode?:        string;
  scrollY?:     number;
  page?:        number;
}

function DrillDownLink({ drillDown, currentState, children }) {
  const navigate = useNavigate();

  if (!drillDown.route) return <span>{children}</span>;  // no route = no link

  function handleClick() {
    sessionStorage.setItem('app.drilldown.returnState', JSON.stringify({
      ...currentState,
      scrollY: window.scrollY,
    }));
    navigate(`${drillDown.route}?highlight=${drillDown.entityId}`);
  }

  return <button onClick={handleClick} className="drill-down-link">{children}</button>;
}
```

### 12.3 Internal DrillDown (stays in Financial Center)

```typescript
// No sessionStorage — use URL navigation
navigate(`/financial?tab=gl&subTab=statement&accountId=${accountId}`);
navigate(`/financial?tab=statement&entityType=customer&entityId=${customerId}`);
// Back button in browser restores previous tab state (URL-based)
```

### 12.4 State Restoration

When user clicks "العودة إلى التقرير":
1. `ReturnToReportButton` reads `sessionStorage['app.drilldown.returnState']`
2. Navigates to `returnState.returnTo` (`/financial`)
3. Passes state via React Router location state
4. `FinancialCenter` reads location.state on mount → restores tab, filters, scroll position
5. Removes `sessionStorage` entry

---

## 13. URL State System

### 13.1 URL Schema

```
/financial                                           → first permitted tab, no filters
/financial?tab=statement                             → Statement tab, no entity selected
/financial?tab=statement&entityType=customer&entityId=42&fromDate=2025-01-01&toDate=2025-12-31
/financial?tab=aging&subTab=ar                       → AR Aging
/financial?tab=aging&subTab=ap&asOfDate=2025-12-31
/financial?tab=gl&subTab=statement&accountId=5&fromDate=2025-01-01
/financial?tab=gl&subTab=report&accountType=ASSET
/financial?tab=trial&mode=as-of&asOfDate=2025-12-31
/financial?tab=trial&mode=period&fromDate=2025-01-01&toDate=2025-03-31
/financial?tab=journal&status=POSTED&fromDate=2025-01-01
/financial?tab=reports&fromDate=2025-01-01&toDate=2025-12-31
```

### 13.2 Tab Keys

| Tab Key | Arabic Label | Permission |
|---------|-------------|------------|
| `statement` | كشف الحساب | statements.read |
| `aging` | أعمار الذمم | aging.read |
| `gl` | الأستاذ العام | gl.read |
| `trial` | ميزان المراجعة | trialbalance.read |
| `journal` | دفتر اليومية | journal.read |
| `reports` | التقارير المالية | finreports.read |

### 13.3 Persisted (localStorage) vs URL State

| State | Storage |
|-------|---------|
| Active tab | URL |
| Sub-tab | URL |
| Date filters | URL |
| Entity selection | URL |
| Account selection | URL |
| Trial Balance mode | localStorage `'financial.trialbalance.mode'` (overridden by URL `mode` param) |
| Statement view mode (grouped/flat) | localStorage `'financial.statement.viewMode'` |
| Statement hide settled | localStorage `'financial.statement.hideSettled'` |
| Dashboard tab (general/financial) | localStorage `'dashboard.tab'` |

---

## 14. Export Pipeline

### 14.1 Export Adapters

Each report has a dedicated adapter that converts `FinancialResponse<T>` → `ReportInput` (the shape expected by `buildExcel()` and `buildPdf()`).

```
statement.export.adapter.ts    → STATEMENT_COLUMNS, maps StatementRow → ReportInput row
gl.export.adapter.ts           → GL_COLUMNS, maps GlStatementRow → ReportInput row
aging.export.adapter.ts        → AGING_COLUMNS, maps AgingRow → ReportInput row
trial.export.adapter.ts        → TB_AS_OF_COLUMNS / TB_PERIOD_COLUMNS (mode-dependent)
journal.export.adapter.ts      → JOURNAL_COLUMNS (flattened — lines expanded inline)
summary.export.adapter.ts      → SUMMARY_COLUMNS for Financial Summary
```

### 14.2 Pattern

```typescript
// Example: statement.export.adapter.ts
export function toStatementReportInput(
  response: FinancialResponse<StatementRow>,
  entityName: string
): ReportInput {
  return {
    title:    `كشف حساب — ${entityName}`,
    subtitle: buildSubtitle(response.metadata?.fromDate, response.metadata?.toDate),
    columns:  STATEMENT_EXPORT_COLUMNS,
    rows:     response.rows.map(r => ({
      date:          formatDate(r.date),
      reference:     r.reference,
      referenceType: translateRefType(r.referenceType),
      description:   r.description,
      debit:         r.debit   || '',
      credit:        r.credit  || '',
      balance:       r.runningBalance,
    })),
    totalsRow: {
      description: 'الإجمالي',
      debit:       response.summary.totalDebit,
      credit:      response.summary.totalCredit,
      balance:     response.summary.closingBalance,
    },
  };
}
```

### 14.3 Controller Export Pattern

```typescript
// financial.controller.ts
async exportReport(req, res) {
  const { format } = req.query;   // 'pdf' | 'excel'
  const buffer = await financialService.exportXxx(params, filters, format);

  // Audit log
  recordAudit({ ... }).catch(() => {});

  const contentType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  const filename = `${reportType}-${formatDate(new Date())}.${ext}`;

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}
```

---

## 15. Migration Strategy

### 15.1 Phase 0 (This Spec — Current)

- `/statements` → `Statements.tsx` — **untouched**
- `/financial` → `FinancialCenter.tsx` — **new**
- Both exist simultaneously
- No references to `/statements` are changed
- Shared components extracted to `components/financial/` but Statements.tsx keeps its own internal copies until migration

### 15.2 Phase X (Next Release After Adoption)

Add a dismissible info banner to `Statements.tsx`:

```typescript
// Statements.tsx — at the top of the component
{!localStorage.getItem('statements.bannerDismissed') && (
  <div className="info-banner">
    <span>🆕 يتوفر الإصدار الجديد من كشف الحساب داخل المحاسبة المالية</span>
    <button onClick={() => navigate('/financial?tab=statement')}>
      فتح الإصدار الجديد
    </button>
    <button onClick={() => localStorage.setItem('statements.bannerDismissed', '1')}>
      ✕
    </button>
  </div>
)}
```

### 15.3 Phase Final (After Banner Adoption Confirmed)

```typescript
// Statements.tsx replaced with:
export default function Statements() {
  return <Navigate to="/financial?tab=statement" replace />;
}
```

Then remove `Statements.tsx`, remove `/statements` route from `App.tsx`, remove Sidebar entry for `/statements`.

---

## 16. Database

### 16.1 No Schema Changes Required

All data needed by Financial Center exists in the current schema:

| Data Needed | Source Table |
|-------------|-------------|
| Customer/Supplier statements | `Invoice`, `Payment`, `Expense` (existing) |
| AR/AP Aging | `Invoice`, `Customer`, `Supplier` (existing) |
| GL Statement | `JournalEntry`, `JournalEntryLine`, `Account` (existing) |
| Trial Balance | `JournalEntry`, `JournalEntryLine`, `Account` (existing) |
| Journal Book | `JournalEntry`, `JournalEntryLine`, `Account` (existing) |
| Financial Summary | `Invoice`, `Expense`, `Payment`, `Transaction` (existing) |
| Dashboard Summary | `Invoice`, `Payment`, `Account` (existing) |

**No `prisma migrate` required.**

### 16.2 Query Performance Notes

- GL Statement and Trial Balance query `JournalEntryLine` with `journalEntry.status = 'POSTED'` filter — the existing index on `JournalEntry.status` covers this.
- Aging queries filter by `Invoice.status NOT IN (PAID, CANCELLED)` — existing index on `Invoice.status` covers this.
- Dashboard Summary runs 9 parallel aggregations — cache (45s TTL) prevents this from being a bottleneck.
- GL Report paginates at account level — `LIMIT/OFFSET` at the account list level before fetching lines.

---

## 17. Testing

### 17.1 Backend Unit Tests (Vitest)

```
backend/src/shared/services/financial/
  balance.utils.test.ts
    ✓ calculateRunningBalances: correct progression
    ✓ calculateRunningBalances: empty array returns empty
    ✓ calculateClosingBalance: correct result
    ✓ normalizeMoney: rounds to 3 decimal places
    ✓ normalizeMoney: handles floating point precision

  aging.utils.test.ts
    ✓ calculateAgingBuckets: current bucket (negative days)
    ✓ calculateAgingBuckets: correct bucket assignment per day count
    ✓ calculateAgingBuckets: skips outstanding=0 entries
    ✓ calculateAgingBuckets: total equals sum of buckets
    ✓ calculateAgingBuckets: custom bucket config works

  drilldown.utils.test.ts
    ✓ buildDrillDownRef: known entityType returns correct route
    ✓ buildDrillDownRef: GL_ACCOUNT returns '/financial'
    ✓ buildDrillDownRef: unknown type returns undefined route

backend/src/modules/financial/
  financial.service.test.ts
    ✓ getStatement: returns FinancialResponse with rows + drillDown refs
    ✓ getStatement: delegates to buildStatement (mock)
    ✓ getGlStatement: returns empty rows for account with no movement (not 404)
    ✓ getGlStatement: correct opening balance calculation
    ✓ getGlStatement: DrillDown is JOURNAL_ENTRY for MANUAL entries
    ✓ getGlStatement: DrillDown is source doc for INVOICE entries
    ✓ getTrialBalance: as-of mode returns correct debit/credit per account
    ✓ getTrialBalance: period mode returns correct opening/period/closing
    ✓ getTrialBalance: detects imbalance (isBalanced: false, difference > 0)
    ✓ getTrialBalance: balanced entries (isBalanced: true, difference: 0)
    ✓ getJournalBook: delegates to accountingService.listJournalEntries
    ✓ getArAging: excludes invoices with outstanding=0
    ✓ getApAging: correctly maps supplier data
```

### 17.2 Integration Tests

```
financial.routes.test.ts (authenticated requests):
  ✓ GET /financial/statements/customer/:id → 200 with valid FinancialResponse
  ✓ GET /financial/statements/customer/:id → 403 without statements.read
  ✓ GET /financial/ar-aging → 200
  ✓ GET /financial/ar-aging → 403 without aging.read
  ✓ GET /financial/gl-statement/:id → 200 even when no journal lines exist
  ✓ GET /financial/trial-balance?mode=as-of&asOfDate=... → 200
  ✓ GET /financial/trial-balance?mode=period&fromDate=...&toDate=... → 200
  ✓ GET /financial/journal-book → 200 with pagination
  ✓ GET /financial/dashboard-summary → 200 with cache headers
  ✓ GET /financial/*/export?format=pdf → Buffer (application/pdf)
  ✓ GET /financial/*/export?format=excel → Buffer (application/vnd.*)
  ✓ Audit log created for each export
```

### 17.3 Frontend Verification

Before declaring implementation complete, verify manually in the Electron app:

- [ ] Financial Center opens at `/financial`
- [ ] Tabs show/hide based on user permissions
- [ ] Statement Tab loads customer statement with hierarchical grouping
- [ ] Grouped view: year rows collapse/expand; month rows collapse/expand
- [ ] Flat view toggle works; preference persists in localStorage
- [ ] Hide Settled shows warning banner
- [ ] PDF export downloads a valid PDF
- [ ] Excel export downloads a valid XLSX
- [ ] DrillDown from Statement → Invoice page → invoice highlighted + "العودة" button appears
- [ ] "العودة إلى التقرير" restores full state
- [ ] AR Aging loads and shows color-coded table
- [ ] AP Aging loads (sub-tab)
- [ ] GL Statement loads for any active account (including empty accounts)
- [ ] Trial Balance As-of mode shows correct totals
- [ ] Trial Balance Period mode shows correct opening/closing
- [ ] Trial Balance imbalance alert shows when debits ≠ credits
- [ ] Trial Balance DrillDown → GL Statement
- [ ] Journal Book expandAll / collapseAll
- [ ] Journal Book DrillDown → Invoice/Expense
- [ ] Dashboard "مالي" Tab loads without affecting "عام" Tab
- [ ] Dashboard cards show "آخر تحديث" timestamp
- [ ] Sidebar "المحاسبة المالية" hidden for STANDARD_USER with only statements.read
- [ ] /statements page is completely untouched

---

## 18. Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Trial Balance imbalance** — Auto-generated journal entries are excluded from financialSummary but included in Trial Balance JournalEntry queries. If some entries are not POSTED, TB may not balance even when books are correct. | High (accounting integrity) | Filter strictly on `status = 'POSTED'`. Add `warnings[]` array to metadata for known non-fatal inconsistencies. Document that TB only reflects POSTED entries. |
| **GL Statement large account** — Account 1100 (AR) or 4000 (Revenue) may have thousands of lines. | Medium (performance) | Add `pageSize` query param to GL Statement with default 200. Frontend shows pagination. |
| **Dashboard cache staleness** — 45-second cache may show stale data after large payments. | Low (Dashboard is summary) | Cache TTL is short. `invalidateCache()` is called on writes. Display `generatedAt` so user can tell. |
| **Parent account double-counting in Trial Balance** — If a parent account has its own direct journal lines AND children accounts also have lines, GL totals may appear to double. | Medium (accounting) | Current schema uses JournalEntryLine with direct accountId — no auto-roll-up. Report shows each account independently. Add warning in metadata if parent account has both direct lines and active children. |
| **Outstanding calculation future incompatibility** — Current outstanding = `invoice.total - invoice.paidAmount`. Future Allocation/Credit Note engine may change this. | Future (low now) | Outstanding computed in one place (caller of `calculateAgingBuckets`). When future engine is introduced, only the caller changes. `aging.utils.ts` is untouched. |
| **Export memory** — PDF/Excel for full GL Report (many accounts) may use significant memory. | Medium | GL Report export is paginated — export one page at a time, or limit export to N accounts with a note. |
| **Drill Down to non-existent page** — DrillDownRef may point to a page that doesn't have `?highlight=` support yet. | Low | `route?: string` is optional. If undefined, `DrillDownLink` renders as text (not clickable). Pages gain `?highlight=` support in this same implementation. |
| **⚠️ M8 — AP Aging vs Supplier Statement inconsistency** — Supplier Statement includes purchase invoices + expenses linked to supplier. AP Aging includes purchase invoices ONLY. User may see different outstanding amounts in the two views. | Medium | Intentional design for Phase 2. Add UI note in Aging Tab: "يعرض أعمار الذمم فواتير المشتريات فقط. للرصيد الشامل بما يتضمن المصروفات راجع كشف الحساب." Document AP Aging + expenses as Phase 3 extension. |
| **⚠️ M9 — GL Statement sign convention for credit-normal accounts** — `openingBalance = totalDebit - totalCredit`. For credit-normal accounts (Liabilities/Equity/Revenue), this produces a negative number when account has a normal credit balance. | Medium | Frontend reads `account.normalBalance` from `metadata.normalBalance`. Displays D/C indicator beside balance. Never shows raw negative number without context. |
| **⚠️ M10 — Financial Summary (Cash vs Accrual) vs Trial Balance** — `accountingService.financialSummary()` computes revenue from `Invoice.total` (accrual) and expenses from `Expense.amount`. Trial Balance reflects GL journal entries only. Numbers will differ when some invoices have no matching journal entries posted yet. | Low | Document this in the Financial Reports Tab UI: "الملخص المالي يعتمد على الجداول التشغيلية (الفواتير والمصروفات). أرقامه قد تختلف عن ميزان المراجعة الذي يعتمد على القيود المحاسبية." |

---

## 19. Future Extensions

The Financial Center is designed to accommodate the following features without architectural changes:

### 19.1 New Report Tabs

Add by:
1. Adding a new tab entry to `FINANCIAL_TABS` in `FinancialCenter.tsx`
2. Adding new permission key to `constants.ts`
3. Adding new endpoint to `financial.routes.ts`
4. Adding service method to `financial.service.ts`
5. Adding export adapter

No existing code needs modification.

| Future Report | Tab Key | Permission |
|---------------|---------|------------|
| الميزانية العمومية | `balance-sheet` | `balancesheet.read` |
| التدفقات النقدية | `cash-flow` | `cashflow.read` |
| مقارنة الميزانية | `budget` | `budget.read` |
| مراكز التكلفة | `cost-centers` | `costcenters.read` |
| ربحية المشاريع | `projects` | `projects.read` |

### 19.2 New Statement Types

The Statement Tab architecture supports new entity types by:
1. Adding `entityType` to `buildStatement()` (Statement Engine)
2. Adding entity selector option in `StatementTab.tsx`

Future statement types:
- Bank Statement (entity: `BANK_ACCOUNT`)
- Cash Statement (entity: `CASH_ACCOUNT`)
- Employee Advance Statement (entity: `EMPLOYEE`)
- Project Statement (entity: `CONTRACT`)

### 19.3 New Aging Bucket Configurations

`calculateAgingBuckets()` accepts a custom `buckets: AgingBucket[]` parameter. Future configs (30/60/90/180+ for government clients) require no code changes — only a config change.

### 19.4 Cost Center Columns in Trial Balance

`TrialBalancePeriodRow` and `TrialBalanceAsOfRow` extend `FinancialRow` which allows arbitrary extra fields. When cost center dimension is added, columns appear without breaking existing rows.

### 19.5 Financial Closing

Future Financial Closing (period closing) would:
1. Mark JournalEntries in a period as CLOSED (new status)
2. Trial Balance `mode='closed-period'` added to existing toggle
3. `ImbalanceAlert.tsx` extended with "فترة مقفلة" indicator

### 19.6 GL Auto-Posting

When Invoice/Expense GL auto-posting is implemented (Phase B):
- `JournalEntry.referenceType` will be populated for auto-entries
- GL Statement DrillDown to source document will work automatically
- No Financial Center code changes needed — DrillDown refs are already built from `referenceType + referenceId`

---

*End of Specification*

**Version:** 1.0  
**Approved By:** User (2026-06-24)  
**Sections Reviewed:** 5 design sections + 8 clarification rounds  
**Architecture:** Approach B — Financial Module (Orchestrator pattern)

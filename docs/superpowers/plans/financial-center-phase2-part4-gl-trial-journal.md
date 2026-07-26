# Part 4 — GL Statement, GL Report, Trial Balance, Journal Book

> **Depends on:** Part 1 (Foundation), Part 2 (module scaffold)
> **Can parallelize with:** Part 3 (after Part 2 is merged)

---

## Objective

Implement the four most technically complex reports — GL Statement (running balance per GL account), GL Report (multi-account summary), Trial Balance (dual mode: As-of + Period), and Journal Book (expandable paginated entries). All query Prisma directly or orchestrate `accountingService.listJournalEntries()`. Wire up the corresponding tabs in FinancialCenter. Add `?highlight=` to `Accounting.tsx` for Journal Entry DrillDown.

## Scope

**Backend:** 8 new endpoints (4 report + 4 export), service methods for GL Statement, GL Report, Trial Balance, Journal Book.

**Frontend:** 5 new components; GL, Trial Balance, Journal Book tabs wired in `FinancialCenter.tsx`.

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/shared/services/financial/export/gl.export.adapter.ts` | GL Statement → ReportInput |
| `backend/src/shared/services/financial/export/trial.export.adapter.ts` | Trial Balance → ReportInput (mode-aware) |
| `backend/src/shared/services/financial/export/journal.export.adapter.ts` | Journal Book → ReportInput (flattened lines) |
| `frontend/src/components/financial/AccountSelector.tsx` | Searchable GL account dropdown |
| `frontend/src/components/financial/TrialBalanceTable.tsx` | Mode-aware trial balance table |
| `frontend/src/components/financial/ModeToggle.tsx` | Toggle between as-of / period modes |
| `frontend/src/components/financial/ImbalanceAlert.tsx` | Warning banner for unbalanced TB |
| `frontend/src/components/financial/JournalBookTable.tsx` | Expandable journal entry rows |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/modules/financial/financial.service.ts` | Add GL, Trial Balance, Journal Book methods |
| `backend/src/modules/financial/financial.controller.ts` | Add corresponding handlers |
| `backend/src/modules/financial/financial.routes.ts` | Add 8 new routes |
| `frontend/src/pages/FinancialCenter.tsx` | Replace GL/Trial/Journal placeholders with full implementations |
| `frontend/src/pages/Accounting.tsx` | Add `useHighlight()` + `ReturnToReportButton` to Journal Entries table |

## Dependencies

- Part 1: `calculateRunningBalances`, `calculateClosingBalance`, `sumDebitCredit`, `normalizeMoney`, `buildDrillDownRef`, `wrapFinancialResponse`
- Part 2: module scaffold, `ExportBar`, `SummaryCards`, `StatementTable`, `FilterBar`
- Existing: `accountingService.listJournalEntries()` from `@modules/accounting/accounting.service`
- Existing: Prisma `Account`, `JournalEntry`, `JournalEntryLine` models

---

## Step-by-Step Implementation

### Step 1 — Add GL Statement + GL Report service methods

Append to `backend/src/modules/financial/financial.service.ts`:

Add these imports alongside existing ones at the top of the file:
```typescript
import { AccountingService } from '@modules/accounting/accounting.service';
import { calculateRunningBalances, calculateClosingBalance, sumDebitCredit } from '@shared/services/financial/balance.utils';
import { toGlReportInput, toGlStatementReportInput } from '@shared/services/financial/export/gl.export.adapter';
import { toTrialBalanceReportInput } from '@shared/services/financial/export/trial.export.adapter';
import { toJournalBookReportInput } from '@shared/services/financial/export/journal.export.adapter';
import type { GlStatementRow, GlReportAccount, GlReportResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow, JournalBookRow } from '@shared/services/financial/financial.types';

const accountingService = new AccountingService();
```

Then append methods to the class:

```typescript
// ─── GL Statement ─────────────────────────────────────────────────────────

async getGlStatement(accountId: number, filters: {
  fromDate?: string;
  toDate?: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<FinancialResponse<GlStatementRow>> {

  // 1. Account info — throws 404 if not found
  const account = await prisma.account.findUniqueOrThrow({
    where: { id: accountId },
    include: { parent: { select: { code: true, name: true } } },
  });

  // 2. Opening Balance: sum all POSTED lines before fromDate
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
  const openingBalance = normalizeMoney(
    (openingAgg._sum.debit ?? 0) - (openingAgg._sum.credit ?? 0)
  );

  // 3. Lines in period (account with no movement → empty array, not 404)
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      accountId,
      journalEntry: {
        status: filters.status ? filters.status : { not: 'CANCELLED' },
        ...(filters.fromDate && { date: { gte: new Date(filters.fromDate) } }),
        ...(filters.toDate   && { date: { lte: new Date(filters.toDate)   } }),
        ...(filters.search && {
          OR: [
            { entryNumber:  { contains: filters.search } },
            { description:  { contains: filters.search } },
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
    ...(filters.page && filters.pageSize && {
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
  });

  // 4. Running Balance
  const flatLines = lines.map(l => ({
    id:             `JEL-${l.id}`,
    date:           l.journalEntry.date.toISOString(),
    journalNumber:  l.journalEntry.entryNumber,
    journalEntryId: l.journalEntry.id,
    referenceType:  l.journalEntry.referenceType ?? 'MANUAL',
    referenceId:    l.journalEntry.referenceId ?? undefined,
    description:    l.description ?? l.journalEntry.description,
    debit:          normalizeMoney(l.debit),
    credit:         normalizeMoney(l.credit),
    status:         l.journalEntry.status,
  }));

  const rowsWithBalance = calculateRunningBalances(openingBalance, flatLines);
  const { totalDebit, totalCredit } = sumDebitCredit(flatLines);
  const closingBalance = calculateClosingBalance(openingBalance, totalDebit, totalCredit);

  // 5. DrillDown: MANUAL entries → Journal Entry page; source-referenced entries → source document
  const rows: GlStatementRow[] = rowsWithBalance.map(r => ({
    ...r,
    drillDown: r.referenceType !== 'MANUAL' && r.referenceId
      ? buildDrillDownRef(r.referenceType as DrillDownRef['entityType'], r.referenceId)
      : buildDrillDownRef('JOURNAL_ENTRY', r.journalEntryId, `قيد ${r.journalNumber}`),
  }));

  return wrapFinancialResponse({
    reportType: 'gl-statement',
    summary: { openingBalance, totalDebit, totalCredit, closingBalance, transactionCount: rows.length },
    metadata: {
      accountId,
      accountCode:   account.code,
      accountName:   account.name,
      accountType:   account.type,
      normalBalance: account.normalBalance ?? 'DEBIT',
      // M9: Frontend must read normalBalance and show D/C indicator beside balance
    },
    filters: sanitizeFilters(filters),
    rows,
    totals: {
      id: 'TOTALS', description: 'الإجمالي',
      debit: totalDebit, credit: totalCredit, runningBalance: closingBalance,
    } as Partial<GlStatementRow>,
  });
}

async exportGlStatement(accountId: number, filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
  const data = await this.getGlStatement(accountId, filters as Parameters<typeof this.getGlStatement>[1]);
  const input = toGlStatementReportInput(data);
  return format === 'pdf' ? buildPdf(input) : buildExcel(input);
}

// ─── GL Report ────────────────────────────────────────────────────────────

async getGlReport(filters: {
  fromDate?: string;
  toDate?: string;
  accountType?: string;
  page?: number;
  pageSize?: number;
}): Promise<GlReportResponse> {
  const page     = filters.page     ?? 1;
  const pageSize = filters.pageSize ?? 20;

  const allAccounts = await prisma.account.findMany({
    where: {
      isActive: true,
      ...(filters.accountType && { type: filters.accountType }),
    },
    orderBy: { code: 'asc' },
  });

  const total            = allAccounts.length;
  const paginatedAccounts = allAccounts.slice((page - 1) * pageSize, page * pageSize);

  // M2 FIX: Return account totals ONLY — do NOT call getGlStatement N times.
  // Full lines are fetched on demand when user expands an account (separate GL Statement call).
  const accounts: GlReportAccount[] = await Promise.all(
    paginatedAccounts.map(async account => {
      const [openingAgg, periodAgg] = await Promise.all([
        prisma.journalEntryLine.aggregate({
          where: {
            accountId: account.id,
            journalEntry: {
              status: 'POSTED',
              ...(filters.fromDate && { date: { lt: new Date(filters.fromDate) } }),
            },
          },
          _sum: { debit: true, credit: true },
        }),
        prisma.journalEntryLine.aggregate({
          where: {
            accountId: account.id,
            journalEntry: {
              status: 'POSTED',
              ...(filters.fromDate && { date: { gte: new Date(filters.fromDate) } }),
              ...(filters.toDate   && { date: { lte: new Date(filters.toDate)   } }),
            },
          },
          _sum: { debit: true, credit: true },
        }),
      ]);

      const openingBalance = normalizeMoney((openingAgg._sum.debit ?? 0) - (openingAgg._sum.credit ?? 0));
      const totalDebit     = normalizeMoney(periodAgg._sum.debit  ?? 0);
      const totalCredit    = normalizeMoney(periodAgg._sum.credit ?? 0);

      return {
        accountId:     account.id,
        accountCode:   account.code,
        accountName:   account.name,
        accountType:   account.type,
        normalBalance: (account.normalBalance ?? 'DEBIT') as 'DEBIT' | 'CREDIT',
        openingBalance,
        totalDebit,
        totalCredit,
        closingBalance: calculateClosingBalance(openingBalance, totalDebit, totalCredit),
        rows: [], // Lines fetched on demand by frontend via getGlStatement
      };
    })
  );

  return {
    generatedAt: new Date().toISOString(),
    filters: sanitizeFilters(filters),
    accounts,
    summary: { totalAccounts: total, fromDate: filters.fromDate, toDate: filters.toDate },
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async exportGlReport(filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
  const data = await this.getGlReport(filters as Parameters<typeof this.getGlReport>[0]);
  const input = toGlReportInput(data);
  return format === 'pdf' ? buildPdf(input) : buildExcel(input);
}
```

### Step 2 — Add Trial Balance service method

Append to class in `financial.service.ts`:

```typescript
// ─── Trial Balance ────────────────────────────────────────────────────────

async getTrialBalance(filters: {
  mode: 'as-of' | 'period';
  asOfDate?: string;
  fromDate?: string;
  toDate?: string;
  showZeroBalances?: boolean;
  accountType?: string;
}): Promise<FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow>> {
  const { mode, asOfDate, fromDate, toDate, showZeroBalances, accountType } = filters;

  if (mode === 'as-of') {
    const effectiveDate = asOfDate ? new Date(asOfDate) : new Date();

    const [grouped, allAccounts] = await Promise.all([
      prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: {
          journalEntry: {
            status: 'POSTED',
            date:   { lte: effectiveDate },
          },
        },
        _sum: { debit: true, credit: true },
      }),
      prisma.account.findMany({
        where: { isActive: true, ...(accountType && { type: accountType }) },
        orderBy: { code: 'asc' },
      }),
    ]);

    const groupedIds = new Set(grouped.map(g => g.accountId));
    const relevantAccounts = showZeroBalances
      ? allAccounts
      : allAccounts.filter(a => groupedIds.has(a.id));

    const rows: TrialBalanceAsOfRow[] = relevantAccounts.map(account => {
      const agg        = grouped.find(g => g.accountId === account.id);
      const totalDebit  = normalizeMoney(agg?._sum.debit  ?? 0);
      const totalCredit = normalizeMoney(agg?._sum.credit ?? 0);
      const balance     = normalizeMoney(totalDebit - totalCredit);
      return {
        id:            `TB-${account.id}`,
        accountId:     account.id,
        accountCode:   account.code,
        accountName:   account.name,
        accountType:   account.type,
        normalBalance: (account.normalBalance ?? 'DEBIT') as 'DEBIT' | 'CREDIT',
        totalDebit,
        totalCredit,
        balance,
        balanceType:   balance >= 0 ? 'DEBIT' : 'CREDIT',
        drillDown:     buildDrillDownRef('GL_ACCOUNT', account.id, account.name),
      };
    });

    const totalD     = normalizeMoney(rows.reduce((s, r) => s + r.totalDebit,  0));
    const totalC     = normalizeMoney(rows.reduce((s, r) => s + r.totalCredit, 0));
    const isBalanced = Math.abs(totalD - totalC) < 0.001;
    const warnings: string[] = [];
    if (!isBalanced) warnings.push(`الفرق: ${normalizeMoney(Math.abs(totalD - totalC))} د.ك — تحقّق من قيود غير مرحّلة`);

    return wrapFinancialResponse({
      reportType: 'trial-balance',
      summary: { totalDebit: totalD, totalCredit: totalC },
      metadata: { mode: 'as-of', asOfDate: effectiveDate.toISOString(), isBalanced, difference: normalizeMoney(Math.abs(totalD - totalC)), warnings },
      filters: sanitizeFilters(filters),
      rows,
      totals: { id: 'TOTALS', accountName: 'الإجمالي', totalDebit: totalD, totalCredit: totalC } as Partial<TrialBalanceAsOfRow>,
    });

  } else {
    // Period mode: opening balance + period movements + closing balance per account
    if (!fromDate || !toDate) throw new Error('fromDate and toDate are required for period mode');

    const [openingGrouped, periodGrouped, allAccounts] = await Promise.all([
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

    const activeIds = new Set([
      ...openingGrouped.map(g => g.accountId),
      ...periodGrouped.map(g => g.accountId),
    ]);
    const relevantAccounts = showZeroBalances ? allAccounts : allAccounts.filter(a => activeIds.has(a.id));

    const rows: TrialBalancePeriodRow[] = relevantAccounts.map(account => {
      const openD = openingGrouped.find(g => g.accountId === account.id)?._sum.debit  ?? 0;
      const openC = openingGrouped.find(g => g.accountId === account.id)?._sum.credit ?? 0;
      const perD  = periodGrouped.find(g  => g.accountId === account.id)?._sum.debit  ?? 0;
      const perC  = periodGrouped.find(g  => g.accountId === account.id)?._sum.credit ?? 0;
      const openingBalance = normalizeMoney(openD - openC);
      const periodDebit    = normalizeMoney(perD);
      const periodCredit   = normalizeMoney(perC);
      const closingBalance = calculateClosingBalance(openingBalance, periodDebit, periodCredit);
      return {
        id: `TB-${account.id}`,
        accountId: account.id, accountCode: account.code, accountName: account.name,
        accountType: account.type, normalBalance: (account.normalBalance ?? 'DEBIT') as 'DEBIT' | 'CREDIT',
        openingBalance, periodDebit, periodCredit, closingBalance,
        drillDown: buildDrillDownRef('GL_ACCOUNT', account.id, account.name),
      };
    });

    const totalPD    = normalizeMoney(rows.reduce((s, r) => s + r.periodDebit,  0));
    const totalPC    = normalizeMoney(rows.reduce((s, r) => s + r.periodCredit, 0));
    const isBalanced = Math.abs(totalPD - totalPC) < 0.001;

    return wrapFinancialResponse({
      reportType: 'trial-balance',
      summary: { totalDebit: totalPD, totalCredit: totalPC },
      metadata: { mode: 'period', fromDate, toDate, isBalanced, difference: normalizeMoney(Math.abs(totalPD - totalPC)), warnings: [] },
      filters: sanitizeFilters(filters),
      rows,
      totals: { id: 'TOTALS', accountName: 'الإجمالي', periodDebit: totalPD, periodCredit: totalPC } as Partial<TrialBalancePeriodRow>,
    });
  }
}

async exportTrialBalance(filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
  const data = await this.getTrialBalance(filters as Parameters<typeof this.getTrialBalance>[0]);
  const input = toTrialBalanceReportInput(data);
  return format === 'pdf' ? buildPdf(input) : buildExcel(input);
}
```

### Step 3 — Add Journal Book service method

Append to class in `financial.service.ts`:

```typescript
// ─── Journal Book ─────────────────────────────────────────────────────────

async getJournalBook(filters: {
  fromDate?: string;
  toDate?: string;
  status?: string;
  referenceType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<FinancialResponse<JournalBookRow>> {
  const pageSize = filters.pageSize ?? 50;
  const page     = filters.page     ?? 1;

  // Orchestrator pattern: delegates to existing accountingService — no Prisma here
  const { data: entries, total } = await accountingService.listJournalEntries({
    page,
    pageSize,
    status:        filters.status,
    description:   filters.search,
    fromDate:      filters.fromDate,
    toDate:        filters.toDate,
    referenceType: filters.referenceType,
  });

  const rows: JournalBookRow[] = entries.map(entry => ({
    id:            `JE-${entry.id}`,
    entryNumber:   entry.entryNumber,
    date:          entry.date instanceof Date ? entry.date.toISOString() : String(entry.date),
    description:   entry.description,
    referenceType: entry.referenceType ?? 'MANUAL',
    referenceId:   entry.referenceId ?? undefined,
    status:        entry.status,
    totalDebit:    normalizeMoney(entry.lines.reduce((s: number, l: { debit: number }) => s + l.debit,  0)),
    totalCredit:   normalizeMoney(entry.lines.reduce((s: number, l: { credit: number }) => s + l.credit, 0)),
    lineCount:     entry.lines.length,
    lines:         entry.lines.map((l: { account: { code: string; name: string }; description?: string; debit: number; credit: number }) => ({
      accountCode: l.account.code,
      accountName: l.account.name,
      description: l.description ?? undefined,
      debit:       normalizeMoney(l.debit),
      credit:      normalizeMoney(l.credit),
    })),
    drillDown: entry.referenceType && entry.referenceId
      ? buildDrillDownRef(entry.referenceType as DrillDownRef['entityType'], entry.referenceId)
      : undefined,
  }));

  return wrapFinancialResponse({
    reportType: 'journal-book',
    summary: {
      totalDebit:       normalizeMoney(rows.reduce((s, r) => s + r.totalDebit,  0)),
      totalCredit:      normalizeMoney(rows.reduce((s, r) => s + r.totalCredit, 0)),
      transactionCount: total,
    },
    metadata: { fromDate: filters.fromDate, toDate: filters.toDate },
    filters: sanitizeFilters(filters),
    rows,
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  });
}

async exportJournalBook(filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
  const f = filters as Parameters<typeof this.getJournalBook>[0];
  const data = await this.getJournalBook({ ...f, pageSize: 500, page: 1 }); // export all pages
  const input = toJournalBookReportInput(data);
  return format === 'pdf' ? buildPdf(input) : buildExcel(input);
}
```

### Step 4 — Add controllers and routes

In `financial.controller.ts`, append:

```typescript
import { GlStatementQuerySchema, GlReportQuerySchema, TrialBalanceQuerySchema, JournalBookQuerySchema } from './financial.schema';

export async function getGlStatement(req: Request, res: Response): Promise<void> {
  const accountId = z.coerce.number().int().positive().parse(req.params.accountId);
  const query = GlStatementQuerySchema.parse(req.query);
  ok(res, await financialService.getGlStatement(accountId, query));
}
export async function exportGlStatement(req: Request, res: Response): Promise<void> {
  const accountId = z.coerce.number().int().positive().parse(req.params.accountId);
  const query = GlStatementQuerySchema.extend({ format: z.enum(['pdf', 'excel']).default('excel') }).parse(req.query);
  const buffer = await financialService.exportGlStatement(accountId, query, query.format as 'pdf' | 'excel');
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined, newValue: { reportType: 'gl-statement', format: query.format, filters: sanitizeFilters(query) } }).catch(() => {});
  sendFile(res, buffer, `gl-statement-${accountId}`, query.format as 'pdf' | 'excel');
}

export async function getGlReport(req: Request, res: Response): Promise<void> {
  const query = GlReportQuerySchema.parse(req.query);
  ok(res, await financialService.getGlReport(query));
}
export async function exportGlReport(req: Request, res: Response): Promise<void> {
  const query = GlReportQuerySchema.parse(req.query);
  const buffer = await financialService.exportGlReport(query, (query.format ?? 'excel') as 'pdf' | 'excel');
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined, newValue: { reportType: 'gl-report', format: query.format, filters: sanitizeFilters(query) } }).catch(() => {});
  sendFile(res, buffer, 'gl-report', (query.format ?? 'excel') as 'pdf' | 'excel');
}

export async function getTrialBalance(req: Request, res: Response): Promise<void> {
  const query = TrialBalanceQuerySchema.parse(req.query);
  ok(res, await financialService.getTrialBalance(query));
}
export async function exportTrialBalance(req: Request, res: Response): Promise<void> {
  const query = TrialBalanceQuerySchema.parse(req.query);
  const buffer = await financialService.exportTrialBalance(query, (query.format ?? 'excel') as 'pdf' | 'excel');
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined, newValue: { reportType: 'trial-balance', format: query.format, filters: sanitizeFilters(query) } }).catch(() => {});
  sendFile(res, buffer, 'trial-balance', (query.format ?? 'excel') as 'pdf' | 'excel');
}

export async function getJournalBook(req: Request, res: Response): Promise<void> {
  const query = JournalBookQuerySchema.parse(req.query);
  ok(res, await financialService.getJournalBook(query));
}
export async function exportJournalBook(req: Request, res: Response): Promise<void> {
  const query = JournalBookQuerySchema.parse(req.query);
  const buffer = await financialService.exportJournalBook(query, (query.format ?? 'excel') as 'pdf' | 'excel');
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined, newValue: { reportType: 'journal-book', format: query.format, filters: sanitizeFilters(query) } }).catch(() => {});
  sendFile(res, buffer, 'journal-book', (query.format ?? 'excel') as 'pdf' | 'excel');
}

// ─── Shared helper ────────────────────────────────────────────────────────
function sendFile(res: Response, buffer: Buffer, name: string, format: 'pdf' | 'excel') {
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${Date.now()}.${ext}"`);
  res.send(buffer);
}
```

In `financial.routes.ts`, append:

```typescript
import { getGlStatement, exportGlStatement, getGlReport, exportGlReport, getTrialBalance, exportTrialBalance, getJournalBook, exportJournalBook } from './financial.controller';

// ─── GL Statement ──────────────────────────────────────────────────────────
router.get('/gl-statement/:accountId',        requirePermission('gl.read'),          asyncHandler(getGlStatement));
router.get('/gl-statement/:accountId/export', requirePermission('gl.export'),        asyncHandler(exportGlStatement));

// ─── GL Report ─────────────────────────────────────────────────────────────
router.get('/gl-report',                      requirePermission('gl.read'),          asyncHandler(getGlReport));
router.get('/gl-report/export',               requirePermission('gl.export'),        asyncHandler(exportGlReport));

// ─── Trial Balance ─────────────────────────────────────────────────────────
router.get('/trial-balance',                  requirePermission('trialbalance.read'),  asyncHandler(getTrialBalance));
router.get('/trial-balance/export',           requirePermission('trialbalance.export'), asyncHandler(exportTrialBalance));

// ─── Journal Book ──────────────────────────────────────────────────────────
router.get('/journal-book',                   requirePermission('journal.read'),      asyncHandler(getJournalBook));
router.get('/journal-book/export',            requirePermission('journal.export'),    asyncHandler(exportJournalBook));
```

### Step 5 — Create export adapters

**gl.export.adapter.ts** — `backend/src/shared/services/financial/export/gl.export.adapter.ts`:

```typescript
import type { FinancialResponse, GlStatementRow, GlReportResponse } from '../financial.types';
import { buildSubtitle, formatDate, translateRefType } from '../summary.utils';

export function toGlStatementReportInput(response: FinancialResponse<GlStatementRow>) {
  const accountName = String(response.metadata?.accountName ?? '');
  const accountCode = String(response.metadata?.accountCode ?? '');
  return {
    title: `كشف الأستاذ — ${accountCode} ${accountName}`,
    subtitle: buildSubtitle(String(response.metadata?.fromDate ?? ''), String(response.metadata?.toDate ?? '')),
    columns: [
      { header: 'التاريخ',     key: 'date',           width: 14 },
      { header: 'رقم القيد',   key: 'journalNumber',  width: 18 },
      { header: 'النوع',       key: 'referenceType',  width: 12 },
      { header: 'البيان',      key: 'description',    width: 28 },
      { header: 'مدين',        key: 'debit',          width: 14, numFmt: '#,##0.000' },
      { header: 'دائن',        key: 'credit',         width: 14, numFmt: '#,##0.000' },
      { header: 'الرصيد',      key: 'runningBalance', width: 14, numFmt: '#,##0.000' },
    ],
    rows: response.rows.map(r => ({
      date:           formatDate(r.date),
      journalNumber:  r.journalNumber,
      referenceType:  translateRefType(r.referenceType),
      description:    r.description,
      debit:          r.debit   || '',
      credit:         r.credit  || '',
      runningBalance: r.runningBalance,
    })),
    totalsRow: { description: 'الإجمالي', debit: response.summary.totalDebit, credit: response.summary.totalCredit },
  };
}

export function toGlReportInput(response: GlReportResponse) {
  return {
    title: 'دفتر الأستاذ العام',
    subtitle: buildSubtitle(response.filters.fromDate as string, response.filters.toDate as string),
    columns: [
      { header: 'الكود',          key: 'accountCode',    width: 14 },
      { header: 'اسم الحساب',     key: 'accountName',    width: 28 },
      { header: 'النوع',          key: 'accountType',    width: 14 },
      { header: 'رصيد الافتتاح', key: 'openingBalance', width: 16, numFmt: '#,##0.000' },
      { header: 'مدين',           key: 'totalDebit',     width: 14, numFmt: '#,##0.000' },
      { header: 'دائن',           key: 'totalCredit',    width: 14, numFmt: '#,##0.000' },
      { header: 'رصيد الإقفال',  key: 'closingBalance', width: 16, numFmt: '#,##0.000' },
    ],
    rows: response.accounts.map(a => ({
      accountCode: a.accountCode, accountName: a.accountName, accountType: a.accountType,
      openingBalance: a.openingBalance, totalDebit: a.totalDebit, totalCredit: a.totalCredit, closingBalance: a.closingBalance,
    })),
  };
}
```

**trial.export.adapter.ts** — `backend/src/shared/services/financial/export/trial.export.adapter.ts`:

```typescript
import type { FinancialResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow } from '../financial.types';
import { buildSubtitle } from '../summary.utils';

export function toTrialBalanceReportInput(response: FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow>) {
  const mode = String(response.metadata?.mode ?? 'as-of');
  if (mode === 'as-of') {
    return {
      title: 'ميزان المراجعة',
      subtitle: `حتى تاريخ ${String(response.metadata?.asOfDate ?? '').slice(0, 10)}`,
      columns: [
        { header: 'الكود',         key: 'accountCode',  width: 14 },
        { header: 'اسم الحساب',    key: 'accountName',  width: 28 },
        { header: 'النوع',         key: 'accountType',  width: 14 },
        { header: 'إجمالي مدين',   key: 'totalDebit',   width: 16, numFmt: '#,##0.000' },
        { header: 'إجمالي دائن',   key: 'totalCredit',  width: 16, numFmt: '#,##0.000' },
        { header: 'الرصيد',        key: 'balance',      width: 14, numFmt: '#,##0.000' },
        { header: 'طبيعة الرصيد',  key: 'balanceType',  width: 12 },
      ],
      rows: response.rows.map(r => {
        const row = r as TrialBalanceAsOfRow;
        return { accountCode: row.accountCode, accountName: row.accountName, accountType: row.accountType, totalDebit: row.totalDebit, totalCredit: row.totalCredit, balance: row.balance, balanceType: row.balanceType };
      }),
      totalsRow: { accountName: 'الإجمالي', totalDebit: response.summary.totalDebit, totalCredit: response.summary.totalCredit },
    };
  } else {
    return {
      title: 'ميزان المراجعة (فترة)',
      subtitle: buildSubtitle(String(response.metadata?.fromDate ?? ''), String(response.metadata?.toDate ?? '')),
      columns: [
        { header: 'الكود',           key: 'accountCode',    width: 14 },
        { header: 'اسم الحساب',      key: 'accountName',    width: 28 },
        { header: 'رصيد الافتتاح',  key: 'openingBalance', width: 16, numFmt: '#,##0.000' },
        { header: 'مدين الفترة',     key: 'periodDebit',    width: 16, numFmt: '#,##0.000' },
        { header: 'دائن الفترة',     key: 'periodCredit',   width: 16, numFmt: '#,##0.000' },
        { header: 'رصيد الإقفال',   key: 'closingBalance', width: 16, numFmt: '#,##0.000' },
      ],
      rows: response.rows.map(r => {
        const row = r as TrialBalancePeriodRow;
        return { accountCode: row.accountCode, accountName: row.accountName, openingBalance: row.openingBalance, periodDebit: row.periodDebit, periodCredit: row.periodCredit, closingBalance: row.closingBalance };
      }),
      totalsRow: { accountName: 'الإجمالي', periodDebit: response.summary.totalDebit, periodCredit: response.summary.totalCredit },
    };
  }
}
```

**journal.export.adapter.ts** — `backend/src/shared/services/financial/export/journal.export.adapter.ts`:

```typescript
import type { FinancialResponse, JournalBookRow } from '../financial.types';
import { buildSubtitle, formatDate, translateRefType } from '../summary.utils';

export function toJournalBookReportInput(response: FinancialResponse<JournalBookRow>) {
  const flatRows: Record<string, unknown>[] = [];
  for (const entry of response.rows) {
    flatRows.push({
      entryNumber: entry.entryNumber, date: formatDate(entry.date),
      description: entry.description, referenceType: translateRefType(entry.referenceType),
      status: entry.status, accountCode: '', accountName: '', description2: '',
      debit: entry.totalDebit, credit: entry.totalCredit,
    });
    for (const line of entry.lines) {
      flatRows.push({
        entryNumber: '', date: '', description: '', referenceType: '', status: '',
        accountCode: line.accountCode, accountName: line.accountName, description2: line.description ?? '',
        debit: line.debit || '', credit: line.credit || '',
      });
    }
  }
  return {
    title: 'دفتر اليومية',
    subtitle: buildSubtitle(String(response.metadata?.fromDate ?? ''), String(response.metadata?.toDate ?? '')),
    columns: [
      { header: 'رقم القيد',  key: 'entryNumber',   width: 18 },
      { header: 'التاريخ',    key: 'date',           width: 14 },
      { header: 'البيان',     key: 'description',    width: 28 },
      { header: 'المرجع',     key: 'referenceType',  width: 12 },
      { header: 'الحالة',     key: 'status',         width: 10 },
      { header: 'الحساب',     key: 'accountCode',    width: 12 },
      { header: 'اسم الحساب', key: 'accountName',    width: 24 },
      { header: 'بيان البند', key: 'description2',   width: 20 },
      { header: 'مدين',       key: 'debit',          width: 14, numFmt: '#,##0.000' },
      { header: 'دائن',       key: 'credit',         width: 14, numFmt: '#,##0.000' },
    ],
    rows: flatRows,
  };
}
```

### Step 6 — TypeScript validation

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors. Common issues: `accountingService.listJournalEntries()` parameter shape — read the actual method signature in `accounting.service.ts` and match params.

### Step 7 — Create frontend components

**AccountSelector.tsx** — `frontend/src/components/financial/AccountSelector.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { api } from '../../api/client';

interface Account { id: number; code: string; name: string; type: string; }
interface Props { value?: number; onChange: (id: number) => void; }

export function AccountSelector({ value, onChange }: Props) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search, setSearch]     = useState('');

  useEffect(() => {
    api.get<{ data: Account[] }>('/accounting/accounts', { params: { isActive: true } })
      .then(r => setAccounts(r.data.data ?? r.data))
      .catch(() => {});
  }, []);

  const filtered = accounts.filter(a =>
    a.code.includes(search) || a.name.includes(search)
  );

  return (
    <div className="account-selector" dir="rtl">
      <input placeholder="بحث في الحسابات..." value={search} onChange={e => setSearch(e.target.value)} />
      <select
        size={6}
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
      >
        {filtered.map(a => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
        ))}
      </select>
    </div>
  );
}
```

**ModeToggle.tsx** — `frontend/src/components/financial/ModeToggle.tsx`:

```typescript
interface Props { mode: 'as-of' | 'period'; onChange: (m: 'as-of' | 'period') => void; }
export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle" role="group">
      <button className={mode === 'as-of'  ? 'active' : ''} onClick={() => onChange('as-of')}>نقطة زمنية</button>
      <button className={mode === 'period' ? 'active' : ''} onClick={() => onChange('period')}>فترة</button>
    </div>
  );
}
```

**ImbalanceAlert.tsx** — `frontend/src/components/financial/ImbalanceAlert.tsx`:

```typescript
interface Props { isBalanced?: boolean; difference?: number; }
export function ImbalanceAlert({ isBalanced, difference }: Props) {
  if (isBalanced !== false) return null;
  const fmt = (n?: number) => n?.toLocaleString('ar-KW', { minimumFractionDigits: 3 }) ?? '0.000';
  return (
    <div className="imbalance-alert" role="alert">
      ⚠️ ميزان المراجعة غير متوازن — الفرق: {fmt(difference)} د.ك
    </div>
  );
}
```

**TrialBalanceTable.tsx** — `frontend/src/components/financial/TrialBalanceTable.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import type { TrialBalanceAsOfRow, TrialBalancePeriodRow } from '../../api/financial';

function fmt(n: number | undefined) {
  if (!n) return '';
  return n.toLocaleString('ar-KW', { minimumFractionDigits: 3 });
}

interface Props {
  rows: (TrialBalanceAsOfRow | TrialBalancePeriodRow)[];
  mode: 'as-of' | 'period';
  totals?: Partial<TrialBalanceAsOfRow | TrialBalancePeriodRow>;
}

export function TrialBalanceTable({ rows, mode, totals }: Props) {
  const navigate = useNavigate();

  function handleAccountClick(accountId: number) {
    navigate(`/financial?tab=gl&subTab=statement&accountId=${accountId}`);
  }

  if (mode === 'as-of') {
    const asOfRows = rows as TrialBalanceAsOfRow[];
    return (
      <table className="financial-table trial-balance-table" dir="rtl">
        <thead>
          <tr><th>الكود</th><th>اسم الحساب</th><th>النوع</th><th>إجمالي مدين</th><th>إجمالي دائن</th><th>الرصيد</th><th>طبيعة</th></tr>
        </thead>
        <tbody>
          {asOfRows.map(row => (
            <tr key={row.id}>
              <td>{row.accountCode}</td>
              <td><button className="account-link" onClick={() => handleAccountClick(row.accountId)}>{row.accountName}</button></td>
              <td>{row.accountType}</td>
              <td className="num">{fmt(row.totalDebit)}</td>
              <td className="num">{fmt(row.totalCredit)}</td>
              <td className={`num ${(row.balance ?? 0) < 0 ? 'negative' : ''}`}>{fmt(Math.abs(row.balance ?? 0))}</td>
              <td>{row.balanceType === 'DEBIT' ? 'مدين' : 'دائن'}</td>
            </tr>
          ))}
          {totals && (
            <tr className="totals-row">
              <td colSpan={3}>الإجمالي</td>
              <td className="num">{fmt((totals as Partial<TrialBalanceAsOfRow>).totalDebit)}</td>
              <td className="num">{fmt((totals as Partial<TrialBalanceAsOfRow>).totalCredit)}</td>
              <td colSpan={2} />
            </tr>
          )}
        </tbody>
      </table>
    );
  } else {
    const periodRows = rows as TrialBalancePeriodRow[];
    return (
      <table className="financial-table trial-balance-table" dir="rtl">
        <thead>
          <tr><th>الكود</th><th>اسم الحساب</th><th>رصيد الافتتاح</th><th>مدين الفترة</th><th>دائن الفترة</th><th>رصيد الإقفال</th></tr>
        </thead>
        <tbody>
          {periodRows.map(row => (
            <tr key={row.id}>
              <td>{row.accountCode}</td>
              <td><button className="account-link" onClick={() => handleAccountClick(row.accountId)}>{row.accountName}</button></td>
              <td className="num">{fmt(row.openingBalance)}</td>
              <td className="num">{fmt(row.periodDebit)}</td>
              <td className="num">{fmt(row.periodCredit)}</td>
              <td className="num">{fmt(row.closingBalance)}</td>
            </tr>
          ))}
          {totals && (
            <tr className="totals-row">
              <td colSpan={2}>الإجمالي</td>
              <td />
              <td className="num">{fmt((totals as Partial<TrialBalancePeriodRow>).periodDebit)}</td>
              <td className="num">{fmt((totals as Partial<TrialBalancePeriodRow>).periodCredit)}</td>
              <td />
            </tr>
          )}
        </tbody>
      </table>
    );
  }
}
```

**JournalBookTable.tsx** — `frontend/src/components/financial/JournalBookTable.tsx`:

```typescript
import { useState } from 'react';
import type { JournalBookRow } from '../../api/financial';
import { DrillDownLink, type FinancialDrillDownState } from './DrillDownLink';

function fmt(n: number) { return n.toLocaleString('ar-KW', { minimumFractionDigits: 3 }); }

interface Props {
  rows: JournalBookRow[];
  currentState: FinancialDrillDownState;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
}

export function JournalBookTable({ rows, currentState }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggleAll(expand: boolean) {
    setExpanded(expand ? new Set(rows.map(r => r.id)) : new Set());
  }

  return (
    <div className="journal-book-container" dir="rtl">
      <div className="journal-book-controls">
        <button onClick={() => toggleAll(true)}>فتح الكل</button>
        <button onClick={() => toggleAll(false)}>إغلاق الكل</button>
      </div>
      <table className="financial-table journal-book-table">
        <thead>
          <tr>
            <th />
            <th>رقم القيد</th><th>التاريخ</th><th>البيان</th>
            <th>المرجع</th><th>الحالة</th><th>مدين</th><th>دائن</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <>
              <tr
                key={row.id}
                id={`row-${row.id}`}
                className={`journal-entry-row ${expanded.has(row.id) ? 'expanded' : ''}`}
                onClick={() => setExpanded(prev => { const n = new Set(prev); n.has(row.id) ? n.delete(row.id) : n.add(row.id); return n; })}
              >
                <td>{expanded.has(row.id) ? '▼' : '▶'}</td>
                <td>{row.entryNumber}</td>
                <td>{row.date.slice(0, 10)}</td>
                <td>{row.description}</td>
                <td>
                  <DrillDownLink drillDown={row.drillDown} currentState={currentState}>
                    {row.referenceType}
                  </DrillDownLink>
                </td>
                <td>{row.status}</td>
                <td className="num">{fmt(row.totalDebit)}</td>
                <td className="num">{fmt(row.totalCredit)}</td>
              </tr>
              {expanded.has(row.id) && (
                <tr key={`${row.id}-lines`} className="journal-lines-row">
                  <td colSpan={8}>
                    <table className="journal-lines-table">
                      <thead>
                        <tr><th>الحساب</th><th>اسم الحساب</th><th>البيان</th><th>مدين</th><th>دائن</th></tr>
                      </thead>
                      <tbody>
                        {row.lines.map((line, li) => (
                          <tr key={li}>
                            <td>{line.accountCode}</td>
                            <td>{line.accountName}</td>
                            <td>{line.description}</td>
                            <td className="num">{line.debit ? fmt(line.debit) : ''}</td>
                            <td className="num">{line.credit ? fmt(line.credit) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 8 — Wire GL/Trial/Journal tabs into FinancialCenter.tsx

Replace the `activeTab === 'gl'`, `activeTab === 'trial'`, and `activeTab === 'journal'` placeholder sections in `FinancialCenter.tsx` with full implementations. Due to the length of this component, each tab follows the same pattern established in Part 2 (Statement) and Part 3 (Aging):

1. **GL Tab:** Renders sub-tabs (`كشف الحساب` / `دفتر الأستاذ`). For `كشف الحساب`, shows `AccountSelector` + `FilterBar` + `SummaryCards` with D/C indicator from `metadata.normalBalance` + `StatementTable`. For `دفتر الأستاذ`, shows `FilterBar` + paginated list of `GlReportAccount` each with a collapsible `StatementTable`.

2. **Trial Balance Tab:** Shows `ModeToggle` + `FilterBar` (mode-dependent fields) + `ImbalanceAlert` (reads `metadata.isBalanced`) + `TrialBalanceTable`. Account name click → `navigate('/financial?tab=gl&subTab=statement&accountId=X')`.

3. **Journal Book Tab:** Shows `FilterBar` + `SummaryCards` + `JournalBookTable` with pagination.

The `currentState` for DrillDownLink in each tab must set:
- GL: `{ tab: 'gl', subTab: 'statement', accountId, fromDate, toDate }`
- Trial: `{ tab: 'trial', mode, asOfDate/fromDate/toDate }`
- Journal: `{ tab: 'journal', fromDate, toDate, page }`

### Step 9 — Add ?highlight= to Accounting.tsx

In `frontend/src/pages/Accounting.tsx`:

1. Add imports:
```typescript
import { useHighlight } from '../hooks/useHighlight';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
```

2. Call inside component:
```typescript
const highlightId = useHighlight();
```

3. Add `id={`row-${entry.id}`}` to journal entry rows in the table render.

4. Add `<ReturnToReportButton />` below page title.

### Step 10 — TypeScript validation

```bash
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

Expected: 0 errors in both.

### Step 11 — Commit

```bash
git add backend/src/modules/financial/ backend/src/shared/services/financial/export/ frontend/src/components/financial/ frontend/src/pages/FinancialCenter.tsx frontend/src/pages/Accounting.tsx
git commit -m "feat(financial): add GL Statement, GL Report, Trial Balance, and Journal Book with export and DrillDown"
```

---

## Validation

- [ ] `GET /api/financial/gl-statement/1` → 200 with running balances
- [ ] `GET /api/financial/gl-statement/999` → 404 (account not found)
- [ ] `GET /api/financial/gl-statement/1` with account that has no journal lines → 200 with `rows: []`, `openingBalance: 0`
- [ ] `GET /api/financial/trial-balance?mode=as-of&asOfDate=2025-12-31` → 200
- [ ] `GET /api/financial/trial-balance?mode=period&fromDate=2025-01-01&toDate=2025-12-31` → 200
- [ ] Trial balance `metadata.isBalanced` is correct (true when totalDebit ≈ totalCredit)
- [ ] `GET /api/financial/journal-book` → 200 with pagination
- [ ] `GET /api/financial/gl-report` → 200 with `GlReportResponse` shape
- [ ] GL Tab AccountSelector loads active accounts from `/accounting/accounts`
- [ ] GL Statement tab shows correct running balance progression
- [ ] Trial Balance imbalance alert shows when applicable
- [ ] Trial Balance account click → navigates to GL Statement tab for that account
- [ ] Journal Book expandAll/collapseAll works
- [ ] DrillDown from Journal row → Accounting.tsx with highlight

## Rollback Considerations

- All changes are additive; removing routes, handlers, and service methods cleanly reverts
- `Accounting.tsx` change is minimal (2 imports, 1 hook call, 1 component) — low risk

## Risks

- **`accountingService.listJournalEntries()` signature mismatch:** Read the exact method signature in `accounting.service.ts` before implementing. The parameter names (`status`, `description`, `fromDate`, `toDate`, `referenceType`) must match exactly.
- **Trial Balance large dataset:** If schema has thousands of accounts, `Promise.all` inside `getGlReport()` runs N×2 Prisma queries per page. For a page of 20 accounts, that's 40 queries. Acceptable for SQLite but monitor performance.
- **M9 — GL balance sign:** The running balance and opening balance use `debit - credit`. For credit-normal accounts (liabilities, equity, revenue), this produces negative numbers when the account has a normal balance. Frontend must show D/C indicator from `metadata.normalBalance` and avoid showing raw negative numbers.

## Acceptance Criteria

- GL Statement correctly computes running balance from opening balance
- GL Report returns account-level totals without fetching all lines
- Trial Balance totals balance (or shows imbalance alert correctly)
- Journal Book entries expand/collapse with line details
- All exports produce valid Excel/PDF files

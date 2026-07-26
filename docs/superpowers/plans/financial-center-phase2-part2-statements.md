# Part 2 — Backend Module Scaffold + Statement Center

> **Depends on:** Part 1 (Foundation)
> **Blocks:** Parts 3, 4, 5 (they extend the files created here)

---

## Objective

Create the `financial` backend module (routes, controller, schema, service) with Statement endpoints implemented and registered in `app.ts`. Then build the frontend foundation: API client, route, sidebar entry, shared components, and the FinancialCenter page with the Statement tab wired up. Add `?highlight=` DrillDown support to `Invoices.tsx` and `Expenses.tsx`.

## Scope

**Backend:**
- `financial.schema.ts` — Zod schemas (statement params; stubs for later extensions)
- `financial.routes.ts` — Statement GET + export routes (all other routes added in Parts 3–4)
- `financial.controller.ts` — Statement handlers
- `financial.service.ts` — `getStatement()` and `exportStatement()` methods
- `backend/src/app.ts` — register `/api/financial` router

**Frontend:**
- `frontend/src/api/financial.ts` — API client (statement calls; others added in later parts)
- `frontend/src/hooks/useHighlight.ts`
- `frontend/src/App.tsx` — add `/financial` route
- `frontend/src/config/modules.tsx` — add "المحاسبة المالية" NAV entry
- Shared components: `FinancialTabs`, `FilterBar`, `SummaryCards`, `ExportBar`, `DrillDownLink`, `ReturnToReportButton`, `StatementTable`, `GroupedTable`
- `frontend/src/pages/FinancialCenter.tsx` — page shell + Statement tab
- `frontend/src/pages/Invoices.tsx` — add `?highlight=` + `ReturnToReportButton`
- `frontend/src/pages/Expenses.tsx` — add `?highlight=` + `ReturnToReportButton`

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/modules/financial/financial.schema.ts` | Zod validation for all query params |
| `backend/src/modules/financial/financial.routes.ts` | Express router |
| `backend/src/modules/financial/financial.controller.ts` | Request handlers |
| `backend/src/modules/financial/financial.service.ts` | Business logic + orchestration |
| `frontend/src/api/financial.ts` | All API calls to /financial/* |
| `frontend/src/hooks/useHighlight.ts` | ?highlight= URL param handler |
| `frontend/src/components/financial/FinancialTabs.tsx` | RBAC-aware tab bar |
| `frontend/src/components/financial/FilterBar.tsx` | Date + search filter row |
| `frontend/src/components/financial/SummaryCards.tsx` | Opening/Debit/Credit/Closing cards |
| `frontend/src/components/financial/ExportBar.tsx` | Excel + PDF export buttons |
| `frontend/src/components/financial/DrillDownLink.tsx` | Navigate with state save |
| `frontend/src/components/financial/ReturnToReportButton.tsx` | "العودة إلى التقرير" button |
| `frontend/src/components/financial/StatementTable.tsx` | Flat statement rows with DrillDown |
| `frontend/src/components/financial/GroupedTable.tsx` | Year → Month → Detail hierarchy |
| `frontend/src/pages/FinancialCenter.tsx` | Main page, all tabs wired via FINANCIAL_TABS |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/app.ts` | Add `import financialRouter` + `app.use('/api/financial', financialRouter)` |
| `frontend/src/App.tsx` | Add `<Route path="/financial" element={...}>` inside Layout route |
| `frontend/src/config/modules.tsx` | Add NAV entry for `financial` in the financial group |
| `frontend/src/pages/Invoices.tsx` | Add `useHighlight()` call + `id` on rows + `ReturnToReportButton` |
| `frontend/src/pages/Expenses.tsx` | Same pattern as Invoices.tsx |

## Dependencies

- Part 1: `financial.types.ts`, `balance.utils.ts`, `drilldown.utils.ts`, `financial.response.ts`, `summary.utils.ts`
- Existing: `buildStatement()` from `@shared/services/statement.service`
- Existing: `buildExcel()` from `@shared/services/reportEngine/excel.service`
- Existing: `buildPdf()` from `@shared/services/reportEngine/pdf.service`
- Existing: `authenticate` + `requirePermission` from `@core/middleware/`
- Existing: `recordAudit` from `@core/middleware/audit`

---

## Step-by-Step Implementation

### Step 1 — Create financial.schema.ts

Create `backend/src/modules/financial/financial.schema.ts`:

```typescript
import { z } from 'zod';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional();
const pageInt = z.coerce.number().int().positive().default(1);
const pageSizeInt = z.coerce.number().int().positive().max(200).default(50);

// Statement schemas
export const StatementParamsSchema = z.object({
  entityType: z.enum(['customer', 'supplier']),
  id: z.coerce.number().int().positive(),
});

export const StatementQuerySchema = z.object({
  fromDate:      dateStr,
  toDate:        dateStr,
  search:        z.string().optional(),
  referenceType: z.string().optional(),
  status:        z.string().optional(),
});

export const ExportQuerySchema = StatementQuerySchema.extend({
  format: z.enum(['pdf', 'excel']).default('excel'),
});

// Aging schemas
export const AgingQuerySchema = z.object({
  asOfDate:     dateStr,
  search:       z.string().optional(),
  customerType: z.enum(['GOVERNMENT', 'PRIVATE']).optional(),
  hideZero:     z.coerce.boolean().default(false),
  format:       z.enum(['pdf', 'excel']).optional(),
});

// GL schemas
export const GlStatementQuerySchema = z.object({
  fromDate: dateStr,
  toDate:   dateStr,
  search:   z.string().optional(),
  status:   z.string().optional(),
  format:   z.enum(['pdf', 'excel']).optional(),
  page:     pageInt,
  pageSize: pageSizeInt,
});

export const GlReportQuerySchema = z.object({
  fromDate:    dateStr,
  toDate:      dateStr,
  accountType: z.string().optional(),
  page:        pageInt,
  pageSize:    z.coerce.number().int().positive().max(100).default(20),
  format:      z.enum(['pdf', 'excel']).optional(),
});

// Trial Balance schemas
export const TrialBalanceQuerySchema = z.object({
  mode:             z.enum(['as-of', 'period']).default('as-of'),
  asOfDate:         dateStr,
  fromDate:         dateStr,
  toDate:           dateStr,
  showZeroBalances: z.coerce.boolean().default(false),
  accountType:      z.string().optional(),
  format:           z.enum(['pdf', 'excel']).optional(),
});

// Journal Book schemas
export const JournalBookQuerySchema = z.object({
  fromDate:      dateStr,
  toDate:        dateStr,
  status:        z.string().optional(),
  referenceType: z.string().optional(),
  search:        z.string().optional(),
  page:          pageInt,
  pageSize:      pageSizeInt,
  format:        z.enum(['pdf', 'excel']).optional(),
});

// Financial Summary schemas
export const SummaryQuerySchema = z.object({
  fromDate: dateStr,
  toDate:   dateStr,
  format:   z.enum(['pdf', 'excel']).optional(),
});
```

### Step 2 — Create financial.service.ts (statement methods only)

Create `backend/src/modules/financial/financial.service.ts`:

```typescript
import { buildStatement } from '@shared/services/statement.service';
import { buildExcel }     from '@shared/services/reportEngine/excel.service';
import { buildPdf }       from '@shared/services/reportEngine/pdf.service';
import { wrapFinancialResponse } from '@shared/services/financial/financial.response';
import { buildDrillDownRef }     from '@shared/services/financial/drilldown.utils';
import { normalizeMoney }        from '@shared/services/financial/balance.utils';
import { buildSubtitle, formatDate, translateRefType, sanitizeFilters } from '@shared/services/financial/summary.utils';
import { toStatementReportInput } from '@shared/services/financial/export/statement.export.adapter';
import type {
  FinancialResponse, StatementRow, DrillDownRef,
} from '@shared/services/financial/financial.types';

// Parts 3–5 will add more imports and methods to this class.

export class FinancialService {

  // ─── Statement ────────────────────────────────────────────────────────────

  async getStatement(
    entityType: string,
    entityId: number,
    filters: { fromDate?: string; toDate?: string; search?: string; referenceType?: string }
  ): Promise<FinancialResponse<StatementRow>> {

    const result = await buildStatement({
      entityType: entityType.toUpperCase() as 'CUSTOMER' | 'SUPPLIER',
      entityId,
      filters: {
        fromDate:      filters.fromDate  ? new Date(filters.fromDate)  : undefined,
        toDate:        filters.toDate    ? new Date(filters.toDate)    : undefined,
        search:        filters.search,
        referenceType: filters.referenceType,
      },
    });

    const rows: StatementRow[] = result.entries.map(entry => ({
      // M4 FIX: use timestamp fallback to avoid 'STMT-INVOICE-undefined' for manual entries
      id: entry.referenceId
        ? `STMT-${entry.referenceType}-${entry.referenceId}`
        : `STMT-${entry.referenceType}-${new Date(entry.date).getTime()}`,
      date:           entry.date instanceof Date ? entry.date.toISOString() : String(entry.date),
      reference:      entry.reference,
      referenceType:  entry.referenceType,
      referenceId:    entry.referenceId ?? undefined,
      description:    entry.description,
      debit:          normalizeMoney(entry.debit),
      credit:         normalizeMoney(entry.credit),
      runningBalance: normalizeMoney(entry.runningBalance),
      status:         entry.status,
      drillDown: entry.referenceId
        ? buildDrillDownRef(entry.referenceType as DrillDownRef['entityType'], entry.referenceId)
        : undefined,
    }));

    return wrapFinancialResponse<StatementRow>({
      reportType: 'statement',
      summary: {
        openingBalance:   normalizeMoney(result.summary?.openingBalance ?? 0),
        totalDebit:       normalizeMoney(result.summary?.totalDebit ?? 0),
        totalCredit:      normalizeMoney(result.summary?.totalCredit ?? 0),
        closingBalance:   normalizeMoney(result.summary?.closingBalance ?? 0),
        transactionCount: rows.length,
      },
      metadata: {
        entityType:  result.entityType,
        entityName:  result.entityName,
        entityCode:  result.entityCode,
        fromDate:    filters.fromDate,
        toDate:      filters.toDate,
      },
      filters: sanitizeFilters(filters),
      rows,
      totals: {
        id:             'TOTALS',
        description:    'الإجمالي',
        debit:          normalizeMoney(result.summary?.totalDebit ?? 0),
        credit:         normalizeMoney(result.summary?.totalCredit ?? 0),
        runningBalance: normalizeMoney(result.summary?.closingBalance ?? 0),
      } as Partial<StatementRow>,
    });
  }

  async exportStatement(
    entityType: string,
    entityId: number,
    filters: { fromDate?: string; toDate?: string; search?: string; referenceType?: string },
    format: 'pdf' | 'excel'
  ): Promise<Buffer> {
    const data = await this.getStatement(entityType, entityId, filters);
    const entityName = String(data.metadata?.entityName ?? '');
    const input = toStatementReportInput(data, entityName);
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // Parts 3–5 add: getArAging, getApAging, getGlStatement, getGlReport,
  //                getTrialBalance, getJournalBook, getFinancialSummary, getDashboardSummary
}

export const financialService = new FinancialService();
```

### Step 3 — Create statement.export.adapter.ts

Create `backend/src/shared/services/financial/export/statement.export.adapter.ts`:

```typescript
import type { FinancialResponse, StatementRow } from '../financial.types';
import type { ReportInput } from '../reportEngine/types';  // existing type from excel/pdf service
import { buildSubtitle, formatDate, translateRefType } from '../summary.utils';

const STATEMENT_EXPORT_COLUMNS = [
  { header: 'التاريخ',   key: 'date',            width: 14 },
  { header: 'المرجع',    key: 'reference',        width: 20 },
  { header: 'النوع',     key: 'referenceType',    width: 14 },
  { header: 'البيان',    key: 'description',      width: 30 },
  { header: 'مدين',      key: 'debit',            width: 14, numFmt: '#,##0.000' },
  { header: 'دائن',      key: 'credit',           width: 14, numFmt: '#,##0.000' },
  { header: 'الرصيد',    key: 'runningBalance',   width: 14, numFmt: '#,##0.000' },
] as const;

export function toStatementReportInput(
  response: FinancialResponse<StatementRow>,
  entityName: string
): ReportInput {
  return {
    title:    `كشف حساب — ${entityName}`,
    subtitle: buildSubtitle(
      String(response.metadata?.fromDate ?? ''),
      String(response.metadata?.toDate   ?? '')
    ),
    columns:  [...STATEMENT_EXPORT_COLUMNS],
    rows: response.rows.map(r => ({
      date:          formatDate(r.date),
      reference:     r.reference,
      referenceType: translateRefType(r.referenceType),
      description:   r.description,
      debit:         r.debit   || '',
      credit:        r.credit  || '',
      runningBalance: r.runningBalance,
    })),
    totalsRow: response.totals ? {
      description:    'الإجمالي',
      debit:          response.summary.totalDebit,
      credit:         response.summary.totalCredit,
      runningBalance: response.summary.closingBalance,
    } : undefined,
  };
}
```

**Note:** If `ReportInput` type does not exist as a standalone import, inline the object shape (the existing excel/pdf services define their own input shape). Look at `backend/src/shared/services/reportEngine/excel.service.ts` for the actual parameter type and match it.

### Step 4 — Create financial.controller.ts

Create `backend/src/modules/financial/financial.controller.ts`:

```typescript
import type { Request, Response } from 'express';
import { financialService }  from './financial.service';
import {
  StatementParamsSchema, StatementQuerySchema, ExportQuerySchema,
} from './financial.schema';
import { recordAudit }        from '@core/middleware/audit';
import { ok, error }          from '@core/utils/response';
import { sanitizeFilters }    from '@shared/services/financial/summary.utils';

// Parts 3–5 add additional handler functions below.

// ─── Statement ────────────────────────────────────────────────────────────

export async function getStatement(req: Request, res: Response): Promise<void> {
  const { entityType, id } = StatementParamsSchema.parse(req.params);
  const filters = StatementQuerySchema.parse(req.query);
  const data = await financialService.getStatement(entityType, id, filters);
  ok(res, data);
}

export async function exportStatement(req: Request, res: Response): Promise<void> {
  const { entityType, id } = StatementParamsSchema.parse(req.params);
  const query  = ExportQuerySchema.parse(req.query);
  const format = query.format as 'pdf' | 'excel';

  const buffer = await financialService.exportStatement(entityType, id, query, format);

  recordAudit({
    req,
    action:   'REPORT_EXPORT',
    module:   'financial',
    entityId: undefined,
    newValue: {
      reportType: 'statement',
      format,
      filters: sanitizeFilters(query),
    },
  }).catch(() => {});

  const contentType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="statement-${entityType}-${id}-${Date.now()}.${format === 'pdf' ? 'pdf' : 'xlsx'}"`);
  res.send(buffer);
}
```

### Step 5 — Create financial.routes.ts

Create `backend/src/modules/financial/financial.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate }       from '@core/middleware/auth.middleware';
import { requirePermission }  from '@core/middleware/rbac.middleware';
import { asyncHandler }       from '@core/utils/asyncHandler';
import {
  getStatement, exportStatement,
} from './financial.controller';

const router = Router();
router.use(authenticate);

// ─── Statement Center ─────────────────────────────────────────────────────
router.get('/statements/:entityType/:id',        requirePermission('statements.read'),   asyncHandler(getStatement));
router.get('/statements/:entityType/:id/export', requirePermission('statements.export'), asyncHandler(exportStatement));

// Parts 3–5 append additional routes here.

export default router;
```

### Step 6 — Register router in app.ts

In `backend/src/app.ts`, add after the existing `statementsRoutes` import and registration:

```typescript
// Add import at top with other route imports:
import financialRoutes from './modules/financial/financial.routes';

// Add after app.use('/api/statements', statementsRoutes):
app.use('/api/financial', financialRoutes);
```

### Step 7 — TypeScript validation (backend)

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors. Fix any import path issues (alias `@shared/*` → `../../shared/`).

### Step 8 — Manual API smoke test

Start the backend dev server and test:

```bash
# In backend terminal:
cd backend && npm run dev

# In another terminal:
curl -X GET "http://127.0.0.1:48211/api/financial/statements/customer/1" \
  -H "Authorization: Bearer <token>"
```

Expected: `{"success": true, "data": {"reportType": "statement", "rows": [...], "summary": {...}}}`

---

### Step 9 — Create frontend API client

Create `frontend/src/api/financial.ts`:

```typescript
import { api } from './client';
import type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
  GlStatementRow, GlReportResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow,
  JournalBookRow, DashboardSummary,
} from '../../../backend/src/shared/services/financial/financial.types';

// Re-export for frontend use
export type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
  GlStatementRow, GlReportResponse, TrialBalanceAsOfRow, TrialBalancePeriodRow,
  JournalBookRow, DashboardSummary,
};

type StatementFilters = {
  fromDate?: string;
  toDate?: string;
  search?: string;
  referenceType?: string;
};

type AgingFilters = {
  asOfDate?: string;
  search?: string;
  customerType?: string;
  hideZero?: boolean;
};

type GlFilters = {
  fromDate?: string;
  toDate?: string;
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

type TrialBalanceFilters = {
  mode: 'as-of' | 'period';
  asOfDate?: string;
  fromDate?: string;
  toDate?: string;
  showZeroBalances?: boolean;
  accountType?: string;
};

type JournalFilters = {
  fromDate?: string;
  toDate?: string;
  status?: string;
  referenceType?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export const financialApi = {
  // ── Statement ──────────────────────────────────────────────────────────
  getStatement(entityType: 'customer' | 'supplier', entityId: number, filters: StatementFilters) {
    return api.get<{ data: FinancialResponse<StatementRow> }>(
      `/financial/statements/${entityType}/${entityId}`,
      { params: filters }
    ).then(r => r.data.data);
  },
  exportStatement(entityType: 'customer' | 'supplier', entityId: number, filters: StatementFilters & { format: 'pdf' | 'excel' }) {
    return api.get(
      `/financial/statements/${entityType}/${entityId}/export`,
      { params: filters, responseType: 'blob' }
    ).then(r => r.data as Blob);
  },

  // ── Aging ──────────────────────────────────────────────────────────────
  getArAging(filters: AgingFilters) {
    return api.get<{ data: FinancialResponse<ArAgingRow> }>(
      '/financial/ar-aging', { params: filters }
    ).then(r => r.data.data);
  },
  getApAging(filters: AgingFilters) {
    return api.get<{ data: FinancialResponse<ApAgingRow> }>(
      '/financial/ap-aging', { params: filters }
    ).then(r => r.data.data);
  },
  exportArAging(filters: AgingFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/ar-aging/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },
  exportApAging(filters: AgingFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/ap-aging/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── GL Statement ───────────────────────────────────────────────────────
  getGlStatement(accountId: number, filters: GlFilters) {
    return api.get<{ data: FinancialResponse<GlStatementRow> }>(
      `/financial/gl-statement/${accountId}`, { params: filters }
    ).then(r => r.data.data);
  },
  exportGlStatement(accountId: number, filters: GlFilters & { format: 'pdf' | 'excel' }) {
    return api.get(`/financial/gl-statement/${accountId}/export`, { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── GL Report ──────────────────────────────────────────────────────────
  getGlReport(filters: { fromDate?: string; toDate?: string; accountType?: string; page?: number; pageSize?: number }) {
    return api.get<{ data: GlReportResponse }>(
      '/financial/gl-report', { params: filters }
    ).then(r => r.data.data);
  },
  exportGlReport(filters: { fromDate?: string; toDate?: string; format: 'pdf' | 'excel' }) {
    return api.get('/financial/gl-report/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Trial Balance ──────────────────────────────────────────────────────
  getTrialBalance(filters: TrialBalanceFilters) {
    return api.get<{ data: FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow> }>(
      '/financial/trial-balance', { params: filters }
    ).then(r => r.data.data);
  },
  exportTrialBalance(filters: TrialBalanceFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/trial-balance/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Journal Book ───────────────────────────────────────────────────────
  getJournalBook(filters: JournalFilters) {
    return api.get<{ data: FinancialResponse<JournalBookRow> }>(
      '/financial/journal-book', { params: filters }
    ).then(r => r.data.data);
  },
  exportJournalBook(filters: JournalFilters & { format: 'pdf' | 'excel' }) {
    return api.get('/financial/journal-book/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Financial Summary ──────────────────────────────────────────────────
  getFinancialSummary(filters: { fromDate?: string; toDate?: string }) {
    return api.get<{ data: FinancialResponse<never> }>(
      '/financial/summary', { params: filters }
    ).then(r => r.data.data);
  },
  exportFinancialSummary(filters: { fromDate?: string; toDate?: string; format: 'pdf' | 'excel' }) {
    return api.get('/financial/summary/export', { params: filters, responseType: 'blob' }).then(r => r.data as Blob);
  },

  // ── Dashboard Summary ──────────────────────────────────────────────────
  getDashboardSummary() {
    return api.get<{ data: DashboardSummary }>('/financial/dashboard-summary').then(r => r.data.data);
  },
};
```

**Note on types import path:** The frontend imports backend types. This is acceptable in a monorepo Electron app. If this causes issues during Vite build, copy the types to `frontend/src/types/financial.types.ts` instead.

### Step 10 — Create useHighlight.ts

Create `frontend/src/hooks/useHighlight.ts`:

```typescript
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useHighlight(): string | null {
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');

  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`row-${highlightId}`);
    if (!el) {
      // Row might render asynchronously — retry after short delay
      const timer = setTimeout(() => {
        const delayed = document.getElementById(`row-${highlightId}`);
        if (!delayed) return;
        delayed.scrollIntoView({ behavior: 'smooth', block: 'center' });
        delayed.classList.add('highlight-row');
        setTimeout(() => delayed.classList.remove('highlight-row'), 3000);
      }, 300);
      return () => clearTimeout(timer);
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('highlight-row');
    const timer = setTimeout(() => el.classList.remove('highlight-row'), 3000);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return highlightId;
}
```

Add CSS in `frontend/src/index.css` or a global stylesheet:

```css
.highlight-row {
  background-color: #fefce8 !important;  /* yellow-50 */
  outline: 2px solid #ca8a04 !important;  /* yellow-600 */
  transition: background-color 3s ease-out, outline 3s ease-out;
}
```

### Step 11 — Create shared financial components

**FinancialTabs.tsx** — `frontend/src/components/financial/FinancialTabs.tsx`:

```typescript
import { useAuth } from '../../stores/authStore';

interface Tab { key: string; label: string; permission: string; }
interface Props { tabs: Tab[]; activeTab: string; onTabChange: (key: string) => void; }

export function FinancialTabs({ tabs, activeTab, onTabChange }: Props) {
  const { hasPermission } = useAuth();
  const visible = tabs.filter(t => hasPermission(t.permission));

  return (
    <div className="financial-tabs" role="tablist">
      {visible.map(tab => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          className={`financial-tab-btn ${activeTab === tab.key ? 'active' : ''}`}
          onClick={() => onTabChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

**FilterBar.tsx** — `frontend/src/components/financial/FilterBar.tsx`:

```typescript
interface FilterBarProps {
  fromDate?: string;
  toDate?: string;
  search?: string;
  onFromDate?: (v: string) => void;
  onToDate?: (v: string) => void;
  onSearch?: (v: string) => void;
  children?: React.ReactNode; // extra filters (entity selector, status, etc.)
}

export function FilterBar({ fromDate, toDate, search, onFromDate, onToDate, onSearch, children }: FilterBarProps) {
  return (
    <div className="financial-filter-bar" dir="rtl">
      {children}
      {onFromDate && (
        <div className="filter-field">
          <label>من تاريخ</label>
          <input type="date" value={fromDate ?? ''} onChange={e => onFromDate(e.target.value)} />
        </div>
      )}
      {onToDate && (
        <div className="filter-field">
          <label>إلى تاريخ</label>
          <input type="date" value={toDate ?? ''} onChange={e => onToDate(e.target.value)} />
        </div>
      )}
      {onSearch && (
        <div className="filter-field">
          <label>بحث</label>
          <input
            type="text"
            value={search ?? ''}
            placeholder="بحث..."
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
```

**SummaryCards.tsx** — `frontend/src/components/financial/SummaryCards.tsx`:

```typescript
interface Card { label: string; value?: number; variant?: 'neutral' | 'green' | 'red' | 'blue'; }
interface Props { cards: Card[]; }

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function SummaryCards({ cards }: Props) {
  return (
    <div className="financial-summary-cards">
      {cards.map((c, i) => (
        <div key={i} className={`summary-card ${c.variant ?? 'neutral'}`}>
          <div className="card-label">{c.label}</div>
          <div className="card-value">{fmt(c.value)} <span className="currency">د.ك</span></div>
        </div>
      ))}
    </div>
  );
}
```

**ExportBar.tsx** — `frontend/src/components/financial/ExportBar.tsx`:

```typescript
interface Props {
  onExcelExport: () => void;
  onPdfExport: () => void;
  loading?: boolean;
}

export function ExportBar({ onExcelExport, onPdfExport, loading }: Props) {
  return (
    <div className="financial-export-bar">
      <button className="export-btn excel" onClick={onExcelExport} disabled={loading}>
        <span className="material-symbols-outlined">table_view</span> Excel
      </button>
      <button className="export-btn pdf" onClick={onPdfExport} disabled={loading}>
        <span className="material-symbols-outlined">picture_as_pdf</span> PDF
      </button>
    </div>
  );
}
```

**DrillDownLink.tsx** — `frontend/src/components/financial/DrillDownLink.tsx`:

```typescript
import { useNavigate } from 'react-router-dom';
import type { DrillDownRef } from '../../../backend/src/shared/services/financial/financial.types';

export interface FinancialDrillDownState {
  returnTo:    string;
  reportLabel: string;
  tab:         string;
  subTab?:     string;
  entityType?: string;
  entityId?:   number;
  accountId?:  number;
  fromDate?:   string;
  toDate?:     string;
  mode?:       string;
  page?:       number;
  scrollY?:    number;
}

interface Props {
  drillDown?: DrillDownRef;
  currentState: FinancialDrillDownState;
  children: React.ReactNode;
}

export function DrillDownLink({ drillDown, currentState, children }: Props) {
  const navigate = useNavigate();

  if (!drillDown?.route) return <span className="drill-down-text">{children}</span>;

  function handleClick() {
    sessionStorage.setItem('app.drilldown.returnState', JSON.stringify({
      ...currentState,
      scrollY: window.scrollY,
    }));
    navigate(`${drillDown!.route}?highlight=${drillDown!.entityId}`);
  }

  return (
    <button onClick={handleClick} className="drill-down-link" type="button">
      {children}
    </button>
  );
}
```

**ReturnToReportButton.tsx** — `frontend/src/components/financial/ReturnToReportButton.tsx`:

```typescript
import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { FinancialDrillDownState } from './DrillDownLink';

export function ReturnToReportButton() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const highlight = searchParams.get('highlight');

  const returnState = useMemo((): FinancialDrillDownState | null => {
    try {
      const raw = sessionStorage.getItem('app.drilldown.returnState');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  if (!highlight || !returnState) return null;

  function handleReturn() {
    // M5 FIX: Build URL from params — not location.state — so it survives page refresh
    const params = new URLSearchParams();
    params.set('tab', returnState!.tab);
    if (returnState!.subTab)     params.set('subTab',     returnState!.subTab);
    if (returnState!.entityType) params.set('entityType', returnState!.entityType);
    if (returnState!.entityId)   params.set('entityId',   String(returnState!.entityId));
    if (returnState!.accountId)  params.set('accountId',  String(returnState!.accountId));
    if (returnState!.fromDate)   params.set('fromDate',   returnState!.fromDate);
    if (returnState!.toDate)     params.set('toDate',     returnState!.toDate);
    if (returnState!.mode)       params.set('mode',       returnState!.mode);
    sessionStorage.removeItem('app.drilldown.returnState');
    // Pass scrollY only via location.state (non-critical — lost on refresh is fine)
    navigate(`${returnState!.returnTo}?${params.toString()}`, {
      state: { scrollY: returnState!.scrollY },
    });
  }

  return (
    <button onClick={handleReturn} className="return-to-report-btn" type="button">
      ← العودة إلى {returnState.reportLabel ?? 'التقرير'}
    </button>
  );
}
```

**StatementTable.tsx** — `frontend/src/components/financial/StatementTable.tsx`:

```typescript
import type { StatementRow } from '../../api/financial';
import { DrillDownLink, type FinancialDrillDownState } from './DrillDownLink';

interface Props {
  rows: StatementRow[];
  currentState: FinancialDrillDownState;
  highlightId?: string | null;
}

function fmt(n: number) {
  return n ? n.toLocaleString('ar-KW', { minimumFractionDigits: 3 }) : '';
}

export function StatementTable({ rows, currentState, highlightId }: Props) {
  return (
    <table className="financial-table statement-table" dir="rtl">
      <thead>
        <tr>
          <th>التاريخ</th><th>المرجع</th><th>النوع</th><th>البيان</th>
          <th>مدين</th><th>دائن</th><th>الرصيد</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr
            key={row.id}
            id={`row-${row.id}`}
            className={highlightId === row.id ? 'highlight-row' : ''}
          >
            <td>{row.date.slice(0, 10)}</td>
            <td>
              <DrillDownLink drillDown={row.drillDown} currentState={currentState}>
                {row.reference}
              </DrillDownLink>
            </td>
            <td>{row.referenceType}</td>
            <td>{row.description}</td>
            <td className="num">{fmt(row.debit)}</td>
            <td className="num">{fmt(row.credit)}</td>
            <td className={`num ${row.runningBalance < 0 ? 'negative' : ''}`}>{fmt(row.runningBalance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

**GroupedTable.tsx** — `frontend/src/components/financial/GroupedTable.tsx`:

```typescript
import { useState } from 'react';
import type { StatementRow } from '../../api/financial';
import { DrillDownLink, type FinancialDrillDownState } from './DrillDownLink';
import { normalizeMoney } from '../../../../backend/src/shared/services/financial/balance.utils';

interface GroupedYear {
  year: number;
  months: { month: number; label: string; rows: StatementRow[]; }[];
}

function groupByYearMonth(rows: StatementRow[]): GroupedYear[] {
  const map = new Map<number, Map<number, StatementRow[]>>();
  for (const row of rows) {
    const d = new Date(row.date);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    if (!map.has(y)) map.set(y, new Map());
    const months = map.get(y)!;
    if (!months.has(m)) months.set(m, []);
    months.get(m)!.push(row);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b - a)
    .map(([year, months]) => ({
      year,
      months: Array.from(months.entries())
        .sort(([a], [b]) => a - b)
        .map(([month, rows]) => ({
          month,
          label: new Date(year, month - 1).toLocaleString('ar-KW', { month: 'long', year: 'numeric' }),
          rows,
        })),
    }));
}

function fmt(n: number) {
  return n ? n.toLocaleString('ar-KW', { minimumFractionDigits: 3 }) : '';
}

interface Props {
  rows: StatementRow[];
  currentState: FinancialDrillDownState;
}

export function GroupedTable({ rows, currentState }: Props) {
  const [expandedYears, setExpandedYears]   = useState<Set<number>>(new Set());
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const grouped = groupByYearMonth(rows);

  function toggleYear(y: number) {
    setExpandedYears(prev => { const next = new Set(prev); next.has(y) ? next.delete(y) : next.add(y); return next; });
  }
  function toggleMonth(key: string) {
    setExpandedMonths(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }

  return (
    <table className="financial-table grouped-table" dir="rtl">
      <thead>
        <tr>
          <th>التاريخ</th><th>المرجع</th><th>النوع</th><th>البيان</th>
          <th>مدين</th><th>دائن</th><th>الرصيد</th>
        </tr>
      </thead>
      <tbody>
        {grouped.map(({ year, months }) => {
          const yearDebit  = normalizeMoney(months.flatMap(m => m.rows).reduce((s, r) => s + r.debit, 0));
          const yearCredit = normalizeMoney(months.flatMap(m => m.rows).reduce((s, r) => s + r.credit, 0));
          return (
            <>
              <tr key={`y-${year}`} className="group-year-row" onClick={() => toggleYear(year)}>
                <td colSpan={4}>{expandedYears.has(year) ? '▼' : '▶'} سنة {year}</td>
                <td className="num">{fmt(yearDebit)}</td>
                <td className="num">{fmt(yearCredit)}</td>
                <td />
              </tr>
              {expandedYears.has(year) && months.map(({ month, label, rows: mRows }) => {
                const mk = `${year}-${month}`;
                const mDebit  = normalizeMoney(mRows.reduce((s, r) => s + r.debit, 0));
                const mCredit = normalizeMoney(mRows.reduce((s, r) => s + r.credit, 0));
                return (
                  <>
                    <tr key={mk} className="group-month-row" onClick={() => toggleMonth(mk)}>
                      <td colSpan={4}>&nbsp;&nbsp;{expandedMonths.has(mk) ? '▼' : '▶'} {label}</td>
                      <td className="num">{fmt(mDebit)}</td>
                      <td className="num">{fmt(mCredit)}</td>
                      <td />
                    </tr>
                    {expandedMonths.has(mk) && mRows.map(row => (
                      <tr key={row.id} id={`row-${row.id}`} className="detail-row">
                        <td>{row.date.slice(0, 10)}</td>
                        <td>
                          <DrillDownLink drillDown={row.drillDown} currentState={currentState}>
                            {row.reference}
                          </DrillDownLink>
                        </td>
                        <td>{row.referenceType}</td>
                        <td>{row.description}</td>
                        <td className="num">{fmt(row.debit)}</td>
                        <td className="num">{fmt(row.credit)}</td>
                        <td className={`num ${row.runningBalance < 0 ? 'negative' : ''}`}>{fmt(row.runningBalance)}</td>
                      </tr>
                    ))}
                  </>
                );
              })}
            </>
          );
        })}
      </tbody>
    </table>
  );
}
```

### Step 12 — Create FinancialCenter.tsx (shell + Statement tab)

Create `frontend/src/pages/FinancialCenter.tsx`:

```typescript
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { useAuth } from '../stores/authStore';
import { financialApi, type FinancialResponse, type StatementRow } from '../api/financial';
import { FinancialTabs }        from '../components/financial/FinancialTabs';
import { FilterBar }            from '../components/financial/FilterBar';
import { SummaryCards }         from '../components/financial/SummaryCards';
import { ExportBar }            from '../components/financial/ExportBar';
import { StatementTable }       from '../components/financial/StatementTable';
import { GroupedTable }         from '../components/financial/GroupedTable';
import { useHighlight }         from '../hooks/useHighlight';

const FINANCIAL_TABS = [
  { key: 'statement', label: 'كشف الحساب',      permission: 'statements.read'   },
  { key: 'aging',     label: 'أعمار الذمم',       permission: 'aging.read'        },
  { key: 'gl',        label: 'الأستاذ العام',     permission: 'gl.read'           },
  { key: 'trial',     label: 'ميزان المراجعة',    permission: 'trialbalance.read' },
  { key: 'journal',   label: 'دفتر اليومية',      permission: 'journal.read'      },
  { key: 'reports',   label: 'التقارير المالية',  permission: 'finreports.read'   },
];

// ─── Local state key constants ─────────────────────────────────────────────
const LS_VIEW_MODE   = 'financial.statement.viewMode';
const LS_HIDE_SETTLED = 'financial.statement.hideSettled';

export default function FinancialCenter() {
  const { hasPermission } = useAuth();
  const navigate          = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const highlightId = useHighlight();

  // ─── URL state ────────────────────────────────────────────────────────────
  const firstPermittedTab = FINANCIAL_TABS.find(t => hasPermission(t.permission))?.key ?? 'statement';
  const activeTab    = searchParams.get('tab')        ?? firstPermittedTab;
  const entityType   = (searchParams.get('entityType') ?? 'customer') as 'customer' | 'supplier';
  const entityIdStr  = searchParams.get('entityId')  ?? '';
  const entityId     = entityIdStr ? Number(entityIdStr) : null;
  const fromDate     = searchParams.get('fromDate')  ?? '';
  const toDate       = searchParams.get('toDate')    ?? '';
  const subTab       = searchParams.get('subTab')    ?? '';
  const accountId    = searchParams.get('accountId') ?? '';
  const mode         = searchParams.get('mode')      ?? 'as-of';

  // ─── Statement local state ─────────────────────────────────────────────────
  const [stmtData,    setStmtData]    = useState<FinancialResponse<StatementRow> | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);
  const [stmtError,   setStmtError]   = useState<string | null>(null);

  // M6 FIX: smart default applies ONLY on first load when localStorage is empty
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>(() => {
    const stored = localStorage.getItem(LS_VIEW_MODE);
    if (stored) return stored as 'grouped' | 'flat';
    // Smart default: grouped if date range > 60 days, flat otherwise
    if (fromDate && toDate) {
      const diff = (new Date(toDate).getTime() - new Date(fromDate).getTime()) / (1000 * 60 * 60 * 24);
      return diff > 60 ? 'grouped' : 'flat';
    }
    return 'grouped';
  });
  const [hideSettled, setHideSettled] = useState(() => localStorage.getItem(LS_HIDE_SETTLED) === 'true');

  // Restore scroll on return from DrillDown (scrollY from location.state, non-critical)
  useEffect(() => {
    const state = location.state as { scrollY?: number } | null;
    if (state?.scrollY) {
      setTimeout(() => window.scrollTo({ top: state.scrollY, behavior: 'instant' }), 100);
    }
  }, []);

  // ─── URL helpers ──────────────────────────────────────────────────────────
  function setTab(tab: string, extra?: Record<string, string>) {
    setSearchParams(prev => {
      const next = new URLSearchParams();
      next.set('tab', tab);
      if (extra) Object.entries(extra).forEach(([k, v]) => next.set(k, v));
      return next;
    });
  }

  function setParam(key: string, value: string) {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    });
  }

  // ─── Statement data fetch ─────────────────────────────────────────────────
  const loadStatement = useCallback(async () => {
    if (!entityId || !hasPermission('statements.read')) return;
    setStmtLoading(true);
    setStmtError(null);
    try {
      const data = await financialApi.getStatement(entityType, entityId, { fromDate: fromDate || undefined, toDate: toDate || undefined });
      setStmtData(data);
    } catch (e: unknown) {
      setStmtError((e as Error).message ?? 'خطأ في تحميل كشف الحساب');
    } finally {
      setStmtLoading(false);
    }
  }, [entityType, entityId, fromDate, toDate]);

  useEffect(() => {
    if (activeTab === 'statement') loadStatement();
  }, [activeTab, loadStatement]);

  // ─── Export handlers ──────────────────────────────────────────────────────
  async function handleStmtExport(format: 'pdf' | 'excel') {
    if (!entityId) return;
    const blob = await financialApi.exportStatement(entityType, entityId, { fromDate: fromDate || undefined, toDate: toDate || undefined, format });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `statement-${entityType}-${entityId}.${format === 'pdf' ? 'pdf' : 'xlsx'}` });
    a.click(); URL.revokeObjectURL(url);
  }

  // ─── Statement drilldown state ─────────────────────────────────────────────
  const stmtDrillState = useMemo(() => ({
    returnTo:    '/financial',
    reportLabel: 'كشف الحساب',
    tab:         'statement',
    entityType,
    entityId:    entityId ?? undefined,
    fromDate:    fromDate || undefined,
    toDate:      toDate   || undefined,
  }), [entityType, entityId, fromDate, toDate]);

  // ─── Filtered statement rows ──────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!stmtData) return [];
    if (!hideSettled) return stmtData.rows;
    return stmtData.rows.filter(r => r.status !== 'PAID');
  }, [stmtData, hideSettled]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const visibleTabs = FINANCIAL_TABS.filter(t => hasPermission(t.permission));
  if (visibleTabs.length === 0) {
    return <div className="no-permission-page">لا توجد صلاحية للوصول إلى المحاسبة المالية</div>;
  }

  return (
    <div className="financial-center" dir="rtl">
      <h1 className="page-title">المحاسبة المالية</h1>

      <FinancialTabs tabs={FINANCIAL_TABS} activeTab={activeTab} onTabChange={tab => setTab(tab)} />

      {/* ─── Statement Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'statement' && (
        <div className="financial-tab-content">
          <FilterBar
            fromDate={fromDate} toDate={toDate}
            onFromDate={v => setParam('fromDate', v)}
            onToDate={v   => setParam('toDate', v)}
          >
            {/* Entity type + entity selector */}
            <div className="filter-field">
              <label>نوع الجهة</label>
              <select value={entityType} onChange={e => setParam('entityType', e.target.value)}>
                <option value="customer">عميل</option>
                <option value="supplier">مورد</option>
              </select>
            </div>
            <div className="filter-field">
              <label>الجهة</label>
              <input
                type="number"
                placeholder="رقم الجهة..."
                value={entityIdStr}
                onChange={e => setParam('entityId', e.target.value)}
              />
            </div>
          </FilterBar>

          {/* Controls */}
          <div className="statement-controls">
            <button
              className={`view-mode-btn ${viewMode === 'grouped' ? 'active' : ''}`}
              onClick={() => { const v = viewMode === 'grouped' ? 'flat' : 'grouped'; setViewMode(v); localStorage.setItem(LS_VIEW_MODE, v); }}
            >
              {viewMode === 'grouped' ? 'عرض مفصّل' : 'عرض مجمّع'}
            </button>
            <label className="hide-settled-toggle">
              <input
                type="checkbox"
                checked={hideSettled}
                onChange={e => { setHideSettled(e.target.checked); localStorage.setItem(LS_HIDE_SETTLED, String(e.target.checked)); }}
              />
              إخفاء المسدّدة
            </label>
          </div>

          {hideSettled && (
            <div className="warning-banner">
              ⚠️ إخفاء بعض الحركات يؤثر على العرض فقط، ولا يغيّر الأرصدة المحاسبية
            </div>
          )}

          {stmtData && (
            <SummaryCards cards={[
              { label: 'رصيد الافتتاح', value: stmtData.summary.openingBalance },
              { label: 'إجمالي مدين',   value: stmtData.summary.totalDebit,   variant: 'blue' },
              { label: 'إجمالي دائن',   value: stmtData.summary.totalCredit,  variant: 'green' },
              { label: 'الرصيد الختامي', value: stmtData.summary.closingBalance },
            ]} />
          )}

          <ExportBar
            onExcelExport={() => handleStmtExport('excel')}
            onPdfExport={()   => handleStmtExport('pdf')}
            loading={stmtLoading}
          />

          {stmtLoading && <div className="loading-state">جاري التحميل...</div>}
          {stmtError   && <div className="error-state">{stmtError}</div>}
          {!entityId   && !stmtLoading && <div className="empty-state">اختر الجهة لعرض كشف الحساب</div>}

          {stmtData && viewMode === 'grouped' && (
            <GroupedTable rows={filteredRows} currentState={stmtDrillState} />
          )}
          {stmtData && viewMode === 'flat' && (
            <StatementTable rows={filteredRows} currentState={stmtDrillState} highlightId={highlightId} />
          )}
        </div>
      )}

      {/* Parts 3–5 add: AgingTab, GlTab, TrialBalanceTab, JournalBookTab, FinancialReportsTab */}
      {activeTab === 'aging'   && <div className="tab-placeholder">أعمار الذمم — قريباً (Part 3)</div>}
      {activeTab === 'gl'      && <div className="tab-placeholder">الأستاذ العام — قريباً (Part 4)</div>}
      {activeTab === 'trial'   && <div className="tab-placeholder">ميزان المراجعة — قريباً (Part 4)</div>}
      {activeTab === 'journal' && <div className="tab-placeholder">دفتر اليومية — قريباً (Part 4)</div>}
      {activeTab === 'reports' && <div className="tab-placeholder">التقارير المالية — قريباً (Part 5)</div>}
    </div>
  );
}
```

### Step 13 — Update App.tsx (add /financial route)

In `frontend/src/App.tsx`, add after the `/statements` route import:

```typescript
import FinancialCenter from './pages/FinancialCenter';
```

And inside the Layout route block (after the `statements` route, before the catch-all `*`):

```typescript
<Route path="/financial" element={<ProtectedRoute anyPermission={[
  'statements.read', 'aging.read', 'gl.read',
  'trialbalance.read', 'journal.read', 'finreports.read',
]}>
  <FinancialCenter />
</ProtectedRoute>} />
```

**Check `ProtectedRoute` props:** If `ProtectedRoute` does not accept `anyPermission` (only `permission`), use a wrapper or check existing `ProtectedRoute` implementation to find the correct prop name.

### Step 14 — Update modules.tsx NAV (add financial entry)

In `frontend/src/config/modules.tsx`, inside the `nav.group.financial` section, add after the `statements` entry:

```typescript
{ key: 'financial', label: 'nav.financial', icon: 'account_balance', permission: 'statements.read' },
```

**Note:** The sidebar entry uses `statements.read` as the minimum permission (most permissive check — if user has ANY financial center tab permission, they can see the entry). Alternatively, compute: if you want the entry hidden unless user has at least one of the 6 financial permissions, update this to use the most common base permission or add a custom check. The spec says: "Sidebar entry hidden if user has none of the 6 `.read` permissions OR `financialdashboard.read`." Since NAV only supports a single `permission` string, use `statements.read` as the entry condition (PROJECT_MANAGER has this). STANDARD_USER also has `statements.read` but will see the page and only the Statement tab.

Add the i18n key `nav.financial: 'المحاسبة المالية'` to the translations file.

### Step 15 — Add ?highlight= to Invoices.tsx

In `frontend/src/pages/Invoices.tsx`, add:

1. Import at top:
```typescript
import { useHighlight } from '../hooks/useHighlight';
import { ReturnToReportButton } from '../components/financial/ReturnToReportButton';
```

2. Call the hook inside the component (near other hooks):
```typescript
const highlightId = useHighlight();
```

3. Add `id` attribute to each invoice row in the DataTable (or wherever rows are rendered). If using `DataTable`, pass a `rowId` prop or use the `data-*` attribute pattern. Find the row `<tr>` element in the table render and add:
```typescript
id={`row-${invoice.id}`}
```

4. Add `ReturnToReportButton` below the page title `<h1>`:
```typescript
<ReturnToReportButton />
```

### Step 16 — Add ?highlight= to Expenses.tsx

Same pattern as Step 15 but for `Expenses.tsx`. Import both hooks/components, call `useHighlight()`, add `id={`row-${expense.id}`}` to expense rows, add `<ReturnToReportButton />` below page title.

### Step 17 — TypeScript validation (frontend)

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors. Fix any type mismatches (particularly the `FinancialResponse<never>` for summary and the backend type import path).

### Step 18 — Commit

```bash
git add backend/src/modules/financial/ backend/src/shared/services/financial/export/statement.export.adapter.ts backend/src/app.ts frontend/src/api/financial.ts frontend/src/hooks/useHighlight.ts frontend/src/components/financial/ frontend/src/pages/FinancialCenter.tsx frontend/src/App.tsx frontend/src/config/modules.tsx frontend/src/pages/Invoices.tsx frontend/src/pages/Expenses.tsx
git commit -m "feat(financial): add Financial Center page with Statement tab, shared components, backend module scaffold, and ?highlight= DrillDown support"
```

---

## Validation

- [ ] `cd backend && npx tsc --noEmit` → 0 errors
- [ ] `cd frontend && npx tsc --noEmit` → 0 errors
- [ ] `GET /api/financial/statements/customer/1` → 200 with `FinancialResponse<StatementRow>`
- [ ] `GET /api/financial/statements/customer/1` without token → 401
- [ ] `GET /api/financial/statements/customer/1` with token lacking `statements.read` → 403
- [ ] `/financial` opens in Electron, Statement tab is visible
- [ ] Statement tab loads data when entityId is provided
- [ ] Grouped/flat toggle persists in localStorage
- [ ] DrillDown from statement row → invoice page → "العودة" button appears

## Rollback Considerations

All changes are additive:
- `backend/src/app.ts` change adds one line — reversible
- New files can be deleted without affecting existing functionality
- Invoices.tsx and Expenses.tsx changes only add a hook call and a component render — neither modifies existing behavior

## Risks

- **`ProtectedRoute` prop compatibility:** `anyPermission` may not be a supported prop. Check existing usage in `App.tsx` before adding.
- **Backend type import in frontend:** TypeScript path aliasing across workspaces may not work in Vite. If it fails, copy types to `frontend/src/types/financial.types.ts`.
- **`buildStatement()` return type:** The `result.summary` shape from existing `statement.service.ts` must match the expected fields. Read the file at `backend/src/shared/services/statement.service.ts` before implementing to verify field names (`openingBalance`, `totalDebit`, `totalCredit`, `closingBalance`).

## Acceptance Criteria

- Statement endpoint returns `FinancialResponse<StatementRow>` with correct `reportType: 'statement'`
- Export endpoint returns valid binary buffer for both pdf and excel formats
- Frontend Statement tab renders rows with DrillDown links
- Grouped view collapses/expands by Year then Month
- "العودة إلى التقرير" button restores full Financial Center URL state after DrillDown

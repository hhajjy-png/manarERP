# Part 5 — Dashboard Summary, Financial Reports Tab, Dashboard "مالي" Tab & Migration Banner

> **Depends on:** Part 1 (Foundation), Part 2, Part 3, Part 4 (all tabs must exist)

---

## Objective

Complete the Financial Center by: implementing the Financial Summary endpoint, building the Dashboard Summary service (with 45-second TTL cache), wiring the Financial Reports tab, adding the "مالي" tab to `Dashboard.tsx`, and placing the Phase X migration banner on `Statements.tsx`.

## Scope

**Backend:**
- `dashboard-summary.service.ts` — cached aggregation service
- Financial Summary endpoint (orchestrates `accountingService.financialSummary()`)
- Dashboard Summary endpoint

**Frontend:**
- `FinancialReportsTab.tsx` — Financial Summary cards + future-report placeholders
- `FinancialDashboardTab.tsx` — "مالي" tab content with AR/AP cards + top-5 tables
- `Dashboard.tsx` — tab bar addition (minimal change)
- `Statements.tsx` — migration banner (Phase X)
- `FinancialCenter.tsx` — wire Financial Reports tab

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/shared/services/financial/dashboard-summary.service.ts` | Cached dashboard aggregations |
| `backend/src/shared/services/financial/export/summary.export.adapter.ts` | Financial Summary → ReportInput |
| `frontend/src/components/financial/FinancialReportsTab.tsx` | Financial Summary + placeholders |
| `frontend/src/components/financial/FinancialDashboardTab.tsx` | "مالي" dashboard tab content |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/modules/financial/financial.service.ts` | Add `getFinancialSummary()`, `exportFinancialSummary()`, `getDashboardSummary()` |
| `backend/src/modules/financial/financial.controller.ts` | Add summary + dashboard handlers |
| `backend/src/modules/financial/financial.routes.ts` | Add 3 new routes |
| `frontend/src/pages/FinancialCenter.tsx` | Replace Financial Reports tab placeholder |
| `frontend/src/pages/Dashboard.tsx` | Add "عام" / "مالي" tab bar, wrap existing content in `GeneralDashboardContent` |
| `frontend/src/pages/Statements.tsx` | Add dismissible migration info banner |

## Dependencies

- Part 2: `financial.service.ts` class, `ok()` helper, `recordAudit`
- Part 3 & 4: All other service methods must exist (import paths)
- Existing: `accountingService.financialSummary()` from `@modules/accounting/accounting.service`
- Existing: `Dashboard.tsx` existing content (only wrapped, not modified internally)
- Existing: `Statements.tsx` (only a banner added at top)

---

## Step-by-Step Implementation

### Step 1 — Create dashboard-summary.service.ts

Create `backend/src/shared/services/financial/dashboard-summary.service.ts`:

```typescript
import { prisma } from '@config/database';
import { normalizeMoney } from './balance.utils';
import type { DashboardSummary, TopEntitySummary } from './financial.types';

// 45-second TTL in-memory cache (single entry — summary is not user-specific)
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
    const today       = new Date();
    const thirtyAgo   = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyAgo   = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);

    // ⚠️ M3: All $queryRaw calls use tagged template literals — NEVER string concatenation.
    // Tagged template literals → parameterized queries → no SQL injection.
    const [arData, apData, topCustomers, topSuppliers, collections30, payments30, accountsCount, arCritical, apCritical] =
      await Promise.all([
        prisma.invoice.aggregate({
          where: { direction: 'SALES', status: { notIn: ['PAID', 'CANCELLED'] } },
          _sum: { total: true, paidAmount: true }, _count: { customerId: true },
        }),
        prisma.invoice.aggregate({
          where: { direction: 'PURCHASE', status: { notIn: ['PAID', 'CANCELLED'] } },
          _sum: { total: true, paidAmount: true }, _count: { supplierId: true },
        }),
        // Tagged template literal — parameterized, not injectable
        prisma.$queryRaw<TopEntitySummary[]>`
          SELECT c.id as id, c.name as name,
                 ROUND(SUM(i.total - i.paidAmount), 3) as outstanding
          FROM Invoice i
          JOIN Customer c ON i.customerId = c.id
          WHERE i.direction = 'SALES'
            AND i.status NOT IN ('PAID','CANCELLED')
            AND (i.total - i.paidAmount) > 0
          GROUP BY c.id
          ORDER BY outstanding DESC
          LIMIT 5
        `,
        prisma.$queryRaw<TopEntitySummary[]>`
          SELECT s.id as id, s.name as name,
                 ROUND(SUM(i.total - i.paidAmount), 3) as outstanding
          FROM Invoice i
          JOIN Supplier s ON i.supplierId = s.id
          WHERE i.direction = 'PURCHASE'
            AND i.status NOT IN ('PAID','CANCELLED')
            AND (i.total - i.paidAmount) > 0
          GROUP BY s.id
          ORDER BY outstanding DESC
          LIMIT 5
        `,
        prisma.payment.aggregate({
          where: { date: { gte: thirtyAgo }, invoice: { direction: 'SALES' } },
          _sum: { amount: true },
        }),
        prisma.payment.aggregate({
          where: { date: { gte: thirtyAgo }, invoice: { direction: 'PURCHASE' } },
          _sum: { amount: true },
        }),
        prisma.account.count({ where: { isActive: true } }),
        prisma.invoice.aggregate({
          where: { direction: 'SALES', status: { notIn: ['PAID','CANCELLED'] }, dueDate: { lt: ninetyAgo } },
          _sum: { total: true, paidAmount: true },
        }),
        prisma.invoice.aggregate({
          where: { direction: 'PURCHASE', status: { notIn: ['PAID','CANCELLED'] }, dueDate: { lt: ninetyAgo } },
          _sum: { total: true, paidAmount: true },
        }),
      ]);

    return {
      generatedAt: new Date().toISOString(),
      arSummary: {
        totalOutstanding: normalizeMoney((arData._sum.total ?? 0) - (arData._sum.paidAmount ?? 0)),
        criticalOver90:   normalizeMoney((arCritical._sum.total ?? 0) - (arCritical._sum.paidAmount ?? 0)),
        entityCount:      arData._count.customerId ?? 0,
      },
      apSummary: {
        totalOutstanding: normalizeMoney((apData._sum.total ?? 0) - (apData._sum.paidAmount ?? 0)),
        criticalOver90:   normalizeMoney((apCritical._sum.total ?? 0) - (apCritical._sum.paidAmount ?? 0)),
        entityCount:      apData._count.supplierId ?? 0,
      },
      topCustomers:      topCustomers.map(r => ({ id: Number(r.id), name: r.name, outstanding: normalizeMoney(Number(r.outstanding)) })),
      topSuppliers:      topSuppliers.map(r => ({ id: Number(r.id), name: r.name, outstanding: normalizeMoney(Number(r.outstanding)) })),
      collectionsLast30: normalizeMoney(collections30._sum.amount ?? 0),
      paymentsLast30:    normalizeMoney(payments30._sum.amount    ?? 0),
      activeAccountsCount: accountsCount,
    };
  }

  // M7 FIX: No active cache invalidation — TTL-only. Active invalidation creates module coupling.
  // 45 seconds is acceptable for a Dashboard summary (not real-time).
  // generatedAt field in DashboardSummary shows users when data was last computed.
}

export const dashboardSummaryService = new DashboardSummaryService();
```

### Step 2 — Add Financial Summary + Dashboard Summary service methods

Append to `financial.service.ts`:

```typescript
import { dashboardSummaryService } from '@shared/services/financial/dashboard-summary.service';
import { toSummaryReportInput } from '@shared/services/financial/export/summary.export.adapter';

// ─── Financial Summary ─────────────────────────────────────────────────────

async getFinancialSummary(filters: { fromDate?: string; toDate?: string }): Promise<FinancialResponse<never>> {
  // Orchestrator pattern: delegates to existing accountingService
  const raw = await accountingService.financialSummary({
    fromDate: filters.fromDate,
    toDate:   filters.toDate,
  });

  return wrapFinancialResponse<never>({
    reportType: 'financial-summary',
    summary: {
      totalDebit:  normalizeMoney(raw.totalExpenses   ?? 0),
      totalCredit: normalizeMoney(raw.totalRevenue    ?? 0),
      closingBalance: normalizeMoney((raw.totalRevenue ?? 0) - (raw.totalExpenses ?? 0)),
    },
    metadata: {
      totalRevenue:    normalizeMoney(raw.totalRevenue    ?? 0),
      totalExpenses:   normalizeMoney(raw.totalExpenses   ?? 0),
      totalCollected:  normalizeMoney(raw.totalCollected  ?? 0),
      totalPaid:       normalizeMoney(raw.totalPaid       ?? 0),
      netIncome:       normalizeMoney((raw.totalRevenue ?? 0) - (raw.totalExpenses ?? 0)),
      disclaimer: 'الملخص المالي يعتمد على الجداول التشغيلية (الفواتير والمصروفات). قد تختلف أرقامه عن ميزان المراجعة الذي يعتمد على القيود المحاسبية.',
      fromDate: filters.fromDate,
      toDate:   filters.toDate,
    },
    filters: sanitizeFilters(filters),
    rows: [] as never[],
  });
}

async exportFinancialSummary(filters: { fromDate?: string; toDate?: string }, format: 'pdf' | 'excel'): Promise<Buffer> {
  const data = await this.getFinancialSummary(filters);
  const input = toSummaryReportInput(data);
  return format === 'pdf' ? buildPdf(input) : buildExcel(input);
}

// ─── Dashboard Summary ─────────────────────────────────────────────────────

async getDashboardSummary() {
  return dashboardSummaryService.getSummary();
}
```

**Note:** `accountingService.financialSummary()` — read the actual method signature in `accounting.service.ts` before implementing. The return shape (`totalRevenue`, `totalExpenses`, `totalCollected`, `totalPaid`) may differ. Map accordingly.

### Step 3 — Create summary.export.adapter.ts

Create `backend/src/shared/services/financial/export/summary.export.adapter.ts`:

```typescript
import type { FinancialResponse } from '../financial.types';
import { buildSubtitle } from '../summary.utils';

function fmt(n?: number) { return Number((n ?? 0).toFixed(3)); }

export function toSummaryReportInput(response: FinancialResponse<never>) {
  const meta = response.metadata ?? {};
  return {
    title: 'الملخص المالي',
    subtitle: buildSubtitle(String(meta.fromDate ?? ''), String(meta.toDate ?? '')),
    columns: [
      { header: 'البند',   key: 'label',  width: 28 },
      { header: 'المبلغ',  key: 'amount', width: 18, numFmt: '#,##0.000' },
    ],
    rows: [
      { label: 'إجمالي الإيرادات',  amount: fmt(meta.totalRevenue   as number) },
      { label: 'إجمالي المصاريف',   amount: fmt(meta.totalExpenses  as number) },
      { label: 'صافي الدخل',        amount: fmt(meta.netIncome      as number) },
      { label: 'إجمالي التحصيلات',  amount: fmt(meta.totalCollected as number) },
      { label: 'إجمالي المدفوعات',  amount: fmt(meta.totalPaid      as number) },
    ],
    footer: String(meta.disclaimer ?? ''),
  };
}
```

### Step 4 — Add summary + dashboard handlers and routes

In `financial.controller.ts`, append:

```typescript
import { SummaryQuerySchema } from './financial.schema';

export async function getFinancialSummary(req: Request, res: Response): Promise<void> {
  const query = SummaryQuerySchema.parse(req.query);
  ok(res, await financialService.getFinancialSummary(query));
}

export async function exportFinancialSummary(req: Request, res: Response): Promise<void> {
  const query  = SummaryQuerySchema.parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportFinancialSummary(query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'financial-summary', format, filters: sanitizeFilters(query) } }).catch(() => {});
  sendFile(res, buffer, 'financial-summary', format);
}

export async function getDashboardSummary(req: Request, res: Response): Promise<void> {
  const data = await financialService.getDashboardSummary();
  // Include cache info header so frontend can display "آخر تحديث"
  const ageSeconds = Math.floor((Date.now() - new Date(data.generatedAt).getTime()) / 1000);
  res.setHeader('X-Cache-Age', String(ageSeconds));
  ok(res, data);
}
```

In `financial.routes.ts`, append:

```typescript
import { getFinancialSummary, exportFinancialSummary, getDashboardSummary } from './financial.controller';

// ─── Financial Summary ─────────────────────────────────────────────────────
router.get('/summary',         requirePermission('finreports.read'),      asyncHandler(getFinancialSummary));
router.get('/summary/export',  requirePermission('finreports.export'),    asyncHandler(exportFinancialSummary));

// ─── Dashboard Summary ─────────────────────────────────────────────────────
router.get('/dashboard-summary', requirePermission('financialdashboard.read'), asyncHandler(getDashboardSummary));
```

### Step 5 — TypeScript validation (backend complete)

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors. This is the final backend TypeScript check — all modules, service methods, and routes must be clean.

### Step 6 — Run backend unit tests

```bash
cd backend && npm test
```

Expected: all existing tests pass + new financial utility tests (22) pass.

---

### Step 7 — Create FinancialReportsTab.tsx

Create `frontend/src/components/financial/FinancialReportsTab.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { financialApi } from '../../api/financial';
import { FilterBar }  from './FilterBar';
import { ExportBar }  from './ExportBar';

function fmt(n?: number) {
  return (n ?? 0).toLocaleString('ar-KW', { minimumFractionDigits: 3 });
}

interface Props { fromDate?: string; toDate?: string; onFromDate: (v: string) => void; onToDate: (v: string) => void; }

export function FinancialReportsTab({ fromDate, toDate, onFromDate, onToDate }: Props) {
  const [data, setData]     = useState<{ metadata?: Record<string, unknown>; } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    financialApi.getFinancialSummary({ fromDate: fromDate || undefined, toDate: toDate || undefined })
      .then(d => setData(d))
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  async function handleExport(format: 'pdf' | 'excel') {
    const blob = await financialApi.exportFinancialSummary({ fromDate: fromDate || undefined, toDate: toDate || undefined, format });
    const url  = URL.createObjectURL(blob);
    Object.assign(document.createElement('a'), { href: url, download: `financial-summary.${format === 'pdf' ? 'pdf' : 'xlsx'}` }).click();
    URL.revokeObjectURL(url);
  }

  const meta = data?.metadata ?? {};

  return (
    <div className="financial-reports-tab" dir="rtl">
      <FilterBar fromDate={fromDate} toDate={toDate} onFromDate={onFromDate} onToDate={onToDate} />

      {/* Financial Summary Cards */}
      {loading && <div className="loading-state">جاري التحميل...</div>}
      {error   && <div className="error-state">{error}</div>}

      {data && (
        <div className="financial-summary-section">
          <h3 className="section-title">الملخص المالي</h3>
          <div className="financial-summary-cards">
            <div className="summary-card green">
              <div className="card-label">الإيرادات</div>
              <div className="card-value">{fmt(meta.totalRevenue as number)} د.ك</div>
            </div>
            <div className="summary-card blue">
              <div className="card-label">التحصيلات</div>
              <div className="card-value">{fmt(meta.totalCollected as number)} د.ك</div>
            </div>
            <div className="summary-card red">
              <div className="card-label">المصاريف</div>
              <div className="card-value">{fmt(meta.totalExpenses as number)} د.ك</div>
            </div>
            <div className="summary-card neutral">
              <div className="card-label">صافي الدخل</div>
              <div className="card-value">{fmt(meta.netIncome as number)} د.ك</div>
            </div>
          </div>
          {/* M10 Disclaimer */}
          <div className="accounting-disclaimer">
            ⓘ {meta.disclaimer as string}
          </div>
          <ExportBar onExcelExport={() => handleExport('excel')} onPdfExport={() => handleExport('pdf')} />
        </div>
      )}

      {/* Future Reports Placeholders */}
      <div className="future-reports-section">
        <h3 className="section-title">تقارير قادمة</h3>
        <div className="future-reports-grid">
          {[
            'الميزانية العمومية',
            'التدفقات النقدية',
            'الأرباح والخسائر',
            'مقارنة الميزانية',
          ].map(name => (
            <div key={name} className="future-report-card disabled">
              <div className="future-report-name">{name}</div>
              <div className="coming-soon-badge">قريباً</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

### Step 8 — Create FinancialDashboardTab.tsx

Create `frontend/src/components/financial/FinancialDashboardTab.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { financialApi, type DashboardSummary } from '../../api/financial';

function fmt(n: number) { return n.toLocaleString('ar-KW', { minimumFractionDigits: 3 }); }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function FinancialDashboardTab() {
  const navigate                   = useNavigate();
  const [data, setData]            = useState<DashboardSummary | null>(null);
  const [loading, setLoading]      = useState(false);
  const [error, setError]          = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    financialApi.getDashboardSummary()
      .then(setData)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state">جاري تحميل الملخص المالي...</div>;
  if (error)   return <div className="error-state">{error}</div>;
  if (!data)   return null;

  const lastUpdated = `آخر تحديث: ${fmtTime(data.generatedAt)}`;

  return (
    <div className="financial-dashboard-tab" dir="rtl">
      <div className="dashboard-last-updated">{lastUpdated}</div>

      {/* Row 1 — Summary Cards */}
      <div className="financial-dashboard-cards">
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">ذمم العملاء</div>
          <div className="fin-dash-card-value">{fmt(data.arSummary.totalOutstanding)} <span>د.ك</span></div>
          <div className="fin-dash-card-sub critical">حرج +90 يوم: {fmt(data.arSummary.criticalOver90)} د.ك</div>
          <button className="fin-dash-link" onClick={() => navigate('/financial?tab=aging&subTab=ar')}>
            عرض التفاصيل ←
          </button>
        </div>
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">ذمم الموردين</div>
          <div className="fin-dash-card-value">{fmt(data.apSummary.totalOutstanding)} <span>د.ك</span></div>
          <div className="fin-dash-card-sub critical">حرج +90 يوم: {fmt(data.apSummary.criticalOver90)} د.ك</div>
          <button className="fin-dash-link" onClick={() => navigate('/financial?tab=aging&subTab=ap')}>
            عرض التفاصيل ←
          </button>
        </div>
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">تحصيلات 30 يوم</div>
          <div className="fin-dash-card-value green">{fmt(data.collectionsLast30)} <span>د.ك</span></div>
        </div>
        <div className="fin-dash-card">
          <div className="fin-dash-card-title">مدفوعات 30 يوم</div>
          <div className="fin-dash-card-value">{fmt(data.paymentsLast30)} <span>د.ك</span></div>
        </div>
      </div>

      {/* Row 2 — Top 5 Tables */}
      <div className="financial-dashboard-tables">
        <div className="fin-dash-table">
          <h4>أعلى 5 عملاء (ذمم)</h4>
          <table>
            <thead><tr><th>الاسم</th><th>المبلغ</th></tr></thead>
            <tbody>
              {data.topCustomers.map(c => (
                <tr key={c.id} className="clickable-row" onClick={() => navigate(`/financial?tab=statement&entityType=customer&entityId=${c.id}`)}>
                  <td>{c.name}</td>
                  <td className="num">{fmt(c.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fin-dash-table">
          <h4>أعلى 5 موردين (ذمم)</h4>
          <table>
            <thead><tr><th>الاسم</th><th>المبلغ</th></tr></thead>
            <tbody>
              {data.topSuppliers.map(s => (
                <tr key={s.id} className="clickable-row" onClick={() => navigate(`/financial?tab=statement&entityType=supplier&entityId=${s.id}`)}>
                  <td>{s.name}</td>
                  <td className="num">{fmt(s.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
```

### Step 9 — Update Dashboard.tsx (add "مالي" tab)

In `frontend/src/pages/Dashboard.tsx`:

1. Find the top-level return JSX. **Wrap all existing content** in a `GeneralDashboardContent` component (inline or extracted) — no internal changes to the existing content.

2. Add tab state:
```typescript
const { hasPermission } = useAuth();
const [dashTab, setDashTab] = useState<'general' | 'financial'>(
  (localStorage.getItem('dashboard.tab') as 'general' | 'financial') ?? 'general'
);
```

3. Replace the return with:
```typescript
return (
  <div className="dashboard-page" dir="rtl">
    {/* Tab bar — only show financial tab if user has permission */}
    <div className="dashboard-tab-bar">
      <button
        className={`dashboard-tab-btn ${dashTab === 'general' ? 'active' : ''}`}
        onClick={() => { setDashTab('general'); localStorage.setItem('dashboard.tab', 'general'); }}
      >عام</button>
      {hasPermission('financialdashboard.read') && (
        <button
          className={`dashboard-tab-btn ${dashTab === 'financial' ? 'active' : ''}`}
          onClick={() => { setDashTab('financial'); localStorage.setItem('dashboard.tab', 'financial'); }}
        >مالي</button>
      )}
    </div>

    {/* Existing content — completely unchanged internally */}
    {dashTab === 'general' && <GeneralDashboardContent />}

    {/* New financial tab */}
    {dashTab === 'financial' && hasPermission('financialdashboard.read') && <FinancialDashboardTab />}
  </div>
);
```

4. Import:
```typescript
import { FinancialDashboardTab } from '../components/financial/FinancialDashboardTab';
import { useAuth } from '../stores/authStore';
```

5. **Extract `GeneralDashboardContent`:** Move all existing JSX from the original `return (...)` into a new function `function GeneralDashboardContent() { return <existing content>; }` defined in the same file (or imported if Dashboard.tsx is too large). The key constraint: **no changes inside the existing content**.

### Step 10 — Wire Financial Reports tab in FinancialCenter.tsx

Replace the `activeTab === 'reports'` placeholder in `FinancialCenter.tsx`:

```typescript
import { FinancialReportsTab } from '../components/financial/FinancialReportsTab';

// In JSX:
{activeTab === 'reports' && (
  <FinancialReportsTab
    fromDate={fromDate}
    toDate={toDate}
    onFromDate={v => setParam('fromDate', v)}
    onToDate={v   => setParam('toDate', v)}
  />
)}
```

### Step 11 — Add migration banner to Statements.tsx (Phase X)

**Note:** This implements Phase X of the migration strategy. Add the banner code now but it only renders if not dismissed. When leadership decides to push migration (next release), this is already in place.

In `frontend/src/pages/Statements.tsx`, add at the very top of the component return (before any existing JSX):

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Inside the component, before the return:
const [bannerVisible, setBannerVisible] = useState(
  !localStorage.getItem('statements.bannerDismissed')
);
const navigate = useNavigate();

// Inside the return, before all existing content:
{bannerVisible && (
  <div className="migration-banner info-banner" dir="rtl">
    <span>🆕 يتوفر الإصدار الجديد من كشف الحساب داخل المحاسبة المالية</span>
    <button
      className="banner-action-btn"
      onClick={() => navigate('/financial?tab=statement')}
    >
      فتح الإصدار الجديد
    </button>
    <button
      className="banner-dismiss-btn"
      onClick={() => { localStorage.setItem('statements.bannerDismissed', '1'); setBannerVisible(false); }}
      aria-label="إغلاق"
    >
      ✕
    </button>
  </div>
)}
```

### Step 12 — TypeScript validation (frontend complete)

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors. This is the final frontend TypeScript check.

### Step 13 — Build validation

```bash
npm run build:back
npm run build:front
```

Both must complete without errors. Fix any build-time issues before proceeding.

Expected:
```
npm run build:back  → "build:back" exits 0
npm run build:front → "build:front" exits 0
```

### Step 14 — Commit

```bash
git add backend/src/shared/services/financial/dashboard-summary.service.ts \
        backend/src/shared/services/financial/export/summary.export.adapter.ts \
        backend/src/modules/financial/ \
        frontend/src/components/financial/FinancialReportsTab.tsx \
        frontend/src/components/financial/FinancialDashboardTab.tsx \
        frontend/src/pages/Dashboard.tsx \
        frontend/src/pages/Statements.tsx \
        frontend/src/pages/FinancialCenter.tsx
git commit -m "feat(financial): add Financial Reports tab, Dashboard مالي tab, cached Dashboard Summary, and migration banner"
```

---

## Validation

- [ ] `GET /api/financial/summary` → 200 with revenue/expenses/collected/paid/netIncome metadata
- [ ] `GET /api/financial/dashboard-summary` → 200 with `generatedAt`, AR/AP summaries, top 5 lists
- [ ] `GET /api/financial/dashboard-summary` (second call within 45s) → same `generatedAt` (cache hit)
- [ ] `X-Cache-Age` header is present on dashboard-summary response
- [ ] `GET /api/financial/dashboard-summary` without `financialdashboard.read` → 403
- [ ] Dashboard "مالي" tab visible to ACCOUNTANT/GENERAL_MANAGER but not STANDARD_USER
- [ ] Dashboard "عام" tab existing content is completely unchanged
- [ ] Financial Reports tab shows summary cards + 4 grayed-out future placeholders
- [ ] Financial Reports tab shows disclaimer note (M10)
- [ ] Statements.tsx shows banner (not dismissed) → click "فتح الإصدار الجديد" → navigates to `/financial?tab=statement`
- [ ] Statements.tsx banner can be dismissed → stays dismissed on page refresh
- [ ] `cd backend && npx tsc --noEmit` → 0 errors
- [ ] `cd frontend && npx tsc --noEmit` → 0 errors
- [ ] `npm run build:back` → exits 0
- [ ] `npm run build:front` → exits 0

## Rollback Considerations

- `Dashboard.tsx` change wraps existing content — remove wrapper to revert cleanly
- `Statements.tsx` banner is additive — remove the `bannerVisible` state and JSX block
- Backend routes are additive — removing routes reverts

## Risks

- **`accountingService.financialSummary()` return shape:** This method must exist and return the expected fields. If it doesn't exist or has different field names, map them. Read the actual implementation before coding.
- **Dashboard.tsx size:** If `Dashboard.tsx` is very large (>500 lines), extracting `GeneralDashboardContent` as a separate file may be cleaner. In that case, create `frontend/src/components/dashboard/GeneralDashboardContent.tsx` and import it.
- **SQLite RAW query column names:** SQLite `$queryRaw` returns column names in lowercase. If the Prisma model uses `customerId` but the raw query aliases as `id`, the result `r.id` returns the correct value. Verify by running the raw query in `prisma studio`.

## Acceptance Criteria

- Dashboard Summary caches correctly (45s TTL)
- Financial Reports tab shows all 4 summary KPIs
- M10 disclaimer text visible
- Dashboard "مالي" tab loads without errors and does not affect "عام" tab
- Migration banner appears on `/statements` and is dismissible
- All exports produce valid files

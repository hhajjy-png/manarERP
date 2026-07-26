# Part 3 — AR/AP Aging Center

> **Depends on:** Part 1 (Foundation), Part 2 (module scaffold + app.ts registration)
> **Can parallelize with:** Part 4 (after Part 2 is merged)

---

## Objective

Implement AR and AP Aging endpoints in the backend (extending the financial module created in Part 2), then build the Aging tab in FinancialCenter with color-coded table, summary cards, a Recharts bar chart, and DrillDown to Invoice pages. Add `?highlight=` support to source pages navigated to from Aging.

## Scope

**Backend:** AR Aging, AP Aging GET + export endpoints in `financial.service.ts`, `financial.controller.ts`, `financial.routes.ts`.

**Frontend:** `AgingTable`, `AgingSummaryCards`, `AgingChart` components; Aging tab wired into `FinancialCenter.tsx`.

**Source page DrillDown:** The aging cell (bucket amount) DrillDown goes to `/invoices?customerId=X&agingBucket=0_30` — `Invoices.tsx` already has `?highlight=` from Part 2. No additional changes needed to Invoices.tsx for Aging.

## Files to Create

| File | Purpose |
|------|---------|
| `backend/src/shared/services/financial/export/aging.export.adapter.ts` | Maps `FinancialResponse<ArAgingRow>` → `ReportInput` |
| `frontend/src/components/financial/AgingTable.tsx` | Sortable, color-coded aging table |
| `frontend/src/components/financial/AgingSummaryCards.tsx` | Total outstanding, critical, count cards |
| `frontend/src/components/financial/AgingChart.tsx` | Recharts BarChart for bucket distribution |

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/modules/financial/financial.service.ts` | Add `getArAging()`, `getApAging()`, `exportArAging()`, `exportApAging()` |
| `backend/src/modules/financial/financial.controller.ts` | Add `getArAging`, `getApAging`, `exportArAging`, `exportApAging` handlers |
| `backend/src/modules/financial/financial.routes.ts` | Add 4 aging routes |
| `frontend/src/pages/FinancialCenter.tsx` | Replace aging placeholder with full Aging tab implementation |

## Dependencies

- Part 1: `calculateAgingBuckets`, `DEFAULT_AGING_BUCKETS`, `buildDrillDownRef`, `normalizeMoney`, `wrapFinancialResponse`, `financial.types.ts`
- Part 2: `financial.service.ts` class, `financial.controller.ts` pattern, `aging.export.adapter.ts`
- Existing: Prisma `Invoice`, `Customer`, `Supplier` models

---

## Step-by-Step Implementation

### Step 1 — Add AR/AP Aging service methods to financial.service.ts

Append to `backend/src/modules/financial/financial.service.ts` (inside the class, after `exportStatement`):

```typescript
import { prisma } from '@config/database';
import { calculateAgingBuckets, DEFAULT_AGING_BUCKETS } from '@shared/services/financial/aging.utils';
import type { ArAgingRow, ApAgingRow } from '@shared/services/financial/financial.types';
import { toAgingReportInput } from '@shared/services/financial/export/aging.export.adapter';

// Add at top of file with other imports:
// (paste these imports alongside existing ones)

// ─── AR Aging ─────────────────────────────────────────────────────────────

async getArAging(filters: {
  asOfDate?: string;
  search?: string;
  customerType?: string;
  hideZero?: boolean;
}): Promise<FinancialResponse<ArAgingRow>> {
  const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();

  const customers = await prisma.customer.findMany({
    where: {
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search } },
          { code: { contains: filters.search } },
        ],
      }),
      ...(filters.customerType && { type: filters.customerType as 'GOVERNMENT' | 'PRIVATE' }),
    },
    select: {
      id: true, code: true, name: true,
      invoices: {
        where: {
          direction: 'SALES',
          status: { notIn: ['PAID', 'CANCELLED'] },
        },
        select: {
          id: true, dueDate: true, invoiceDate: true,
          total: true, paidAmount: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows: (ArAgingRow | null)[] = customers.map(customer => {
    const outstanding = customer.invoices.map(inv => ({
      dueDate: inv.dueDate ?? inv.invoiceDate,
      outstandingAmount: normalizeMoney(inv.total - inv.paidAmount),
    }));
    const buckets = calculateAgingBuckets(outstanding, asOfDate, DEFAULT_AGING_BUCKETS);

    if (filters.hideZero && buckets.total === 0) return null;

    const sortedByDate = [...customer.invoices].sort(
      (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
    );

    return {
      id:              `AR-${customer.id}`,
      customerId:      customer.id,
      customerCode:    customer.code,
      customerName:    customer.name,
      current:         buckets.current ?? 0,
      '0_30':          buckets['0_30'] ?? 0,
      '31_60':         buckets['31_60'] ?? 0,
      '61_90':         buckets['61_90'] ?? 0,
      '91_120':        buckets['91_120'] ?? 0,
      over_120:        buckets.over_120 ?? 0,
      total:           buckets.total,
      lastInvoiceDate: sortedByDate[0]?.invoiceDate?.toISOString(),
      invoiceCount:    customer.invoices.length,
      drillDown:       buildDrillDownRef('CUSTOMER', customer.id, customer.name),
    } satisfies ArAgingRow;
  });

  const validRows = rows.filter((r): r is ArAgingRow => r !== null);
  const totalOutstanding = normalizeMoney(validRows.reduce((s, r) => s + r.total, 0));
  const criticalOver90  = normalizeMoney(validRows.reduce((s, r) => s + r.over_120 + r['91_120'], 0));

  return wrapFinancialResponse({
    reportType: 'ar-aging',
    summary: {
      totalOutstanding,
      criticalOver90,
      entityCount: validRows.length,
    },
    metadata: { asOfDate: asOfDate.toISOString() },
    filters: sanitizeFilters(filters),
    rows: validRows,
  });
}

async exportArAging(filters: { asOfDate?: string; search?: string; customerType?: string; hideZero?: boolean }, format: 'pdf' | 'excel'): Promise<Buffer> {
  const data = await this.getArAging(filters);
  const input = toAgingReportInput(data, 'ar');
  return format === 'pdf' ? buildPdf(input) : buildExcel(input);
}

// ─── AP Aging ─────────────────────────────────────────────────────────────

async getApAging(filters: {
  asOfDate?: string;
  search?: string;
  hideZero?: boolean;
}): Promise<FinancialResponse<ApAgingRow>> {
  const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();

  const suppliers = await prisma.supplier.findMany({
    where: {
      ...(filters.search && {
        OR: [
          { name: { contains: filters.search } },
          { code: { contains: filters.search } },
        ],
      }),
    },
    select: {
      id: true, code: true, name: true,
      invoices: {
        where: {
          direction: 'PURCHASE',
          status: { notIn: ['PAID', 'CANCELLED'] },
        },
        select: {
          id: true, dueDate: true, invoiceDate: true,
          total: true, paidAmount: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  });

  const rows: (ApAgingRow | null)[] = suppliers.map(supplier => {
    const outstanding = supplier.invoices.map(inv => ({
      dueDate: inv.dueDate ?? inv.invoiceDate,
      outstandingAmount: normalizeMoney(inv.total - inv.paidAmount),
    }));
    const buckets = calculateAgingBuckets(outstanding, asOfDate, DEFAULT_AGING_BUCKETS);

    if (filters.hideZero && buckets.total === 0) return null;

    const sortedByDate = [...supplier.invoices].sort(
      (a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime()
    );

    return {
      id:              `AP-${supplier.id}`,
      supplierId:      supplier.id,
      supplierCode:    supplier.code,
      supplierName:    supplier.name,
      current:         buckets.current ?? 0,
      '0_30':          buckets['0_30'] ?? 0,
      '31_60':         buckets['31_60'] ?? 0,
      '61_90':         buckets['61_90'] ?? 0,
      '91_120':        buckets['91_120'] ?? 0,
      over_120:        buckets.over_120 ?? 0,
      total:           buckets.total,
      lastInvoiceDate: sortedByDate[0]?.invoiceDate?.toISOString(),
      invoiceCount:    supplier.invoices.length,
      drillDown:       buildDrillDownRef('SUPPLIER', supplier.id, supplier.name),
    } satisfies ApAgingRow;
  });

  const validRows = rows.filter((r): r is ApAgingRow => r !== null);
  const totalOutstanding = normalizeMoney(validRows.reduce((s, r) => s + r.total, 0));
  const criticalOver90  = normalizeMoney(validRows.reduce((s, r) => s + r.over_120 + r['91_120'], 0));

  return wrapFinancialResponse({
    reportType: 'ap-aging',
    summary: { totalOutstanding, criticalOver90, entityCount: validRows.length },
    metadata: { asOfDate: asOfDate.toISOString() },
    filters: sanitizeFilters(filters),
    rows: validRows,
  });
}

async exportApAging(filters: { asOfDate?: string; search?: string; hideZero?: boolean }, format: 'pdf' | 'excel'): Promise<Buffer> {
  const data = await this.getApAging(filters);
  const input = toAgingReportInput(data, 'ap');
  return format === 'pdf' ? buildPdf(input) : buildExcel(input);
}
```

**UI Note (M8):** AP Aging includes purchase invoices ONLY — not expenses. This is intentional for Phase 2. The Aging tab must show this note:
> "يعرض أعمار الذمم فواتير المشتريات فقط. للرصيد الشامل بما يتضمن المصروفات، راجع كشف الحساب."

### Step 2 — Add aging handlers to financial.controller.ts

Append to `backend/src/modules/financial/financial.controller.ts`:

```typescript
import { AgingQuerySchema } from './financial.schema';

export async function getArAging(req: Request, res: Response): Promise<void> {
  const query = AgingQuerySchema.parse(req.query);
  const data  = await financialService.getArAging(query);
  ok(res, data);
}

export async function exportArAging(req: Request, res: Response): Promise<void> {
  const query  = AgingQuerySchema.parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportArAging(query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'ar-aging', format, filters: sanitizeFilters(query) } }).catch(() => {});
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ar-aging-${Date.now()}.${ext}"`);
  res.send(buffer);
}

export async function getApAging(req: Request, res: Response): Promise<void> {
  const query = AgingQuerySchema.omit({ customerType: true }).parse(req.query);
  const data  = await financialService.getApAging(query);
  ok(res, data);
}

export async function exportApAging(req: Request, res: Response): Promise<void> {
  const query  = AgingQuerySchema.omit({ customerType: true }).parse(req.query);
  const format = (query.format ?? 'excel') as 'pdf' | 'excel';
  const buffer = await financialService.exportApAging(query, format);
  recordAudit({ req, action: 'REPORT_EXPORT', module: 'financial', entityId: undefined,
    newValue: { reportType: 'ap-aging', format, filters: sanitizeFilters(query) } }).catch(() => {});
  const ext = format === 'pdf' ? 'pdf' : 'xlsx';
  res.setHeader('Content-Type', format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="ap-aging-${Date.now()}.${ext}"`);
  res.send(buffer);
}
```

### Step 3 — Add aging routes to financial.routes.ts

In `backend/src/modules/financial/financial.routes.ts`, add after the statement routes:

```typescript
import { getArAging, exportArAging, getApAging, exportApAging } from './financial.controller';

// ─── AR Aging ─────────────────────────────────────────────────────────────
router.get('/ar-aging',        requirePermission('aging.read'),   asyncHandler(getArAging));
router.get('/ar-aging/export', requirePermission('aging.export'), asyncHandler(exportArAging));

// ─── AP Aging ─────────────────────────────────────────────────────────────
router.get('/ap-aging',        requirePermission('aging.read'),   asyncHandler(getApAging));
router.get('/ap-aging/export', requirePermission('aging.export'), asyncHandler(exportApAging));
```

### Step 4 — Create aging.export.adapter.ts

Create `backend/src/shared/services/financial/export/aging.export.adapter.ts`:

```typescript
import type { FinancialResponse, ArAgingRow, ApAgingRow } from '../financial.types';
import { buildSubtitle } from '../summary.utils';

const AGING_COLUMNS = [
  { header: 'الكود',         key: 'code',     width: 14 },
  { header: 'الاسم',          key: 'name',     width: 28 },
  { header: 'جاري',           key: 'current',  width: 14, numFmt: '#,##0.000' },
  { header: '0–30 يوم',      key: '0_30',     width: 14, numFmt: '#,##0.000' },
  { header: '31–60 يوم',     key: '31_60',    width: 14, numFmt: '#,##0.000' },
  { header: '61–90 يوم',     key: '61_90',    width: 14, numFmt: '#,##0.000' },
  { header: '91–120 يوم',    key: '91_120',   width: 14, numFmt: '#,##0.000' },
  { header: '+120 يوم',      key: 'over_120', width: 14, numFmt: '#,##0.000' },
  { header: 'الإجمالي',       key: 'total',    width: 14, numFmt: '#,##0.000' },
] as const;

export function toAgingReportInput(
  response: FinancialResponse<ArAgingRow | ApAgingRow>,
  type: 'ar' | 'ap'
) {
  const title = type === 'ar' ? 'أعمار ذمم العملاء (مديونيات)' : 'أعمار ذمم الموردين (دائنية)';
  const asOfDate = String(response.metadata?.asOfDate ?? '').slice(0, 10);
  return {
    title,
    subtitle: asOfDate ? `حتى تاريخ ${asOfDate}` : '',
    columns: [...AGING_COLUMNS],
    rows: response.rows.map(r => {
      const isAr = 'customerId' in r;
      return {
        code:     isAr ? (r as ArAgingRow).customerCode : (r as ApAgingRow).supplierCode,
        name:     isAr ? (r as ArAgingRow).customerName : (r as ApAgingRow).supplierName,
        current:  r.current  || '',
        '0_30':   r['0_30'] || '',
        '31_60':  r['31_60'] || '',
        '61_90':  r['61_90'] || '',
        '91_120': r['91_120'] || '',
        over_120: r.over_120 || '',
        total:    r.total,
      };
    }),
    totalsRow: {
      name: 'الإجمالي',
      total: response.summary.totalOutstanding,
    },
  };
}
```

### Step 5 — TypeScript validation (backend aging)

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

### Step 6 — Test aging endpoints

```bash
# Start backend dev server, then:
curl -X GET "http://127.0.0.1:48211/api/financial/ar-aging" \
  -H "Authorization: Bearer <token>"
```

Expected: `{"success": true, "data": {"reportType": "ar-aging", "rows": [...], "summary": {...}}}`

```bash
curl -X GET "http://127.0.0.1:48211/api/financial/ar-aging?hideZero=true" \
  -H "Authorization: Bearer <token>"
```

Expected: rows where `total === 0` are excluded.

---

### Step 7 — Create AgingSummaryCards.tsx

Create `frontend/src/components/financial/AgingSummaryCards.tsx`:

```typescript
import type { FinancialSummary } from '../../api/financial';

interface Props { summary: FinancialSummary; type: 'ar' | 'ap'; }

function fmt(n?: number) {
  if (!n) return '0.000';
  return n.toLocaleString('ar-KW', { minimumFractionDigits: 3 });
}

export function AgingSummaryCards({ summary, type }: Props) {
  const label = type === 'ar' ? 'ذمم العملاء' : 'ذمم الموردين';
  return (
    <div className="aging-summary-cards">
      <div className="aging-card">
        <div className="aging-card-label">إجمالي {label}</div>
        <div className="aging-card-value">{fmt(summary.totalOutstanding)} <span>د.ك</span></div>
      </div>
      <div className="aging-card critical">
        <div className="aging-card-label">حرج (+90 يوم)</div>
        <div className="aging-card-value">{fmt(summary.criticalOver90)} <span>د.ك</span></div>
      </div>
      <div className="aging-card">
        <div className="aging-card-label">عدد الجهات</div>
        <div className="aging-card-value">{summary.entityCount ?? 0}</div>
      </div>
    </div>
  );
}
```

### Step 8 — Create AgingChart.tsx

Create `frontend/src/components/financial/AgingChart.tsx`:

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface BucketData { label: string; amount: number; color: string; }
interface Props { data: BucketData[]; }

const BUCKET_COLORS: Record<string, string> = {
  'جاري':       '#22c55e',  // green
  '0–30 يوم':  '#86efac',  // light green
  '31–60 يوم': '#fde047',  // yellow
  '61–90 يوم': '#fb923c',  // orange
  '91–120 يوم':'#f87171',  // light red
  '+120 يوم':  '#ef4444',  // red
};

function fmt(v: number) {
  return `${v.toLocaleString('ar-KW', { minimumFractionDigits: 3 })} د.ك`;
}

export function AgingChart({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
        <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} />
        <Tooltip formatter={(v: number) => fmt(v)} />
        <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
          {data.map((entry, i) => (
            <Cell key={i} fill={BUCKET_COLORS[entry.label] ?? '#94a3b8'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### Step 9 — Create AgingTable.tsx

Create `frontend/src/components/financial/AgingTable.tsx`:

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ArAgingRow, ApAgingRow } from '../../api/financial';
import type { FinancialDrillDownState } from './DrillDownLink';

type AgingRow = ArAgingRow | ApAgingRow;
type SortField = keyof AgingRow;

interface Props {
  rows: AgingRow[];
  type: 'ar' | 'ap';
  currentState: FinancialDrillDownState;
}

function fmt(n: number) {
  return n ? n.toLocaleString('ar-KW', { minimumFractionDigits: 3 }) : '';
}

function cellColor(amount: number, bucket: string): string {
  if (!amount) return '';
  if (bucket === 'over_120' || bucket === '91_120') return 'aging-critical';
  if (bucket === '61_90') return 'aging-warning';
  if (bucket === '31_60') return 'aging-caution';
  return '';
}

export function AgingTable({ rows, type, currentState }: Props) {
  const navigate = useNavigate();
  const [sortField, setSortField] = useState<SortField>('total');
  const [sortDir, setSortDir]     = useState<'asc' | 'desc'>('desc');

  function sort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = (a[sortField] as number) ?? 0;
    const bv = (b[sortField] as number) ?? 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function handleEntityClick(row: AgingRow) {
    // Internal DrillDown — stays in Financial Center, no return state needed
    const entityType = type === 'ar' ? 'customer' : 'supplier';
    const entityId   = type === 'ar' ? (row as ArAgingRow).customerId : (row as ApAgingRow).supplierId;
    navigate(`/financial?tab=statement&entityType=${entityType}&entityId=${entityId}`);
  }

  function handleBucketClick(row: AgingRow, bucketKey: string) {
    // External DrillDown — save return state, navigate to invoices
    sessionStorage.setItem('app.drilldown.returnState', JSON.stringify({
      ...currentState,
      scrollY: window.scrollY,
    }));
    const entityId = type === 'ar' ? (row as ArAgingRow).customerId : (row as ApAgingRow).supplierId;
    const paramKey = type === 'ar' ? 'customerId' : 'supplierId';
    navigate(`/invoices?${paramKey}=${entityId}&agingBucket=${bucketKey}&status=UNPAID`);
  }

  const nameKey  = type === 'ar' ? 'customerName'  : 'supplierName';
  const codeKey  = type === 'ar' ? 'customerCode'  : 'supplierCode';
  const BUCKETS: { key: string; label: string }[] = [
    { key: 'current',  label: 'جاري'      },
    { key: '0_30',     label: '0–30'      },
    { key: '31_60',    label: '31–60'     },
    { key: '61_90',    label: '61–90'     },
    { key: '91_120',   label: '91–120'    },
    { key: 'over_120', label: '+120 يوم'  },
  ];

  return (
    <div className="aging-table-container" dir="rtl">
      {type === 'ap' && (
        <div className="aging-note">
          ملاحظة: يعرض أعمار الذمم فواتير المشتريات فقط. للرصيد الشامل بما يتضمن المصروفات، راجع كشف الحساب.
        </div>
      )}
      <table className="financial-table aging-table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>الاسم</th>
            {BUCKETS.map(b => (
              <th key={b.key} onClick={() => sort(b.key as SortField)} className="sortable">
                {b.label} {sortField === b.key ? (sortDir === 'asc' ? '↑' : '↓') : ''}
              </th>
            ))}
            <th onClick={() => sort('total')} className="sortable">
              الإجمالي {sortField === 'total' ? (sortDir === 'asc' ? '↑' : '↓') : ''}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => (
            <tr key={row.id}>
              <td>{row[codeKey as keyof AgingRow] as string}</td>
              <td>
                <button className="aging-entity-link" onClick={() => handleEntityClick(row)}>
                  {row[nameKey as keyof AgingRow] as string}
                </button>
              </td>
              {BUCKETS.map(b => {
                const amount = row[b.key as keyof AgingRow] as number;
                return (
                  <td key={b.key} className={`num ${cellColor(amount, b.key)}`}>
                    {amount > 0 ? (
                      <button className="aging-bucket-link" onClick={() => handleBucketClick(row, b.key)}>
                        {fmt(amount)}
                      </button>
                    ) : ''}
                  </td>
                );
              })}
              <td className="num total-col">{fmt(row.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 10 — Wire Aging tab into FinancialCenter.tsx

In `frontend/src/pages/FinancialCenter.tsx`, add the following state and logic (alongside existing statement state):

```typescript
// New imports to add:
import { AgingTable }        from '../components/financial/AgingTable';
import { AgingSummaryCards } from '../components/financial/AgingSummaryCards';
import { AgingChart }        from '../components/financial/AgingChart';
import type { ArAgingRow, ApAgingRow, FinancialSummary } from '../api/financial';
import { DEFAULT_AGING_BUCKETS } from '../../../backend/src/shared/services/financial/aging.utils';

// New state (add near other useState calls):
const agingSubTab = (searchParams.get('subTab') ?? 'ar') as 'ar' | 'ap';
const [arData,    setArData]    = useState<FinancialResponse<ArAgingRow> | null>(null);
const [apData,    setApData]    = useState<FinancialResponse<ApAgingRow> | null>(null);
const [agingLoading, setAgingLoading] = useState(false);
const [agingError,   setAgingError]   = useState<string | null>(null);
const agingAsOfDate = searchParams.get('asOfDate') ?? '';
const agingSearch   = searchParams.get('search')   ?? '';
const agingHideZero = searchParams.get('hideZero') === 'true';

// Load aging data:
const loadAging = useCallback(async () => {
  if (!hasPermission('aging.read')) return;
  setAgingLoading(true);
  setAgingError(null);
  try {
    const filters = {
      asOfDate: agingAsOfDate || undefined,
      search:   agingSearch   || undefined,
      hideZero: agingHideZero,
    };
    if (agingSubTab === 'ar') {
      setArData(await financialApi.getArAging(filters));
    } else {
      setApData(await financialApi.getApAging(filters));
    }
  } catch (e: unknown) {
    setAgingError((e as Error).message ?? 'خطأ في تحميل أعمار الذمم');
  } finally {
    setAgingLoading(false);
  }
}, [agingSubTab, agingAsOfDate, agingSearch, agingHideZero]);

useEffect(() => {
  if (activeTab === 'aging') loadAging();
}, [activeTab, loadAging]);
```

Replace the aging placeholder in the JSX return:

```typescript
{activeTab === 'aging' && (
  <div className="financial-tab-content">
    {/* Sub-tabs */}
    <div className="aging-subtabs">
      <button
        className={`subtab-btn ${agingSubTab === 'ar' ? 'active' : ''}`}
        onClick={() => setParam('subTab', 'ar')}
      >ذمم العملاء</button>
      <button
        className={`subtab-btn ${agingSubTab === 'ap' ? 'active' : ''}`}
        onClick={() => setParam('subTab', 'ap')}
      >ذمم الموردين</button>
    </div>

    <FilterBar
      onFromDate={undefined}
      onSearch={v => setParam('search', v)}
      search={agingSearch}
    >
      <div className="filter-field">
        <label>حتى تاريخ</label>
        <input type="date" value={agingAsOfDate} onChange={e => setParam('asOfDate', e.target.value)} />
      </div>
      <label className="filter-field">
        <input type="checkbox" checked={agingHideZero} onChange={e => setParam('hideZero', String(e.target.checked))} />
        إخفاء الصفرية
      </label>
    </FilterBar>

    {/* Summary + Chart */}
    {(agingSubTab === 'ar' ? arData : apData) && (() => {
      const data = agingSubTab === 'ar' ? arData! : apData!;
      const chartData = DEFAULT_AGING_BUCKETS.map(b => ({
        label:  b.label,
        amount: data.rows.reduce((s, r) => s + ((r as Record<string,number>)[b.key] ?? 0), 0),
        color:  '',
      }));
      return (
        <>
          <AgingSummaryCards summary={data.summary} type={agingSubTab} />
          <AgingChart data={chartData} />
          <ExportBar
            onExcelExport={async () => {
              const blob = agingSubTab === 'ar'
                ? await financialApi.exportArAging({ ...{asOfDate: agingAsOfDate || undefined}, format: 'excel' })
                : await financialApi.exportApAging({ ...{asOfDate: agingAsOfDate || undefined}, format: 'excel' });
              const url = URL.createObjectURL(blob);
              Object.assign(document.createElement('a'), { href: url, download: `${agingSubTab}-aging.xlsx` }).click();
              URL.revokeObjectURL(url);
            }}
            onPdfExport={async () => {
              const blob = agingSubTab === 'ar'
                ? await financialApi.exportArAging({ ...{asOfDate: agingAsOfDate || undefined}, format: 'pdf' })
                : await financialApi.exportApAging({ ...{asOfDate: agingAsOfDate || undefined}, format: 'pdf' });
              const url = URL.createObjectURL(blob);
              Object.assign(document.createElement('a'), { href: url, download: `${agingSubTab}-aging.pdf` }).click();
              URL.revokeObjectURL(url);
            }}
          />
          <AgingTable
            rows={data.rows}
            type={agingSubTab}
            currentState={{ returnTo: '/financial', reportLabel: 'أعمار الذمم', tab: 'aging', subTab: agingSubTab, fromDate: agingAsOfDate || undefined }}
          />
        </>
      );
    })()}

    {agingLoading && <div className="loading-state">جاري التحميل...</div>}
    {agingError   && <div className="error-state">{agingError}</div>}
  </div>
)}
```

### Step 11 — TypeScript validation (full)

```bash
cd backend  && npx tsc --noEmit
cd frontend && npx tsc --noEmit
```

Expected: 0 errors in both.

### Step 12 — Commit

```bash
git add backend/src/modules/financial/ backend/src/shared/services/financial/export/aging.export.adapter.ts frontend/src/components/financial/Aging* frontend/src/pages/FinancialCenter.tsx
git commit -m "feat(financial): add AR/AP Aging Center with configurable buckets, chart, and DrillDown"
```

---

## Validation

- [ ] `GET /api/financial/ar-aging` → 200 with `FinancialResponse<ArAgingRow>`
- [ ] `GET /api/financial/ap-aging` → 200 with `FinancialResponse<ApAgingRow>`
- [ ] `GET /api/financial/ar-aging?hideZero=true` → rows with `total: 0` excluded
- [ ] `GET /api/financial/ar-aging/export?format=excel` → binary XLSX download
- [ ] `GET /api/financial/ar-aging` without `aging.read` → 403
- [ ] Frontend Aging tab: AR sub-tab shows customer table, AP sub-tab shows supplier table
- [ ] Chart renders bucket distribution with correct colors
- [ ] Bucket cell click → navigates to `/invoices?customerId=X&agingBucket=0_30&status=UNPAID`
- [ ] Entity name click → navigates internally to `/financial?tab=statement&entityType=customer&entityId=X`
- [ ] AP Aging note text is visible
- [ ] `cd backend && npx tsc --noEmit` → 0 errors
- [ ] `cd frontend && npx tsc --noEmit` → 0 errors

## Rollback Considerations

- All changes are additive (new routes, new service methods)
- Removing aging routes from `financial.routes.ts` and handlers from controller reverts cleanly
- Frontend Aging tab component can be removed without affecting other tabs

## Risks

- **Supplier `code` field:** Verify that `supplier.code` exists on the Prisma model. If the field is named differently (e.g., `supplierCode`), update the select.
- **`dueDate` null:** Some invoices may have `dueDate: null` — the code falls back to `invoiceDate`. If both are null, `new Date(null)` produces epoch (Jan 1970) which would put the invoice in `over_120`. Add a guard: if `dueDate` and `invoiceDate` are both null, skip the invoice.

## Acceptance Criteria

- AR Aging returns all customers with outstanding invoices, bucketed by days overdue
- AP Aging returns all suppliers with outstanding purchase invoices, bucketed by days overdue
- Outstanding = 0 entries are excluded from bucket calculations
- Export produces valid Excel and PDF files
- Frontend shows color-coded table with correct bucket assignment

# Page-Level Improvements Phase 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add status/type filters, search improvements, clear-filter UX, and consistent empty/action states across Customers, Employees, Equipment, Expenses, Invoices, Cheques, and Reports pages — frontend only, no backend or schema changes.

**Architecture:** All backend endpoints already support the required query params (`status`, `type`, `direction`, `search`). Changes are purely additive frontend UI improvements inside existing page components and `ModuleConfig`. No new components are introduced.

**Tech Stack:** React 18, TypeScript 5.5, Vite, Zustand, Axios, existing i18n system (`frontend/src/lib/i18n.ts`)

---

## File Map

| File | Change type | What changes |
|------|------------|-------------|
| `frontend/src/config/modules.tsx` | Modify | Add `statusFilter` to `ModuleConfig`, wire it for customers/employees/equipment/expenses |
| `frontend/src/pages/ResourcePage.tsx` | Modify | Render status filter select + clear (×) button on search input |
| `frontend/src/pages/Invoices.tsx` | Modify | Add status + direction filter dropdowns to toolbar |
| `frontend/src/pages/Cheques.tsx` | Modify | Add search + status filter to history section, pass to API |
| `frontend/src/components/DataTable.tsx` | Modify | Label the actions `<th>` with `col.actions` i18n key |
| `frontend/src/pages/Reports.tsx` | Modify | Add reset-filters button + row count below filter bar |
| `frontend/src/lib/i18n.ts` | Modify | Add `col.actions` in AR+EN; verify no other keys missing |

---

## Task 1: i18n — add `col.actions` key

**Files:**
- Modify: `frontend/src/lib/i18n.ts`

- [ ] **Step 1: Add `col.actions` to AR and EN dictionaries**

In `frontend/src/lib/i18n.ts`, in the AR section find `'col.status': 'الحالة',` and add the new key immediately after it:

```typescript
'col.actions': 'إجراءات',
```

In the EN section find `'col.status': 'Status',` and add:

```typescript
'col.actions': 'Actions',
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

## Task 2: `modules.tsx` — add `statusFilter` to `ModuleConfig`

**Files:**
- Modify: `frontend/src/config/modules.tsx`

- [ ] **Step 1: Extend `ModuleConfig` interface**

Find the `ModuleConfig` interface and add one optional field:

```typescript
export interface ModuleConfig {
  key: string;
  endpoint: string;
  label: string;
  title: string;
  subtitle: string;
  icon: string;
  group: string;
  columns: Column[];
  fields: FormField[];
  createLabel: string;
  canApprove?: boolean;
  statusFilter?: { param: string; options: { value: string; labelKey: string }[] };
}
```

Note: `labelKey` is used instead of `label` so the filter options go through `t()`.

- [ ] **Step 2: Add `statusFilter` to `customers` config**

In the `customers` module definition, after `canApprove` (or after `createLabel`), add:

```typescript
statusFilter: {
  param: 'type',
  options: [
    { value: 'GOVERNMENT', labelKey: 'opt.customer.government' },
    { value: 'PRIVATE',    labelKey: 'opt.customer.private' },
  ],
},
```

- [ ] **Step 3: Add `statusFilter` to `employees` config**

In the `employees` module definition add:

```typescript
statusFilter: {
  param: 'status',
  options: [
    { value: 'ACTIVE',     labelKey: 'opt.emp.active' },
    { value: 'ON_LEAVE',   labelKey: 'opt.emp.on_leave' },
    { value: 'TERMINATED', labelKey: 'opt.emp.terminated' },
  ],
},
```

- [ ] **Step 4: Add `statusFilter` to `equipment` config**

```typescript
statusFilter: {
  param: 'status',
  options: [
    { value: 'WORKING',     labelKey: 'opt.eq.working' },
    { value: 'NOT_WORKING', labelKey: 'opt.eq.not_working' },
  ],
},
```

- [ ] **Step 5: Add `statusFilter` to `expenses` config**

```typescript
statusFilter: {
  param: 'status',
  options: [
    { value: 'PENDING',  labelKey: 'status.pending' },
    { value: 'APPROVED', labelKey: 'status.approved' },
    { value: 'REJECTED', labelKey: 'status.rejected' },
  ],
},
```

- [ ] **Step 6: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

## Task 3: `ResourcePage.tsx` — filter dropdown + clear button

**Files:**
- Modify: `frontend/src/pages/ResourcePage.tsx`

- [ ] **Step 1: Add `filterValue` state**

After the existing `const [query, setQuery] = useState('');` line, add:

```typescript
const [filterValue, setFilterValue] = useState('');
```

- [ ] **Step 2: Pass filter to API call**

In the `load` callback, find the `api.get` call and update `params`:

```typescript
const res = await api.get(cfg.endpoint, {
  params: {
    page,
    search: query,
    pageSize: 15,
    ...(cfg.statusFilter && filterValue ? { [cfg.statusFilter.param]: filterValue } : {}),
  },
});
```

- [ ] **Step 3: Reset filter when module changes**

Add an effect after the existing load effect:

```typescript
useEffect(() => {
  setFilterValue('');
  setSearch('');
  setQuery('');
  setPage(1);
}, [cfg.key]);
```

- [ ] **Step 4: Update toolbar JSX**

Replace the existing `<form className="toolbar" ...>` block with:

```tsx
<form className="toolbar" onSubmit={onSearch}>
  <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
    <input
      placeholder={t('action.search_placeholder')}
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      style={{ flex: 1, minWidth: 240, paddingInlineEnd: search ? 32 : undefined }}
    />
    {search && (
      <button
        type="button"
        onClick={() => { setSearch(''); setQuery(''); setPage(1); }}
        style={{ position: 'absolute', insetInlineEnd: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, lineHeight: 1 }}
        title={t('action.reset_filters')}
      >
        ✕
      </button>
    )}
  </div>
  <button className="btn secondary" type="submit">{t('action.search')}</button>
  {cfg.statusFilter && (
    <select
      value={filterValue}
      onChange={(e) => { setFilterValue(e.target.value); setPage(1); }}
      style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--bg)', color: 'var(--text)', fontSize: 14, cursor: 'pointer' }}
    >
      <option value="">{t('opt.all')}</option>
      {cfg.statusFilter.options.map((o) => (
        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
      ))}
    </select>
  )}
</form>
```

- [ ] **Step 5: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

## Task 4: `DataTable.tsx` — label the actions column header

**Files:**
- Modify: `frontend/src/components/DataTable.tsx`

- [ ] **Step 1: Replace empty `<th></th>` with a labeled one**

Find `{actions && <th></th>}` and replace with:

```tsx
{actions && <th style={{ minWidth: 80 }}>{t('col.actions')}</th>}
```

- [ ] **Step 2: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

## Task 5: `Invoices.tsx` — status + direction filters

**Files:**
- Modify: `frontend/src/pages/Invoices.tsx`

- [ ] **Step 1: Add filter state variables**

After `const [search, setSearch] = useState('');` add:

```typescript
const [statusFilter, setStatusFilter] = useState('');
const [directionFilter, setDirectionFilter] = useState('');
```

- [ ] **Step 2: Pass filters to API call**

In the `load` callback, update the `api.get` params:

```typescript
const res = await api.get('/invoices', {
  params: {
    page,
    pageSize: 15,
    search: search || undefined,
    status: statusFilter || undefined,
    direction: directionFilter || undefined,
  },
});
```

- [ ] **Step 3: Reset page on filter change**

Update the existing `onChange` handlers to also reset page. After the existing search `onChange`, add effects or wrap filter setters:

```typescript
// Replace setStatusFilter and setDirectionFilter calls in JSX with:
// onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
// onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}
```

- [ ] **Step 4: Update toolbar JSX**

Find the existing `<div className="toolbar" ...>` block and expand it:

```tsx
<div className="toolbar" style={{ marginBottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
  <input
    placeholder={t('page.invoices.search')}
    value={search}
    onChange={(e) => { setSearch(e.target.value); setPage(1); }}
    style={{ ...inp, maxWidth: 280 }}
  />
  <select
    value={statusFilter}
    onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
    style={{ ...inp, maxWidth: 160 }}
  >
    <option value="">{t('opt.all')}</option>
    <option value="UNPAID">{t('inv.status.unpaid')}</option>
    <option value="PARTIAL">{t('inv.status.partial')}</option>
    <option value="PAID">{t('inv.status.paid')}</option>
    <option value="OVERDUE">{t('inv.status.overdue')}</option>
    <option value="CANCELLED">{t('inv.status.cancelled')}</option>
  </select>
  <select
    value={directionFilter}
    onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}
    style={{ ...inp, maxWidth: 160 }}
  >
    <option value="">{t('opt.all')}</option>
    <option value="SALES">{t('opt.direction.sales')}</option>
    <option value="PURCHASE">{t('opt.direction.purchase')}</option>
  </select>
  {(statusFilter || directionFilter || search) && (
    <button
      className="btn secondary sm"
      onClick={() => { setSearch(''); setStatusFilter(''); setDirectionFilter(''); setPage(1); }}
    >
      {t('action.reset_filters')}
    </button>
  )}
</div>
```

- [ ] **Step 5: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

## Task 6: `Cheques.tsx` — search + status filter in history

**Files:**
- Modify: `frontend/src/pages/Cheques.tsx`

- [ ] **Step 1: Add search + status state**

After `const [page, setPage] = useState(1);` add:

```typescript
const [historySearch, setHistorySearch] = useState('');
const [historyStatus, setHistoryStatus] = useState('');
```

- [ ] **Step 2: Pass filters to `loadData`**

Update the `loadData` callback signature and API call:

```typescript
const loadData = useCallback(async (p = 1) => {
  setLoading(true);
  try {
    const [listRes, statsRes] = await Promise.all([
      api.get('/cheques', {
        params: {
          page: p,
          pageSize: 20,
          search: historySearch || undefined,
          status: historyStatus || undefined,
        },
      }),
      api.get('/cheques/stats'),
    ]);
    setCheques(listRes.data.data.data ?? []);
    setMeta(listRes.data.data.meta ?? null);
    setStats(statsRes.data.data ?? { total: 0, draft: 0, printed: 0, cancelled: 0 });
  } catch (e) {
    setFormError(errorMessage(e));
  } finally {
    setLoading(false);
  }
}, [historySearch, historyStatus]);
```

- [ ] **Step 3: Add filter toolbar above the history DataTable**

Find the history table section comment `{/* History table */}` and add a filter row before the DataTable:

```tsx
{/* History filter toolbar */}
<div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
  <input
    className="form-input"
    style={{ maxWidth: 240, padding: '6px 10px' }}
    placeholder={t('action.search_placeholder')}
    value={historySearch}
    onChange={(e) => { setHistorySearch(e.target.value); setPage(1); loadData(1); }}
  />
  <select
    className="form-input"
    style={{ maxWidth: 160, padding: '6px 10px' }}
    value={historyStatus}
    onChange={(e) => { setHistoryStatus(e.target.value); setPage(1); loadData(1); }}
  >
    <option value="">{t('opt.all')}</option>
    <option value="DRAFT">{t('cheque.status.draft')}</option>
    <option value="PRINTED">{t('cheque.status.printed')}</option>
    <option value="CANCELLED">{t('cheque.status.cancelled')}</option>
  </select>
  {(historySearch || historyStatus) && (
    <button
      className="btn secondary sm"
      onClick={() => { setHistorySearch(''); setHistoryStatus(''); setPage(1); loadData(1); }}
    >
      {t('action.reset_filters')}
    </button>
  )}
</div>
```

Note: inline `loadData(1)` call on filter change provides immediate feedback without needing a submit button. This is safe because the cheques list is small.

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

## Task 7: `Reports.tsx` — reset filters + row count

**Files:**
- Modify: `frontend/src/pages/Reports.tsx`

- [ ] **Step 1: Extract a `resetFilters` function**

After the existing `function buildParams()` function, add:

```typescript
function resetFilters() {
  setFrom(''); setTo('');
  setCustomerId(''); setEmployeeId('');
  setStatus(''); setDirection('');
  setPreview(null); setError('');
}
```

- [ ] **Step 2: Add "Reset Filters" button to the filter bar**

In the `filterBar` JSX, find the buttons `<div>` that contains the view/export/print buttons and add a reset button:

```tsx
<div style={{ display: 'flex', gap: 8, marginRight: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
  {canView && (
    <button className="btn" onClick={loadPreview} disabled={loading} style={{ padding: '8px 18px' }}>
      {loading ? t('page.reports.loading') : t('page.reports.view')}
    </button>
  )}
  {(from || to || customerId || employeeId || status || direction) && (
    <button className="btn secondary" onClick={resetFilters} style={{ padding: '8px 14px' }}>
      {t('action.reset_filters')}
    </button>
  )}
  {canExport && preview && (
    <>
      <button className="btn secondary" onClick={downloadExcel} disabled={excelBusy} style={{ padding: '8px 16px' }}>
        {excelBusy ? '⏳' : '⤓ Excel'}
      </button>
      <button className="btn secondary" onClick={openPrint} style={{ padding: '8px 16px' }}>
        🖨️ PDF / طباعة
      </button>
    </>
  )}
</div>
```

- [ ] **Step 3: Add row count above the preview table**

Find `{!loading && previewTable}` and replace with:

```tsx
{!loading && preview && (
  <div style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
    {preview.rows.length} {preview.rows.length === 1 ? 'نتيجة' : 'نتيجة'}
  </div>
)}
{!loading && previewTable}
```

Note: uses inline Arabic string because there is no singular/plural distinction in Arabic for this count pattern. If EN is active, this will show a number without unit — acceptable at this phase.

- [ ] **Step 4: TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no new errors.

---

## Task 8: Final validation run

- [ ] **Step 1: Backend TypeScript check**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (no backend changes made).

- [ ] **Step 2: Frontend TypeScript check**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Electron TypeScript check**

Run: `tsc -p electron/tsconfig.json --noEmit`
Expected: PASS.

- [ ] **Step 4: Backend build**

Run: `npm run build:back`
Expected: exits 0.

- [ ] **Step 5: Frontend build**

Run: `npm run build:front`
Expected: exits 0.

- [ ] **Step 6: Prisma validate**

Run: `cd backend && npx prisma validate`
Expected: Schema is valid.

---

## Task 9: Git setup

- [ ] **Step 1: Create checkpoint tag on current production HEAD**

```bash
git tag pre-page-level-improvements-phase1
```

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feature/page-level-improvements-phase1
```

- [ ] **Step 3: Confirm branch**

Run: `git branch --show-current`
Expected: `feature/page-level-improvements-phase1`

---

## Notes

- `filterValue` in ResourcePage resets when `cfg.key` changes (navigating between modules), so no stale filter bleeds across pages.
- Cheques inline `loadData(1)` on filter change fires immediately. This is acceptable for an Electron local app with SQLite — no debounce needed.
- Reports row count shows Arabic text unconditionally. If EN mode is active this will show "10 نتيجة". This is acceptable at Phase 1; a Phase 2 improvement can add an EN string.
- `col.actions` in DataTable only appears when `actions` prop is provided, which is always the case for ResourcePage and Invoices. Cheques history table also passes `actions`.

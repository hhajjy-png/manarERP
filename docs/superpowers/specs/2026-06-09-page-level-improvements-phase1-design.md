---
name: page-level-improvements-phase1
description: Small, safe UX improvements to Customers, Employees, Equipment, Invoices, Cheques, Reports pages — Phase 1
metadata:
  type: project
---

# Page-Level Improvements Phase 1 — Design Spec

**Date:** 2026-06-09
**Branch:** `feature/page-level-improvements-phase1`
**Scope:** Frontend-only. No schema changes. No migration. No auth changes.

---

## Audit Summary

All six target pages were read in full. Key findings:

| Page | Pattern | Issues Found |
|------|---------|--------------|
| Customers | ResourcePage | No status/type filter, no search clear button |
| Employees | ResourcePage | No status filter, 13-column table is wide |
| Equipment | ResourcePage | No status filter |
| Expenses | ResourcePage | No status filter |
| Invoices | Custom | No status or direction filter in toolbar |
| Cheques | Custom | No search, no status filter in history table |
| Reports | Custom | No reset-filters button, no row count after preview |

---

## Changes Per Component

### 1. `frontend/src/config/modules.tsx`

Add optional `statusFilter` to `ModuleConfig`:

```typescript
statusFilter?: { param: string; options: { value: string; label: string }[] };
```

Define it for:
- **customers**: `{ param: 'type', options: [GOVERNMENT, PRIVATE] }`
- **employees**: `{ param: 'status', options: [ACTIVE, ON_LEAVE, TERMINATED] }`
- **equipment**: `{ param: 'status', options: [WORKING, NOT_WORKING] }`
- **expenses**: `{ param: 'status', options: [PENDING, APPROVED, REJECTED] }`

### 2. `frontend/src/pages/ResourcePage.tsx`

- Add `statusFilter` state (default `''`).
- Pass `{ [cfg.statusFilter.param]: statusFilter || undefined }` to API params.
- Render a `<select>` in the toolbar when `cfg.statusFilter` is defined.
- Add a `×` clear button to the search input.
- Reset page to 1 on filter change.

### 3. `frontend/src/pages/Invoices.tsx`

- Add `status` state and `direction` state.
- Add two `<select>` dropdowns to the toolbar (status pill options, direction SALES/PURCHASE).
- Include in `params` to `api.get('/invoices', ...)`.
- Reset page to 1 on filter change.
- Add "مسح" (clear) button to reset all filters.

### 4. `frontend/src/pages/Cheques.tsx`

- Add `search` state and `statusFilter` state.
- Add search `<input>` and status `<select>` above the history DataTable.
- Pass `{ search, status }` to `api.get('/cheques', ...)`.
- Reset page to 1 on filter change.

### 5. `frontend/src/components/DataTable.tsx`

- Label the actions `<th>` with i18n key `col.actions` instead of empty `<th></th>`.

### 6. `frontend/src/pages/Reports.tsx`

- Add "مسح الفلاتر" button to filter bar (resets all filter state).
- Show row count chip below the filter bar after preview loads: "عرض X نتيجة".

---

## i18n Keys to Add (if missing)

All new string literals will use existing i18n keys where possible. New keys (if needed):
- `filter.type` — "النوع"
- `col.actions` — "إجراءات"
- `action.clear_filters` — "مسح الفلاتر"
- `msg.row_count` — "عرض {count} نتيجة"

These will be added to `frontend/src/lib/i18n.ts` translations map.

---

## What Is NOT Changing

- No backend changes (unless filter params are missing — will verify before adding frontend filters).
- No Prisma schema changes.
- No auth/session/middleware changes.
- No cheque print coordinates.
- No payroll/accounting/inventory calculation logic.
- No full UI rebuild.
- No new modules.
- `confirm()` / `alert()` patterns in ResourcePage and Invoices are kept as-is (acceptable for Electron).

---

## Validation Plan

1. `cd backend && npx tsc --noEmit`
2. `cd frontend && npx tsc --noEmit`
3. `tsc -p electron/tsconfig.json --noEmit`
4. `npm run build:back`
5. `npm run build:front`

---

## Approved

User has granted autonomous authorization to proceed within this scope.

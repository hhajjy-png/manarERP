# Design Spec: Invoice UX Improvements Bundle

**Date:** 2026-06-16
**Branch:** feature/invoice-ux-improvements
**Status:** Approved — ready for implementation

---

## Scope

Six targeted UX improvements to the invoice module. No accounting logic changes. One DB schema addition (customerId on ProjectPrice).

---

## Improvement #1 — Price Filtering by Customer

### Problem
The price picker in invoice forms shows all project prices regardless of which customer is selected. Users must manually identify which prices apply to their customer.

### Solution
Link `ProjectPrice` to `Customer` via optional foreign key. In invoice forms (SALES direction), load only prices for the selected customer.

### Schema Change (backend/prisma/schema.prisma)

**Strategy:** `customerId` is nullable in the DB (existing rows have no customer yet), but required in Zod validation for new/updated records. Existing prices are mapped manually by the admin via the updated Prices page — no programmatic data migration.

Add to `ProjectPrice`:
```prisma
customerId Int?
customer   Customer? @relation(fields: [customerId], references: [id])
```
Add index:
```prisma
@@index([customerId])
```
Add reverse relation on `Customer` model:
```prisma
projectPrices ProjectPrice[]
```

Migration name: `add-customer-to-project-price`

### Backend

**prices.schema.ts:**
- Create schema: `customerId: z.number().int().positive()` — **required**, not optional
- Update schema: `customerId: z.number().int().positive()` — **required**, not optional
- Query schema: add optional `customerId` filter for list endpoint

**prices.service.ts:**
- Add `customerId?: number` to `listPrices` params
- Add `...(customerId ? { customerId } : {})` to `where` clause
- Add `customerId` to create and update `data` objects
- Include `customer: { select: { id: true, name: true } }` in `findMany` select

**prices.controller.ts:**
- Parse `customerId` from query params as integer (optional)

### Frontend — Prices.tsx

**PriceForm:**
- Fetch customers list (`/customers?pageSize=200`) on mount
- Add customer selector: `العميل (اختياري)` — dropdown with blank option
- Initialize from `price?.customerId` when editing
- Include `customerId` in submit payload (null if blank)

**Prices table:**
- Add column `العميل` showing `row.customer?.name ?? '—'`

### Frontend — Invoices.tsx (CreateInvoice + EditInvoice)

**Price loading:**
- Change price `useEffect` dependency from `[]` to `[partyId, effectivePartySource]`
- Only load prices when `effectivePartySource === 'SALES'` AND `partyId` is non-empty
- URL: `/prices?pageSize=200&customerId=${partyId}`
- When customer changes or party source is not SALES: `setPrices([])`

**"No prices" message:**
- When `effectivePartySource === 'SALES'` AND `partyId` is set AND `prices.length === 0`: show a small muted note above the items grid: `"لا توجد أسعار معرفة لهذا العميل"`

**No fallback:**
- If customer has no prices → price picker is hidden; no fallback to showing all prices
- For PURCHASE invoices: prices array stays empty → no picker buttons shown
- When `partyId` is empty (no customer selected): prices array stays empty

**Existing behavior preserved:**
- Price picker per line still filters by `contractUnit === it.unit` (unchanged)

---

## Improvement #2 — Clean Up Actions Column

### Remove from the actions renderer (DataTable actions prop):
- **Preview button** (`btn.inv.preview` → navigate to `/invoices/${row.id}/preview`)
- **Regular Delete button** (`setDeleting(row)` flow)

Remove the `deleting` state variable, the `{deleting && <DeleteInvoiceConfirm .../>}` render, and the `DeleteInvoiceConfirm` function — they will be dead code once the button is removed.

### Keep:
- Print button
- Edit button
- Collect button (تحصيل)
- Cancel button (إلغاء)
- Force Delete button (🗑️)

---

## Improvement #3 — Force Delete → Trash Icon

### Change:
```jsx
// Before
<button type="button" className="btn danger sm" onClick={() => setForceDeleteId(row.id)}>
  حذف نهائي
</button>

// After
<button
  type="button"
  className="btn danger sm"
  title="حذف نهائي"
  style={{ padding: '4px 8px', lineHeight: 1 }}
  onClick={() => setForceDeleteId(row.id)}
>
  🗑️
</button>
```

Position: last button in the row (after إلغاء).

---

## Improvement #4 — Items Column Order

**No change required.** Current grid order is already: البنود → الكمية → الوحدة → السعر → الإجمالي.
This improvement is fulfilled by adding column headers (#6).

---

## Improvement #5 — Default Unit 'درب'

Change the 4 occurrences of `unit: 'طن'` to `unit: 'درب'`:

| Location | Line (approx) | Context |
|---|---|---|
| `CreateInvoice` | 286 | `useState<Item[]>([{ ..., unit: 'طن', ... }])` |
| `CreateInvoice` | 621 | `setItems add-item` callback |
| `EditInvoice` | 668 | `useState<Item[]>([{ ..., unit: 'طن', ... }])` |
| `EditInvoice` | 956 | `setItems add-item` callback |

---

## Improvement #6 — Column Headers Above Items Grid

Add a header row immediately before the `items.map(...)` in both `CreateInvoice` and `EditInvoice`. The header row uses the same grid template as item rows (`2fr .9fr .9fr 1fr 1fr auto`).

```jsx
<div style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 4, padding: '0 2px' }}>
  {['البنود', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'].map((h) => (
    <div key={h} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
  ))}
  <div /> {/* spacer for delete-button column */}
</div>
```

---

## Files to Modify

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add customerId + relation to ProjectPrice; add reverse relation on Customer |
| `backend/src/modules/prices/prices.schema.ts` | Add customerId to create/update Zod schemas |
| `backend/src/modules/prices/prices.service.ts` | Add customerId filter in list; include in create/update |
| `backend/src/modules/prices/prices.controller.ts` | Parse customerId query param |
| `frontend/src/pages/Prices.tsx` | Add customer selector in PriceForm; add customer column |
| `frontend/src/pages/Invoices.tsx` | All 6 improvements |

## Migration Steps

1. Edit `schema.prisma`
2. `npm run db:migrate` (generates SQL + applies)
3. `npm run db:generate` (regenerates Prisma Client)
4. Update backend module files
5. Update frontend files
6. Run all TypeScript checks + build checks

---

## Constraints

- No changes to accounting/invoice calculation logic
- No changes to invoice status machine
- No changes to payment flows
- `DeleteInvoiceConfirm` component preserved (not removed, just not called from table actions)
- All existing permissions remain unchanged

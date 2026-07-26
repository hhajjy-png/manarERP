# Design Spec: Invoice Custom Type/Direction + Project Prices Phase 1

**Date:** 2026-06-10  
**Branch:** feature/prices-and-invoice-custom-fields  
**Status:** Approved — ready for implementation

---

## Feature 1: Invoice Custom Type & Direction

### Storage
Both `invoiceType` and `direction` are already `String` in Prisma — no migration needed.  
Zod currently enforces `z.enum()` — changes to `z.string().min(1)`.

### invoiceType — "Other"
- Backend (`invoices.schema.ts`): relax to `z.string().min(1)`
- Frontend: add `'أخرى'` sentinel at end of `invoiceTypes` array
- When selected: show required text input `نوع الفاتورة المخصص`
- On submit: send custom text value (not the sentinel `'أخرى'`)
- Table display: raw value shown as-is (already works)

### direction — "Other"
- Backend (`invoices.schema.ts`): relax to `z.string().min(1)`
- Refine logic:
  - `SALES` → `customerId` required
  - `PURCHASE` → `supplierId` required
  - custom → `customerId` OR `supplierId` required (party type shown in form)
- Frontend: add `'OTHER'` sentinel to direction dropdown
- When selected: show required text input `اتجاه مخصص` + party type selector (عميل/مورد)
- On submit: send `direction = customText`, `customerId` or `supplierId` per party type
- Table display: `SALES→مبيعات | PURCHASE→مشتريات | other→raw value`

---

## Feature 2: Project Prices Page Phase 1

### Prisma Model: `ProjectPrice`
```
id               Int     @id @default(autoincrement())
asphaltPlant     String
companyName      String
contractLocation String
contractUnit     String  // طن | درب | يومية
unitPrice        Float
isArchived       Boolean @default(false)
createdAt        DateTime @default(now())
updatedAt        DateTime @updatedAt
@@map("project_prices")
```

### Backend Module: `prices/`
- `prices.routes.ts` — GET /api/prices, POST, PATCH/:id, DELETE/:id
- `prices.controller.ts` — thin handlers
- `prices.service.ts` — Prisma queries, soft-delete via `isArchived`
- `prices.schema.ts` — Zod validation

### Permissions: `prices.read | prices.create | prices.update | prices.delete`

### Frontend: `Prices.tsx` (custom page, not ResourcePage — supports 3 filters)
- Filters: asphaltPlant, companyName, contractUnit
- Columns: asphaltPlant, companyName, contractLocation, contractUnit, unitPrice, actions
- CRUD: create, edit (modal), archive (soft delete)
- Currency format: `money()` for unitPrice

### Sidebar
- Group: `nav.group.core` after `contracts`
- key: `prices`, icon: `sell`, permission: `prices.read`

### i18n
- Both `ar` and `en` translations for all new keys

### No linking to contracts or invoices in Phase 1.

# Print Polish Batch 1 — Design Spec

**Date:** 2026-06-25
**Status:** Approved — Ready for Implementation
**Branch:** `feature/print-polish-batch1`
**Mode:** Polish / Enhancement — No Rewrite. No Breaking Changes.

---

## Overview

Three targeted improvements to the existing print infrastructure. Each Part is independent and can be validated separately.

| Part | Title | Scope | Schema Change? |
|------|-------|-------|---------------|
| 1 | Full Print Localization (Targeted Fix) | Frontend print templates + shared utility | No |
| 2 | Advanced Print Profiles | Backend Report Engine only | No |
| 3 | QR Verification Foundation | Invoice + Quotation schema + new module | Yes (nullable column) |

**Out of Scope (deferred):**
- HR Forms print profiles — separate project
- Print Template Storage (invoice/quotation template selector) — separate project
- Print Designer profiles — separate project
- Online/Cloud QR verification — deferred
- HMAC signature on documents — deferred
- QR on Cheques, PayrollPayslip, PurchaseOrder — deferred (same pattern, separate PR)
- Unified print profile system across all three subsystems — separate project

---

## Part 1 — Full Print Localization (Targeted Fix)

### Goal

Fix the 2 known English strings in print templates and provide a centralized utility that prevents raw enum values (`PAID`, `CANCELLED`, `DRAFT`) from appearing in future print output.

### Non-Goals

- No broad audit of the codebase
- Do NOT touch bilingual text in `QuotationBase.tsx` (English company name/tagline — intentional)
- Do NOT touch `i18n.ts` (UI translations) unless a clear gap is found
- Do NOT touch internal-only developer labels (e.g. `ReferenceTemplatePreview.tsx`)

### Files Changed

| File | Change |
|------|--------|
| `frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx` | `'Total :'` → `'الإجمالي:'` |
| `frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx` | Same |
| `frontend/src/print-templates/utils/printI18n.ts` | **New** — centralized print translation utility |

### `printI18n.ts` API

Pure functions, no imports from `i18n.ts`, no side effects. Fallback: unknown values return the raw string unchanged.

```typescript
// Invoice / Expense / Quotation statuses
translateInvoiceStatus(status: string): string
// UNPAID    → 'غير مسددة'
// PARTIAL   → 'مسددة جزئياً'
// PAID      → 'مسددة'
// OVERDUE   → 'متأخرة'
// CANCELLED → 'ملغاة'
// DRAFT     → 'مسودة'
// APPROVED  → 'معتمد'
// REJECTED  → 'مرفوض'
// PENDING   → 'قيد الانتظار'
// PRINTED   → 'مطبوعة'
// REVERSED  → 'معكوسة'
// VOID      → 'لاغية'
// unknown   → raw string (fallback)

translatePaymentMethod(method: string): string
// CASH     → 'نقداً'
// BANK     → 'بنك'
// CHEQUE   → 'شيك'
// TRANSFER → 'تحويل'

translateInvoiceDirection(direction: string): string
// SALES    → 'نقليات عميل'
// PURCHASE → 'مشتريات مورّد'

translateRefType(type: string): string
// INVOICE       → 'فاتورة'
// PAYMENT       → 'دفعة'
// EXPENSE       → 'مصروف'
// JOURNAL_ENTRY → 'قيد'
// MANUAL        → 'يدوي'
// CONTRACT      → 'عقد'

translateDocumentState(state: string): string
// APPROVED  → 'معتمد'
// REJECTED  → 'مرفوض'
// DRAFT     → 'مسودة'
// CANCELLED → 'ملغي'
// PENDING   → 'قيد الانتظار'

formatArabicDate(date: string | Date): string
// toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' })
```

### Tests

12 tests in `frontend/src/__tests__/printTemplates/printI18n.test.ts`:
- Each translation function: known values + unknown fallback
- `formatArabicDate`: string input, Date input, invalid input (fallback graceful)

---

## Part 2 — Advanced Print Profiles (Backend Report Engine)

### Goal

Extend `ProfileConfig` in the backend Report Engine with 5 new optional properties that control header height, footer height, logo rendering, and table density. Backward compatible: existing callers see identical output.

### Scope

Strictly limited to:
- `backend/src/shared/services/reportEngine/printProfiles.ts`
- `backend/src/shared/services/reportEngine/styles.template.ts`
- `backend/src/shared/services/reportEngine/branding.template.ts`
- `backend/src/shared/services/reportEngine/html.service.ts`

### New Properties (`ProfileConfig`)

```typescript
interface ProfileConfig {
  // Existing — unchanged
  pageSize:      string;
  orientation:   'portrait' | 'landscape';
  margin:        string;
  fontSize:      string;
  tableFontSize: string;

  // New — all optional, all have explicit defaults in helper functions
  headerHeight?:  string;                              // CSS min-height for branding block
  footerHeight?:  string;                              // CSS min-height for footer block
  logoSize?:      'small' | 'medium' | 'large';        // default: 'small'
  logoAlignment?: 'start' | 'center' | 'end';          // default: 'start'
  tableDensity?:  'compact' | 'normal' | 'comfortable'; // default: 'normal'
}
```

### Helper Function Defaults

All helpers are named exports (for direct testability):

```typescript
export function resolveTablePadding(density?: 'compact' | 'normal' | 'comfortable'): string
// compact      → '3px 6px'
// normal       → '6px 10px'   ← default
// comfortable  → '8px 14px'

export function resolveLogoWidth(size?: 'small' | 'medium' | 'large'): string
// small   → '60px'   ← default
// medium  → '90px'
// large   → '120px'

export function resolveLogoJustify(align?: 'start' | 'center' | 'end'): string
// start   → 'flex-start'   ← default
// center  → 'center'
// end     → 'flex-end'
```

`headerHeight` and `footerHeight`: if undefined, no `min-height` CSS is applied (no change to layout).

### Updated Profile Definitions

| Profile | headerHeight | footerHeight | logoSize | logoAlignment | tableDensity |
|---------|-------------|-------------|---------|--------------|-------------|
| `a4-landscape` | — | — | `small` | `start` | `compact` |
| `a4-portrait` | — | — | `small` | `start` | `normal` |
| `statement` | `70px` | `30px` | `medium` | `start` | `comfortable` |
| `journal` | — | — | `small` | `start` | `compact` |
| `receipt` | — | — | `small` | `center` | `compact` |
| `letter` | `80px` | `40px` | `medium` | `center` | `comfortable` |

### CSS Changes in `styles.template.ts`

`buildStyles(profile, branding)` already receives the profile name → looks up `PRINT_PROFILES[profile ?? 'a4-landscape']` → passes config to helpers:

```css
/* Added to generated CSS */
table td, table th { padding: <resolveTablePadding(config.tableDensity)>; }
.branding-logo-wrap { justify-content: <resolveLogoJustify(config.logoAlignment)>; }
.branding-logo      { width: <resolveLogoWidth(config.logoSize)>; height: auto; }
```

### `branding.template.ts` Change

```typescript
// Signature change (backward compatible — second param optional)
export function buildBrandingHeader(
  branding: ReportBranding,
  config?: Pick<ProfileConfig, 'headerHeight' | 'logoSize' | 'logoAlignment'>
): string
```

If `config.headerHeight` present → adds `min-height: ${config.headerHeight}` to wrapper div.
Logo wrapper uses `resolveLogoJustify(config.logoAlignment)` and `resolveLogoWidth(config.logoSize)`.

### `html.service.ts` Change (Single Line)

```typescript
const profileConfig = PRINT_PROFILES[options?.profile ?? 'a4-landscape'];
const brandingHtml = branding ? buildBrandingHeader(branding, profileConfig) : '';
```

### Notes on Existing `ReportOptions`

`showPageNumbers`, `watermark`, `showSignatureArea` are already in `ReportOptions` (caller-level). They remain there — not moved to `ProfileConfig`. Profile = document shape defaults. Options = per-render overrides.

### Tests

10 new tests added to `reportEngine.test.ts` (existing file):
- `resolveTablePadding`: compact, normal, comfortable, undefined (→ normal default)
- `resolveLogoWidth`: small, medium, large, undefined (→ small default)
- `resolveLogoJustify`: start, center, end, undefined (→ flex-start default)
- `buildBrandingHeader` with config: verifies `min-height` present when `headerHeight` set
- `buildBrandingHeader` without config: verifies `min-height` absent (backward compat)
- `buildStyles` with `statement` profile: verifies `comfortable` padding in output
- Backward compat: `buildReportHtml` with no options still generates valid HTML

---

## Part 3 — QR Verification Foundation

### Goal

Add a stable, unique `verificationUuid` to Invoice and Quotation models. Build a local (offline-first) verification endpoint that returns document status without exposing financial data. Add a QR component that prints the UUID for future lookup.

### Schema Changes

```prisma
model Invoice {
  // ... existing fields ...
  verificationUuid  String?  @unique   // nullable — generated in service layer for new records
}

model Quotation {
  // ... existing fields ...
  verificationUuid  String?  @unique
}
```

Nullable to safely handle existing records during migration. New records always receive a UUID via service layer (enforced by tests).

### Migration SQL (Custom — Must Be Reviewed Before Apply)

```sql
-- Step 1: Add columns as nullable
ALTER TABLE "Invoice"   ADD COLUMN "verificationUuid" TEXT;
ALTER TABLE "Quotation" ADD COLUMN "verificationUuid" TEXT;

-- Step 2: Backfill existing rows (one-time, safe to re-run — UPDATE WHERE NULL)
-- lower(hex(randomblob(16))) generates 32 hex chars — unique enough for backfill
UPDATE "Invoice"   SET "verificationUuid" = lower(hex(randomblob(16))) WHERE "verificationUuid" IS NULL;
UPDATE "Quotation" SET "verificationUuid" = lower(hex(randomblob(16))) WHERE "verificationUuid" IS NULL;

-- Step 3: Create unique indexes (after backfill — prevents duplicates first)
CREATE UNIQUE INDEX "Invoice_verificationUuid_key"   ON "Invoice"("verificationUuid");
CREATE UNIQUE INDEX "Quotation_verificationUuid_key" ON "Quotation"("verificationUuid");
```

**Note:** In the extremely rare case of a randomblob collision, the `UPDATE WHERE NULL` approach means only un-backfilled rows are retried. The unique index creation (Step 3) will fail cleanly if any collision exists — re-running the UPDATE fills remaining NULLs with new values.

Future consideration: after all production data has been backfilled and verified, `verificationUuid` can be made non-nullable in a follow-up migration if desired.

### Service Layer — UUID Generation

In `invoices.service.ts` and `quotations.service.ts`, `create()` methods:

```typescript
import { randomUUID } from 'crypto'; // Node.js built-in — no new package

// Inside prisma.invoice.create({ data: { ...rest, verificationUuid: randomUUID() } })
```

No changes to routes, controllers, Zod schemas, or API response shapes.

### Backend Translation Utility (No Frontend Dependency)

New file: `backend/src/shared/utils/arabicLabels.ts`

```typescript
// Small, standalone — no imports from frontend or printI18n
export function translateStatusAr(status: string): string {
  // UNPAID / PARTIAL / PAID / OVERDUE / CANCELLED / DRAFT / APPROVED / REJECTED / PENDING
}
```

Used only by `verification.service.ts`. This is separate from the frontend `printI18n.ts` — no cross-layer dependency.

### New Backend Module: `backend/src/modules/verification/`

```
verification.routes.ts      — GET /api/verify/:uuid (authenticate only)
verification.controller.ts  — calls service, returns 200 or 404
verification.service.ts     — searches Invoice then Quotation by verificationUuid
verification.schema.ts      — Zod: uuid param must be non-empty string
```

**Response Shape:**

```typescript
// Found:
{
  found: true,
  documentType: 'invoice' | 'quotation',
  documentNumber: string,      // e.g. 'INV-2024-001'
  status: string,              // raw enum
  statusAr: string,            // Arabic translation via arabicLabels.ts
  issueDate: string,           // YYYY-MM-DD
  updatedAt: string,           // YYYY-MM-DD
  isCancelled: boolean,
  isApproved: boolean          // invoice: PAID | quotation: APPROVED
}

// Not Found:
{ found: false }               // HTTP 404
```

**What is NEVER in the response:**
- `amount` / `total` / `paidAmount`
- `customerName` / `supplierName`
- `customerId` / `supplierId`
- Any line items or financial fields

**Auth:** `authenticate` middleware only. No `requirePermission`. Endpoint is local/offline — read-only, single record, non-sensitive metadata only.

**Registered in `app.ts`:**
```typescript
import verificationRouter from '@modules/verification/verification.routes';
app.use('/api/verify', verificationRouter);
```

**`constants.ts`:** Add `'verification'` to MODULES array (documentation only — no permission keys yet).

### New Frontend Component: `frontend/src/print-templates/components/DocumentVerificationQR.tsx`

```typescript
interface DocumentVerificationQRProps {
  uuid: string | null | undefined;
  size?: number;         // default: 72
  showLabel?: boolean;   // default: true — renders 'رمز التحقق' below QR
}
```

- Uses existing `qrcode` package (already in package.json — no new dependency)
- QR content: the UUID string only — no URL, no financial data
- Brand color: `#1d4e6f` (dark), white background
- Returns `null` silently when `uuid` is falsy — no error, no placeholder
- Print-safe: uses `useEffect` + `useState` (same pattern as `FormQRCode.tsx`)

### Integration in Print Pages

**`InvoicePreview.tsx` and `Quotation.tsx`** — engine mode only, behind `showVerificationQr` prop/flag:

```tsx
// Controlled by prop (default: false — opt-in, not forced)
{showVerificationQr && data?.verificationUuid && (
  <div style={{ position: 'absolute', bottom: 8, left: 8, printColorAdjust: 'exact' }}>
    <DocumentVerificationQR uuid={data.verificationUuid} size={64} />
  </div>
)}
```

- Hidden by default (`showVerificationQr = false`)
- Only shown in engine mode (not legacy, not Template Studio)
- Does not affect any saved/persisted template layout
- Disappears automatically if `verificationUuid` is null

### Tests

**Backend — `verification.service.test.ts` (9 tests):**
1. UUID found in Invoice → returns `found: true` + correct documentType
2. UUID found in Quotation → returns `found: true` + correct documentType
3. UUID not found → returns `{ found: false }`
4. `isCancelled: true` when Invoice status = CANCELLED
5. `isApproved: true` when Invoice status = PAID
6. `isApproved: true` when Quotation status = APPROVED
7. `statusAr` is translated (non-empty Arabic string)
8. Response does NOT contain `amount`, `total`, `paidAmount` (field absence check)
9. Response does NOT contain `customerName`, `supplierName`, `customerId`, `supplierId`

**Frontend — `documentVerificationQR.test.ts` (3 tests):**
1. Renders QR img when valid UUID provided
2. Returns null when uuid is null/undefined/empty
3. `size` prop is applied to the rendered img dimensions

---

## Architecture Compliance

| Rule | Compliance |
|------|-----------|
| No rewrite | ✅ All changes additive |
| No breaking changes | ✅ All new fields optional; API shapes unchanged |
| Reuse existing packages | ✅ `qrcode`, `crypto` (built-in), existing Report Engine |
| Module pattern (routes/controller/service/schema) | ✅ `verification/` follows exact pattern |
| No cross-layer dependency | ✅ `arabicLabels.ts` is backend-only; `printI18n.ts` is frontend-only |
| No schema change without migration review | ✅ Migration SQL is written explicitly, reviewed before apply |
| Feature branch | ✅ `feature/print-polish-batch1` |
| Validate before declaring done | ✅ tsc + tests + build per Part |

## Validation Checklist (Per Part)

```
Part 1:
[ ] cd frontend && npx tsc --noEmit  → 0 errors
[ ] cd frontend && npm test -- --run  → all passing (including 12 new printI18n tests)

Part 2:
[ ] cd backend && npx tsc --noEmit   → 0 errors
[ ] cd backend && npm test           → all passing (including 10 new profile tests)
[ ] npm run build:back               → clean compile

Part 3:
[ ] cd backend && npx prisma validate          → schema valid
[ ] Review migration SQL before prisma migrate
[ ] cd backend && npm run db:migrate
[ ] cd backend && npm run db:generate
[ ] cd backend && npx tsc --noEmit             → 0 errors
[ ] cd backend && npm test                     → all passing (including 9 new verification tests)
[ ] cd frontend && npx tsc --noEmit            → 0 errors
[ ] cd frontend && npm test -- --run           → all passing (including 3 new QR tests)
[ ] npm run build:back                         → clean compile
[ ] npm run build:front                        → clean build

Final:
[ ] tsc -p electron/tsconfig.json --noEmit     → 0 errors
```

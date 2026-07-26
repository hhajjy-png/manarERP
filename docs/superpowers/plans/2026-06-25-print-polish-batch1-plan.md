# Print Polish Batch 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three targeted print-infrastructure improvements: centralized Arabic translation utility (Part 1), advanced print profile configuration for the backend Report Engine (Part 2), and QR-based document verification foundation for Invoices (Part 3).

**Architecture:**
- Part 1: Frontend-only — pure-function utility in `print-templates/utils/printI18n.ts` plus two one-line text fixes in InvoiceDesign1 components.
- Part 2: Backend-only — additive changes to 4 files in `backend/src/shared/services/reportEngine/`. All backward compatible — existing callers see identical output.
- Part 3: Full-stack — Prisma schema change adding `verificationUuid` to Invoice model, a new `verification` backend module, and a reusable frontend QR component wired into InvoicePreview. **No Quotation DB model exists in this codebase** — `Quotation.tsx` is a purely frontend form. Quotation QR integration is explicitly deferred.

**Tech Stack:** React 18 + TypeScript + Vite (frontend), Express + Prisma + SQLite (backend), `qrcode` package (already installed in frontend), Node.js built-in `crypto.randomUUID()` (no new package), `@testing-library/react` + `jsdom` (added in Task 7).

## Global Constraints

- No breaking changes: all new fields/params are optional; all new helpers are additive
- Arabic labels without shadda: `مسددة` (PAID), `مسددة جزئياً` (PARTIAL), `غير مسددة` (UNPAID)
- `printI18n.ts` is **frontend-only** — no import from backend utils
- `arabicLabels.ts` is **backend-only** — no import from frontend utils
- `verifyDocument` response must **never** include: `amount`, `total`, `paidAmount`, `customerName`, `supplierName`, `customerId`, `supplierId`, or any line item / financial fields
- `DocumentVerificationQR` returns `null` silently when `uuid` is falsy — no errors, no placeholder
- Feature branch: `feature/print-polish-batch1` (create before starting)
- Run `tsc --noEmit` in the relevant layer after each Part before declaring done

---

## File Map

### Part 1 — Print Localization
| Action | File |
|--------|------|
| Create | `frontend/src/print-templates/utils/printI18n.ts` |
| Create | `frontend/src/__tests__/printTemplates/printI18n.test.ts` |
| Modify | `frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx` (line 109) |
| Modify | `frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx` (line 109) |

### Part 2 — Advanced Print Profiles
| Action | File |
|--------|------|
| Modify | `backend/src/shared/services/reportEngine/printProfiles.ts` |
| Modify | `backend/src/shared/services/reportEngine/styles.template.ts` |
| Modify | `backend/src/shared/services/reportEngine/branding.template.ts` |
| Modify | `backend/src/shared/services/reportEngine/html.service.ts` |
| Modify | `backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts` |

### Part 3 — QR Verification Foundation
| Action | File |
|--------|------|
| Modify | `backend/prisma/schema.prisma` (add `verificationUuid` to Invoice) |
| Create | `backend/prisma/migrations/<timestamp>_add_verification_uuid/migration.sql` |
| Create | `backend/src/shared/utils/arabicLabels.ts` |
| Create | `backend/src/modules/verification/verification.routes.ts` |
| Create | `backend/src/modules/verification/verification.controller.ts` |
| Create | `backend/src/modules/verification/verification.service.ts` |
| Create | `backend/src/modules/verification/verification.schema.ts` |
| Create | `backend/src/modules/verification/__tests__/verification.service.test.ts` |
| Modify | `backend/src/modules/invoices/invoices.service.ts` (add `verificationUuid` on create) |
| Modify | `backend/src/config/constants.ts` (add `'verification'` to MODULES) |
| Modify | `backend/src/app.ts` (register router) |
| Create | `frontend/src/print-templates/components/DocumentVerificationQR.tsx` |
| Create | `frontend/src/__tests__/printTemplates/documentVerificationQR.test.tsx` |
| Modify | `frontend/src/pages/InvoicePreview.tsx` (add QR in engine mode) |

---

## Task 1: Create printI18n.ts Translation Utility

**Files:**
- Create: `frontend/src/print-templates/utils/printI18n.ts`
- Create: `frontend/src/__tests__/printTemplates/printI18n.test.ts`

**Interfaces:**
- Produces: `translateInvoiceStatus`, `translatePaymentMethod`, `translateInvoiceDirection`, `translateRefType`, `translateDocumentState`, `formatArabicDate` — all exported pure functions, consumed by Task 2 (none at this stage, but available for all print templates going forward)

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/__tests__/printTemplates/printI18n.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  translateInvoiceStatus,
  translatePaymentMethod,
  translateInvoiceDirection,
  translateRefType,
  translateDocumentState,
  formatArabicDate,
} from '../../print-templates/utils/printI18n';

describe('translateInvoiceStatus', () => {
  it('translates UNPAID', () => expect(translateInvoiceStatus('UNPAID')).toBe('غير مسددة'));
  it('translates PARTIAL', () => expect(translateInvoiceStatus('PARTIAL')).toBe('مسددة جزئياً'));
  it('translates PAID', () => expect(translateInvoiceStatus('PAID')).toBe('مسددة'));
  it('translates OVERDUE', () => expect(translateInvoiceStatus('OVERDUE')).toBe('متأخرة'));
  it('translates CANCELLED', () => expect(translateInvoiceStatus('CANCELLED')).toBe('ملغاة'));
  it('translates DRAFT', () => expect(translateInvoiceStatus('DRAFT')).toBe('مسودة'));
  it('translates APPROVED', () => expect(translateInvoiceStatus('APPROVED')).toBe('معتمد'));
  it('translates REJECTED', () => expect(translateInvoiceStatus('REJECTED')).toBe('مرفوض'));
  it('translates PENDING', () => expect(translateInvoiceStatus('PENDING')).toBe('قيد الانتظار'));
  it('translates PRINTED', () => expect(translateInvoiceStatus('PRINTED')).toBe('مطبوعة'));
  it('translates REVERSED', () => expect(translateInvoiceStatus('REVERSED')).toBe('معكوسة'));
  it('translates VOID', () => expect(translateInvoiceStatus('VOID')).toBe('لاغية'));
  it('returns raw string for unknown status', () =>
    expect(translateInvoiceStatus('UNKNOWN_XYZ')).toBe('UNKNOWN_XYZ'));
});

describe('translatePaymentMethod', () => {
  it('translates CASH', () => expect(translatePaymentMethod('CASH')).toBe('نقداً'));
  it('translates BANK', () => expect(translatePaymentMethod('BANK')).toBe('بنك'));
  it('translates CHEQUE', () => expect(translatePaymentMethod('CHEQUE')).toBe('شيك'));
  it('translates TRANSFER', () => expect(translatePaymentMethod('TRANSFER')).toBe('تحويل'));
  it('returns raw for unknown', () => expect(translatePaymentMethod('WIRE')).toBe('WIRE'));
});

describe('translateInvoiceDirection', () => {
  it('translates SALES', () => expect(translateInvoiceDirection('SALES')).toBe('نقليات عميل'));
  it('translates PURCHASE', () => expect(translateInvoiceDirection('PURCHASE')).toBe('مشتريات مورّد'));
  it('returns raw for unknown', () => expect(translateInvoiceDirection('INTERNAL')).toBe('INTERNAL'));
});

describe('translateRefType', () => {
  it('translates INVOICE', () => expect(translateRefType('INVOICE')).toBe('فاتورة'));
  it('translates PAYMENT', () => expect(translateRefType('PAYMENT')).toBe('دفعة'));
  it('translates EXPENSE', () => expect(translateRefType('EXPENSE')).toBe('مصروف'));
  it('translates JOURNAL_ENTRY', () => expect(translateRefType('JOURNAL_ENTRY')).toBe('قيد'));
  it('translates MANUAL', () => expect(translateRefType('MANUAL')).toBe('يدوي'));
  it('translates CONTRACT', () => expect(translateRefType('CONTRACT')).toBe('عقد'));
  it('returns raw for unknown', () => expect(translateRefType('UNKNOWN')).toBe('UNKNOWN'));
});

describe('translateDocumentState', () => {
  it('translates APPROVED', () => expect(translateDocumentState('APPROVED')).toBe('معتمد'));
  it('translates REJECTED', () => expect(translateDocumentState('REJECTED')).toBe('مرفوض'));
  it('translates DRAFT', () => expect(translateDocumentState('DRAFT')).toBe('مسودة'));
  it('translates CANCELLED', () => expect(translateDocumentState('CANCELLED')).toBe('ملغي'));
  it('translates PENDING', () => expect(translateDocumentState('PENDING')).toBe('قيد الانتظار'));
  it('returns raw for unknown', () => expect(translateDocumentState('UNKNOWN')).toBe('UNKNOWN'));
});

describe('formatArabicDate', () => {
  it('formats a Date object to a non-empty Arabic string', () => {
    const result = formatArabicDate(new Date('2026-01-15'));
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
  it('formats a string date to a non-empty string', () => {
    const result = formatArabicDate('2026-06-25');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
  it('returns a string without throwing on invalid date', () => {
    const result = formatArabicDate('not-a-valid-date');
    expect(typeof result).toBe('string');
  });
});
```

- [ ] **Step 2: Run tests — expect ALL to fail (module not found)**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: errors about missing module `../../print-templates/utils/printI18n`

- [ ] **Step 3: Implement printI18n.ts**

Create `frontend/src/print-templates/utils/printI18n.ts`:

```typescript
const INVOICE_STATUS_MAP: Record<string, string> = {
  UNPAID:    'غير مسددة',
  PARTIAL:   'مسددة جزئياً',
  PAID:      'مسددة',
  OVERDUE:   'متأخرة',
  CANCELLED: 'ملغاة',
  DRAFT:     'مسودة',
  APPROVED:  'معتمد',
  REJECTED:  'مرفوض',
  PENDING:   'قيد الانتظار',
  PRINTED:   'مطبوعة',
  REVERSED:  'معكوسة',
  VOID:      'لاغية',
};

const PAYMENT_METHOD_MAP: Record<string, string> = {
  CASH:     'نقداً',
  BANK:     'بنك',
  CHEQUE:   'شيك',
  TRANSFER: 'تحويل',
};

const INVOICE_DIRECTION_MAP: Record<string, string> = {
  SALES:    'نقليات عميل',
  PURCHASE: 'مشتريات مورّد',
};

const REF_TYPE_MAP: Record<string, string> = {
  INVOICE:       'فاتورة',
  PAYMENT:       'دفعة',
  EXPENSE:       'مصروف',
  JOURNAL_ENTRY: 'قيد',
  MANUAL:        'يدوي',
  CONTRACT:      'عقد',
};

const DOCUMENT_STATE_MAP: Record<string, string> = {
  APPROVED:  'معتمد',
  REJECTED:  'مرفوض',
  DRAFT:     'مسودة',
  CANCELLED: 'ملغي',
  PENDING:   'قيد الانتظار',
};

export function translateInvoiceStatus(status: string): string {
  return INVOICE_STATUS_MAP[status] ?? status;
}

export function translatePaymentMethod(method: string): string {
  return PAYMENT_METHOD_MAP[method] ?? method;
}

export function translateInvoiceDirection(direction: string): string {
  return INVOICE_DIRECTION_MAP[direction] ?? direction;
}

export function translateRefType(type: string): string {
  return REF_TYPE_MAP[type] ?? type;
}

export function translateDocumentState(state: string): string {
  return DOCUMENT_STATE_MAP[state] ?? state;
}

export function formatArabicDate(date: string | Date): string {
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('ar-KW', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return String(date);
  }
}
```

- [ ] **Step 4: Run tests — expect ALL to pass**

```bash
cd frontend && npm test -- --reporter=verbose 2>&1 | grep -E "(PASS|FAIL|✓|✗)"
```

Expected: all `printI18n.test.ts` tests pass

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/print-templates/utils/printI18n.ts frontend/src/__tests__/printTemplates/printI18n.test.ts
git commit -m "feat(print): add printI18n.ts centralized Arabic translation utility"
```

---

## Task 2: Fix 'Total :' English Placeholder Text

**Files:**
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx` (line 109)
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx` (line 109)

**Note:** These files show `'Total :'` as the placeholder text when `data` is null (preview/blank state). The fix replaces it with the correct Arabic label.

- [ ] **Step 1: Fix InvoiceDesign1.tsx**

In `frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx`, line 109, change:

Old:
```tsx
            : 'Total :'}
```

New:
```tsx
            : 'الإجمالي:'}
```

- [ ] **Step 2: Fix InvoiceDesign1Blank.tsx**

In `frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx`, line 109, change:

Old:
```tsx
            : 'Total :'}
```

New:
```tsx
            : 'الإجمالي:'}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx
git commit -m "fix(print): replace 'Total :' placeholder with Arabic الإجمالي in InvoiceDesign1"
```

**Part 1 validation checkpoint:**
```bash
cd frontend && npm test -- --run
```
Expected: all tests pass (printI18n suite + all existing suites)

---

## Task 3: Extend ProfileConfig and Add Helper Functions

**Files:**
- Modify: `backend/src/shared/services/reportEngine/printProfiles.ts`
- Modify: `backend/src/shared/services/reportEngine/styles.template.ts`
- Modify: `backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts`

**Interfaces:**
- Produces (from `printProfiles.ts`): exported `ProfileConfig` interface with 5 new optional fields
- Produces (from `styles.template.ts`): exported named functions `resolveTablePadding`, `resolveLogoWidth`, `resolveLogoJustify` — consumed by Task 4

- [ ] **Step 1: Write failing tests for helper functions and buildStyles density**

Add this block at the END of `backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts` (before the final closing line):

```typescript
// ─── Profile Helper Functions ─────────────────────────────────────────────────
import { resolveTablePadding, resolveLogoWidth, resolveLogoJustify } from '../styles.template';

describe('resolveTablePadding', () => {
  it('returns compact padding for compact density', () =>
    expect(resolveTablePadding('compact')).toBe('3px 6px'));
  it('returns normal padding for normal density', () =>
    expect(resolveTablePadding('normal')).toBe('6px 10px'));
  it('returns comfortable padding for comfortable density', () =>
    expect(resolveTablePadding('comfortable')).toBe('8px 14px'));
  it('returns normal padding when undefined (default)', () =>
    expect(resolveTablePadding(undefined)).toBe('6px 10px'));
});

describe('resolveLogoWidth', () => {
  it('returns 60px for small size', () => expect(resolveLogoWidth('small')).toBe('60px'));
  it('returns 90px for medium size', () => expect(resolveLogoWidth('medium')).toBe('90px'));
  it('returns 120px for large size', () => expect(resolveLogoWidth('large')).toBe('120px'));
  it('returns 60px when undefined (default)', () => expect(resolveLogoWidth(undefined)).toBe('60px'));
});

describe('resolveLogoJustify', () => {
  it('returns flex-start for start alignment', () =>
    expect(resolveLogoJustify('start')).toBe('flex-start'));
  it('returns center for center alignment', () =>
    expect(resolveLogoJustify('center')).toBe('center'));
  it('returns flex-end for end alignment', () =>
    expect(resolveLogoJustify('end')).toBe('flex-end'));
  it('returns flex-start when undefined (default)', () =>
    expect(resolveLogoJustify(undefined)).toBe('flex-start'));
});

describe('buildStyles — profile density CSS', () => {
  it('statement profile generates comfortable table padding in CSS', () => {
    const css = buildStyles('statement');
    expect(css).toContain('8px 14px');
  });
  it('a4-landscape profile generates compact table padding in CSS', () => {
    const css = buildStyles('a4-landscape');
    expect(css).toContain('3px 6px');
  });
  it('a4-portrait profile generates normal table padding in CSS', () => {
    const css = buildStyles('a4-portrait');
    expect(css).toContain('6px 10px');
  });
});
```

- [ ] **Step 2: Run tests — expect new tests to fail (functions not exported yet)**

```bash
cd backend && npm test 2>&1 | grep -E "(PASS|FAIL|resolveTable|resolveLog|buildStyles)"
```

Expected: TypeScript import errors / test failures for missing exports

- [ ] **Step 3: Extend ProfileConfig and update profiles in printProfiles.ts**

Replace the entire content of `backend/src/shared/services/reportEngine/printProfiles.ts`:

```typescript
import type { PrintProfile } from './reportTypes';

export interface ProfileConfig {
  pageSize:      string;
  orientation:   'portrait' | 'landscape';
  margin:        string;
  fontSize:      string;
  tableFontSize: string;
  headerHeight?:  string;
  footerHeight?:  string;
  logoSize?:      'small' | 'medium' | 'large';
  logoAlignment?: 'start' | 'center' | 'end';
  tableDensity?:  'compact' | 'normal' | 'comfortable';
}

export const PRINT_PROFILES: Record<PrintProfile, ProfileConfig> = {
  'a4-landscape': {
    pageSize:      'A4',
    orientation:   'landscape',
    margin:        '10mm',
    fontSize:      '11px',
    tableFontSize: '10px',
    logoSize:      'small',
    logoAlignment: 'start',
    tableDensity:  'compact',
  },
  'a4-portrait': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '12mm',
    fontSize:      '11px',
    tableFontSize: '10px',
    logoSize:      'small',
    logoAlignment: 'start',
    tableDensity:  'normal',
  },
  'statement': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '14mm',
    fontSize:      '11px',
    tableFontSize: '10px',
    headerHeight:  '70px',
    footerHeight:  '30px',
    logoSize:      'medium',
    logoAlignment: 'start',
    tableDensity:  'comfortable',
  },
  'journal': {
    pageSize:      'A4',
    orientation:   'landscape',
    margin:        '10mm',
    fontSize:      '10px',
    tableFontSize: '9.5px',
    logoSize:      'small',
    logoAlignment: 'start',
    tableDensity:  'compact',
  },
  'receipt': {
    pageSize:      'A5',
    orientation:   'portrait',
    margin:        '8mm',
    fontSize:      '10px',
    tableFontSize: '9px',
    logoSize:      'small',
    logoAlignment: 'center',
    tableDensity:  'compact',
  },
  'letter': {
    pageSize:      'A4',
    orientation:   'portrait',
    margin:        '20mm',
    fontSize:      '12px',
    tableFontSize: '11px',
    headerHeight:  '80px',
    footerHeight:  '40px',
    logoSize:      'medium',
    logoAlignment: 'center',
    tableDensity:  'comfortable',
  },
};
```

- [ ] **Step 4: Add helper functions and CSS rules to styles.template.ts**

Add the three helper functions as named exports BEFORE the `buildStyles` function in `backend/src/shared/services/reportEngine/styles.template.ts`. Add them right after the imports:

```typescript
export function resolveTablePadding(density?: 'compact' | 'normal' | 'comfortable'): string {
  if (density === 'compact')     return '3px 6px';
  if (density === 'comfortable') return '8px 14px';
  return '6px 10px';
}

export function resolveLogoWidth(size?: 'small' | 'medium' | 'large'): string {
  if (size === 'medium') return '90px';
  if (size === 'large')  return '120px';
  return '60px';
}

export function resolveLogoJustify(align?: 'start' | 'center' | 'end'): string {
  if (align === 'center') return 'center';
  if (align === 'end')    return 'flex-end';
  return 'flex-start';
}
```

Then, at the very end of the CSS template string inside `buildStyles` (just before the closing backtick of the `return` template literal), append:

```css
    /* ── Profile density + logo sizing ── */
    table td, table th { padding: ${resolveTablePadding(p.tableDensity)}; }
    .branding-logo-wrap { display: flex; justify-content: ${resolveLogoJustify(p.logoAlignment)}; }
    .branding-logo { width: ${resolveLogoWidth(p.logoSize)}; height: auto; }
```

The `table td, table th` rule intentionally overrides the earlier more-specific `thead th { padding: 7px 8px }` and `tbody td { padding: 6px 8px }` rules via CSS cascade order (placed after them). The `tfoot tr.totals td` rule has a class selector (higher specificity) and is NOT overridden.

- [ ] **Step 5: Run tests — expect all (including new helpers) to pass**

```bash
cd backend && npm test 2>&1 | grep -E "(PASS|FAIL|✓|✗|resolveTable|resolveLog)"
```

Expected: all tests pass

- [ ] **Step 6: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/services/reportEngine/printProfiles.ts backend/src/shared/services/reportEngine/styles.template.ts backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts
git commit -m "feat(reportEngine): extend ProfileConfig with 5 optional properties and add resolveTable/Logo helpers"
```

---

## Task 4: Update branding.template.ts and html.service.ts

**Files:**
- Modify: `backend/src/shared/services/reportEngine/branding.template.ts`
- Modify: `backend/src/shared/services/reportEngine/html.service.ts`
- Modify: `backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts`

**Interfaces:**
- Consumes: `ProfileConfig` from `./printProfiles` (Task 3), `resolveLogoWidth`, `resolveLogoJustify` from `./styles.template` (Task 3)
- Produces: `buildBrandingHeader(branding, config?)` with optional config param — backward compatible

- [ ] **Step 1: Write failing tests for branding header with config**

Add to the `describe('buildBrandingHeader', ...)` block in `reportEngine.test.ts` (append inside the existing describe block, after the last `it` call):

```typescript
  it('applies min-height inline style when headerHeight config is provided', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة' }, { headerHeight: '70px' });
    expect(html).toContain('min-height');
    expect(html).toContain('70px');
  });

  it('does NOT apply min-height when no config provided (backward compat)', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة' });
    expect(html).not.toContain('min-height');
  });

  it('includes branding-logo-wrap wrapper always', () => {
    const html = buildBrandingHeader({ companyNameAr: 'شركة' });
    expect(html).toContain('branding-logo-wrap');
  });
```

- [ ] **Step 2: Run tests — expect new tests to fail**

```bash
cd backend && npm test 2>&1 | grep -E "(min-height|branding-logo-wrap|FAIL)"
```

Expected: failures on the 3 new branding tests

- [ ] **Step 3: Update branding.template.ts**

Replace the entire content of `backend/src/shared/services/reportEngine/branding.template.ts`:

```typescript
import type { ReportBranding } from './reportTypes';
import type { ProfileConfig } from './printProfiles';
import { resolveLogoWidth, resolveLogoJustify } from './styles.template';
import { esc } from './htmlUtils';

export function buildBrandingHeader(
  branding: ReportBranding,
  config?: Pick<ProfileConfig, 'headerHeight' | 'logoSize' | 'logoAlignment'>
): string {
  const headerStyle = config?.headerHeight
    ? ` style="min-height: ${config.headerHeight}"`
    : '';
  const logoWrapStyle = `display:flex;justify-content:${resolveLogoJustify(config?.logoAlignment)}`;
  const logoWidthStyle = `width:${resolveLogoWidth(config?.logoSize)};height:auto`;

  const logoHtml = branding.logoBase64
    ? `<img src="data:image/png;base64,${branding.logoBase64}" alt="شعار الشركة" class="company-logo branding-logo" style="${logoWidthStyle}">`
    : `<div class="company-logo-placeholder branding-logo" style="${logoWidthStyle}">م</div>`;

  const contactParts: string[] = [];
  if (branding.phone)         contactParts.push(esc(branding.phone));
  if (branding.address)       contactParts.push(esc(branding.address));
  if (branding.commercialReg) contactParts.push(`س.ت: ${esc(branding.commercialReg)}`);
  if (branding.email)         contactParts.push(esc(branding.email));
  const contactLine = contactParts.join('  ·  ');

  return `
    <div class="company-header"${headerStyle}>
      <div class="branding-logo-wrap" style="${logoWrapStyle}">${logoHtml}</div>
      <div class="company-info">
        <div class="company-name-ar">${esc(branding.companyNameAr)}</div>
        ${branding.companyNameEn ? `<div class="company-name-en">${esc(branding.companyNameEn)}</div>` : ''}
        ${contactLine ? `<div class="company-contact">${contactLine}</div>` : ''}
      </div>
    </div>
    <hr class="company-divider">
  `;
}
```

- [ ] **Step 4: Update html.service.ts — wire profileConfig to buildBrandingHeader**

In `backend/src/shared/services/reportEngine/html.service.ts`, add the import at the top:

```typescript
import { PRINT_PROFILES } from './printProfiles';
```

Then find these two lines (around line 49–52):

```typescript
  const profile  = options?.profile   ?? 'a4-landscape';
  const styles   = buildStyles(profile, options?.branding, fontFace);
  const watermark    = buildWatermark(options?.watermark);
  const brandingHdr  = options?.branding ? buildBrandingHeader(options.branding) : '';
```

Replace them with:

```typescript
  const profile       = options?.profile ?? 'a4-landscape';
  const profileConfig = PRINT_PROFILES[profile];
  const styles        = buildStyles(profile, options?.branding, fontFace);
  const watermark     = buildWatermark(options?.watermark);
  const brandingHdr   = options?.branding ? buildBrandingHeader(options.branding, profileConfig) : '';
```

- [ ] **Step 5: Run all backend tests — expect all to pass**

```bash
cd backend && npm test
```

Expected: ALL tests pass (including the 3 new branding tests and all existing tests)

- [ ] **Step 6: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Backend build check**

```bash
npm run build:back
```

Expected: clean compile, 0 errors

- [ ] **Step 8: Commit**

```bash
git add backend/src/shared/services/reportEngine/branding.template.ts backend/src/shared/services/reportEngine/html.service.ts backend/src/shared/services/reportEngine/__tests__/reportEngine.test.ts
git commit -m "feat(reportEngine): add optional profile config to buildBrandingHeader; wire profileConfig in html.service"
```

**Part 2 validation checkpoint:**
```bash
cd backend && npm test && npx tsc --noEmit && npm run build:back
```
Expected: all green

---

## Task 5: Prisma Schema Change + Custom Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_add_verification_uuid/migration.sql`

**Context:** Adding a nullable `verificationUuid` field to the `Invoice` model (table: `invoices`). Nullable during migration to handle existing rows safely. New records always get a UUID in the service layer (Task 6). No Quotation model exists — this is Invoice-only.

- [ ] **Step 1: Add verificationUuid to Invoice model in schema.prisma**

In `backend/prisma/schema.prisma`, find the Invoice model (starts at the line with `model Invoice {`). Add `verificationUuid` as a new field BEFORE the relations (i.e., before the `customer Customer?` line):

Add this line after `notes`:

```prisma
  verificationUuid  String?  @unique
```

The Invoice model should now have (among other fields):
```prisma
  notes         String?
  verificationUuid  String?  @unique
  billingMonth  Int?
```

Wait — insert it between `notes` and `billingMonth`. Check the current field order and place it logically. The exact position doesn't matter for SQLite, only for readability. Place it after `notes String?`.

- [ ] **Step 2: Validate schema**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at ... is valid`

- [ ] **Step 3: Create migration (dry-run only — do NOT apply yet)**

```bash
cd backend && npx prisma migrate dev --name add_verification_uuid --create-only
```

Expected: creates a new file at `backend/prisma/migrations/<timestamp>_add_verification_uuid/migration.sql`

- [ ] **Step 4: Review the generated migration SQL**

Open the generated migration file (exact path printed in console output above). It will contain something like:

```sql
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "verificationUuid" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "invoices_verificationUuid_key" ON "invoices"("verificationUuid");
```

- [ ] **Step 5: Edit migration SQL to add backfill step**

The unique index creation will FAIL if any two existing rows get the same random value. The backfill UPDATE must run BEFORE the index is created. Edit the migration file to insert the backfill statement between the ALTER TABLE and CREATE INDEX:

```sql
-- AlterTable
ALTER TABLE "invoices" ADD COLUMN "verificationUuid" TEXT;

-- Backfill existing rows with unique hex identifiers (one-time safe backfill)
-- lower(hex(randomblob(16))) generates 32-character hex strings unique enough for backfill
UPDATE "invoices" SET "verificationUuid" = lower(hex(randomblob(16))) WHERE "verificationUuid" IS NULL;

-- CreateIndex (runs AFTER backfill to prevent duplicate value conflicts)
CREATE UNIQUE INDEX "invoices_verificationUuid_key" ON "invoices"("verificationUuid");
```

Save the file.

- [ ] **Step 6: Apply the migration**

```bash
cd backend && npm run db:migrate
```

Expected: `The following migration(s) have been applied: ...add_verification_uuid`

If you see a unique constraint error during backfill (extremely rare — only if two randomblob(16) values collide), re-run: `npm run db:migrate` — the `WHERE verificationUuid IS NULL` ensures only un-backfilled rows are retried.

- [ ] **Step 7: Regenerate Prisma Client**

```bash
npm run db:generate
```

Expected: `Generated Prisma Client`

- [ ] **Step 8: TypeScript check — verify new field is available**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors. The `Invoice` type now has `verificationUuid: string | null`.

- [ ] **Step 9: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add nullable verificationUuid to Invoice model with backfill migration"
```

---

## Task 6: Backend Verification Module

**Files:**
- Create: `backend/src/shared/utils/arabicLabels.ts`
- Create: `backend/src/modules/verification/verification.schema.ts`
- Create: `backend/src/modules/verification/verification.service.ts`
- Create: `backend/src/modules/verification/verification.controller.ts`
- Create: `backend/src/modules/verification/verification.routes.ts`
- Create: `backend/src/modules/verification/__tests__/verification.service.test.ts`
- Modify: `backend/src/modules/invoices/invoices.service.ts`
- Modify: `backend/src/config/constants.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `prisma.invoice.findUnique` (from Prisma Client, Task 5), `translateStatusAr` from `arabicLabels.ts`
- Produces: `GET /api/verify/:uuid` — returns `{ found, documentType, documentNumber, status, statusAr, issueDate, updatedAt, isCancelled, isApproved }` or `{ found: false }` (HTTP 404)

- [ ] **Step 1: Write failing tests**

Create `backend/src/modules/verification/__tests__/verification.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyDocument } from '../verification.service';

const mockFindUnique = vi.fn();
vi.mock('@config/database', () => ({
  prisma: {
    invoice: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

const SAMPLE_INVOICE = {
  invoiceNumber: 'INV-2026-00001',
  status: 'PAID',
  issueDate: new Date('2026-01-15T00:00:00.000Z'),
  updatedAt: new Date('2026-03-20T00:00:00.000Z'),
};

describe('verifyDocument', () => {
  beforeEach(() => mockFindUnique.mockReset());

  it('returns found:true with documentType invoice when UUID matches', async () => {
    mockFindUnique.mockResolvedValueOnce(SAMPLE_INVOICE);
    const result = await verifyDocument('test-uuid');
    expect(result.found).toBe(true);
    if (result.found) expect(result.documentType).toBe('invoice');
  });

  it('returns correct documentNumber from invoice.invoiceNumber', async () => {
    mockFindUnique.mockResolvedValueOnce(SAMPLE_INVOICE);
    const result = await verifyDocument('test-uuid');
    if (result.found) expect(result.documentNumber).toBe('INV-2026-00001');
  });

  it('returns found:false when UUID not found', async () => {
    mockFindUnique.mockResolvedValueOnce(null);
    const result = await verifyDocument('missing-uuid');
    expect(result.found).toBe(false);
  });

  it('sets isCancelled:true when invoice status is CANCELLED', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...SAMPLE_INVOICE, status: 'CANCELLED' });
    const result = await verifyDocument('test-uuid');
    if (result.found) expect(result.isCancelled).toBe(true);
  });

  it('sets isCancelled:false when invoice status is PAID', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...SAMPLE_INVOICE, status: 'PAID' });
    const result = await verifyDocument('test-uuid');
    if (result.found) expect(result.isCancelled).toBe(false);
  });

  it('sets isApproved:true when invoice status is PAID', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...SAMPLE_INVOICE, status: 'PAID' });
    const result = await verifyDocument('test-uuid');
    if (result.found) expect(result.isApproved).toBe(true);
  });

  it('sets isApproved:false for non-PAID status (e.g. UNPAID)', async () => {
    mockFindUnique.mockResolvedValueOnce({ ...SAMPLE_INVOICE, status: 'UNPAID' });
    const result = await verifyDocument('test-uuid');
    if (result.found) expect(result.isApproved).toBe(false);
  });

  it('statusAr is a non-empty Arabic string', async () => {
    mockFindUnique.mockResolvedValueOnce(SAMPLE_INVOICE);
    const result = await verifyDocument('test-uuid');
    if (result.found) {
      expect(result.statusAr).toBeTruthy();
      expect(result.statusAr.length).toBeGreaterThan(0);
    }
  });

  it('response does NOT contain financial fields (amount, total, paidAmount)', async () => {
    mockFindUnique.mockResolvedValueOnce(SAMPLE_INVOICE);
    const result = await verifyDocument('test-uuid');
    expect(result).not.toHaveProperty('amount');
    expect(result).not.toHaveProperty('total');
    expect(result).not.toHaveProperty('paidAmount');
  });

  it('response does NOT contain party identity fields', async () => {
    mockFindUnique.mockResolvedValueOnce(SAMPLE_INVOICE);
    const result = await verifyDocument('test-uuid');
    expect(result).not.toHaveProperty('customerName');
    expect(result).not.toHaveProperty('supplierName');
    expect(result).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('supplierId');
  });
});
```

- [ ] **Step 2: Run tests — expect failures (module not found)**

```bash
cd backend && npm test -- verification 2>&1 | head -30
```

Expected: import errors about missing `../verification.service`

- [ ] **Step 3: Create arabicLabels.ts**

Create `backend/src/shared/utils/arabicLabels.ts`:

```typescript
const STATUS_LABELS: Record<string, string> = {
  UNPAID:    'غير مسددة',
  PARTIAL:   'مسددة جزئياً',
  PAID:      'مسددة',
  OVERDUE:   'متأخرة',
  CANCELLED: 'ملغاة',
  DRAFT:     'مسودة',
  APPROVED:  'معتمد',
  REJECTED:  'مرفوض',
  PENDING:   'قيد الانتظار',
  PRINTED:   'مطبوعة',
  REVERSED:  'معكوسة',
  VOID:      'لاغية',
};

export function translateStatusAr(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
```

- [ ] **Step 4: Create verification.schema.ts**

Create `backend/src/modules/verification/verification.schema.ts`:

```typescript
import { z } from 'zod';

export const verifyParamSchema = z.object({
  params: z.object({
    uuid: z.string().min(1, 'UUID مطلوب'),
  }),
});
```

- [ ] **Step 5: Create verification.service.ts**

Create `backend/src/modules/verification/verification.service.ts`:

```typescript
import { prisma } from '@config/database';
import { translateStatusAr } from '@shared/utils/arabicLabels';

interface VerificationFound {
  found: true;
  documentType: 'invoice';
  documentNumber: string;
  status: string;
  statusAr: string;
  issueDate: string;
  updatedAt: string;
  isCancelled: boolean;
  isApproved: boolean;
}

interface VerificationNotFound {
  found: false;
}

export type VerifyResult = VerificationFound | VerificationNotFound;

export async function verifyDocument(uuid: string): Promise<VerifyResult> {
  const invoice = await prisma.invoice.findUnique({
    where: { verificationUuid: uuid },
    select: {
      invoiceNumber: true,
      status: true,
      issueDate: true,
      updatedAt: true,
    },
  });

  if (!invoice) return { found: false };

  return {
    found: true,
    documentType: 'invoice',
    documentNumber: invoice.invoiceNumber,
    status: invoice.status,
    statusAr: translateStatusAr(invoice.status),
    issueDate: invoice.issueDate.toISOString().split('T')[0],
    updatedAt: invoice.updatedAt.toISOString().split('T')[0],
    isCancelled: invoice.status === 'CANCELLED',
    isApproved: invoice.status === 'PAID',
  };
}
```

- [ ] **Step 6: Create verification.controller.ts**

Create `backend/src/modules/verification/verification.controller.ts`:

```typescript
import type { Request, Response } from 'express';
import { verifyDocument } from './verification.service';
import { successResponse } from '@core/utils/response';
import { AppError } from '@core/errors/AppError';

export const verificationController = {
  async verify(req: Request, res: Response) {
    const { uuid } = req.params;
    const result = await verifyDocument(uuid);
    if (!result.found) {
      throw AppError.notFound('الوثيقة غير موجودة');
    }
    return successResponse(res, result);
  },
};
```

- [ ] **Step 7: Create verification.routes.ts**

Create `backend/src/modules/verification/verification.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { validate } from '@core/middleware/validate.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { verifyParamSchema } from './verification.schema';
import { verificationController } from './verification.controller';

const router = Router();
router.use(authenticate);

router.get('/:uuid', validate(verifyParamSchema), asyncHandler(verificationController.verify));

export default router;
```

- [ ] **Step 8: Run tests — expect all 10 verification tests to pass**

```bash
cd backend && npm test -- verification 2>&1 | grep -E "(✓|✗|PASS|FAIL)"
```

Expected: all 10 tests pass

- [ ] **Step 9: Add verificationUuid to Invoice.create in invoices.service.ts**

In `backend/src/modules/invoices/invoices.service.ts`:

Add the import at the top of the file (with existing imports):
```typescript
import { randomUUID } from 'crypto';
```

Then find the `await tx.invoice.create({ data: { ... } })` call (around line 236). Add `verificationUuid: randomUUID()` to the data object. The data object should have:
```typescript
const created = await tx.invoice.create({
  data: {
    number: invoiceNumber,
    invoiceNumber,
    direction: input.direction,
    invoiceType: input.invoiceType,
    customerId: input.customerId ?? null,
    supplierId: input.supplierId ?? null,
    contractId: input.contractId ?? null,
    issueDate: input.issueDate ?? new Date(),
    dueDate: input.dueDate ?? null,
    deliveryDate: input.deliveryDate ?? null,
    billingMonth: input.billingMonth ?? null,
    billingYear: input.billingYear ?? null,
    paymentMethod: input.paymentMethod ?? null,
    subtotal,
    taxRate: input.taxRate,
    taxAmount,
    discount: input.discount,
    total,
    paidAmount: 0,
    status: 'UNPAID',
    notes: input.notes ?? null,
    verificationUuid: randomUUID(),   // ← add this line
    items: { create: lines },
  },
  include: FULL_INCLUDE,
});
```

- [ ] **Step 10: Add 'verification' to MODULES in constants.ts**

In `backend/src/config/constants.ts`, find the `MODULES` array. Add `'verification'` after `'users'`:

```typescript
export const MODULES = [
  'dashboard',
  'customers',
  'employees',
  'attendance',
  'payroll',
  'equipment',
  'maintenance',
  'contracts',
  'invoices',
  'suppliers',
  'expenses',
  'transactions',
  'reports',
  'users',
  'verification',   // ← add here
  'roles',
  'audit',
  'backups',
  'settings',
  'inventory',
  'cheques',
  'import',
  'prices',
  'forms',
  'statements',
  'aging',
  'gl',
  'trialbalance',
  'journal',
  'finreports',
  'financial',
  'financialdashboard',
] as const;
```

- [ ] **Step 11: Register verification router in app.ts**

In `backend/src/app.ts`, add the import with the other router imports:

```typescript
import verificationRouter from './modules/verification/verification.routes';
```

Then add the route registration after the `statementsRoutes` line:

```typescript
app.use('/api/statements', statementsRoutes);
app.use('/api/verify',     verificationRouter);   // ← add this line
```

- [ ] **Step 12: Run all backend tests**

```bash
cd backend && npm test
```

Expected: ALL tests pass (including 10 new verification tests + all existing tests)

- [ ] **Step 13: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 14: Backend build check**

```bash
npm run build:back
```

Expected: clean compile

- [ ] **Step 15: Commit**

```bash
git add backend/src/shared/utils/arabicLabels.ts backend/src/modules/verification/ backend/src/modules/invoices/invoices.service.ts backend/src/config/constants.ts backend/src/app.ts
git commit -m "feat(verification): add QR verification module — Invoice verificationUuid on create, GET /api/verify/:uuid endpoint"
```

---

## Task 7: Frontend DocumentVerificationQR Component

**Files:**
- Create: `frontend/src/print-templates/components/DocumentVerificationQR.tsx`
- Create: `frontend/src/__tests__/printTemplates/documentVerificationQR.test.tsx`

**Context:** The `qrcode` package is already installed in `frontend/package.json`. The tests require React component rendering, which needs `@testing-library/react` and `jsdom`. These are not currently in the project — install them in Step 1.

**Interfaces:**
- Produces: `DocumentVerificationQR` — default export React component
  - Props: `{ uuid: string | null | undefined; size?: number; showLabel?: boolean }`
  - Returns `null` when `uuid` is falsy
  - Consumed by Task 8 (InvoicePreview.tsx)

- [ ] **Step 1: Install test dependencies**

```bash
cd frontend && npm install --save-dev @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Write failing component tests**

Create `frontend/src/__tests__/printTemplates/documentVerificationQR.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,fakeqrdata'),
  },
}));

import DocumentVerificationQR from '../../print-templates/components/DocumentVerificationQR';

describe('DocumentVerificationQR', () => {
  it('renders a QR image when a valid UUID is provided', async () => {
    render(<DocumentVerificationQR uuid="6ba7b810-9dad-11d1-80b4-00c04fd430c8" />);
    await waitFor(() => {
      expect(screen.getByAltText('رمز التحقق')).toBeInTheDocument();
    });
  });

  it('renders nothing when uuid is null', () => {
    const { container } = render(<DocumentVerificationQR uuid={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when uuid is undefined', () => {
    const { container } = render(<DocumentVerificationQR uuid={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it('applies size prop to rendered image dimensions', async () => {
    render(<DocumentVerificationQR uuid="test-uuid-abc" size={48} />);
    await waitFor(() => {
      const img = screen.getByAltText('رمز التحقق');
      expect(img).toHaveStyle('width: 48px');
      expect(img).toHaveStyle('height: 48px');
    });
  });
});
```

- [ ] **Step 3: Run tests — expect failures (component not found)**

```bash
cd frontend && npm test -- documentVerificationQR 2>&1 | head -30
```

Expected: import errors about missing component

- [ ] **Step 4: Create DocumentVerificationQR.tsx**

Create `frontend/src/print-templates/components/DocumentVerificationQR.tsx`:

```tsx
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface DocumentVerificationQRProps {
  uuid: string | null | undefined;
  size?: number;
  showLabel?: boolean;
}

export default function DocumentVerificationQR({
  uuid,
  size = 72,
  showLabel = true,
}: DocumentVerificationQRProps) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    if (!uuid) {
      setSrc('');
      return;
    }
    QRCode.toDataURL(uuid, {
      width: size * 2,
      margin: 1,
      color: { dark: '#1d4e6f', light: '#ffffff' },
    })
      .then(setSrc)
      .catch(() => {});
  }, [uuid, size]);

  if (!uuid || !src) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <img src={src} alt="رمز التحقق" style={{ width: size, height: size }} />
      {showLabel && (
        <span style={{ fontSize: 8, color: '#64748b', direction: 'rtl' }}>رمز التحقق</span>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Run tests — expect all 4 tests to pass**

```bash
cd frontend && npm test -- documentVerificationQR 2>&1 | grep -E "(✓|✗|PASS|FAIL)"
```

Expected: 4 tests pass

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/print-templates/components/DocumentVerificationQR.tsx frontend/src/__tests__/printTemplates/documentVerificationQR.test.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(print): add DocumentVerificationQR component — renders QR from UUID, null-safe"
```

---

## Task 8: Wire QR into InvoicePreview.tsx

**Files:**
- Modify: `frontend/src/pages/InvoicePreview.tsx`

**Context:** `InvoicePreview.tsx` fetches invoice data from `/invoices/${id}` and has two render modes: `'legacy'` and `'engine'`. The QR is shown only in engine mode. The `verificationUuid` field will now be returned by the API (Task 5 added it to the schema).

- [ ] **Step 1: Add verificationUuid to the FullInvoice type**

In `frontend/src/pages/InvoicePreview.tsx`, find the `FullInvoice` type definition (around lines 48–73). Add `verificationUuid` as an optional nullable field:

```typescript
type FullInvoice = {
  id: number;
  invoiceNumber: string;
  number: string;
  direction: string;
  invoiceType: string;
  status: string;
  issueDate: string;
  dueDate?: string | null;
  billingMonth?: number | null;
  billingYear?: number | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  paidAmount: number;
  notes?: string | null;
  verificationUuid?: string | null;   // ← add this field
  createdAt: string;
  updatedAt: string;
  customer?: { id: number; name: string } | null;
  supplier?: { id: number; name: string } | null;
  contract?: { id: number; code?: string; asphaltPlant: string } | null;
  items: InvItem[];
  payments: Payment[];
};
```

- [ ] **Step 2: Add DocumentVerificationQR import**

At the top of `frontend/src/pages/InvoicePreview.tsx`, add the import with the other print-template imports:

```typescript
import DocumentVerificationQR from '../print-templates/components/DocumentVerificationQR';
```

- [ ] **Step 3: Place QR in the engine mode render section**

Search for where the engine-mode template renders (`previewMode === 'engine'`). Inside the engine mode conditional block, after the main template content, add the QR overlay:

```tsx
{previewMode === 'engine' && data?.verificationUuid && (
  <div style={{
    position: 'absolute',
    bottom: 8,
    left: 8,
    printColorAdjust: 'exact',
    WebkitPrintColorAdjust: 'exact',
  }}>
    <DocumentVerificationQR uuid={data.verificationUuid} size={64} />
  </div>
)}
```

Place this inside whatever wrapper div already has `position: 'relative'` in the engine render area. If the engine render area doesn't have `position: 'relative'`, add `position: 'relative'` to the nearest container div.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Run all frontend tests**

```bash
cd frontend && npm test -- --run
```

Expected: ALL tests pass (all suites, no regressions)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/InvoicePreview.tsx
git commit -m "feat(invoice): show DocumentVerificationQR in engine print mode when verificationUuid is present"
```

---

## Final Validation Checklist

Run all of these before declaring the batch complete:

```bash
# Backend — all tests + type check + build
cd backend && npm test && npx tsc --noEmit && npm run build:back

# Frontend — all tests + type check + build
cd frontend && npm test -- --run && npx tsc --noEmit && npm run build:front

# Electron — type check
tsc -p electron/tsconfig.json --noEmit
```

Expected: all 0 errors, all tests green.

---

## Self-Review

### Spec Coverage Check

| Spec Requirement | Task | Status |
|-----------------|------|--------|
| Fix `'Total :'` in InvoiceDesign1.tsx | Task 2 | ✅ |
| Fix `'Total :'` in InvoiceDesign1Blank.tsx | Task 2 | ✅ |
| Create `printI18n.ts` with 6 translation functions | Task 1 | ✅ |
| `translateInvoiceStatus` — 12 status values + fallback | Task 1 | ✅ |
| `translatePaymentMethod` — 4 values + fallback | Task 1 | ✅ |
| `translateInvoiceDirection` — SALES/PURCHASE + fallback | Task 1 | ✅ |
| `translateRefType` — 6 values + fallback | Task 1 | ✅ |
| `translateDocumentState` — 5 values + fallback | Task 1 | ✅ |
| `formatArabicDate` — string/Date/invalid | Task 1 | ✅ |
| Extend `ProfileConfig` with 5 optional fields | Task 3 | ✅ |
| Export `ProfileConfig` type | Task 3 | ✅ |
| Update 6 profiles with new values (per spec table) | Task 3 | ✅ |
| Export `resolveTablePadding` (compact/normal/comfortable/default) | Task 3 | ✅ |
| Export `resolveLogoWidth` (small/medium/large/default) | Task 3 | ✅ |
| Export `resolveLogoJustify` (start/center/end/default) | Task 3 | ✅ |
| Add `table td, table th` padding CSS using `tableDensity` | Task 3 | ✅ |
| Add `.branding-logo-wrap` and `.branding-logo` CSS | Task 3 | ✅ |
| `buildBrandingHeader` optional second param with config | Task 4 | ✅ |
| Apply `min-height` only when `headerHeight` is set | Task 4 | ✅ |
| Wrap logo in `branding-logo-wrap` | Task 4 | ✅ |
| `html.service.ts` passes profileConfig to buildBrandingHeader | Task 4 | ✅ |
| Invoice `verificationUuid String? @unique` schema change | Task 5 | ✅ |
| Custom migration SQL with backfill + index | Task 5 | ✅ |
| `arabicLabels.ts` — backend-only, no frontend import | Task 6 | ✅ |
| `verification.routes.ts` — GET /:uuid, authenticate only | Task 6 | ✅ |
| `verification.service.ts` — Invoice-only lookup | Task 6 | ✅ |
| Response: found/documentType/status/statusAr/dates/flags | Task 6 | ✅ |
| Response: NEVER includes financial/party fields | Task 6 + tests | ✅ |
| `invoices.service.ts` adds `verificationUuid: randomUUID()` on create | Task 6 | ✅ |
| `constants.ts` adds `'verification'` to MODULES | Task 6 | ✅ |
| `app.ts` registers `/api/verify` router | Task 6 | ✅ |
| `DocumentVerificationQR` — uuid prop, size, showLabel | Task 7 | ✅ |
| Returns `null` when uuid is falsy | Task 7 | ✅ |
| Uses `#1d4e6f` brand color | Task 7 | ✅ |
| Label `'رمز التحقق'` when showLabel is true | Task 7 | ✅ |
| `InvoicePreview.tsx` — QR in engine mode only | Task 8 | ✅ |
| QR hidden by default (`verificationUuid` must be present) | Task 8 | ✅ |

### Deferred Items (NOT in this batch)
- Quotation QR integration — `Quotation.tsx` is frontend-only (no Quotation DB model exists). Deferred until a Quotation backend model is created.
- HR Forms print profiles — separate project
- Print Template Storage profiles — separate project
- Print Designer profiles — separate project
- Online/Cloud QR verification — offline-only app
- HMAC document signatures — deferred
- QR on Cheques, PayrollPayslip, PurchaseOrder — same pattern, separate PR

### Known Discrepancy vs. Spec
The approved spec mentioned `quotations.service.ts` and `Quotation.verificationUuid`. Investigation reveals no `Quotation` model exists in `schema.prisma` and no `quotations` backend module exists. The `Quotation.tsx` page is a purely frontend form. All Part 3 work is scoped to Invoice only, consistent with the actual codebase.

### Placeholder Scan
No placeholders found. Every step has complete code.

### Type Consistency Check
- `ProfileConfig` is exported from `printProfiles.ts` (Task 3), used as `Pick<ProfileConfig, ...>` in `branding.template.ts` (Task 4) — consistent.
- `resolveLogoWidth`, `resolveLogoJustify` exported from `styles.template.ts` (Task 3), imported in `branding.template.ts` (Task 4) — consistent.
- `verifyDocument` returns `VerifyResult` (Task 6), controller handles `result.found` discriminant — consistent.
- `FullInvoice.verificationUuid?: string | null` (Task 8) matches Prisma `String? @unique` schema (Task 5) — consistent.

---

**Plan complete and saved to `docs/superpowers/plans/2026-06-25-print-polish-batch1-plan.md`.**

**Two execution options:**

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration. Use skill: `superpowers:subagent-driven-development`

**2. Inline Execution** — execute tasks in this session with checkpoints for review. Use skill: `superpowers:executing-plans`

**Which approach?**

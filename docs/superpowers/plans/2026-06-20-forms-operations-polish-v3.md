# Forms & Operations Polish Pack v3 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two standalone print forms (Quotation + Purchase Request), improve existing HR form UX (drafts, reset, print-log search, lang=en audit), fix Employment Contract spacing, and produce two lightweight documentation files — all frontend-only on branch `feature/forms-operations-polish-v3`.

**Architecture:** All new forms use FormLayout + PrintProfile + Cairo font (inherited). Quotation and Purchase Request are "standalone" forms (no `:employeeId` route param) — all fields typed manually in an on-screen no-print panel; interfaces are designed so future backend selectors replace text inputs without changing the template or print layout. Parts 4–6 extend the existing draft store and add UX affordances to the 8 existing HR form pages.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, Zustand 4, React Router 6 (HashRouter), Cairo font, existing FormLayout / PrintProfile / formStyles / formNumber / printLogStore / printDraftStore.

## Global Constraints

- Branch: `feature/forms-operations-polish-v3` — do NOT merge to production
- Frontend-only: no changes to `backend/`, `prisma/`, `electron/`, `package.json`
- No API calls for new forms — all fields manually entered on screen
- No new npm packages; no database migrations
- Print font: `"Cairo", Arial, sans-serif` (inherited from FormLayout — do NOT set inline in templates)
- AR forms: `direction: 'rtl'`; EN forms: `direction: 'ltr'`
- All form routes go outside the `<Layout>` wrapper in App.tsx (same as existing HR form routes)
- `QRData` interface (`frontend/src/forms/shared/FormQRCode.tsx`) requires: `formType: string`, `formNumber: string`, `employeeId: number`, `employeeName: string`, `issueDate: string` — standalone forms use `employeeId: 0`
- All new template elements: `WebkitPrintColorAdjust: 'exact'`, `printColorAdjust: 'exact'` on colored backgrounds
- Session-only: no localStorage, no backend persistence for drafts or print log
- Validation must pass after every task: `cd frontend && npx tsc --noEmit`

---

## File Map

### New Files
| Path | Purpose |
|------|---------|
| `frontend/src/forms/QuotationTemplate.tsx` | Print template: AR + EN render paths, items table, auto-calculated totals |
| `frontend/src/pages/Quotation.tsx` | Page component: printFields state, add/remove items, draft, print log, profile toggle |
| `frontend/src/forms/PurchaseRequestTemplate.tsx` | Print template: AR + EN render paths, items table |
| `frontend/src/pages/PurchaseRequest.tsx` | Page component: printFields state, add/remove items, draft, print log, profile toggle |
| `docs/invoice-templates/README.md` | Part 9: future invoice template conversion documentation |
| `docs/superpowers/reports/2026-06-20-git-cleanup-report.md` | Part 10: repository cleanup report |

### Modified Files
| Path | Changes |
|------|---------|
| `frontend/src/App.tsx` | +2 routes: `/forms/quotation`, `/forms/purchase-request` |
| `frontend/src/pages/Forms.tsx` | `FormCard.requiresEmployee` flag; standalone cards; `handlePrint` guard |
| `frontend/src/forms/shared/formNumber.ts` | +2 prefixes: `quotation → QTN`, `purchase-request → PR` |
| `frontend/src/stores/printLogStore.ts` | +2 form labels for `quotation` and `purchase-request` |
| `frontend/src/components/PrintLogPanel.tsx` | Search box + filtered display |
| `frontend/src/forms/EmploymentContractTemplate.tsx` | Part 2: reduce spacing after removed title row |
| `frontend/src/pages/LeaveRequest.tsx` | Draft buttons + reset button |
| `frontend/src/pages/ReturnToWork.tsx` | Draft buttons + reset button |
| `frontend/src/pages/SalaryAdvance.tsx` | Draft buttons + reset button |
| `frontend/src/pages/SalaryCertificate.tsx` | Draft buttons + reset button |
| `frontend/src/pages/ToWhomItMayConcern.tsx` | Draft buttons + reset button |
| `frontend/src/pages/EmployeeWarning.tsx` | Draft buttons + reset button |
| `frontend/src/pages/PerformanceEvaluation.tsx` | Draft buttons + reset button |
| `frontend/src/pages/Resignation.tsx` | Draft buttons + reset button |

---

## Task 1 — Branch Setup + Baseline Validation

**Files:** none created/modified

- [ ] **Step 1: Create feature branch from production**

```bash
git checkout production
git checkout -b feature/forms-operations-polish-v3
```

Expected: `Switched to a new branch 'feature/forms-operations-polish-v3'`

- [ ] **Step 2: Confirm baseline validation passes**

```bash
cd frontend && npx tsc --noEmit
cd ../backend && npx tsc --noEmit
cd .. && npx tsc -p electron/tsconfig.json --noEmit
cd backend && npx prisma validate
cd .. && npm test
npm run build:back
npm run build:front
```

Expected: all pass, `npm test` shows 424/424.

- [ ] **Step 3: Commit baseline marker**

```bash
git commit --allow-empty -m "chore: start feature/forms-operations-polish-v3"
```

---

## Task 2 — Part 2: Employment Contract Spacing Fix

**Files:**
- Modify: `frontend/src/forms/EmploymentContractTemplate.tsx`

**Interfaces:**
- Consumes: existing `EmploymentContractTemplate` (no interface change)
- Produces: same export, reduced whitespace between authority banner and preamble row

- [ ] **Step 1: Identify the spacing**

Run `npm run dev`, navigate to `/forms/employment-contract`, pick any employee, open the preview. On-screen, measure the gap between the "الهيئة العامة للقوى العاملة" banner row and the first bilingual preamble row. The gap was created when the bilingual gray title row ("نموذج عقد عمل إسترشادي...") was removed in Forms Polish Pack v2 — the `fullRow` padding on the authority-name div now has no content below it before the `ec-row` twoCol.

- [ ] **Step 2: Apply the fix**

In `frontend/src/forms/EmploymentContractTemplate.tsx`, locate the authority-name `fullRow` div (the one containing "الهـيئة العـامة للقـوى العـاملة"). Change its padding to reduce vertical space:

```tsx
// BEFORE (lines ~172-175):
<div style={{ ...fullRow, padding: '5px 10px' }}>
  <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>الهـيئة العـامة للقـوى العـاملة</div>
  <div style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginTop: 1 }}>The Public Authority For Manpower</div>
</div>

// AFTER:
<div style={{ ...fullRow, padding: '3px 10px' }}>
  <div style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>الهـيئة العـامة للقـوى العـاملة</div>
  <div style={{ fontSize: 11, fontWeight: 500, color: '#374151', marginTop: 1 }}>The Public Authority For Manpower</div>
</div>
```

Also reduce the emblem row padding from `'8px 10px'` to `'5px 10px'`:

```tsx
// BEFORE:
<div style={{ ...fullRow, padding: '8px 10px' }}>
  <img src="/contract_emblem.png" ... />
</div>

// AFTER:
<div style={{ ...fullRow, padding: '5px 10px' }}>
  <img src="/contract_emblem.png" ... />
</div>
```

- [ ] **Step 3: Verify — must still be exactly 2 pages, Article 7 starts page 2**

Print-preview in Chromium (Ctrl+P from the preview page). Confirm page 1 ends after Article 6, page 2 begins with Article 7, no content overflow, NOTE visible at bottom of page 2, signature area unchanged.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/forms/EmploymentContractTemplate.tsx
git commit -m "fix(contract): reduce spacing after removed title row"
```

---

## Task 3 — Part 3: Print Log Search Box

**Files:**
- Modify: `frontend/src/components/PrintLogPanel.tsx`

**Interfaces:**
- Consumes: `usePrintLogStore` (existing)
- Produces: `PrintLogPanel` — same export, now with internal search state filtering the displayed entries

- [ ] **Step 1: Replace PrintLogPanel.tsx entirely**

```tsx
// frontend/src/components/PrintLogPanel.tsx
import { useState } from 'react';
import { usePrintLogStore, FORM_LABELS, PROFILE_LABELS } from '../stores/printLogStore';

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('ar-KW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const time = d.toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' });
  return `${date} — ${time}`;
}

export default function PrintLogPanel() {
  const entries = usePrintLogStore((s) => s.entries);
  const clear = usePrintLogStore((s) => s.clear);
  const [search, setSearch] = useState('');

  if (entries.length === 0) return null;

  const q = search.trim().toLowerCase();
  const filtered = q
    ? entries.filter(
        (e) =>
          (e.employeeName || '').toLowerCase().includes(q) ||
          (FORM_LABELS[e.formType] ?? e.formType).toLowerCase().includes(q),
      )
    : entries;

  return (
    <div className="card" style={{ marginTop: 32, padding: 0, overflow: 'hidden' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-2)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--text-muted)' }}>
            history
          </span>
          <span style={{ fontWeight: 700, fontSize: 14 }}>سجل الطباعة لهذه الجلسة</span>
          <span
            style={{
              background: 'var(--primary)',
              color: '#fff',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 700,
              padding: '1px 7px',
            }}
          >
            {entries.length}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 180 }}>
          <input
            type="search"
            placeholder="بحث باسم الموظف أو النموذج…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1,
              padding: '5px 10px',
              border: '1px solid var(--border)',
              borderRadius: 8,
              background: 'var(--bg)',
              color: 'var(--text)',
              fontSize: 12,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 10px', whiteSpace: 'nowrap' }}
            onClick={() => { setSearch(''); clear(); }}
          >
            مسح السجل
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '16px 18px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
            لا توجد نتائج للبحث
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', direction: 'rtl' }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  التاريخ والوقت
                </th>
                <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>
                  الاسم / العميل
                </th>
                <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right' }}>
                  النموذج
                </th>
                <th style={{ padding: '7px 10px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                  نوع الطباعة
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr key={entry.id} style={{ background: i % 2 === 0 ? 'var(--bg)' : 'var(--surface-2)' }}>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formatDateTime(entry.printedAt)}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 13, fontWeight: 600 }}>
                    {entry.employeeName || '—'}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 12 }}>
                    {FORM_LABELS[entry.formType] ?? entry.formType}
                  </td>
                  <td style={{ padding: '6px 10px', fontSize: 12, color: 'var(--text-muted)' }}>
                    {PROFILE_LABELS[entry.printProfile] ?? entry.printProfile}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/PrintLogPanel.tsx
git commit -m "feat(forms): add search to print log panel"
```

---

## Task 4 — Part 1 Shared Infrastructure

**Files:**
- Modify: `frontend/src/forms/shared/formNumber.ts`
- Modify: `frontend/src/stores/printLogStore.ts`
- Modify: `frontend/src/pages/Forms.tsx`

**Interfaces:**
- Produces: `generateFormNumber('quotation')` → `'QTN-YYYY-XXXX'`
- Produces: `generateFormNumber('purchase-request')` → `'PR-YYYY-XXXX'`
- Produces: `FORM_LABELS['quotation']` → `'عرض سعر'`
- Produces: `FORM_LABELS['purchase-request']` → `'طلب شراء'`
- Produces: `FormCard.requiresEmployee?: boolean` — drives standalone form routing in Forms.tsx

- [ ] **Step 1: Add prefixes to formNumber.ts**

```typescript
// frontend/src/forms/shared/formNumber.ts — add two entries to PREFIXES:
const PREFIXES: Record<string, string> = {
  'salary-certificate': 'SAL',
  'to-whom-it-may-concern': 'TWM',
  'leave-request': 'LV',
  'return-to-work': 'RTW',
  'salary-advance': 'ADV',
  resignation: 'RES',
  'employee-warning': 'WRN',
  'performance-evaluation': 'EVA',
  'employment-contract': 'EMP',
  quotation: 'QTN',           // ← add
  'purchase-request': 'PR',   // ← add
};
```

- [ ] **Step 2: Add form labels to printLogStore.ts**

```typescript
// In the FORM_LABELS const, add two entries:
const FORM_LABELS: Record<string, string> = {
  'employment-contract': 'عقد العمل',
  'salary-certificate': 'شهادة راتب',
  'to-whom-it-may-concern': 'إفادة لمن يهمه الأمر',
  'leave-request': 'طلب إجازة',
  'return-to-work': 'إعادة مباشرة العمل',
  'salary-advance': 'طلب سلفة راتب',
  'employee-warning': 'إنذار موظف',
  'performance-evaluation': 'تقييم أداء',
  resignation: 'استقالة',
  quotation: 'عرض سعر',           // ← add
  'purchase-request': 'طلب شراء', // ← add
};
```

- [ ] **Step 3: Update Forms.tsx — add requiresEmployee flag and standalone routing**

Replace the `FormCard` interface, `FORM_CARDS` array additions, and `handlePrint` in `frontend/src/pages/Forms.tsx`:

```tsx
// 1. Extend FormCard interface:
interface FormCard {
  key: string;
  route: string;
  titleAr: string;
  titleEn: string;
  description: string;
  icon: string;
  requiresEmployee?: boolean; // defaults to true when absent
}

// 2. Append two cards to FORM_CARDS (after the employment-contract entry):
  {
    key: 'quotation',
    route: 'quotation',
    titleAr: 'عرض سعر',
    titleEn: 'Quotation',
    description: 'نموذج عرض سعر رسمي للعملاء يتضمن جدول الأسعار والشروط.',
    icon: '📊',
    requiresEmployee: false,
  },
  {
    key: 'purchase-request',
    route: 'purchase-request',
    titleAr: 'طلب شراء',
    titleEn: 'Purchase Request',
    description: 'نموذج طلب شراء داخلي مع جدول المواد والكميات وبيانات الاعتماد.',
    icon: '🛒',
    requiresEmployee: false,
  },

// 3. Replace handlePrint:
function handlePrint(card: FormCard) {
  if (card.requiresEmployee !== false && !selectedId) return;
  if (card.requiresEmployee === false) {
    navigate(`/forms/${card.route}`);
  } else {
    navigate(`/forms/${card.route}/${selectedId}?printMode=${printModes[card.key]}`);
  }
}

// 4. Update the disabled condition on the Print button:
disabled={card.requiresEmployee !== false && !selectedId}

// 5. Hide print-mode selector for standalone forms (same exclusion as employment-contract):
{card.key !== 'employment-contract' && card.requiresEmployee !== false && (
  <div style={{ marginBottom: 14 }}>
    ...printModes selector...
  </div>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/forms/shared/formNumber.ts \
        frontend/src/stores/printLogStore.ts \
        frontend/src/pages/Forms.tsx
git commit -m "feat(forms): add quotation and purchase-request form infrastructure"
```

---

## Task 5 — Part 1A: QuotationTemplate.tsx

**Files:**
- Create: `frontend/src/forms/QuotationTemplate.tsx`

**Interfaces:**
- Produces: exported `QuotationItem`, `QuotationPrintFields`, `default QuotationTemplate`
- Consumed by: `Quotation.tsx` (Task 6)

- [ ] **Step 1: Create frontend/src/forms/QuotationTemplate.tsx**

```tsx
import { CSSProperties } from 'react';
import {
  COMPANY_NAME,
  sectionHeader,
  tableWrapper,
  labelCell,
  valueCell,
  fmtDate,
  fmtDateEn,
  blankLine,
} from './shared/formStyles';

// ─── Exported interfaces ──────────────────────────────────────────────────────
// Future integration: replace flat fields with typed references, e.g.:
//   customerId: number | null  →  replaces customerName, contactPerson, phone
//   projectId: number | null   →  replaces project

export interface QuotationItem {
  id: string;           // React key — use crypto.randomUUID() when creating
  description: string;
  qty: string;          // string to allow partial input ('1.', '')
  unit: string;
  unitPrice: string;    // string to allow partial input
  // total is NOT stored — computed in template from qty × unitPrice
}

export interface QuotationPrintFields {
  quotationNumber: string;
  date: string;         // ISO YYYY-MM-DD
  validUntil: string;   // ISO YYYY-MM-DD
  currency: string;     // 'KWD' | 'USD' | 'SAR'
  subject: string;
  // Customer block — future: { customerId, customerName, ... }
  customerName: string;
  contactPerson: string;
  phone: string;
  // Project block — future: { projectId, projectName }
  project: string;
  // Items
  items: QuotationItem[];
  // Footer
  notes: string;
  paymentTerms: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CURRENCY_SYMBOLS: Record<string, { ar: string; en: string }> = {
  KWD: { ar: 'د.ك', en: 'KWD' },
  USD: { ar: 'دولار', en: 'USD' },
  SAR: { ar: 'ر.س', en: 'SAR' },
};

function currSym(currency: string, lang: 'ar' | 'en'): string {
  return (CURRENCY_SYMBOLS[currency] ?? { ar: currency, en: currency })[lang];
}

function itemTotal(item: QuotationItem): number {
  const q = parseFloat(item.qty) || 0;
  const p = parseFloat(item.unitPrice) || 0;
  return Math.round(q * p * 1000) / 1000;
}

function grandTotal(items: QuotationItem[]): number {
  return Math.round(items.reduce((s, i) => s + itemTotal(i), 0) * 1000) / 1000;
}

function fmtAmt(v: number, currency: string, lang: 'ar' | 'en'): string {
  return `${v.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currSym(currency, lang)}`;
}

// ─── Shared table styles ──────────────────────────────────────────────────────

const th: CSSProperties = {
  background: '#1d4e6f',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  padding: '5px 8px',
  border: '1px solid #bfd6e3',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const td: CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid #e2e8f0',
  verticalAlign: 'top',
};

// ─── InfoRow helper ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>{label}</div>
      <div style={valueCell}>
        {value.trim() ? value : <span style={blankLine} />}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  printFields: QuotationPrintFields;
  lang?: 'ar' | 'en';
}

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

export default function QuotationTemplate({ printFields: pf, lang = 'ar' }: Props) {
  const gt = grandTotal(pf.items);
  const isAr = lang !== 'en';

  // ── English path ─────────────────────────────────────────────────────────
  if (!isAr) {
    return (
      <div style={{ direction: 'ltr' }}>
        {/* Company intro */}
        <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
          <strong>{COMPANY_NAME_EN}</strong> hereby submits this quotation:
        </p>

        {/* Quote details */}
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={{ ...sectionHeader }}>Quotation Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Quotation No." value={pf.quotationNumber} />
            <InfoRow label="Date" value={fmtDateEn(pf.date)} />
            <InfoRow label="Valid Until" value={fmtDateEn(pf.validUntil)} />
            <InfoRow label="Currency" value={currSym(pf.currency, 'en')} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>Subject</div>
              <div style={valueCell}>{pf.subject.trim() ? pf.subject : <span style={blankLine} />}</div>
            </div>
          </div>
        </div>

        {/* Customer */}
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Customer Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Customer Name" value={pf.customerName} />
            <InfoRow label="Contact Person" value={pf.contactPerson} />
            <InfoRow label="Phone" value={pf.phone} />
            <InfoRow label="Project" value={pf.project} />
          </div>
        </div>

        {/* Items table */}
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 30 }}>#</th>
                <th style={{ ...th }}>Description</th>
                <th style={{ ...th, width: 60, textAlign: 'center' }}>Qty</th>
                <th style={{ ...th, width: 70, textAlign: 'center' }}>Unit</th>
                <th style={{ ...th, width: 110, textAlign: 'end' }}>Unit Price</th>
                <th style={{ ...th, width: 110, textAlign: 'end' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {pf.items.map((item, i) => (
                <tr key={item.id}>
                  <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                  <td style={td}>{item.description.trim() || <span style={blankLine} />}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                  <td style={{ ...td, textAlign: 'end' }}>
                    {item.unitPrice ? fmtAmt(parseFloat(item.unitPrice) || 0, pf.currency, 'en') : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'end', fontWeight: 600 }}>
                    {item.qty && item.unitPrice ? fmtAmt(itemTotal(item), pf.currency, 'en') : '—'}
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={5} style={{ ...td, textAlign: 'start', fontWeight: 700, color: '#1d4e6f', background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                  Grand Total
                </td>
                <td style={{ ...td, fontWeight: 800, color: '#1d4e6f', fontSize: 13, background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                  {fmtAmt(gt, pf.currency, 'en')}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Notes + terms */}
        {(pf.notes.trim() || pf.paymentTerms.trim()) && (
          <div style={{ ...tableWrapper, marginBottom: 10 }}>
            <div style={sectionHeader}>Notes & Terms</div>
            {pf.notes.trim() && (
              <div style={{ padding: '6px 12px', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>
                <strong>Notes: </strong>{pf.notes}
              </div>
            )}
            {pf.paymentTerms.trim() && (
              <div style={{ padding: '6px 12px', fontSize: 12 }}>
                <strong>Payment Terms: </strong>{pf.paymentTerms}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Arabic path ───────────────────────────────────────────────────────────
  return (
    <div style={{ direction: 'rtl' }}>
      {/* Company intro */}
      <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
        تتقدم <strong>{COMPANY_NAME}</strong> بعرض السعر التالي:
      </p>

      {/* Quote details */}
      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>تفاصيل عرض السعر</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="رقم العرض" value={pf.quotationNumber} />
          <InfoRow label="التاريخ" value={fmtDate(pf.date)} />
          <InfoRow label="صالح حتى" value={fmtDate(pf.validUntil)} />
          <InfoRow label="العملة" value={currSym(pf.currency, 'ar')} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>الموضوع</div>
            <div style={valueCell}>{pf.subject.trim() ? pf.subject : <span style={blankLine} />}</div>
          </div>
        </div>
      </div>

      {/* Customer */}
      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>بيانات العميل</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="اسم العميل" value={pf.customerName} />
          <InfoRow label="جهة الاتصال" value={pf.contactPerson} />
          <InfoRow label="الهاتف" value={pf.phone} />
          <InfoRow label="المشروع" value={pf.project} />
        </div>
      </div>

      {/* Items table */}
      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>بنود العرض</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 30 }}>#</th>
              <th style={{ ...th }}>الوصف</th>
              <th style={{ ...th, width: 60, textAlign: 'center' }}>الكمية</th>
              <th style={{ ...th, width: 70, textAlign: 'center' }}>الوحدة</th>
              <th style={{ ...th, width: 110, textAlign: 'end' }}>سعر الوحدة</th>
              <th style={{ ...th, width: 110, textAlign: 'end' }}>الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            {pf.items.map((item, i) => (
              <tr key={item.id}>
                <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                <td style={td}>{item.description.trim() || <span style={blankLine} />}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                <td style={{ ...td, textAlign: 'end' }}>
                  {item.unitPrice ? fmtAmt(parseFloat(item.unitPrice) || 0, pf.currency, 'ar') : '—'}
                </td>
                <td style={{ ...td, textAlign: 'end', fontWeight: 600 }}>
                  {item.qty && item.unitPrice ? fmtAmt(itemTotal(item), pf.currency, 'ar') : '—'}
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} style={{ ...td, textAlign: 'start', fontWeight: 700, color: '#1d4e6f', background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                الإجمالي الكلي
              </td>
              <td style={{ ...td, fontWeight: 800, color: '#1d4e6f', fontSize: 13, background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
                {fmtAmt(gt, pf.currency, 'ar')}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Notes + terms */}
      {(pf.notes.trim() || pf.paymentTerms.trim()) && (
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>ملاحظات وشروط</div>
          {pf.notes.trim() && (
            <div style={{ padding: '6px 12px', fontSize: 12, borderBottom: '1px solid #e2e8f0' }}>
              <strong>ملاحظات: </strong>{pf.notes}
            </div>
          )}
          {pf.paymentTerms.trim() && (
            <div style={{ padding: '6px 12px', fontSize: 12 }}>
              <strong>شروط الدفع: </strong>{pf.paymentTerms}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/forms/QuotationTemplate.tsx
git commit -m "feat(forms): add QuotationTemplate (AR + EN)"
```

---

## Task 6 — Part 1A: Quotation.tsx page + App.tsx route

**Files:**
- Create: `frontend/src/pages/Quotation.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `QuotationItem`, `QuotationPrintFields` from `QuotationTemplate.tsx`
- Consumes: `FormLayout`, `PrintProfileToggle`, `LanguageToggle`, `generateFormNumber`, `usePrintLogStore`, `usePrintDraftStore`
- Produces: route `/forms/quotation` renders `<Quotation />`

- [ ] **Step 1: Create frontend/src/pages/Quotation.tsx**

```tsx
import { useState, useEffect } from 'react';
import { ProfileId, DEFAULT_PROFILE_ID } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import LanguageToggle from '../forms/shared/LanguageToggle';
import QuotationTemplate, {
  type QuotationItem,
  type QuotationPrintFields,
} from '../forms/QuotationTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';

const FORM_KEY = 'quotation';

// Helper — stable ID for new rows
function newItem(): QuotationItem {
  return { id: crypto.randomUUID(), description: '', qty: '', unit: '', unitPrice: '' };
}

function makeInitial(): QuotationPrintFields {
  return {
    quotationNumber: generateFormNumber(FORM_KEY),
    date: new Date().toISOString().slice(0, 10),
    validUntil: '',
    currency: 'KWD',
    subject: '',
    customerName: '',
    contactPerson: '',
    phone: '',
    project: '',
    items: [newItem()],
    notes: '',
    paymentTerms: 'الدفع خلال 30 يوماً من تاريخ الفاتورة',
  };
}

const inp: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 4,
  color: 'var(--text-muted)',
};

export default function Quotation() {
  const [profile, setProfile] = useState<ProfileId>(DEFAULT_PROFILE_ID);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState<QuotationPrintFields>(makeInitial);

  // Draft store
  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  // Print log
  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    const handler = () =>
      addPrintLog({
        formType: FORM_KEY,
        formNumber: printFields.quotationNumber,
        employeeName: printFields.customerName || '—',
        printProfile: profile,
      });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [printFields.quotationNumber, printFields.customerName, profile, addPrintLog]);

  // ── Item helpers ──────────────────────────────────────────────────────────

  function addItem() {
    setPrintFields((prev) => ({ ...prev, items: [...prev.items, newItem()] }));
  }

  function removeItem(id: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((i) => i.id !== id) : prev.items,
    }));
  }

  function updateItem(id: string, field: keyof Omit<QuotationItem, 'id'>, value: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    }));
  }

  function set<K extends keyof Omit<QuotationPrintFields, 'items'>>(key: K, value: QuotationPrintFields[K]) {
    setPrintFields((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    if (!window.confirm('سيتم مسح جميع الحقول. هل تريد المتابعة؟')) return;
    setPrintFields(makeInitial());
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <FormLayout
      ready={false}
      formNumber={printFields.quotationNumber || generateFormNumber(FORM_KEY)}
      title={lang === 'ar' ? 'عرض سعر' : 'Quotation'}
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title="حفظ مسودة"
            onClick={() => saveDraft(FORM_KEY, printFields)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title="استعادة المسودة"
              onClick={() => setPrintFields(draftEntry.state as QuotationPrintFields)}
            >
              ↩
            </button>
          )}
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              title="مسح المسودة"
              onClick={() => clearDraft(FORM_KEY)}
            >
              ✕
            </button>
          )}
        </>
      }
      qrData={{
        formType: FORM_KEY,
        formNumber: printFields.quotationNumber,
        employeeId: 0,
        employeeName: printFields.customerName || '—',
        issueDate: new Date().toISOString(),
      }}
    >
      {/* ── No-print panel ── */}
      <div
        className="no-print"
        style={{
          marginBottom: 16,
          padding: '14px 18px',
          background: 'var(--surface-2)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          حقول الطباعة فقط — لن تُحفظ
        </div>

        {/* Row 1: quotationNumber, date, validUntil, currency */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>رقم العرض</label>
            <input style={inp} value={printFields.quotationNumber}
              onChange={(e) => set('quotationNumber', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>التاريخ</label>
            <input type="date" lang="en" style={inp} value={printFields.date}
              onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>صالح حتى</label>
            <input type="date" lang="en" style={inp} value={printFields.validUntil}
              onChange={(e) => set('validUntil', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>العملة</label>
            <select title="العملة" style={inp} value={printFields.currency}
              onChange={(e) => set('currency', e.target.value)}>
              <option value="KWD">د.ك — KWD</option>
              <option value="USD">دولار — USD</option>
              <option value="SAR">ريال — SAR</option>
            </select>
          </div>
        </div>

        {/* Row 2: customerName, contactPerson, phone, project */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>اسم العميل</label>
            <input style={inp} value={printFields.customerName}
              onChange={(e) => set('customerName', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>جهة الاتصال</label>
            <input style={inp} value={printFields.contactPerson}
              onChange={(e) => set('contactPerson', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>الهاتف</label>
            <input style={inp} value={printFields.phone}
              onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>المشروع</label>
            <input style={inp} value={printFields.project}
              onChange={(e) => set('project', e.target.value)} />
          </div>
        </div>

        {/* Subject */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>الموضوع / Subject</label>
          <input style={inp} value={printFields.subject}
            onChange={(e) => set('subject', e.target.value)} />
        </div>

        {/* Items table */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={lbl}>البنود</label>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={addItem}>
              + إضافة بند
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', border: '1px solid var(--border)', width: '35%' }}>الوصف</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الكمية</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الوحدة</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'end', border: '1px solid var(--border)', width: '18%' }}>سعر الوحدة</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'end', border: '1px solid var(--border)', width: '15%' }}>الإجمالي</th>
                <th style={{ border: '1px solid var(--border)', width: '8%' }} />
              </tr>
            </thead>
            <tbody>
              {printFields.items.map((item) => {
                const total = (parseFloat(item.qty) || 0) * (parseFloat(item.unitPrice) || 0);
                return (
                  <tr key={item.id}>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input style={{ ...inp, padding: '3px 6px' }} value={item.description}
                        onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input type="number" lang="en" min="0" style={{ ...inp, padding: '3px 6px', textAlign: 'center' }}
                        value={item.qty} onChange={(e) => updateItem(item.id, 'qty', e.target.value)} />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input style={{ ...inp, padding: '3px 6px', textAlign: 'center' }} value={item.unit}
                        onChange={(e) => updateItem(item.id, 'unit', e.target.value)} />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                      <input type="number" lang="en" min="0" step="0.001" style={{ ...inp, padding: '3px 6px', textAlign: 'end' }}
                        value={item.unitPrice} onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)} />
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: '3px 6px', textAlign: 'end', fontWeight: 600, color: '#1d4e6f' }}>
                      {total > 0 ? total.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : '—'}
                    </td>
                    <td style={{ border: '1px solid var(--border)', padding: 3, textAlign: 'center' }}>
                      <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16, lineHeight: 1 }}
                        disabled={printFields.items.length === 1}
                        onClick={() => removeItem(item.id)}>
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Notes + terms */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>ملاحظات</label>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={printFields.notes}
              onChange={(e) => set('notes', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>شروط الدفع</label>
            <textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={printFields.paymentTerms}
              onChange={(e) => set('paymentTerms', e.target.value)} />
          </div>
        </div>

        {/* Reset */}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn secondary" style={{ fontSize: 12 }} onClick={resetForm}>
            ↺ إعادة تعيين
          </button>
        </div>
      </div>

      {/* ── Print template ── */}
      <QuotationTemplate printFields={printFields} lang={lang} />
    </FormLayout>
  );
}
```

- [ ] **Step 2: Register route in App.tsx**

After the existing HR form routes (before the `<Route element={<ProtectedRoute><Layout />...`), add:

```tsx
// Add imports at top:
import Quotation from './pages/Quotation';
import PurchaseRequest from './pages/PurchaseRequest'; // will exist after Task 8

// Add routes (before the Layout wrapper Route):
<Route path="/forms/quotation" element={<ProtectedRoute><Quotation /></ProtectedRoute>} />
<Route path="/forms/purchase-request" element={<ProtectedRoute><PurchaseRequest /></ProtectedRoute>} />
```

Note: Add only the `/forms/quotation` route now; `/forms/purchase-request` can be imported as a stub or added after Task 8. To avoid a TS error on the missing import, create `PurchaseRequest.tsx` as an empty placeholder first (one line: `export default function PurchaseRequest() { return null; }`) and replace it in Task 8.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Smoke test — navigate to /forms/quotation in the app**

Run `npm run dev`, log in, navigate to `/forms` — confirm the "عرض سعر" card is visible and clickable without selecting an employee. Click it, confirm the Quotation page opens, fill a few fields, verify the AR template renders with the entered data, verify "Add Item" and "Remove Item" work, verify the grand total updates. Switch to EN via the toggle. Print-preview.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/Quotation.tsx frontend/src/App.tsx
git commit -m "feat(forms): add Quotation form page and route"
```

---

## Task 7 — Part 1B: PurchaseRequestTemplate.tsx

**Files:**
- Create: `frontend/src/forms/PurchaseRequestTemplate.tsx`

**Interfaces:**
- Produces: exported `PurchaseRequestItem`, `PurchaseRequestPrintFields`, `default PurchaseRequestTemplate`
- Consumed by: `PurchaseRequest.tsx` (Task 8)

- [ ] **Step 1: Create frontend/src/forms/PurchaseRequestTemplate.tsx**

```tsx
import { CSSProperties } from 'react';
import {
  COMPANY_NAME,
  sectionHeader,
  tableWrapper,
  labelCell,
  valueCell,
  fmtDate,
  fmtDateEn,
  blankLine,
} from './shared/formStyles';

// ─── Exported interfaces ──────────────────────────────────────────────────────
// Future integration: replace requesterName/department with employee reference,
// replace items with inventory item references.

export interface PurchaseRequestItem {
  id: string;
  description: string;
  qty: string;
  unit: string;
  specification: string;
}

export type PriorityLevel = '' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface PurchaseRequestPrintFields {
  requestNumber: string;
  date: string;         // ISO YYYY-MM-DD
  requiredDate: string; // ISO YYYY-MM-DD
  // Requester block — future: { employeeId, employeeName, department }
  requesterName: string;
  department: string;
  priority: PriorityLevel;
  reason: string;
  // Items
  items: PurchaseRequestItem[];
  // Approval footer
  notes: string;
  requestedBy: string;
  reviewedBy: string;
  approvedBy: string;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const PRIORITY_AR: Record<string, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  URGENT: 'عاجل',
};

const PRIORITY_EN: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

// ─── Table styles ─────────────────────────────────────────────────────────────

const th: CSSProperties = {
  background: '#1d4e6f',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  padding: '5px 8px',
  border: '1px solid #bfd6e3',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const td: CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid #e2e8f0',
  verticalAlign: 'top',
};

// ─── InfoRow helper ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>{label}</div>
      <div style={valueCell}>
        {value.trim() ? value : <span style={blankLine} />}
      </div>
    </div>
  );
}

// ─── Approval row helper ──────────────────────────────────────────────────────

function ApprovalCell({ label, name }: { label: string; name: string }) {
  const line: CSSProperties = {
    borderBottom: '1px solid #64748b',
    display: 'inline-block',
    width: 140,
    marginBottom: 2,
  };
  return (
    <div style={{ flex: 1, padding: '8px 12px', textAlign: 'center', borderInlineEnd: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4e6f', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{name.trim() ? name : <span style={line} />}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>التوقيع: <span style={{ ...line, width: 80 }} /></div>
    </div>
  );
}

function ApprovalCellEn({ label, name }: { label: string; name: string }) {
  const line: CSSProperties = {
    borderBottom: '1px solid #64748b',
    display: 'inline-block',
    width: 140,
    marginBottom: 2,
  };
  return (
    <div style={{ flex: 1, padding: '8px 12px', textAlign: 'center', borderInlineEnd: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4e6f', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{name.trim() ? name : <span style={line} />}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>Signature: <span style={{ ...line, width: 80 }} /></div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

interface Props {
  printFields: PurchaseRequestPrintFields;
  lang?: 'ar' | 'en';
}

export default function PurchaseRequestTemplate({ printFields: pf, lang = 'ar' }: Props) {
  const isAr = lang !== 'en';

  // ── English path ─────────────────────────────────────────────────────────
  if (!isAr) {
    return (
      <div style={{ direction: 'ltr' }}>
        <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
          <strong>{COMPANY_NAME_EN}</strong> — Internal Purchase Request
        </p>

        {/* Request details */}
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Request Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Request No." value={pf.requestNumber} />
            <InfoRow label="Date" value={fmtDateEn(pf.date)} />
            <InfoRow label="Required Date" value={fmtDateEn(pf.requiredDate)} />
            <InfoRow label="Priority" value={pf.priority ? (PRIORITY_EN[pf.priority] ?? pf.priority) : '—'} />
          </div>
        </div>

        {/* Requester */}
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Requester Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Requester Name" value={pf.requesterName} />
            <InfoRow label="Department" value={pf.department} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>Reason</div>
              <div style={valueCell}>{pf.reason.trim() ? pf.reason : <span style={blankLine} />}</div>
            </div>
          </div>
        </div>

        {/* Items */}
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Requested Items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 30 }}>#</th>
                <th style={th}>Description</th>
                <th style={{ ...th, width: 60, textAlign: 'center' }}>Qty</th>
                <th style={{ ...th, width: 70, textAlign: 'center' }}>Unit</th>
                <th style={th}>Specification</th>
              </tr>
            </thead>
            <tbody>
              {pf.items.map((item, i) => (
                <tr key={item.id}>
                  <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                  <td style={td}>{item.description.trim() || <span style={blankLine} />}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                  <td style={td}>{item.specification.trim() || <span style={blankLine} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Notes */}
        {pf.notes.trim() && (
          <div style={{ ...tableWrapper, marginBottom: 10 }}>
            <div style={sectionHeader}>Notes</div>
            <div style={{ padding: '6px 12px', fontSize: 12 }}>{pf.notes}</div>
          </div>
        )}

        {/* Approval row */}
        <div style={{ ...tableWrapper, marginTop: 10 }}>
          <div style={sectionHeader}>Approvals</div>
          <div style={{ display: 'flex' }}>
            <ApprovalCellEn label="Requested By" name={pf.requestedBy} />
            <ApprovalCellEn label="Reviewed By" name={pf.reviewedBy} />
            <ApprovalCellEn label="Approved By" name={pf.approvedBy} />
          </div>
        </div>
      </div>
    );
  }

  // ── Arabic path ───────────────────────────────────────────────────────────
  return (
    <div style={{ direction: 'rtl' }}>
      <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
        <strong>{COMPANY_NAME}</strong> — طلب شراء داخلي
      </p>

      {/* Request details */}
      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>تفاصيل الطلب</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="رقم الطلب" value={pf.requestNumber} />
          <InfoRow label="التاريخ" value={fmtDate(pf.date)} />
          <InfoRow label="التاريخ المطلوب" value={fmtDate(pf.requiredDate)} />
          <InfoRow label="الأولوية" value={pf.priority ? (PRIORITY_AR[pf.priority] ?? pf.priority) : '—'} />
        </div>
      </div>

      {/* Requester */}
      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>بيانات مقدم الطلب</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="اسم مقدم الطلب" value={pf.requesterName} />
          <InfoRow label="القسم" value={pf.department} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>سبب الطلب</div>
            <div style={valueCell}>{pf.reason.trim() ? pf.reason : <span style={blankLine} />}</div>
          </div>
        </div>
      </div>

      {/* Items */}
      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>المواد المطلوبة</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 30 }}>#</th>
              <th style={th}>الوصف</th>
              <th style={{ ...th, width: 60, textAlign: 'center' }}>الكمية</th>
              <th style={{ ...th, width: 70, textAlign: 'center' }}>الوحدة</th>
              <th style={th}>المواصفات</th>
            </tr>
          </thead>
          <tbody>
            {pf.items.map((item, i) => (
              <tr key={item.id}>
                <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                <td style={td}>{item.description.trim() || <span style={blankLine} />}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                <td style={td}>{item.specification.trim() || <span style={blankLine} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {pf.notes.trim() && (
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>ملاحظات</div>
          <div style={{ padding: '6px 12px', fontSize: 12 }}>{pf.notes}</div>
        </div>
      )}

      {/* Approval row */}
      <div style={{ ...tableWrapper, marginTop: 10 }}>
        <div style={sectionHeader}>الاعتماد</div>
        <div style={{ display: 'flex' }}>
          <ApprovalCell label="طلب بواسطة" name={pf.requestedBy} />
          <ApprovalCell label="مراجعة بواسطة" name={pf.reviewedBy} />
          <ApprovalCell label="اعتماد بواسطة" name={pf.approvedBy} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/forms/PurchaseRequestTemplate.tsx
git commit -m "feat(forms): add PurchaseRequestTemplate (AR + EN)"
```

---

## Task 8 — Part 1B: PurchaseRequest.tsx page

**Files:**
- Create: `frontend/src/pages/PurchaseRequest.tsx` (replaces stub from Task 6)
- `frontend/src/App.tsx` already has the route (from Task 6)

**Interfaces:**
- Consumes: `PurchaseRequestItem`, `PurchaseRequestPrintFields`, `PriorityLevel` from `PurchaseRequestTemplate.tsx`
- Consumes: `FormLayout`, `PrintProfileToggle`, `LanguageToggle`, `generateFormNumber`, `usePrintLogStore`, `usePrintDraftStore`

- [ ] **Step 1: Write frontend/src/pages/PurchaseRequest.tsx**

```tsx
import { useState, useEffect } from 'react';
import { ProfileId, DEFAULT_PROFILE_ID } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PurchaseRequestTemplate, {
  type PurchaseRequestItem,
  type PurchaseRequestPrintFields,
  type PriorityLevel,
} from '../forms/PurchaseRequestTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';

const FORM_KEY = 'purchase-request';

function newItem(): PurchaseRequestItem {
  return { id: crypto.randomUUID(), description: '', qty: '', unit: '', specification: '' };
}

function makeInitial(): PurchaseRequestPrintFields {
  return {
    requestNumber: generateFormNumber(FORM_KEY),
    date: new Date().toISOString().slice(0, 10),
    requiredDate: '',
    requesterName: '',
    department: '',
    priority: '',
    reason: '',
    items: [newItem()],
    notes: '',
    requestedBy: '',
    reviewedBy: '',
    approvedBy: '',
  };
}

const inp: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 4,
  color: 'var(--text-muted)',
};

export default function PurchaseRequest() {
  const [profile, setProfile] = useState<ProfileId>(DEFAULT_PROFILE_ID);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState<PurchaseRequestPrintFields>(makeInitial);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    const handler = () =>
      addPrintLog({
        formType: FORM_KEY,
        formNumber: printFields.requestNumber,
        employeeName: printFields.requesterName || '—',
        printProfile: profile,
      });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [printFields.requestNumber, printFields.requesterName, profile, addPrintLog]);

  function addItem() {
    setPrintFields((prev) => ({ ...prev, items: [...prev.items, newItem()] }));
  }

  function removeItem(id: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((i) => i.id !== id) : prev.items,
    }));
  }

  function updateItem(id: string, field: keyof Omit<PurchaseRequestItem, 'id'>, value: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    }));
  }

  function set<K extends keyof Omit<PurchaseRequestPrintFields, 'items'>>(
    key: K,
    value: PurchaseRequestPrintFields[K],
  ) {
    setPrintFields((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    if (!window.confirm('سيتم مسح جميع الحقول. هل تريد المتابعة؟')) return;
    setPrintFields(makeInitial());
  }

  return (
    <FormLayout
      ready={false}
      formNumber={printFields.requestNumber || generateFormNumber(FORM_KEY)}
      title={lang === 'ar' ? 'طلب شراء' : 'Purchase Request'}
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 8px' }}
            title="حفظ مسودة" onClick={() => saveDraft(FORM_KEY, printFields)}>
            💾
          </button>
          {draftEntry && (
            <button type="button" className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title="استعادة المسودة"
              onClick={() => setPrintFields(draftEntry.state as PurchaseRequestPrintFields)}>
              ↩
            </button>
          )}
          {draftEntry && (
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '4px 8px' }}
              title="مسح المسودة" onClick={() => clearDraft(FORM_KEY)}>
              ✕
            </button>
          )}
        </>
      }
      qrData={{
        formType: FORM_KEY,
        formNumber: printFields.requestNumber,
        employeeId: 0,
        employeeName: printFields.requesterName || '—',
        issueDate: new Date().toISOString(),
      }}
    >
      {/* ── No-print panel ── */}
      <div className="no-print" style={{
        marginBottom: 16, padding: '14px 18px',
        background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10,
      }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          حقول الطباعة فقط — لن تُحفظ
        </div>

        {/* Row 1 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>رقم الطلب</label>
            <input style={inp} value={printFields.requestNumber}
              onChange={(e) => set('requestNumber', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>التاريخ</label>
            <input type="date" lang="en" style={inp} value={printFields.date}
              onChange={(e) => set('date', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>التاريخ المطلوب</label>
            <input type="date" lang="en" style={inp} value={printFields.requiredDate}
              onChange={(e) => set('requiredDate', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>الأولوية</label>
            <select title="الأولوية" style={inp} value={printFields.priority}
              onChange={(e) => set('priority', e.target.value as PriorityLevel)}>
              <option value="">— اختر —</option>
              <option value="LOW">منخفضة / Low</option>
              <option value="MEDIUM">متوسطة / Medium</option>
              <option value="HIGH">عالية / High</option>
              <option value="URGENT">عاجل / Urgent</option>
            </select>
          </div>
        </div>

        {/* Row 2 */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>اسم مقدم الطلب</label>
            <input style={inp} value={printFields.requesterName}
              onChange={(e) => set('requesterName', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>القسم</label>
            <input style={inp} value={printFields.department}
              onChange={(e) => set('department', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>سبب الطلب</label>
            <input style={inp} value={printFields.reason}
              onChange={(e) => set('reason', e.target.value)} />
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={lbl}>المواد المطلوبة</label>
            <button type="button" className="btn secondary" style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={addItem}>
              + إضافة مادة
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', border: '1px solid var(--border)', width: '30%' }}>الوصف</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الكمية</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الوحدة</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', border: '1px solid var(--border)' }}>المواصفات</th>
                <th style={{ border: '1px solid var(--border)', width: '8%' }} />
              </tr>
            </thead>
            <tbody>
              {printFields.items.map((item) => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input style={{ ...inp, padding: '3px 6px' }} value={item.description}
                      onChange={(e) => updateItem(item.id, 'description', e.target.value)} />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input type="number" lang="en" min="0" style={{ ...inp, padding: '3px 6px', textAlign: 'center' }}
                      value={item.qty} onChange={(e) => updateItem(item.id, 'qty', e.target.value)} />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input style={{ ...inp, padding: '3px 6px', textAlign: 'center' }} value={item.unit}
                      onChange={(e) => updateItem(item.id, 'unit', e.target.value)} />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input style={{ ...inp, padding: '3px 6px' }} value={item.specification}
                      onChange={(e) => updateItem(item.id, 'specification', e.target.value)} />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3, textAlign: 'center' }}>
                    <button type="button" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}
                      disabled={printFields.items.length === 1}
                      onClick={() => removeItem(item.id)}>
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Approval names + notes */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>طلب بواسطة</label>
            <input style={inp} value={printFields.requestedBy}
              onChange={(e) => set('requestedBy', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>مراجعة بواسطة</label>
            <input style={inp} value={printFields.reviewedBy}
              onChange={(e) => set('reviewedBy', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>اعتماد بواسطة</label>
            <input style={inp} value={printFields.approvedBy}
              onChange={(e) => set('approvedBy', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>ملاحظات</label>
          <textarea style={{ ...inp, minHeight: 52, resize: 'vertical' }} value={printFields.notes}
            onChange={(e) => set('notes', e.target.value)} />
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button type="button" className="btn secondary" style={{ fontSize: 12 }} onClick={resetForm}>
            ↺ إعادة تعيين
          </button>
        </div>
      </div>

      <PurchaseRequestTemplate printFields={printFields} lang={lang} />
    </FormLayout>
  );
}
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Smoke test both new forms**

Navigate to `/forms`, confirm both "عرض سعر" and "طلب شراء" cards are present and clickable without employee selection. Test add/remove items on both. Test draft save/restore/clear. Test language toggle. Test print preview.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/PurchaseRequest.tsx
git commit -m "feat(forms): add PurchaseRequest form page and route"
```

---

## Task 9 — Part 4: Draft Extension to 8 Existing HR Forms

**Files (all modify):** `LeaveRequest.tsx`, `ReturnToWork.tsx`, `SalaryAdvance.tsx`, `SalaryCertificate.tsx`, `ToWhomItMayConcern.tsx`, `EmployeeWarning.tsx`, `PerformanceEvaluation.tsx`, `Resignation.tsx`

**Pattern (apply identically to each form):**

**A. Add import** (if not present):
```typescript
import { usePrintDraftStore } from '../stores/printDraftStore';
```

**B. Add store subscriptions** (replace any existing `getDraft`/`saveDraft` calls):
```typescript
const FORM_KEY = 'leave-request'; // change per form
const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
const saveDraft = usePrintDraftStore((s) => s.saveDraft);
const clearDraft = usePrintDraftStore((s) => s.clearDraft);
```

**C. Add draft buttons to `toolbarExtra`** (after existing LanguageToggle / PrintProfileToggle):
```tsx
<button type="button" className="btn secondary"
  style={{ fontSize: 12, padding: '4px 8px' }}
  title="حفظ مسودة"
  onClick={() => saveDraft(FORM_KEY, printFields)}>
  💾
</button>
{draftEntry && (
  <button type="button" className="btn secondary"
    style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
    title="استعادة المسودة"
    onClick={() => setPrintFields(draftEntry.state as typeof printFields)}>
    ↩
  </button>
)}
{draftEntry && (
  <button type="button" className="btn secondary"
    style={{ fontSize: 12, padding: '4px 8px' }}
    title="مسح المسودة"
    onClick={() => clearDraft(FORM_KEY)}>
    ✕
  </button>
)}
```

**Form keys per file:**

| File | FORM_KEY |
|------|----------|
| LeaveRequest.tsx | `'leave-request'` |
| ReturnToWork.tsx | `'return-to-work'` |
| SalaryAdvance.tsx | `'salary-advance'` |
| SalaryCertificate.tsx | `'salary-certificate'` |
| ToWhomItMayConcern.tsx | `'to-whom-it-may-concern'` |
| EmployeeWarning.tsx | `'employee-warning'` |
| PerformanceEvaluation.tsx | `'performance-evaluation'` |
| Resignation.tsx | `'resignation'` |

- [ ] **Step 1: Apply pattern to all 8 forms** (edit each file per the pattern above)

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Smoke test one form** (LeaveRequest) — verify save draft, restore draft, and clear draft all work in the browser.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LeaveRequest.tsx \
        frontend/src/pages/ReturnToWork.tsx \
        frontend/src/pages/SalaryAdvance.tsx \
        frontend/src/pages/SalaryCertificate.tsx \
        frontend/src/pages/ToWhomItMayConcern.tsx \
        frontend/src/pages/EmployeeWarning.tsx \
        frontend/src/pages/PerformanceEvaluation.tsx \
        frontend/src/pages/Resignation.tsx
git commit -m "feat(forms): extend draft save/restore/clear to all 8 HR forms"
```

---

## Task 10 — Part 5: lang="en" Audit

**Files (inspect all HR form pages):** LeaveRequest, ReturnToWork, SalaryAdvance, SalaryCertificate, ToWhomItMayConcern, EmployeeWarning, PerformanceEvaluation, Resignation, EmploymentContract

**Context:** Forms Polish Pack v2 added `lang="en"` to all `type="number"` and `type="date"` inputs. This task is a verification pass that catches any regressions or missed inputs.

- [ ] **Step 1: Search all form pages for date/number inputs missing lang attribute**

```bash
cd frontend
grep -rn 'type="date"\|type="number"' src/pages/LeaveRequest.tsx src/pages/ReturnToWork.tsx src/pages/SalaryAdvance.tsx src/pages/SalaryCertificate.tsx src/pages/ToWhomItMayConcern.tsx src/pages/EmployeeWarning.tsx src/pages/PerformanceEvaluation.tsx src/pages/Resignation.tsx src/pages/EmploymentContract.tsx
```

- [ ] **Step 2: For any `type="date"` or `type="number"` line missing `lang="en"` on the same element, add it**

Example fix:
```tsx
// BEFORE:
<input type="date" value={printFields.someDate} onChange={...} />

// AFTER:
<input type="date" lang="en" value={printFields.someDate} onChange={...} />
```

The two new form pages (Quotation, PurchaseRequest) already have `lang="en"` on all number/date inputs per Tasks 6 and 8.

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 4: Commit (only if changes were needed)**

```bash
git add frontend/src/pages/
git commit -m "fix(forms): ensure lang=en on all date and number inputs"
```

If no changes were needed, skip this commit.

---

## Task 11 — Part 6: Reset / Clear Print Fields Buttons

**Files (all modify):** all 8 HR form pages

**Pattern (apply to each form):**

**A. Extract initial printFields as a module-level constant:**

```typescript
// At module top-level (before the component function):
const INITIAL_PRINT_FIELDS = {
  certPurpose: '',           // SalaryCertificate example
} as const;
// Use the exact same shape as the existing useState initializer
```

**B. Change useState to use the constant:**
```typescript
const [printFields, setPrintFields] = useState({ ...INITIAL_PRINT_FIELDS });
```

**C. Add reset handler inside the component:**
```typescript
function resetPrintFields() {
  if (!window.confirm('سيتم مسح جميع حقول الطباعة. هل تريد المتابعة؟')) return;
  setPrintFields({ ...INITIAL_PRINT_FIELDS });
}
```

**D. Add Reset button at the bottom of the no-print panel** (inside the `className="no-print"` div, after the last input):
```tsx
<div style={{ marginTop: 10 }}>
  <button type="button" className="btn secondary" style={{ fontSize: 12 }} onClick={resetPrintFields}>
    ↺ إعادة تعيين حقول الطباعة
  </button>
</div>
```

**Initial field shapes per form:**

| Form | INITIAL_PRINT_FIELDS shape |
|------|---------------------------|
| SalaryCertificate | `{ certPurpose: '' }` |
| ToWhomItMayConcern | `{ certPurpose: '' }` |
| LeaveRequest | `{ expectedReturnDate: '', leaveType: '' as LeaveType, startDate: '', endDate: '', days: '', reason: '' }` |
| ReturnToWork | `{ actualReturnDate: '', medicalNotes: '', leaveType: '', leaveStartDate: '', leaveEndDate: '', leaveDays: '' }` |
| SalaryAdvance | `{ advanceAmount: '', requestDate: '', reason: '', installments: '', installmentAmount: '' }` |
| EmployeeWarning | `{ warningDate: '', warningReason: '', violationDetails: '', correctiveAction: '', additionalNotes: '' }` |
| PerformanceEvaluation | `{ periodFrom: '', periodTo: '', overrideRating: '' as OverrideRating, scores: ['', '', '', '', ''] as string[], reviewerComments: '' }` |
| Resignation | `{ lastWorkingDay: '', noticePeriod: '', resignationReason: '', handoverObligations: '' }` |

Note: For forms where the printFields state has a complex union type (like `leaveType`), verify the cast is correct by checking the existing type annotation on the `useState` call. Copy the exact initial value from the existing `useState(...)` call.

- [ ] **Step 1: Apply pattern to all 8 HR form pages**

Read each file to find the exact `useState` initializer shape, then extract it as `INITIAL_PRINT_FIELDS` and add the reset button.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

- [ ] **Step 3: Smoke test** — open a form, fill some print fields, click "إعادة تعيين", confirm dialog, verify all print fields clear.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/
git commit -m "feat(forms): add reset print fields button to all HR forms"
```

---

## Task 12 — Part 7: Translation Helper Verification

**Context:** Dictionary-based translation helpers (`getNationalityEn`, `getJobTitleEn`) exist in `frontend/src/forms/shared/contractTranslations.ts` and are already wired into `EmploymentContract.tsx`'s NewEmployeeForm. The existing 8 HR form templates already call these functions on the EN render path. This task verifies the helpers are working and adds them to the Quotation and Purchase Request forms if applicable (they are not, since these forms have no nationality/job title fields).

- [ ] **Step 1: Read contractTranslations.ts and confirm it exports getNationalityEn and getJobTitleEn**

```bash
head -10 frontend/src/forms/shared/contractTranslations.ts
```

- [ ] **Step 2: Open EmploymentContract.tsx NewEmployeeForm, confirm "ترجمة ←" buttons fire getNationalityEn / getJobTitleEn**

No code change expected — just verification.

- [ ] **Step 3: Confirm 8 HR templates use these in their EN render paths**

```bash
grep -l "getNationalityEn\|getJobTitleEn" frontend/src/forms/*.tsx
```

Expected: `EmploymentContractTemplate.tsx` appears. The other 8 HR templates rely on `emp.nationality` (AR string) which the template renders directly in EN mode. If any EN-path template is showing raw Arabic nationality or job title without a lookup, add the call.

- [ ] **Step 4: Commit only if a fix was needed**

```bash
git add frontend/src/forms/
git commit -m "fix(forms): ensure EN templates use translation helpers for nationality/job title"
```

---

## Task 13 — Documentation (Parts 9 + 10)

**Files:**
- Create: `docs/invoice-templates/README.md`
- Create: `docs/superpowers/reports/2026-06-20-git-cleanup-report.md`

- [ ] **Step 1: Create docs/invoice-templates/README.md**

```markdown
# Invoice Templates — Future React Conversion

> Status: planning / pre-implementation. No production code exists here.
> This document records the intended architecture for a future React-based invoice print system.

## Current State

Invoices are printed via `frontend/src/pages/InvoicePreview.tsx` — a single React component that
renders a full invoice with items, payments, totals, and a company header, then triggers `window.print()`.

## Future Architecture

### Template Selection

When multiple invoice layouts are needed (e.g., by direction, language, or paper size), a
`InvoiceTemplateSelector` component will choose the correct template component based on:
- `invoice.direction` (SALES / PURCHASE)
- `invoice.invoiceType`
- a user-selected `printProfile` (plain-a4 / letterhead / custom)

### Print Profiles

The existing `PRINT_PROFILES` registry (`frontend/src/forms/shared/printProfiles.ts`) will extend
to include invoice-specific profiles:
- `invoice-a4`: standard A4, 10mm margins
- `invoice-letterhead`: leaves 40mm top for company letterhead paper
- `invoice-thermal`: 80mm wide thermal roll (future)

Adding a new profile requires only a new entry in `PRINT_PROFILES` — no component changes.

### React Template Files

Each template will live in `frontend/src/forms/invoice/`:
```
invoice/
  InvoiceTemplate.tsx       # default (current InvoicePreview inner content)
  InvoiceTemplateLandscape.tsx  # future
```

Templates receive a typed `FullInvoice` prop (already defined in `InvoicePreview.tsx`) and a
`profile: ProfileId` prop. They do NOT call APIs — data flows in from the page component.

### InvoicePreview Integration

`InvoicePreview.tsx` will pass invoice data directly to the selected template:
```tsx
<InvoiceTemplateSelector invoice={data} profile={profile} />
```

The no-print controls (collect, cancel, edit) stay in `InvoicePreview.tsx`. Only the print
section delegates to the template.

### Print Log

When `window.print()` fires, a print log entry is added via `usePrintLogStore` with:
- `formType: 'invoice'`
- `formNumber: invoice.invoiceNumber`
- `employeeName: invoice.customer?.name ?? invoice.supplier?.name ?? '—'`
- `printProfile: profile`

## Implementation Prerequisites

- [ ] Design final InvoiceTemplate layout (separate design doc)
- [ ] Decide on template selection rules (direction? type? both?)
- [ ] Add invoice profile IDs to PRINT_PROFILES
- [ ] Migrate existing InvoicePreview.tsx inner content to InvoiceTemplate.tsx
- [ ] Wire InvoiceTemplateSelector into InvoicePreview.tsx
```

- [ ] **Step 2: Create docs/superpowers/reports/2026-06-20-git-cleanup-report.md**

```markdown
# Git Repository Cleanup Report — 2026-06-20

> Documentation only. No branches deleted, no files removed, no .gitignore changes applied.
> This report is a reference for a future cleanup pass.

## Branch Inventory

As of 2026-06-20, the repository contains a large number of merged feature branches.
The following categories were identified:

### Safely Deletable (merged into production, stable tag exists)
All branches with the pattern `feature/*` whose tip commit appears in the `production` branch
history can be deleted. Run to identify them:
```bash
git branch --merged production | grep "feature/"
```

Estimated count: 80+ branches (see `git branch` output — most feature/* entries).

Notable examples already merged:
- `feature/ui-typography-refresh-v1` → `stable-ui-typography-refresh-v1`
- `feature/forms-polish-pack-v2` → `stable-forms-polish-pack-v2`
- `feature/employment-contract-form` → `stable-employment-contract-form-v1`
- (and ~75 more)

### Hotfix branches (merged):
- `hotfix/invoice-conflict-message`
- `hotfix/invoice-preview-cleanup`
- `hotfix/invoice-print-single-page`

### Active / Keep:
- `production` — current stable branch
- `main` — base branch
- `feature/forms-operations-polish-v3` — current feature (in progress)

## Large Tracked Files

The following untracked or tracked large files were observed and may warrant `.gitignore` additions:

| File | Size | Recommendation |
|------|------|----------------|
| `manarERP-production-26ae2da.zip` | ~large | Add `*.zip` to `.gitignore` |
| `docs/AlManar_Official_Forms_v1.pdf` | — | Add `docs/*.pdf` to `.gitignore` or move to a separate assets repo |
| `docs/AlManar_Official_Forms_v2.pdf` | — | Same |
| `docs/contractv2.xlsx` | — | Add `docs/*.xlsx` to `.gitignore` |
| `frontend/src/assets/fonts/` | — | Verify these are not duplicated from `@fontsource` packages |

## Recommended .gitignore Additions

```gitignore
# Distribution archives
*.zip
*.tar.gz

# Document exports (keep source, not rendered copies)
docs/*.pdf
docs/*.xlsx

# macOS
.DS_Store
```

## Recommended Cleanup Procedure (future, requires team approval)

1. Run `git branch --merged production | grep "feature/" | xargs git branch -d` to delete local merged branches
2. Run `git push origin --delete <branch>` for each remote merged branch
3. Add `.gitignore` entries above and commit
4. Remove large binary files from tracking if needed (requires `git filter-repo` — plan carefully)

No action taken in this report. All changes require explicit approval before execution.
```

- [ ] **Step 3: Commit**

```bash
git add docs/invoice-templates/README.md \
        docs/superpowers/reports/2026-06-20-git-cleanup-report.md
git commit -m "docs: add invoice templates README and git cleanup report"
```

---

## Task 14 — Final Validation Pass

**Files:** none modified (validation only)

- [ ] **Step 1: Full TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
cd ../backend && npx tsc --noEmit
cd .. && npx tsc -p electron/tsconfig.json --noEmit
```

Expected: zero errors on all three.

- [ ] **Step 2: Prisma validate**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at prisma\schema.prisma is valid 🚀`

- [ ] **Step 3: Run tests**

```bash
npm test
```

Expected: 424/424 passing (no backend changes = no test count change).

- [ ] **Step 4: Build backend**

```bash
npm run build:back
```

Expected: clean build, zero errors.

- [ ] **Step 5: Build frontend**

```bash
npm run build:front
```

Expected: `✓ built in ~Xs`

- [ ] **Step 6: Confirm git status is clean (no unintended files)**

```bash
git status
```

Expected: working tree clean except for any pre-existing untracked files (png, pdf, xlsx, etc. that were already untracked before this branch).

- [ ] **Step 7: Commit summary if needed**

```bash
git log --oneline feature/forms-operations-polish-v3 ^production
```

Review all commits on this branch. Confirm every commit message is meaningful.

---

## Validation Table (expected results after all tasks)

| Command | Expected Result |
|---------|----------------|
| `cd frontend && npx tsc --noEmit` | ✓ no errors |
| `cd backend && npx tsc --noEmit` | ✓ no errors |
| `npx tsc -p electron/tsconfig.json --noEmit` | ✓ no errors |
| `cd backend && npx prisma validate` | ✓ schema valid |
| `npm test` | ✓ 424/424 passed |
| `npm run build:back` | ✓ clean |
| `npm run build:front` | ✓ built |

---

## Regression Risks

| Risk | Mitigation |
|------|-----------|
| `FormCard.requiresEmployee` change breaks existing handlePrint | The guard `card.requiresEmployee !== false` keeps existing behavior: undefined === true |
| Draft restore casts `unknown` state to `typeof printFields` | The `as` cast is safe because save and restore always use the same form key. TypeScript can't verify at runtime but the shape is identical. |
| EmploymentContractTemplate spacing change causes 3rd page | Verify in print-preview after Task 2; only reduce by 2px, not drastic. |
| PrintLogPanel search state persists between re-renders incorrectly | Search is local `useState`, resets on component remount — correct behavior. |
| `crypto.randomUUID()` not available in Electron's Node context | This runs in the renderer process (Chromium 124+), where `crypto.randomUUID()` is available. |
| `gridColumn: '1 / -1'` inside a 2-column grid in the template | The grid parent must be the immediate parent of the spanning div. Verify layout in screen mode before printing. |

## Rollback Plan

If any task introduces a regression that cannot be quickly fixed:

```bash
# Revert to the last known-good commit on this branch:
git log --oneline feature/forms-operations-polish-v3 ^production
git revert <bad-commit-hash>
# OR discard the entire branch and restart from production:
git checkout production
git branch -D feature/forms-operations-polish-v3
git checkout -b feature/forms-operations-polish-v3
```

No production impact until an explicit merge is performed.

---

## Gemini Review Prompt Outline

When implementation is complete and all validation passes, submit to Gemini for review with the following prompt:

```
You are performing a pre-merge architecture and security review of a frontend-only feature branch for manarERP — an Electron offline desktop ERP.

Branch: feature/forms-operations-polish-v3
Base: production

## Scope of changes
- 2 new standalone print form pages: Quotation (عرض سعر) and Purchase Request (طلب شراء)
- 2 new print templates: QuotationTemplate.tsx, PurchaseRequestTemplate.tsx
- Print log search added to PrintLogPanel
- Draft save/restore/clear extended to 8 existing HR form pages
- Reset print fields button added to 8 existing HR form pages
- Employment Contract header spacing reduced
- lang="en" audit on date/number inputs
- 2 doc files (no production impact)

## Files NOT changed
backend/, prisma/, electron/, package.json — no backend, no schema, no migrations, no packages

## Questions for review
1. Are the exported interfaces (QuotationPrintFields, PurchaseRequestPrintFields) designed for future backend integration without template changes?
2. Any TypeScript type safety concerns with `draftEntry.state as QuotationPrintFields`?
3. Any print-layout or RTL/LTR issues in the template render paths?
4. Any regression risk in Forms.tsx `requiresEmployee` guard change?
5. Any accessibility concerns with the icon-only draft buttons (💾 ↩ ✕)?
6. Are the item add/remove/update handlers correct and leak-free?
7. Any concerns with using `employeeId: 0` in QRData for standalone forms?

Please review the full diff and provide: APPROVED / NEEDS_CHANGES with specific findings.
```

---

*Plan written: 2026-06-20. Do not implement until this plan is approved.*

# Phase A — Print & Forms Polish: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Add full English-language output to the three form templates that currently lack it, make the shared `ApprovalSection` bilingual, and harden long-text wrapping so nothing overflows or breaks across a print page.

**Architecture:** All work is pure frontend — no API, no Prisma, no Electron changes. Each template already receives a `lang: 'ar' | 'en'` prop; missing English branches are added following the exact pattern used in `SalaryCertificateTemplate.tsx`. Shared infrastructure (`ApprovalSection`, `formStyles`, `contractTranslations`) is extended rather than duplicated.

**Tech Stack:** React 18, TypeScript 5.5, print CSS (`@media print`), existing `formStyles.ts` helpers.

**See also:** Master plan — `2026-06-26-operations-suite-master-plan.md`

## Global Constraints

- Arabic is always the default; `lang` prop defaults to `'ar'` on every template.
- One template file per form — no separate `*En.tsx` files.
- `@media print` rules go inside the template's own `buildPrintCSS` function (same pattern as `EmploymentContractTemplate`).
- `page-break-inside: avoid` on every signature and approval block.
- Zero new npm dependencies.
- `cd frontend && npx tsc --noEmit` must pass after every task.

---

## Repository Snapshot (relevant files)

### Files to modify

| File | Change |
|---|---|
| `frontend/src/forms/shared/ApprovalSection.tsx` | Accept `lang?: 'ar' \| 'en'` prop; render English labels when `en` |
| `frontend/src/forms/shared/contractTranslations.ts` | Expand job titles (~30 more entries), add priority-label maps |
| `frontend/src/forms/shared/formStyles.ts` | Export `longTextCell` style (word-wrap + overflow-wrap) |
| `frontend/src/forms/EmploymentContractTemplate.tsx` | Add full English branch (`lang === 'en'` renders EN layout) |
| `frontend/src/forms/PurchaseRequestTemplate.tsx` | Add English branch; translate labels, priority values, approval rows |
| `frontend/src/forms/QuotationTemplate.tsx` | Add English branch; translate labels and column headers |

### Files to create

None.

---

## Task A-1 — Expand shared translations and add longText style

**Files:**
- Modify: `frontend/src/forms/shared/contractTranslations.ts`
- Modify: `frontend/src/forms/shared/formStyles.ts`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — produces:**
```typescript
// contractTranslations.ts additions
export function getPriorityEn(ar: string | null | undefined): string
export function getPriorityLabelEn(key: string): string
// formStyles.ts addition
export const longTextCell: CSSProperties
```

- [ ] **Step 1:** In `contractTranslations.ts`, extend `JOB_TITLE_EN` with at minimum these entries and export `getPriorityLabelEn`:

```typescript
// append inside JOB_TITLE_EN:
'مشغل معدات ثقيلة': 'HEAVY EQUIPMENT OPERATOR',
'مشغل حفار': 'EXCAVATOR OPERATOR',
'مشغل مدحلة': 'ROLLER OPERATOR',
'مشغل شيول': 'WHEEL LOADER OPERATOR',
'سائق شاحنة قلاب': 'DUMP TRUCK DRIVER',
'ميكانيكي': 'MECHANIC',
'كهربائي': 'ELECTRICIAN',
'لحام': 'WELDER',
'نجار': 'CARPENTER',
'بناء': 'MASON',
'مساعد سائق': 'DRIVER ASSISTANT',
'مراقب': 'INSPECTOR',
'مدير مشروع': 'PROJECT MANAGER',
'مهندس مدني': 'CIVIL ENGINEER',
'مهندس ميداني': 'FIELD ENGINEER',
'مسؤول مخازن': 'STOREKEEPER',
'عامل مستودع': 'WAREHOUSE WORKER',
'مساح': 'SURVEYOR',
'مساعد إداري': 'ADMINISTRATIVE ASSISTANT',
'سكرتير': 'SECRETARY',
'مدير مالي': 'FINANCIAL MANAGER',
'مدير موارد بشرية': 'HR MANAGER',
'مسؤول مشتريات': 'PROCUREMENT OFFICER',

// append inside NATIONALITY_EN:
'عراقي': 'IRAQI',
'عراقية': 'IRAQI',
'سوداني': 'SUDANESE',
'سودانية': 'SUDANESE',
'تونسي': 'TUNISIAN',
'تونسية': 'TUNISIAN',
'مغربي': 'MOROCCAN',
'مغربية': 'MOROCCAN',
'لبناني': 'LEBANESE',
'لبنانية': 'LEBANESE',
'ميانماري': 'MYANMAR',
'ميانمارية': 'MYANMAR',
'كيني': 'KENYAN',
'كينية': 'KENYAN',
'غاني': 'GHANAIAN',
'غانية': 'GHANAIAN',
```

Then add at the bottom of the file:

```typescript
const PRIORITY_EN: Record<string, string> = {
  LOW:    'Low',
  MEDIUM: 'Medium',
  HIGH:   'High',
  URGENT: 'Urgent',
};

export function getPriorityLabelEn(key: string): string {
  return PRIORITY_EN[key.toUpperCase()] ?? key;
}
```

- [ ] **Step 2:** In `formStyles.ts`, add after the last export:

```typescript
export const longTextCell: CSSProperties = {
  wordWrap: 'break-word',
  overflowWrap: 'break-word',
  whiteSpace: 'pre-wrap',
  maxWidth: '100%',
};
```

- [ ] **Step 3:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit:

```
git add frontend/src/forms/shared/contractTranslations.ts frontend/src/forms/shared/formStyles.ts
git commit -m "feat(forms): expand contractTranslations and add longTextCell style"
```

---

## Task A-2 — Make ApprovalSection bilingual

**Files:**
- Modify: `frontend/src/forms/shared/ApprovalSection.tsx`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — consumes:**
- Nothing from A-1.

**Interfaces — produces:**
```typescript
// ApprovalSection now accepts:
interface Props { lang?: 'ar' | 'en'; title?: string; }
export default function ApprovalSection({ lang, title }: Props): JSX.Element
```

- [ ] **Step 1:** Replace the entire contents of `ApprovalSection.tsx` with:

```typescript
import { CSSProperties } from 'react';

interface Props {
  lang?: 'ar' | 'en';
  title?: string;
}

const line: CSSProperties = {
  borderBottom: '1px solid #64748b',
  display: 'inline-block',
  width: 200,
  marginBottom: 2,
};

const LABELS = {
  ar: {
    defaultTitle: 'اعتماد المدير المباشر',
    signature:    'التوقيع:',
    date:         'التاريخ:',
    stamp:        'الختم الرسمي',
  },
  en: {
    defaultTitle: 'Direct Manager Approval',
    signature:    'Signature:',
    date:         'Date:',
    stamp:        'Official Stamp',
  },
} as const;

export default function ApprovalSection({ lang = 'ar', title }: Props) {
  const L = LABELS[lang];
  const dir = lang === 'en' ? 'ltr' : 'rtl';

  return (
    <div
      style={{
        pageBreakInside: 'avoid',
        breakInside: 'avoid',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        direction: dir,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#1d4e6f', marginBottom: 16 }}>
        {title ?? L.defaultTitle}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: '#374151' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ minWidth: 80, fontWeight: 600 }}>{L.signature}</span>
          <span style={line} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ minWidth: 80, fontWeight: 600 }}>{L.date}</span>
          <span>____ / ____ / ______</span>
        </div>
        <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: '#374151' }}>
          {L.stamp}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors. If any callers of `ApprovalSection` fail because they previously passed no props, that is fine — `lang` defaults to `'ar'` and behavior is unchanged.

- [ ] **Step 3:** Commit:

```
git add frontend/src/forms/shared/ApprovalSection.tsx
git commit -m "feat(forms): make ApprovalSection bilingual (lang prop)"
```

---

## Task A-3 — Add English branch to EmploymentContractTemplate

**Files:**
- Modify: `frontend/src/forms/EmploymentContractTemplate.tsx`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — consumes:**
- `getNationalityEn`, `getJobTitleEn` from `contractTranslations.ts` (already imported)
- `lang?: 'ar' | 'en'` prop already exists on `ContractParams`-like shape — add it to the component `Props`

**Interfaces — produces:**
- `EmploymentContractTemplate` now accepts `lang?: 'ar' | 'en'` and renders a full EN layout when `'en'`.

- [ ] **Step 1:** Locate the component signature in `EmploymentContractTemplate.tsx`. Add `lang?: 'ar' | 'en'` to the props interface if not already present, and destructure it with a default of `'ar'`.

- [ ] **Step 2:** After the existing Arabic render block, add an English render block that mirrors the Arabic layout but uses English labels. The English section must:
  - Set `direction: 'ltr'` on the root wrapper.
  - Replace every Arabic heading and label with the English equivalent (see label map below).
  - Call `getJobTitleEn(emp.jobTitle)` and `getNationalityEn(emp.nationality)` for those two fields.
  - Call `ApprovalSection` with `lang="en"`.
  - Wrap all cell content that may be long (`specialConditionsEn`, notes) with `longTextCell` from `formStyles`.
  - Keep `page-break-inside: avoid` on every signature row.

English label map for the contract form:
```
'عقد عمل'                   → 'Employment Contract'
'بيانات صاحب العمل'         → 'Employer Details'
'بيانات الموظف'             → 'Employee Details'
'الاسم الكامل'              → 'Full Name'
'الرقم المدني'              → 'Civil ID'
'الجنسية'                   → 'Nationality'
'المهنة'                    → 'Job Title'
'رقم جواز السفر'            → 'Passport No.'
'الراتب الأساسي'            → 'Basic Salary'
'تاريخ بدء العقد'           → 'Contract Start Date'
'مدة العقد'                 → 'Contract Duration'
'فترة التجربة'              → 'Probation Period'
'أيام الإجازة السنوية'      → 'Annual Leave Days'
'الشروط الخاصة'             → 'Special Conditions'
'شروط إنهاء العقد'          → 'Termination Terms'
'توقيع صاحب العمل'          → 'Employer Signature'
'توقيع الموظف'              → 'Employee Signature'
'd.k' / 'KWD'               → 'KWD'
```

- [ ] **Step 3:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Open the app in dev mode, navigate to the employment contract form, switch language toggle to EN, and confirm the English layout renders. Verify print preview shows no broken rows.

- [ ] **Step 5:** Commit:

```
git add frontend/src/forms/EmploymentContractTemplate.tsx
git commit -m "feat(forms): add English branch to EmploymentContractTemplate"
```

---

## Task A-4 — Add English branch to PurchaseRequestTemplate

**Files:**
- Modify: `frontend/src/forms/PurchaseRequestTemplate.tsx`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — consumes:**
- `getPriorityLabelEn` from `contractTranslations.ts` (Task A-1)
- `longTextCell` from `formStyles.ts` (Task A-1)
- `ApprovalSection` with `lang` prop (Task A-2)

- [ ] **Step 1:** Add `lang?: 'ar' | 'en'` to `PurchaseRequestPrintFields` and destructure with default `'ar'` in the component.

- [ ] **Step 2:** Replace the Arabic-only PRIORITY_AR usage with a combined helper that checks `lang`:

```typescript
function priorityLabel(key: string, lang: 'ar' | 'en'): string {
  if (lang === 'en') return getPriorityLabelEn(key);
  const PRIORITY_AR: Record<string, string> = {
    LOW: 'منخفضة', MEDIUM: 'متوسطة', HIGH: 'عالية', URGENT: 'عاجل',
  };
  return PRIORITY_AR[key] ?? key;
}
```

- [ ] **Step 3:** Wrap the existing Arabic render in `if (lang !== 'en') { ... }` and add an English render block with these translated labels:

```
'طلب شراء'              → 'Purchase Request'
'رقم الطلب'             → 'Request No.'
'التاريخ'               → 'Date'
'التاريخ المطلوب'        → 'Required Date'
'مقدم الطلب'            → 'Requested By'
'القسم'                 → 'Department'
'الأولوية'              → 'Priority'
'سبب الطلب'             → 'Reason'
'البند'                 → 'Item'
'الوصف'                 → 'Description'
'الكمية'                → 'Qty'
'الوحدة'                → 'Unit'
'المواصفات'             → 'Specifications'
'ملاحظات'               → 'Notes'
'مراجع من'              → 'Reviewed By'
'معتمد من'              → 'Approved By'
```

- [ ] **Step 4:** Apply `longTextCell` to the `reason`, `notes`, and `specification` columns.

- [ ] **Step 5:** Pass `lang` to `<ApprovalSection lang={lang} />`.

- [ ] **Step 6:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7:** Commit:

```
git add frontend/src/forms/PurchaseRequestTemplate.tsx
git commit -m "feat(forms): add English branch to PurchaseRequestTemplate"
```

---

## Task A-5 — Add English branch to QuotationTemplate

**Files:**
- Modify: `frontend/src/forms/QuotationTemplate.tsx`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — consumes:**
- `longTextCell` from `formStyles.ts` (Task A-1)
- `currSym` helper already exists in the file, already supports `en`

- [ ] **Step 1:** Add `lang?: 'ar' | 'en'` to `QuotationPrintFields`. Destructure with default `'ar'`.

- [ ] **Step 2:** Add an English render block using these translated labels:

```
'عرض سعر'                → 'Price Quotation'
'رقم عرض السعر'          → 'Quotation No.'
'التاريخ'                → 'Date'
'صالح حتى'               → 'Valid Until'
'العملة'                 → 'Currency'
'الموضوع'                → 'Subject'
'العميل'                 → 'Customer'
'جهة الاتصال'            → 'Contact Person'
'الهاتف'                 → 'Phone'
'المشروع'                → 'Project'
'البند'                  → 'Item'
'الوصف'                  → 'Description'
'الكمية'                 → 'Qty'
'الوحدة'                 → 'Unit'
'سعر الوحدة'             → 'Unit Price'
'الإجمالي'               → 'Total'
'المجموع'                → 'Subtotal'
'ملاحظات'                → 'Notes'
'شروط الدفع'             → 'Payment Terms'
'توقيع'                  → 'Signature'
```

- [ ] **Step 3:** Apply `longTextCell` to description and notes columns.

- [ ] **Step 4:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Commit:

```
git add frontend/src/forms/QuotationTemplate.tsx
git commit -m "feat(forms): add English branch to QuotationTemplate"
```

---

## Phase A Summary

| | Count |
|---|---|
| Files modified | 6 |
| Files created | 0 |
| Estimated new LOC | ~380 |
| Prisma migrations | 0 |
| Backend changes | 0 |
| Electron changes | 0 |

**Risks:**
- `EmploymentContractTemplate` is the most complex (multi-page, bilingual paragraphs). The English branch may need manual print preview testing to verify page breaks. Allow extra time here.
- Job title/nationality fallback: if `getJobTitleEn` returns the Arabic string as-is (unknown title), that is acceptable and expected. No crash risk.

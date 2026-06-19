# Print Profiles & Forms Completion — Design Spec

**Branch:** `feature/print-profiles-forms-completion-v1`  
**Date:** 2026-06-19  
**Status:** Approved — ready for implementation

---

## Overview

This document is the canonical print architecture design for manarERP.

It covers:
- A generic, extensible `PrintProfile` system for all printable documents
- Migration of the 9 existing HR form pages to the new system
- A reusable `PrintProfileToggle` UI component
- Warning level interactivity on the Employee Warning form (Option B)
- Missing print-only fields on SalaryCertificate, ToWhomItMayConcern, and LeaveRequest
- A future-extensibility contract that all new modules must follow

**Constraints:**
- Frontend / print-layout only
- No backend changes
- No Prisma changes
- No new npm packages
- No accounting, payroll, or API contract changes
- Plain A4 is and must remain the default

---

## Section 1 — Core Types & Config

### File: `frontend/src/forms/shared/printProfiles.ts` (new)

This file is the **single source of truth** for all print profile definitions.
No margin values may be hardcoded elsewhere.

```typescript
export interface PrintProfile {
  id: string;
  labelAr: string;
  labelEn: string;
  page: {
    size: 'A4';                          // extensible to 'A3', 'Letter', etc. in future
    orientation: 'portrait' | 'landscape';
  };
  margins: {
    top: string;     // CSS length, e.g. '10mm'
    right: string;
    bottom: string;
    left: string;
  };
}

export const PRINT_PROFILES: Record<string, PrintProfile> = {
  'plain-a4': {
    id: 'plain-a4',
    labelAr: 'A4 عادي',
    labelEn: 'Plain A4',
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  },
  'letterhead': {
    id: 'letterhead',
    labelAr: 'ورق الشركة الرسمي',
    labelEn: 'Al Manar Letterhead',
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' },
  },
  // Future profiles are added here only. No API or component changes required.
  // Examples (not implemented in this branch):
  //
  // 'letterhead-en': { ... },
  // 'invoice-template-a': { ... },
  // 'invoice-template-b': { ... },
  // 'purchase-order': { ... },
};

/**
 * ProfileId is derived from the registry keys.
 * Adding a new profile to PRINT_PROFILES automatically widens this type.
 */
export type ProfileId = keyof typeof PRINT_PROFILES;

export const DEFAULT_PROFILE_ID: ProfileId = 'plain-a4';

/**
 * Reads the legacy ?printMode URL param to seed initial profile state.
 * Called once at mount. Never updates the URL after that.
 */
export function getProfileIdFromSearch(search: string): ProfileId {
  const mode = new URLSearchParams(search).get('printMode');
  return mode === 'letterhead' ? 'letterhead' : DEFAULT_PROFILE_ID;
}

/**
 * Returns a CSS padding shorthand string for the given profile.
 * Extensible: future versions may return additional CSS properties.
 *
 * @example
 * getPrintProfileStyle(PRINT_PROFILES['letterhead'])
 * // → '40mm 10mm 20mm 10mm'
 */
export function getPrintProfileStyle(profile: PrintProfile): string {
  const { top, right, bottom, left } = profile.margins;
  return `${top} ${right} ${bottom} ${left}`;
}
```

### Key design rules for this file

- `PRINT_PROFILES` is a plain object registry. New profiles are entries, not subclasses.
- `ProfileId` is always derived from the registry — never manually maintained as a union type.
- `getPrintProfileStyle` is named generically so it can be extended to return additional CSS
  properties (orientation, page size, header offset) without a breaking rename.
- The `page` block exists today for forward compatibility even though it drives no behavior yet.
- `printMode.ts` (the existing file) is **not deleted**. It stays for backward compatibility
  with any code that still imports `PrintMode` or `getPrintMode`. New code uses `printProfiles.ts`.

---

## Section 2 — FormLayout Migration

### File: `frontend/src/forms/shared/FormLayout.tsx` (modified)

**Prop change:**

```typescript
// Before
interface FormLayoutProps {
  printMode: PrintMode;   // URL-derived
  ...
}

// After
interface FormLayoutProps {
  profile: ProfileId;     // React state, initialized once from URL
  ...
}
```

The `printMode` prop is removed entirely. TypeScript enforces this — all call sites must pass `profile`.

**Dynamic print CSS:**

The `<style>` tag is rendered with profile-aware padding:

```tsx
const activeProfile = PRINT_PROFILES[profile];
const padding = getPrintProfileStyle(activeProfile);

<style>{`
  @media print {
    @page { size: A4; margin: 0; }
    html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
    .no-print { display: none !important; }
    .form-page {
      width: 210mm !important;
      height: 297mm !important;
      padding: ${padding} !important;
      box-sizing: border-box !important;
      overflow: hidden !important;
      margin: 0 !important;
      max-width: none !important;
    }
  }
`}</style>
```

**FormHeader prop change:**

```tsx
// Before
<FormHeader printMode={printMode} />

// After
<FormHeader isLetterhead={profile === 'letterhead'} />
```

`FormHeader` is updated to accept `isLetterhead: boolean` instead of `printMode: PrintMode`.
When `isLetterhead` is true, the built-in company header uses `visibility: hidden`
(space is preserved so content does not shift; the pre-printed header on physical paper
occupies that space instead).

**Toolbar status text:**

```tsx
<span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
  {PRINT_PROFILES[profile].labelAr} — {formNumber}
</span>
```

**All other FormLayout behavior is unchanged:**
- Auto-print timer (600ms after `ready`)
- Back button
- Approval section
- QR code
- `toolbarExtra` slot
- Slot layout

---

## Section 3 — Per-Page Integration

### 8 pages using FormLayout

Affected files:
- `frontend/src/pages/SalaryCertificate.tsx`
- `frontend/src/pages/ToWhomItMayConcern.tsx`
- `frontend/src/pages/LeaveRequest.tsx`
- `frontend/src/pages/ReturnToWork.tsx`
- `frontend/src/pages/SalaryAdvance.tsx`
- `frontend/src/pages/EmployeeWarning.tsx`
- `frontend/src/pages/PerformanceEvaluation.tsx`
- `frontend/src/pages/Resignation.tsx`

**Migration pattern (identical for all 8):**

```tsx
// Remove:
const printMode = getPrintMode(search);

// Add:
const [profile, setProfile] = useState<ProfileId>(
  () => getProfileIdFromSearch(search)
);

// FormLayout:
<FormLayout
  profile={profile}
  toolbarExtra={
    <>
      <LanguageToggle lang={lang} onChange={setLang} />
      <PrintProfileToggle profile={profile} onChange={setProfile} />
    </>
  }
  ...
>
```

- Profile is initialized once from the URL param (`?printMode=letterhead` still works as an entry point)
- After page load, all changes go through React state only
- The URL is never updated when toggling
- Plain A4 is the default when no URL param is present
- No data loading logic is touched

### EmploymentContract — special case

**File:** `frontend/src/pages/EmploymentContract.tsx`

EmploymentContract does not use `FormLayout`. It has its own preview toolbar and isolated print CSS.

Changes:
1. Add profile state at the top of the `EmploymentContract` component:
   ```tsx
   const [profile, setProfile] = useState<ProfileId>(DEFAULT_PROFILE_ID);
   ```
   No URL seed (the contract flow has no `?printMode` support currently).

2. Add `<PrintProfileToggle>` to the no-print preview toolbar:
   ```tsx
   <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
     <button className="btn" onClick={() => window.print()}>🖨️ طباعة / حفظ PDF</button>
     <button className="btn secondary" onClick={() => setMode('params')}>✏️ تعديل البيانات</button>
     <button className="btn secondary" onClick={...}>رجوع</button>
     <PrintProfileToggle profile={profile} onChange={setProfile} />  {/* new */}
     <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
       {formNumber}
     </span>
   </div>
   ```

3. Pass `profile` to `EmploymentContractTemplate`:
   ```tsx
   <EmploymentContractTemplate employee={employee} params={params} profile={profile} />
   ```

4. Update print log to capture the actual profile:
   ```tsx
   printMode: profile,   // was hardcoded 'full-template'
   ```

**File:** `frontend/src/forms/EmploymentContractTemplate.tsx`

- `PRINT_CSS` constant is replaced with `buildContractPrintCSS(profile: ProfileId): string`
- The `.ec-page` padding uses `getPrintProfileStyle(PRINT_PROFILES[profile])`
- All other contract CSS (`.ec-p1` page break, `.ec-p2`, `.ec-row`, `.ec-cell`) is unchanged
- The two-page layout is completely preserved:
  - Page 1 = Articles 1–6
  - Page 2 = Article 7 onward + signatures + NOTE

```tsx
function buildContractPrintCSS(profile: ProfileId): string {
  const padding = getPrintProfileStyle(PRINT_PROFILES[profile]);
  return `
    @media print {
      @page { size: A4; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
      .no-print { display: none !important; }
      .ec-page {
        width: 210mm !important;
        padding: ${padding} !important;
        box-sizing: border-box !important;
        font-size: 8.5pt !important;
        line-height: 1.45 !important;
      }
      .ec-p1 { break-after: page !important; page-break-after: always !important; }
      .ec-p2 { break-after: auto !important; page-break-after: auto !important; }
      .ec-row { break-inside: avoid !important; page-break-inside: avoid !important; }
      .ec-cell { padding: 3px 7px !important; }
    }
    @media screen {
      .ec-page { max-width: 800px; margin: 0 auto; }
      .ec-p1 { margin-bottom: 40px; }
    }
  `;
}
```

**Letterhead verification requirement:**  
Before declaring the contract implementation complete, render it in letterhead mode
(`top: 40mm`) on screen and confirm both pages still fit without spilling into a third page.
If the 40mm top margin forces a third page, adjust `.ec-page` font-size or line-height
inside the letterhead branch of `buildContractPrintCSS` — **do not change wording or page split**.

---

## Section 4 — PrintProfileToggle Component

### File: `frontend/src/forms/shared/PrintProfileToggle.tsx` (new)

Visually identical to the existing `LanguageToggle` — a segmented pill of buttons.
One button per profile in `PRINT_PROFILES`. Active button gets `var(--primary)` background.

```tsx
import { PRINT_PROFILES, ProfileId } from './printProfiles';

interface Props {
  profile: ProfileId;
  onChange: (p: ProfileId) => void;
}

export default function PrintProfileToggle({ profile, onChange }: Props) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 0,
        alignItems: 'center',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      {(Object.keys(PRINT_PROFILES) as ProfileId[]).map((id) => {
        const p = PRINT_PROFILES[id];
        const active = profile === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active ? 'true' : 'false'}
            aria-label={p.labelEn}
            onClick={() => onChange(id)}
            style={{
              padding: '4px 12px',
              fontSize: 12,
              border: 'none',
              cursor: 'pointer',
              background: active ? 'var(--primary)' : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
              fontWeight: active ? 700 : 400,
            }}
          >
            {p.labelAr}
          </button>
        );
      })}
    </div>
  );
}
```

**Placement in forms:** Rendered inside the `no-print` toolbar via `FormLayout`'s `toolbarExtra` slot,
immediately after `LanguageToggle`. Automatically hidden at print time because the toolbar
carries `className="no-print"`.

---

## Section 5 — Warning Level Interactivity

### Files modified:
- `frontend/src/pages/EmployeeWarning.tsx`
- `frontend/src/forms/EmployeeWarningTemplate.tsx`

**Choice: Option B** — the user clicks directly on the checkbox in the form preview.
No dropdown, no radio button, no change to the no-print fields panel.

### Warning level constants (single source, bilingual)

```typescript
const LEVELS = [
  { key: 'first',  ar: 'أولى (شفهية)',    en: 'First (Verbal)'  },
  { key: 'second', ar: 'ثانية (خطية)',     en: 'Second (Written)' },
  { key: 'final',  ar: 'نهائية (إنذار)',   en: 'Final Warning'   },
] as const;

type WarningLevel = '' | 'first' | 'second' | 'final';
```

The label rendered in the form is `lang === 'en' ? level.en : level.ar`.
There are no separate `LEVELS_AR` and `LEVELS_EN` arrays.

### `EmployeeWarning.tsx` — extended printFields

```typescript
const [printFields, setPrintFields] = useState({
  warningLevel: '' as WarningLevel,   // new
  warningReason: '',
  violationDetails: '',
  correctiveAction: '',
  additionalNotes: '',
});
```

Pass the callback to the template:
```tsx
<EmployeeWarningTemplate
  employee={data.employee}
  lang={lang}
  printFields={printFields}
  onWarningLevelChange={(level) =>
    setPrintFields(p => ({ ...p, warningLevel: level }))
  }
/>
```

### `EmployeeWarningTemplate.tsx` — interactive checkbox

New prop:
```typescript
interface Props {
  employee: Employee;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;           // PrintFields.warningLevel is new
  onWarningLevelChange?: (level: WarningLevel) => void;  // new
}
```

Checkbox rendering (replaces the existing static map, used for both AR and EN paths):

```tsx
{LEVELS.map((level) => {
  const isSelected = printFields?.warningLevel === level.key;
  return (
    <span
      key={level.key}
      role="checkbox"
      aria-checked={isSelected}
      tabIndex={onWarningLevelChange ? 0 : -1}
      onClick={() =>
        onWarningLevelChange?.(isSelected ? '' : level.key as WarningLevel)
      }
      onKeyDown={(e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          onWarningLevelChange?.(isSelected ? '' : level.key as WarningLevel);
        }
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        cursor: onWarningLevelChange ? 'pointer' : 'default',
        userSelect: 'none',
      }}
    >
      <span
        style={{
          width: 14,
          height: 14,
          border: `1px solid ${isSelected ? '#1d4e6f' : '#94a3b8'}`,
          borderRadius: 2,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          background: isSelected ? '#1d4e6f' : 'transparent',
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        {isSelected && (
          <span style={{ color: '#fff', fontSize: 10, lineHeight: 1, fontWeight: 700 }}>
            ✓
          </span>
        )}
      </span>
      {lang === 'en' ? level.en : level.ar}
    </span>
  );
})}
```

**Behavior:**
- Click a checkbox → selects it (only one active at a time)
- Click the selected checkbox → deselects it (warningLevel resets to `''`)
- Space / Enter → same as click (keyboard accessible)
- When `onWarningLevelChange` is not provided (e.g., in a static render context), checkboxes
  are non-interactive (`cursor: default`, `tabIndex: -1`)
- The filled blue box with white ✓ prints faithfully because `WebkitPrintColorAdjust: exact` is set
- `borderColor: '#1d4e6f'` when selected ensures visual distinction even on printers
  that ignore background colors

---

## Section 6 — Missing Print-Only Fields

### SalaryCertificate

**File modified:** `frontend/src/pages/SalaryCertificate.tsx`  
**Template modified:** `frontend/src/forms/SalaryCertificateTemplate.tsx`

New print-only field: `certPurpose` — free text, max 120 characters.

```typescript
const [printFields, setPrintFields] = useState({ certPurpose: '' });
```

No-print panel added above the template:
```tsx
<div className="no-print" style={{ /* same dashed-border style as other forms */ }}>
  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
    حقول الطباعة فقط — لن تُحفظ
  </div>
  <div className="field" style={{ maxWidth: 400 }}>
    <label>الغرض من الشهادة / Purpose</label>
    <input
      maxLength={120}
      value={printFields.certPurpose}
      onChange={(e) => setPrintFields(p => ({ ...p, certPurpose: e.target.value }))}
      placeholder="مثال: للتقديم إلى البنك / For bank submission"
    />
  </div>
</div>
```

`SalaryCertificateTemplate` receives `printFields?: { certPurpose?: string }`.
The template renders a `الغرض` / `Purpose` row near the top of the data table:
- If `certPurpose` is filled: shows the value
- If empty: shows `blankLine`

Both Arabic and English paths receive and render `certPurpose`.

---

### ToWhomItMayConcern

**File modified:** `frontend/src/pages/ToWhomItMayConcern.tsx`  
**Template modified:** `frontend/src/forms/ToWhomItMayConcernTemplate.tsx`

New print-only field: `addressee` — free text.

```typescript
const [printFields, setPrintFields] = useState({ addressee: '' });
```

No-print panel:
```tsx
<div className="field" style={{ maxWidth: 400 }}>
  <label>مُوجَّه إلى / Addressed To</label>
  <input
    value={printFields.addressee}
    onChange={(e) => setPrintFields(p => ({ ...p, addressee: e.target.value }))}
    placeholder="مثال: السفارة الهندية / Indian Embassy"
  />
</div>
```

`ToWhomItMayConcernTemplate` receives `printFields?: { addressee?: string }`.

**Rendering rule:** If `addressee` is filled, render a line directly below the document title:
```
إلى: [addressee]      /      To: [addressee]
```
If empty, **omit the line entirely** — do not render a blank line.
(The letter reads "to whom it may concern" universally when no addressee is specified.)

---

### LeaveRequest — conditional fields when `latestLeave === null`

**File modified:** `frontend/src/pages/LeaveRequest.tsx`  
**Template modified:** `frontend/src/forms/LeaveRequestTemplate.tsx`

Extended printFields:

```typescript
const [printFields, setPrintFields] = useState({
  // always present:
  expectedReturnDate: '',
  // conditional — only relevant when latestLeave === null:
  leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
  startDate: '',
  endDate: '',
  days: '',
  reason: '',
});
```

No-print panel: the conditional fields are shown **only when `latestLeave` is absent**:

```tsx
<div className="no-print" style={{ /* dashed-border style */ }}>
  <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
    حقول الطباعة فقط — لن تُحفظ
  </div>

  {/* Conditional — only when no leave record exists */}
  {!latestLeave && (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
      <div className="field">
        <label>نوع الإجازة</label>
        <select
          value={printFields.leaveType}
          onChange={(e) => setPrintFields(p => ({ ...p, leaveType: e.target.value as typeof printFields.leaveType }))}
        >
          <option value="">— اختر —</option>
          <option value="ANNUAL">إجازة سنوية</option>
          <option value="SICK">إجازة مرضية</option>
          <option value="UNPAID">إجازة بدون راتب</option>
          <option value="EMERGENCY">إجازة طارئة</option>
        </select>
      </div>
      <div className="field">
        <label>عدد الأيام</label>
        <input type="number" min="1" value={printFields.days}
          onChange={(e) => setPrintFields(p => ({ ...p, days: e.target.value }))} />
      </div>
      <div className="field">
        <label>تاريخ البداية</label>
        <input type="date" value={printFields.startDate}
          onChange={(e) => setPrintFields(p => ({ ...p, startDate: e.target.value }))} />
      </div>
      <div className="field">
        <label>تاريخ النهاية</label>
        <input type="date" value={printFields.endDate}
          onChange={(e) => setPrintFields(p => ({ ...p, endDate: e.target.value }))} />
      </div>
      <div className="field" style={{ gridColumn: '1 / -1' }}>
        <label>سبب الطلب</label>
        <input value={printFields.reason}
          onChange={(e) => setPrintFields(p => ({ ...p, reason: e.target.value }))} />
      </div>
    </div>
  )}

  {/* Always present */}
  <div className="field" style={{ maxWidth: 280 }}>
    <label>تاريخ العودة المتوقعة</label>
    <input type="date" value={printFields.expectedReturnDate}
      onChange={(e) => setPrintFields(p => ({ ...p, expectedReturnDate: e.target.value }))} />
  </div>
</div>
```

**Template fallback chain** (applied to all five conditional fields in both AR and EN paths):

```typescript
// Example for leave type:
const displayLeaveType = latestLeave
  ? (LEAVE_TYPES[latestLeave.type] ?? latestLeave.type)
  : printFields?.leaveType
    ? LEAVE_TYPES[printFields.leaveType]
    : undefined;

// In JSX:
<div style={valueCell}>
  {displayLeaveType ?? <span style={blankLine} />}
</div>

// Example for start date (AR):
const displayStartDate = latestLeave
  ? fmtDate(latestLeave.startDate)
  : printFields?.startDate
    ? fmtDate(printFields.startDate)   // ← same formatter, never raw YYYY-MM-DD
    : undefined;

// Same for end date (fmtDate), days (numeric), reason (string).
// English path uses fmtDateEn for dates, LEAVE_TYPES_EN for type labels.
```

**Date format rule:** `printFields` date strings (`YYYY-MM-DD` from `<input type="date">`)
are always passed through `fmtDate` / `fmtDateEn` before display. Raw date strings
never reach the printed output.

---

## Section 7 — Invoice Print Future Preparation (Note)

No code changes in this branch.

### How the profile system enables future invoice templates

`PRINT_PROFILES` is keyed by arbitrary strings. Adding an invoice profile requires
only one new entry — no component or API changes:

```typescript
// Future addition to printProfiles.ts:
'invoice-ar': {
  id: 'invoice-ar',
  labelAr: 'فاتورة عربية',
  labelEn: 'Arabic Invoice',
  page: { size: 'A4', orientation: 'portrait' },
  margins: { top: '15mm', right: '10mm', bottom: '15mm', left: '10mm' },
},
```

`InvoicePreview.tsx` (already exists) would follow the same 9-step migration:
add `profile` state, add `PrintProfileToggle` to its toolbar, pass profile to the
invoice template, apply margins via `getPrintProfileStyle`.

**Template vs. Profile — two independent concepts:**

| Concept | Controls |
|---------|----------|
| `PrintProfile` | Paper size, orientation, margins, header visibility |
| Template component | Layout, language, content arrangement, branding |

Multiple invoice templates (AR layout, EN layout, bilingual) would be separate React
components. Which template to render is a `templateId` state — orthogonal to `profile`.
Profile controls the paper; the template controls the content. **Never mix them.**

---

## Section 8 — Future Extensibility Contract

This section defines the architectural rules that all future modules must follow
when implementing printable documents.

### Rule 1 — The PrintProfile system is module-agnostic

`PrintProfile` is not an HR-forms concept. It is a general-purpose print configuration
system. Future modules — Invoices, Purchase Orders, Cheques, Payslips, Contracts,
Reports — must reuse it instead of creating separate print-mode systems.

### Rule 2 — Separation of concerns

| Layer | Responsibility | Must NOT contain |
|-------|---------------|-----------------|
| `printProfiles.ts` | Profile registry, margin definitions, CSS helpers | Business logic, template content, language |
| `PrintProfileToggle` | UI for selecting a profile | Profile definitions, form logic |
| Page component | Profile state, data fetching, print log | Hardcoded margins, CSS padding values |
| Template component | Content, layout, language | Profile awareness (receives profile as prop only) |

### Rule 3 — One entry, zero ripple

Adding a new profile must require only adding one entry to `PRINT_PROFILES`.
No changes to `PrintProfileToggle`, `FormLayout`, `FormHeader`, or any existing template.
This is guaranteed by the registry pattern — the toggle iterates `Object.keys(PRINT_PROFILES)`.

### Rule 4 — Template controls content; profile controls paper

A template is never responsible for knowing which paper it is printed on.
A profile is never responsible for knowing what content is printed on it.
If a decision requires both, it belongs in the page component, not either layer.

### Rule 5 — Default is always Plain A4

`DEFAULT_PROFILE_ID = 'plain-a4'` is the system default.
No form may change this default.
Users opt into other profiles by toggling; they never have to opt out of them.

### Rule 6 — No URL mutation after mount

`getProfileIdFromSearch(search)` is called once, at state initialization.
After that, profile state is local React state only.
The URL is never updated when toggling.
The `?printMode` param remains supported as a legacy entry point.

### Rule 7 — The Employment Contract is the reference for complex multi-page forms

`EmploymentContractTemplate` + `EmploymentContract` is the canonical example of:
- A form that does not use `FormLayout`
- A form with multiple phases (selector → params → preview)
- A form with isolated print CSS generated from a function
- A form with an explicit multi-page layout enforced via CSS classes

Future complex multi-page printable forms should follow the same pattern.

### Rule 8 — Migration checklist for existing printable pages

When migrating an existing page to the PrintProfile system:

```
1. Import:
   import { ProfileId, DEFAULT_PROFILE_ID, PRINT_PROFILES,
            getProfileIdFromSearch, getPrintProfileStyle } from '../forms/shared/printProfiles';
   import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

2. Initialize state:
   const [profile, setProfile] = useState<ProfileId>(
     () => getProfileIdFromSearch(search)   // or DEFAULT_PROFILE_ID if no URL seed needed
   );

3. Add toggle to toolbar (via toolbarExtra or inline no-print div):
   <PrintProfileToggle profile={profile} onChange={setProfile} />

4. Pass profile to layout or template:
   <FormLayout profile={profile} ...>          // for FormLayout-based pages
   <MyTemplate profile={profile} ...>          // for standalone templates

5. Apply margins in print CSS:
   padding: ${getPrintProfileStyle(PRINT_PROFILES[profile])} !important;
```

---

## Deferred Items

The following are out of scope for this branch and must be tracked separately:

| Item | Notes |
|------|-------|
| SalaryAdvance conditional print fields | When `latestAdvance === null`, amount/date fields are blank. Same fallback-chain pattern as LeaveRequest. Low priority. |
| Database persistence of profile preference | Spec deferred. Settings module may support this in a future phase. |
| `letterhead-en` profile | Future bilingual letterhead variant. One entry in `PRINT_PROFILES` when needed. |
| Invoice template selection UI | `templateId` state, orthogonal to `profile`. Future branch. |
| Landscape profile support | `page.orientation: 'landscape'` is already in the type. CSS `@page { size: A4 landscape; }` is the only addition needed. |

---

## Validation Requirements

Before this branch is merged, all of the following must pass:

```bash
cd backend && npx prisma validate
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
cd backend && npm test
npm run build:back
npm run build:front
```

Manual verification checklist:
- [ ] All 8 FormLayout-based forms render correctly with Plain A4 profile
- [ ] All 8 forms switch to Letterhead profile without layout breakage
- [ ] EmploymentContract letterhead mode does not spill to 3 pages
- [ ] Warning level checkboxes are mutually exclusive, keyboard accessible
- [ ] `certPurpose` prints correctly in AR and EN on SalaryCertificate
- [ ] `addressee` is omitted when empty on ToWhomItMayConcern
- [ ] LeaveRequest conditional fields appear only when `latestLeave === null`
- [ ] Date values from print-only date inputs print as formatted dates, not YYYY-MM-DD
- [ ] `?printMode=letterhead` URL param still seeds letterhead profile on page load
- [ ] Plain A4 is the default when no URL param is present

---

## Suggested Commit Message

```
feat(forms): add print profiles and complete print-only fields

- Add extensible PrintProfile registry (printProfiles.ts)
- Add PrintProfileToggle component
- Migrate FormLayout to accept profile prop with dynamic margins
- Apply profile system to all 9 HR form pages
- Convert EmploymentContractTemplate PRINT_CSS to buildContractPrintCSS(profile)
- Make warning level checkboxes mutually exclusive and keyboard accessible
- Add certPurpose print-only field to SalaryCertificate
- Add addressee print-only field to ToWhomItMayConcern
- Add conditional leave detail fields to LeaveRequest when latestLeave is null
```

---

## Gemini Review Prompt

```
Please review this frontend-only branch for manarERP (Electron + React + TypeScript desktop app).

Branch: feature/print-profiles-forms-completion-v1
Base: production

Changes:
1. New printProfiles.ts — extensible print profile registry (plain-a4, letterhead)
2. New PrintProfileToggle.tsx — profile selector UI component
3. FormLayout.tsx — migrated from printMode prop to profile prop; dynamic print CSS margins
4. FormHeader.tsx — migrated from printMode to isLetterhead boolean
5. 8 HR form pages — migrated to profile state, PrintProfileToggle added
6. EmploymentContract.tsx + EmploymentContractTemplate.tsx — profile state + buildContractPrintCSS
7. EmployeeWarning.tsx + EmployeeWarningTemplate.tsx — interactive warning level checkboxes
8. SalaryCertificate — certPurpose print-only field
9. ToWhomItMayConcern — addressee print-only field
10. LeaveRequest — conditional print fields when latestLeave is null

Please review for:
- Architectural correctness (profile/template separation of concerns)
- TypeScript type safety (especially ProfileId derivation from registry keys)
- Print CSS correctness (margin injection, letterhead safe area)
- Accessibility (warning level checkboxes: role, aria-checked, keyboard)
- Missing edge cases in fallback chains (LeaveRequest)
- Any regressions in the EmploymentContract two-page layout
- Consistency across all 9 form migrations

No backend, Prisma, or API changes were made in this branch.
```

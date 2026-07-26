# Print Profiles & Forms Completion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a generic extensible PrintProfile system to all HR form pages, add a PrintProfileToggle UI component, fix warning level interactivity on the Employee Warning form, and complete missing print-only fields on three forms.

**Architecture:** A new `printProfiles.ts` registry defines all print profiles with margins. `FormLayout` consumes the profile to inject dynamic print CSS. Each page component holds profile state (seeded from `?printMode` URL param once, then pure React state). `PrintProfileToggle` sits in the no-print toolbar alongside `LanguageToggle`. `EmploymentContractTemplate` has its own isolated CSS track using a `buildContractPrintCSS(profile)` function. Warning level uses interactive Option-B checkboxes rendered directly on the form body.

**Tech Stack:** React 18, TypeScript 5.5, Vite 5, React Router 6 (HashRouter), inline styles (no CSS modules), Cairo/Tajawal fonts, no new packages

## Global Constraints

- Frontend only — no backend, Prisma, API, or permission changes
- No new npm packages
- No database persistence of profile selection (React state only)
- Plain A4 must remain the default (`DEFAULT_PROFILE_ID = 'plain-a4'`)
- All date values from `<input type="date">` must pass through `fmtDate`/`fmtDateEn` before print display — never raw `YYYY-MM-DD`
- `?printMode=letterhead` URL param support retained as a one-time seed at mount
- Employment Contract two-page layout (page 1 = Articles 1–6, page 2 = Article 7 + NOTE) must not break
- `WebkitPrintColorAdjust: 'exact'` and `printColorAdjust: 'exact'` required on all colored print elements
- Warning level selection: click selects, click again deselects; only one active at a time; no backend save
- Branch: `feature/print-profiles-forms-completion-v1` — base: `production`

---

## File Map

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/forms/shared/printProfiles.ts` | Profile registry, `PrintProfile` type, `ProfileId`, `getPrintProfileStyle()`, `getProfileIdFromSearch()` |
| `frontend/src/forms/shared/PrintProfileToggle.tsx` | Segmented toggle button matching `LanguageToggle` visual style |

### Modified Files
| File | What Changes | Risk |
|------|-------------|------|
| `frontend/src/forms/shared/FormHeader.tsx` | `printMode: PrintMode` → `isLetterhead: boolean` | Low |
| `frontend/src/forms/shared/FormLayout.tsx` | `profile: ProfileId` prop; dynamic print CSS padding | Medium |
| `frontend/src/pages/ReturnToWork.tsx` | Profile state + `PrintProfileToggle` | Low |
| `frontend/src/pages/SalaryAdvance.tsx` | Profile state + `PrintProfileToggle` | Low |
| `frontend/src/pages/PerformanceEvaluation.tsx` | Profile state + `PrintProfileToggle` | Low |
| `frontend/src/pages/Resignation.tsx` | Profile state + `PrintProfileToggle` | Low |
| `frontend/src/pages/SalaryCertificate.tsx` | Profile state + `PrintProfileToggle` + `certPurpose` printField | Low |
| `frontend/src/forms/SalaryCertificateTemplate.tsx` | Add `printFields?: { certPurpose?: string }` + new table row | Low |
| `frontend/src/pages/ToWhomItMayConcern.tsx` | Profile state + `PrintProfileToggle` + `certPurpose` printField | Low |
| `frontend/src/forms/ToWhomItMayConcernTemplate.tsx` | Add `printFields?: { certPurpose?: string }` — fills existing `blankLine` slot | Low |
| `frontend/src/pages/LeaveRequest.tsx` | Profile state + `PrintProfileToggle` + 5 conditional printFields | Medium |
| `frontend/src/forms/LeaveRequestTemplate.tsx` | Extend `PrintFields`; fallback chain for 5 conditional fields | Medium |
| `frontend/src/pages/EmployeeWarning.tsx` | Profile state + `PrintProfileToggle` + `warningLevel` in printFields | Medium |
| `frontend/src/forms/EmployeeWarningTemplate.tsx` | Unified `LEVELS` array; interactive checkboxes; `onWarningLevelChange` prop | Medium |
| `frontend/src/pages/EmploymentContract.tsx` | Profile state; `PrintProfileToggle` in preview toolbar; pass `profile` to template; fix print log | Medium |
| `frontend/src/forms/EmploymentContractTemplate.tsx` | `profile?: ProfileId` prop; `const PRINT_CSS` → `buildContractPrintCSS(profile)` | Medium |

### Unchanged Files
- `frontend/src/forms/shared/printMode.ts` — kept for backward compatibility
- `frontend/src/forms/shared/FormQRCode.tsx`
- `frontend/src/forms/shared/ApprovalSection.tsx`
- `frontend/src/forms/shared/LanguageToggle.tsx`
- `frontend/src/forms/shared/formStyles.ts`
- `frontend/src/forms/ReturnToWorkTemplate.tsx`
- `frontend/src/forms/SalaryAdvanceTemplate.tsx`
- `frontend/src/forms/PerformanceEvaluationTemplate.tsx`
- `frontend/src/forms/ResignationTemplate.tsx`
- All backend files

---

## Task 1: Print Profile Registry

**Files:**
- Create: `frontend/src/forms/shared/printProfiles.ts`

**Interfaces:**
- Produces:
  - `PrintProfile` — profile shape including `page` block for future extensibility
  - `PRINT_PROFILES: Record<string, PrintProfile>` — the extensible registry
  - `ProfileId = keyof typeof PRINT_PROFILES` — auto-derived union
  - `DEFAULT_PROFILE_ID: ProfileId = 'plain-a4'`
  - `getProfileIdFromSearch(search: string): ProfileId` — one-time URL seed
  - `getPrintProfileStyle(profile: PrintProfile): string` — CSS `top right bottom left` shorthand

- [ ] **Step 1: Create `frontend/src/forms/shared/printProfiles.ts`**

```typescript
export interface PrintProfile {
  id: string;
  labelAr: string;
  labelEn: string;
  page: {
    size: 'A4';
    orientation: 'portrait' | 'landscape';
  };
  margins: {
    top: string;
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
  // 'letterhead-en': { ... },
  // 'invoice-template-a': { ... },
};

/**
 * ProfileId is derived from PRINT_PROFILES keys.
 * Adding a new entry automatically widens this type — no manual maintenance.
 */
export type ProfileId = keyof typeof PRINT_PROFILES;

export const DEFAULT_PROFILE_ID: ProfileId = 'plain-a4';

/**
 * Reads ?printMode URL param once at page mount to seed initial profile state.
 * After mount, profile is managed as local React state only — URL is never updated.
 */
export function getProfileIdFromSearch(search: string): ProfileId {
  const mode = new URLSearchParams(search).get('printMode');
  return mode === 'letterhead' ? 'letterhead' : DEFAULT_PROFILE_ID;
}

/**
 * Returns CSS padding shorthand string: 'top right bottom left'.
 * Usage: `padding: ${getPrintProfileStyle(PRINT_PROFILES[profile])} !important`
 */
export function getPrintProfileStyle(profile: PrintProfile): string {
  const { top, right, bottom, left } = profile.margins;
  return `${top} ${right} ${bottom} ${left}`;
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors (this file is not yet imported by anything)

- [ ] **Step 3: Commit**

```bash
git add frontend/src/forms/shared/printProfiles.ts
git commit -m "feat(forms): add extensible PrintProfile registry"
```

---

## Task 2: PrintProfileToggle Component

**Files:**
- Create: `frontend/src/forms/shared/PrintProfileToggle.tsx`

**Interfaces:**
- Consumes: `PRINT_PROFILES`, `ProfileId` from `./printProfiles`
- Produces: default export `PrintProfileToggle` with props `{ profile: ProfileId; onChange: (p: ProfileId) => void }`

- [ ] **Step 1: Create `frontend/src/forms/shared/PrintProfileToggle.tsx`**

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

- [ ] **Step 2: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/forms/shared/PrintProfileToggle.tsx
git commit -m "feat(forms): add PrintProfileToggle component"
```

---

## Task 3: FormHeader + FormLayout Migration

These two files are combined into one task so TypeScript always compiles cleanly between commits — `FormHeader`'s prop change and `FormLayout`'s consumption of it must land together.

**Files:**
- Modify: `frontend/src/forms/shared/FormHeader.tsx`
- Modify: `frontend/src/forms/shared/FormLayout.tsx`

**Risk:** Medium — all 8 FormLayout-based HR pages will break at compile until they are updated in Tasks 4–8. This is expected and intentional; TypeScript will catch every missed call site.

**Interfaces:**
- `FormHeader` before: `{ printMode: PrintMode }` — after: `{ isLetterhead: boolean }`
- `FormLayout` before: `{ ...; printMode: PrintMode; ... }` — after: `{ ...; profile: ProfileId; ... }`

- [ ] **Step 1: Replace `frontend/src/forms/shared/FormHeader.tsx`**

```tsx
import { CSSProperties } from 'react';

const COMPANY_NAME =
  'شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

export default function FormHeader({ isLetterhead }: { isLetterhead: boolean }) {
  const style: CSSProperties = isLetterhead ? { visibility: 'hidden' } : {};

  return (
    <div
      style={{
        textAlign: 'center',
        marginBottom: 14,
        borderBottom: '3px solid #1d4e6f',
        paddingBottom: 10,
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
        ...style,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 700, color: '#1d4e6f', lineHeight: 1.7 }}>
        {COMPANY_NAME}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `frontend/src/forms/shared/FormLayout.tsx`**

```tsx
import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ProfileId, PRINT_PROFILES, getPrintProfileStyle } from './printProfiles';
import FormHeader from './FormHeader';
import FormQRCode, { QRData } from './FormQRCode';
import ApprovalSection from './ApprovalSection';

interface FormLayoutProps {
  children: ReactNode;
  ready: boolean;
  formNumber: string;
  title: string;
  profile: ProfileId;
  qrData: QRData;
  toolbarExtra?: ReactNode;
}

export default function FormLayout({
  children,
  ready,
  formNumber,
  title,
  profile,
  qrData,
  toolbarExtra,
}: FormLayoutProps) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [ready]);

  const activeProfile = PRINT_PROFILES[profile];
  const padding = getPrintProfileStyle(activeProfile);

  return (
    <>
      <style>{`
        @media print {
          @page { size: A4; margin: 0; }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
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

      <div
        className="form-page"
        style={{
          padding: '18px 32px',
          fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
          maxWidth: 820,
          margin: '0 auto',
          color: '#0f172a',
          background: '#fff',
          direction: 'rtl',
        }}
      >
        {/* No-print toolbar */}
        <div
          className="no-print"
          style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center' }}
        >
          <button className="btn" onClick={() => window.print()}>
            🖨️ طباعة / حفظ PDF
          </button>
          <button className="btn secondary" onClick={() => navigate(-1)}>
            رجوع
          </button>
          {toolbarExtra}
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {PRINT_PROFILES[profile].labelAr} — {formNumber}
          </span>
        </div>

        {/* Company header — hidden in letterhead mode; space preserved so content doesn't shift */}
        <FormHeader isLetterhead={profile === 'letterhead'} />

        {/* Form number + title */}
        <div style={{ textAlign: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, direction: 'ltr' }}>
            {formNumber}
          </div>
          <h1
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: '#1d4e6f',
              margin: '0 0 6px',
              letterSpacing: 1,
            }}
          >
            {title}
          </h1>
          <div
            style={{
              width: 60,
              height: 3,
              background: '#1d4e6f',
              margin: '0 auto',
              borderRadius: 2,
              WebkitPrintColorAdjust: 'exact',
              printColorAdjust: 'exact',
            }}
          />
        </div>

        {/* Form-specific content */}
        {children}

        {/* Bottom row: Approval | QR */}
        <div
          style={{
            marginTop: 14,
            paddingTop: 10,
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 20,
            WebkitPrintColorAdjust: 'exact',
            printColorAdjust: 'exact',
          }}
        >
          <div style={{ flex: 1 }}>
            <ApprovalSection />
          </div>
          <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <FormQRCode data={qrData} size={80} />
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Type-check (expect failures on HR page files — that is correct)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -40
```

Expected: errors on all 8 page files that pass `printMode` to `FormLayout`. These are intentional and will be resolved in Tasks 4–8. The two files changed here must have zero errors of their own.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/forms/shared/FormHeader.tsx frontend/src/forms/shared/FormLayout.tsx
git commit -m "feat(forms): migrate FormLayout to profile prop with dynamic print margins"
```

---

## Task 4: Simple Page Migrations (4 pages)

These four pages are pure profile migrations — no new print fields, only the `printMode` → `profile` replacement. They follow an identical pattern.

**Files:**
- Modify: `frontend/src/pages/ReturnToWork.tsx`
- Modify: `frontend/src/pages/SalaryAdvance.tsx`
- Modify: `frontend/src/pages/PerformanceEvaluation.tsx`
- Modify: `frontend/src/pages/Resignation.tsx`

**Pattern for all four (shown in full for ReturnToWork; the other three are identical substitutions):**

### 4a. ReturnToWork.tsx

- [ ] **Step 1: Apply migration to `frontend/src/pages/ReturnToWork.tsx`**

```tsx
import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import ReturnToWorkTemplate from '../forms/ReturnToWorkTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

export default function ReturnToWork() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('return-to-work'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({ actualReturnDate: '', medicalNotes: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/return-to-work/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'return-to-work',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title="إشعار العودة إلى العمل"
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
        </>
      }
      qrData={{
        formType: 'return-to-work',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>تاريخ العودة الفعلية</label><input type="date" title="تاريخ العودة الفعلية" value={printFields.actualReturnDate} onChange={(e) => setPrintFields(p => ({ ...p, actualReturnDate: e.target.value }))} /></div>
          <div className="field"><label>ملاحظات طبية / تقرير الطبيب</label><input title="ملاحظات طبية" value={printFields.medicalNotes} onChange={(e) => setPrintFields(p => ({ ...p, medicalNotes: e.target.value }))} /></div>
        </div>
      </div>
      <ReturnToWorkTemplate employee={data.employee} latestLeave={data.latestLeave} lang={lang} printFields={printFields} />
    </FormLayout>
  );
}
```

### 4b–4d. SalaryAdvance, PerformanceEvaluation, Resignation

Apply the identical migration pattern to each. The only parts that differ from ReturnToWork are the API endpoint, formType string, title, template component, and existing printFields shape — all of which are unchanged. Specific substitutions:

**SalaryAdvance.tsx:**
- Remove: `import { getPrintMode } from '../forms/shared/printMode';`
- Remove: `const printMode = getPrintMode(search);`
- Add (after `useLocation`): `const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));`
- Add imports: `getProfileIdFromSearch, ProfileId` from `'../forms/shared/printProfiles'` + `PrintProfileToggle`
- Change: `printMode: printMode` → `printMode: profile` in the print-log POST body
- Change: `<FormLayout printMode={printMode}` → `<FormLayout profile={profile}`
- Change toolbarExtra: wrap existing `<LanguageToggle .../>` in `<>...</>` and add `<PrintProfileToggle profile={profile} onChange={setProfile} />`

Apply the same substitution to **PerformanceEvaluation.tsx** and **Resignation.tsx**.

- [ ] **Step 2: Type-check (all four pages must compile cleanly)**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "ReturnToWork|SalaryAdvance|PerformanceEvaluation|Resignation"
```

Expected: no output (zero errors for these four files). Remaining errors will be in SalaryCertificate, ToWhomItMayConcern, LeaveRequest, EmployeeWarning — fixed in Tasks 5–8.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/ReturnToWork.tsx frontend/src/pages/SalaryAdvance.tsx frontend/src/pages/PerformanceEvaluation.tsx frontend/src/pages/Resignation.tsx
git commit -m "feat(forms): migrate 4 HR pages to profile prop + PrintProfileToggle"
```

---

## Task 5: SalaryCertificate — Profile + certPurpose

**Files:**
- Modify: `frontend/src/pages/SalaryCertificate.tsx`
- Modify: `frontend/src/forms/SalaryCertificateTemplate.tsx`

**What changes:**
- Page: profile state + `PrintProfileToggle`; new `printFields.certPurpose` state; no-print panel; pass printFields to template
- Template: new optional `printFields?: { certPurpose?: string }` prop; new row at bottom of employee info table in both AR and EN paths

- [ ] **Step 1: Update `frontend/src/pages/SalaryCertificate.tsx`**

```tsx
import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import SalaryCertificateTemplate from '../forms/SalaryCertificateTemplate';

type Lang = 'ar' | 'en';

export default function SalaryCertificate() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('salary-certificate'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({ certPurpose: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/salary-certificate/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'salary-certificate',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  if (error)
    return <div className="center-msg">تعذّر تحميل بيانات الشهادة: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ تجهيز الشهادة…
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title={lang === 'en' ? 'Salary Certificate' : 'شـهـادة راتـب'}
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
        </>
      }
      qrData={{
        formType: 'salary-certificate',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
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
      <SalaryCertificateTemplate
        employee={data.employee}
        latestPayroll={data.latestPayroll}
        lang={lang}
        printFields={printFields}
      />
    </FormLayout>
  );
}
```

- [ ] **Step 2: Update `frontend/src/forms/SalaryCertificateTemplate.tsx`**

Add `printFields` to the `Props` interface and a new `الغرض` / `Purpose` row at the bottom of each employee info table. All other content is unchanged.

```tsx
// Add to imports (blankLine not currently imported — add it):
import {
  COMPANY_NAME,
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
  fmtDate,
  fmtDateEn,
  issueDateStr,
  issueDateStrEn,
  money,
  moneyEn,
  blankLine,           // ← add this
} from './shared/formStyles';

// Add PrintFields interface above Props:
interface PrintFields {
  certPurpose?: string;
}

// Update Props:
interface Props {
  employee: Employee;
  latestPayroll: LatestPayroll | null;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;    // ← add this
}

// Update function signature:
export default function SalaryCertificateTemplate({ employee: emp, latestPayroll, lang = 'ar', printFields }: Props) {
```

In the **EN path**, add this row immediately after the `Date of Hire` row (line ~90):
```tsx
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Purpose</div>
            <div style={valueCell}>
              {printFields?.certPurpose?.trim()
                ? <span>{printFields.certPurpose}</span>
                : <span style={blankLine} />}
            </div>
          </div>
```

In the **AR path**, add this row immediately after the `تاريخ التعيين` row (line ~173):
```tsx
        <div style={tableRow}>
          <div style={labelCell}>الغرض</div>
          <div style={valueCell}>
            {printFields?.certPurpose?.trim()
              ? <span>{printFields.certPurpose}</span>
              : <span style={blankLine} />}
          </div>
        </div>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "SalaryCertificate"
```

Expected: no output (zero errors for these two files)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/SalaryCertificate.tsx frontend/src/forms/SalaryCertificateTemplate.tsx
git commit -m "feat(forms): add certPurpose print field and profile to SalaryCertificate"
```

---

## Task 6: ToWhomItMayConcern — Profile + certPurpose

**Files:**
- Modify: `frontend/src/pages/ToWhomItMayConcern.tsx`
- Modify: `frontend/src/forms/ToWhomItMayConcernTemplate.tsx`

**Key insight from reading the template:** The template already renders `<strong>الغرض من الشهادة:</strong>{' '}<span style={blankLine} />` in both AR and EN paths. The `certPurpose` print field fills this existing slot. When empty the `blankLine` remains (the form is still usable as a blank template). The line is NOT omitted when empty — it is part of the certificate's fixed structure.

- [ ] **Step 1: Update `frontend/src/pages/ToWhomItMayConcern.tsx`**

```tsx
import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import ToWhomItMayConcernTemplate from '../forms/ToWhomItMayConcernTemplate';

type Lang = 'ar' | 'en';

export default function ToWhomItMayConcern() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('to-whom-it-may-concern'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({ certPurpose: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/to-whom-it-may-concern/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'to-whom-it-may-concern',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title={lang === 'en' ? 'To Whom It May Concern' : 'إلى من يهمه الأمر'}
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
        </>
      }
      qrData={{
        formType: 'to-whom-it-may-concern',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div className="field" style={{ maxWidth: 400 }}>
          <label>الغرض من الشهادة / Purpose</label>
          <input
            value={printFields.certPurpose}
            onChange={(e) => setPrintFields(p => ({ ...p, certPurpose: e.target.value }))}
            placeholder="مثال: السفارة الهندية / Indian Embassy"
          />
        </div>
      </div>
      <ToWhomItMayConcernTemplate
        employee={data.employee}
        latestPayroll={data.latestPayroll}
        lang={lang}
        printFields={printFields}
      />
    </FormLayout>
  );
}
```

- [ ] **Step 2: Update `frontend/src/forms/ToWhomItMayConcernTemplate.tsx`**

Add `printFields` interface and prop, then replace the two existing `blankLine` spans (one in AR path, one in EN path) with fillable fallbacks.

```tsx
// Add PrintFields interface above Props:
interface PrintFields {
  certPurpose?: string;
}

// Update Props:
interface Props {
  employee: Employee;
  latestPayroll: { month: number; year: number; netSalary: number; snapshotBaseSalary: number } | null;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;    // ← add this
}

// Update function signature:
export default function ToWhomItMayConcernTemplate({ employee: emp, latestPayroll, lang = 'ar', printFields }: Props) {
```

In the **EN path**, replace (around line 93–96):
```tsx
        <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Purpose:</strong>{' '}
          <span style={blankLine} />
        </div>
```
With:
```tsx
        <div style={{ marginBottom: 20, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <strong>Purpose:</strong>{' '}
          {printFields?.certPurpose?.trim()
            ? <span>{printFields.certPurpose}</span>
            : <span style={blankLine} />}
        </div>
```

In the **AR path**, replace (around line 160–163):
```tsx
      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151' }}>
        <strong>الغرض من الشهادة:</strong>{' '}
        <span style={blankLine} />
      </div>
```
With:
```tsx
      <div style={{ marginBottom: 20, fontSize: 13, color: '#374151' }}>
        <strong>الغرض من الشهادة:</strong>{' '}
        {printFields?.certPurpose?.trim()
          ? <span>{printFields.certPurpose}</span>
          : <span style={blankLine} />}
      </div>
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "ToWhomItMayConcern"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ToWhomItMayConcern.tsx frontend/src/forms/ToWhomItMayConcernTemplate.tsx
git commit -m "feat(forms): add certPurpose print field and profile to ToWhomItMayConcern"
```

---

## Task 7: LeaveRequest — Profile + Conditional Print Fields

**Files:**
- Modify: `frontend/src/pages/LeaveRequest.tsx`
- Modify: `frontend/src/forms/LeaveRequestTemplate.tsx`

**What changes:**
- Page: profile state; extend `printFields` with 5 conditional leave fields; show those 5 inputs only when `latestLeave === null`
- Template: extend `PrintFields` interface; fallback chain: API data → printFields value → blankLine; date values always pass through `fmtDate`/`fmtDateEn`

- [ ] **Step 1: Update `frontend/src/pages/LeaveRequest.tsx`**

```tsx
import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import LeaveRequestTemplate from '../forms/LeaveRequestTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

export default function LeaveRequest() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('leave-request'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({
    expectedReturnDate: '',
    leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
    startDate: '',
    endDate: '',
    days: '',
    reason: '',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/leave-request/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'leave-request',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  const latestLeave = data.latestLeave;

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title="طلب إجازة"
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
        </>
      }
      qrData={{
        formType: 'leave-request',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>

        {!latestLeave && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="field">
              <label>نوع الإجازة</label>
              <select
                title="نوع الإجازة"
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
              <input
                type="number"
                min="1"
                title="عدد الأيام"
                value={printFields.days}
                onChange={(e) => setPrintFields(p => ({ ...p, days: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>تاريخ البداية</label>
              <input
                type="date"
                title="تاريخ البداية"
                value={printFields.startDate}
                onChange={(e) => setPrintFields(p => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>تاريخ النهاية</label>
              <input
                type="date"
                title="تاريخ النهاية"
                value={printFields.endDate}
                onChange={(e) => setPrintFields(p => ({ ...p, endDate: e.target.value }))}
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>سبب الطلب</label>
              <input
                title="سبب الطلب"
                value={printFields.reason}
                onChange={(e) => setPrintFields(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="field" style={{ maxWidth: 280 }}>
          <label>تاريخ العودة المتوقعة</label>
          <input
            type="date"
            title="تاريخ العودة المتوقعة"
            value={printFields.expectedReturnDate}
            onChange={(e) => setPrintFields(p => ({ ...p, expectedReturnDate: e.target.value }))}
          />
        </div>
      </div>
      <LeaveRequestTemplate employee={data.employee} latestLeave={latestLeave} lang={lang} printFields={printFields} />
    </FormLayout>
  );
}
```

- [ ] **Step 2: Update `frontend/src/forms/LeaveRequestTemplate.tsx`**

Update the `PrintFields` interface and replace the five leave-detail cells in both AR and EN paths with the fallback chain.

```tsx
// Updated PrintFields interface:
interface PrintFields {
  expectedReturnDate?: string;
  leaveType?: '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY';
  startDate?: string;
  endDate?: string;
  days?: string;
  reason?: string;
}
```

In both the **AR path** and the **EN path**, replace each leave-detail cell using the fallback chain. The pattern is: API data (when leave exists) → printField value formatted → blankLine.

**AR path — leave detail cells (replace the existing `latestLeave ?` ternaries):**

```tsx
        {/* نوع الإجازة */}
        <div style={tableRow}>
          <div style={labelCell}>نوع الإجازة</div>
          <div style={valueCell}>
            {latestLeave
              ? (LEAVE_TYPES[latestLeave.type] ?? latestLeave.type)
              : printFields?.leaveType
                ? (LEAVE_TYPES[printFields.leaveType] ?? printFields.leaveType)
                : <span style={blankLine} />}
          </div>
        </div>

        {/* تاريخ البداية */}
        <div style={tableRow}>
          <div style={labelCell}>تاريخ البداية</div>
          <div style={valueCell}>
            {latestLeave
              ? fmtDate(latestLeave.startDate)
              : printFields?.startDate
                ? fmtDate(printFields.startDate)
                : <span style={blankLine} />}
          </div>
        </div>

        {/* تاريخ النهاية */}
        <div style={tableRow}>
          <div style={labelCell}>تاريخ النهاية</div>
          <div style={valueCell}>
            {latestLeave
              ? fmtDate(latestLeave.endDate)
              : printFields?.endDate
                ? fmtDate(printFields.endDate)
                : <span style={blankLine} />}
          </div>
        </div>

        {/* عدد الأيام */}
        <div style={tableRow}>
          <div style={labelCell}>عدد الأيام</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            {latestLeave
              ? `${latestLeave.days} يوم`
              : printFields?.days
                ? `${printFields.days} يوم`
                : <span style={blankLine} />}
          </div>
        </div>

        {/* سبب الطلب */}
        <div style={tableRow}>
          <div style={labelCell}>سبب الطلب</div>
          <div style={valueCell}>
            {latestLeave
              ? (latestLeave.reason ?? <span style={blankLine} />)
              : printFields?.reason
                ? printFields.reason
                : <span style={blankLine} />}
          </div>
        </div>

        {/* تاريخ العودة المتوقعة — always from printFields */}
        <div style={tableRow}>
          <div style={labelCell}>تاريخ العودة المتوقعة</div>
          <div style={valueCell}>
            {printFields?.expectedReturnDate?.trim()
              ? <span>{fmtDate(printFields.expectedReturnDate)}</span>
              : <span style={blankLine} />}
          </div>
        </div>
```

**EN path — same substitution using `LEAVE_TYPES_EN` and `fmtDateEn`:**

```tsx
        {/* Leave Type */}
        <div style={{ ...tableRow, direction: 'ltr' }}>
          <div style={{ ...labelCell, textAlign: 'left' }}>Leave Type</div>
          <div style={valueCell}>
            {latestLeave
              ? (LEAVE_TYPES_EN[latestLeave.type] ?? latestLeave.type)
              : printFields?.leaveType
                ? (LEAVE_TYPES_EN[printFields.leaveType] ?? printFields.leaveType)
                : <span style={blankLine} />}
          </div>
        </div>

        {/* Start Date */}
        <div style={{ ...tableRow, direction: 'ltr' }}>
          <div style={{ ...labelCell, textAlign: 'left' }}>Start Date</div>
          <div style={valueCell}>
            {latestLeave
              ? fmtDateEn(latestLeave.startDate)
              : printFields?.startDate
                ? fmtDateEn(printFields.startDate)
                : <span style={blankLine} />}
          </div>
        </div>

        {/* End Date */}
        <div style={{ ...tableRow, direction: 'ltr' }}>
          <div style={{ ...labelCell, textAlign: 'left' }}>End Date</div>
          <div style={valueCell}>
            {latestLeave
              ? fmtDateEn(latestLeave.endDate)
              : printFields?.endDate
                ? fmtDateEn(printFields.endDate)
                : <span style={blankLine} />}
          </div>
        </div>

        {/* Days */}
        <div style={{ ...tableRow, direction: 'ltr' }}>
          <div style={{ ...labelCell, textAlign: 'left' }}>Days</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            {latestLeave
              ? `${latestLeave.days} day(s)`
              : printFields?.days
                ? `${printFields.days} day(s)`
                : <span style={blankLine} />}
          </div>
        </div>

        {/* Reason */}
        <div style={{ ...tableRow, direction: 'ltr' }}>
          <div style={{ ...labelCell, textAlign: 'left' }}>Reason</div>
          <div style={valueCell}>
            {latestLeave
              ? (latestLeave.reason ?? <span style={blankLine} />)
              : printFields?.reason
                ? printFields.reason
                : <span style={blankLine} />}
          </div>
        </div>

        {/* Expected Return Date */}
        <div style={{ ...tableRow, direction: 'ltr' }}>
          <div style={{ ...labelCell, textAlign: 'left' }}>Expected Return Date</div>
          <div style={valueCell}>
            {printFields?.expectedReturnDate?.trim()
              ? <span>{fmtDateEn(printFields.expectedReturnDate)}</span>
              : <span style={blankLine} />}
          </div>
        </div>
```

Note: The existing `expectedReturnDate` cell currently shows the raw date string without formatting (`<span>{printFields.expectedReturnDate}</span>`). Both paths are corrected here to pass through `fmtDate`/`fmtDateEn`.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npx tsc --noEmit 2>&1 | grep -E "LeaveRequest"
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/LeaveRequest.tsx frontend/src/forms/LeaveRequestTemplate.tsx
git commit -m "feat(forms): add conditional leave print fields and profile to LeaveRequest"
```

---

## Task 8: EmployeeWarning — Profile + Interactive Warning Level

**Files:**
- Modify: `frontend/src/pages/EmployeeWarning.tsx`
- Modify: `frontend/src/forms/EmployeeWarningTemplate.tsx`

**What changes:**
- Page: profile state; `warningLevel` added to `printFields`; `onWarningLevelChange` callback passed to template
- Template: unified `LEVELS` array replaces `WARNING_LEVELS` + `WARNING_LEVELS_EN`; `warningLevel` added to `PrintFields`; static checkboxes replaced with interactive ones; `onWarningLevelChange` prop added

- [ ] **Step 1: Update `frontend/src/pages/EmployeeWarning.tsx`**

```tsx
import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import EmployeeWarningTemplate from '../forms/EmployeeWarningTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

type WarningLevel = '' | 'first' | 'second' | 'final';

export default function EmployeeWarning() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('employee-warning'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({
    warningLevel: '' as WarningLevel,
    warningReason: '',
    violationDetails: '',
    correctiveAction: '',
    additionalNotes: '',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/employee-warning/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'employee-warning',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title="إنذار موظف"
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
        </>
      }
      qrData={{
        formType: 'employee-warning',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>سبب الإنذار</label><input title="سبب الإنذار" value={printFields.warningReason} onChange={(e) => setPrintFields(p => ({ ...p, warningReason: e.target.value }))} /></div>
          <div className="field"><label>تفاصيل المخالفة</label><input title="تفاصيل المخالفة" value={printFields.violationDetails} onChange={(e) => setPrintFields(p => ({ ...p, violationDetails: e.target.value }))} /></div>
          <div className="field"><label>الإجراء التصحيحي</label><input title="الإجراء التصحيحي" value={printFields.correctiveAction} onChange={(e) => setPrintFields(p => ({ ...p, correctiveAction: e.target.value }))} /></div>
          <div className="field"><label>ملاحظات إضافية</label><input title="ملاحظات إضافية" value={printFields.additionalNotes} onChange={(e) => setPrintFields(p => ({ ...p, additionalNotes: e.target.value }))} /></div>
        </div>
      </div>
      <EmployeeWarningTemplate
        employee={data.employee}
        lang={lang}
        printFields={printFields}
        onWarningLevelChange={(level) =>
          setPrintFields(p => ({ ...p, warningLevel: level }))
        }
      />
    </FormLayout>
  );
}
```

- [ ] **Step 2: Replace `frontend/src/forms/EmployeeWarningTemplate.tsx`**

Full replacement — the unified `LEVELS` array replaces the two separate arrays, and interactive checkbox rendering replaces the static map.

```tsx
import {
  tableRow,
  labelCell,
  valueCell,
  sectionHeader,
  tableWrapper,
  issueDateStr,
  issueDateStrEn,
  blankLine,
} from './shared/formStyles';

type WarningLevel = '' | 'first' | 'second' | 'final';

const LEVELS = [
  { key: 'first',  ar: 'أولى (شفهية)',    en: 'First (Verbal)'   },
  { key: 'second', ar: 'ثانية (خطية)',     en: 'Second (Written)' },
  { key: 'final',  ar: 'نهائية (إنذار)',   en: 'Final Warning'    },
] as const;

interface Employee {
  id: number;
  code: string;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  civilId: string | null;
}

interface PrintFields {
  warningLevel?: WarningLevel;
  warningReason?: string;
  violationDetails?: string;
  correctiveAction?: string;
  additionalNotes?: string;
}

interface Props {
  employee: Employee;
  lang?: 'ar' | 'en';
  printFields?: PrintFields;
  onWarningLevelChange?: (level: WarningLevel) => void;
}

function WarningCheckboxRow({
  lang,
  printFields,
  onWarningLevelChange,
}: {
  lang: 'ar' | 'en';
  printFields?: PrintFields;
  onWarningLevelChange?: (level: WarningLevel) => void;
}) {
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
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
    </div>
  );
}

export default function EmployeeWarningTemplate({ employee: emp, lang = 'ar', printFields, onWarningLevelChange }: Props) {
  if (lang === 'en') {
    return (
      <>
        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Employee Information</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Name</div>
            <div style={{ ...valueCell, fontWeight: 700 }}>{emp.fullName}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Employee ID</div>
            <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.code}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Civil ID</div>
            <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.civilId ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Job Title</div>
            <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Department</div>
            <div style={valueCell}>{emp.department ?? '—'}</div>
          </div>
        </div>

        <div style={{ ...tableWrapper, direction: 'ltr' }}>
          <div style={{ ...sectionHeader, textAlign: 'left' }}>Warning Details</div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Warning Date</div>
            <div style={valueCell}>{issueDateStrEn()}</div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Warning Level</div>
            <div style={valueCell}>
              <WarningCheckboxRow lang="en" printFields={printFields} onWarningLevelChange={onWarningLevelChange} />
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Warning Reason</div>
            <div style={{ ...valueCell, minHeight: 48 }}>
              {printFields?.warningReason?.trim() ? <span>{printFields.warningReason}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Violation Details</div>
            <div style={{ ...valueCell, minHeight: 48 }}>
              {printFields?.violationDetails?.trim() ? <span>{printFields.violationDetails}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Corrective Action</div>
            <div style={{ ...valueCell, minHeight: 40 }}>
              {printFields?.correctiveAction?.trim() ? <span>{printFields.correctiveAction}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
            </div>
          </div>
          <div style={{ ...tableRow, direction: 'ltr' }}>
            <div style={{ ...labelCell, textAlign: 'left' }}>Additional Notes</div>
            <div style={{ ...valueCell, minHeight: 36 }}>
              {printFields?.additionalNotes?.trim() ? <span>{printFields.additionalNotes}</span> : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7, direction: 'ltr' }}>
          <p style={{ margin: 0 }}>
            The above-mentioned employee has been notified of this warning and has been informed of its
            contents. The employee is required not to repeat this violation in the future, failing which
            they will be subject to the prescribed disciplinary measures.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 16, fontSize: 13, color: '#374151', direction: 'ltr' }}>
          <div>
            <strong>Employee Signature (Acknowledgment):</strong>
            <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
          <div>
            <strong>Supervisor Signature:</strong>
            <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
          <div>
            <strong>Date:</strong>
            <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات الموظف</div>
        <div style={tableRow}>
          <div style={labelCell}>الاسم</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{emp.fullName}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الرقم الوظيفي</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.code}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الرقم المدني</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{emp.civilId ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>المسمى الوظيفي</div>
          <div style={valueCell}>{emp.jobTitle ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>القسم / الإدارة</div>
          <div style={valueCell}>{emp.department ?? '—'}</div>
        </div>
      </div>

      <div style={tableWrapper}>
        <div style={sectionHeader}>تفاصيل الإنذار</div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ الإنذار</div>
          <div style={valueCell}>{issueDateStr()}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>درجة الإنذار</div>
          <div style={valueCell}>
            <WarningCheckboxRow lang="ar" printFields={printFields} onWarningLevelChange={onWarningLevelChange} />
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>سبب الإنذار</div>
          <div style={{ ...valueCell, minHeight: 48 }}>
            {printFields?.warningReason?.trim() ? <span>{printFields.warningReason}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تفاصيل المخالفة</div>
          <div style={{ ...valueCell, minHeight: 48 }}>
            {printFields?.violationDetails?.trim() ? <span>{printFields.violationDetails}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الإجراء التصحيحي</div>
          <div style={{ ...valueCell, minHeight: 40 }}>
            {printFields?.correctiveAction?.trim() ? <span>{printFields.correctiveAction}</span> : (<><span style={{ ...blankLine, width: '100%', display: 'block', marginBottom: 10 }} /><span style={{ ...blankLine, width: '100%', display: 'block' }} /></>)}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>ملاحظات إضافية</div>
          <div style={{ ...valueCell, minHeight: 36 }}>
            {printFields?.additionalNotes?.trim() ? <span>{printFields.additionalNotes}</span> : <span style={{ ...blankLine, width: '100%', display: 'block' }} />}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 14, fontSize: 12.5, color: '#374151', lineHeight: 1.7 }}>
        <p style={{ margin: 0 }}>
          أُفيد الموظف/ة المذكور/ة بهذا الإنذار، وأُحاط علماً بمضمونه، ويُلتزم
          بعدم تكرار المخالفة مستقبلاً وإلا تعرّض/تتعرّض للإجراءات التأديبية المقررة.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 16, fontSize: 13, color: '#374151' }}>
        <div>
          <strong>توقيع الموظف (إقرار الاستلام):</strong>
          <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <strong>توقيع المشرف المباشر:</strong>
          <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
        <div>
          <strong>التاريخ:</strong>
          <div style={{ marginTop: 24, borderBottom: '1px solid #64748b', width: '100%' }} />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Type-check — at this point ALL 8 FormLayout pages must be error-free**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors. If any errors remain they are in `EmploymentContract` (handled in Task 9) or indicate a missed migration.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/EmployeeWarning.tsx frontend/src/forms/EmployeeWarningTemplate.tsx
git commit -m "feat(forms): interactive warning level checkboxes and profile on EmployeeWarning"
```

---

## Task 9: EmploymentContract — Profile + buildContractPrintCSS

**Files:**
- Modify: `frontend/src/pages/EmploymentContract.tsx`
- Modify: `frontend/src/forms/EmploymentContractTemplate.tsx`

**What changes:**
- Template: `const PRINT_CSS` constant → `buildContractPrintCSS(profile: ProfileId): string` function; new `profile?: ProfileId` prop; `<style>` tag uses the function's output
- Page: add `profile` state (no URL seed); add `PrintProfileToggle` to preview toolbar; pass `profile` to template; fix print log from hardcoded `'full-template'` to `profile`

**Critical constraint:** The two-page layout — `.ec-p1` forces page break after Articles 1–6, `.ec-p2` is page 2 — must survive unchanged. Only the padding in `.ec-page` changes.

- [ ] **Step 1: Add `buildContractPrintCSS` to `frontend/src/forms/EmploymentContractTemplate.tsx`**

At the top of the file, add imports and replace `PRINT_CSS`:

```tsx
// Add these imports at the top:
import { ProfileId, PRINT_PROFILES, DEFAULT_PROFILE_ID, getPrintProfileStyle } from './shared/printProfiles';
```

Replace the `const PRINT_CSS = ...` block (lines 37–64) with:

```typescript
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
  .ec-p1 {
    break-after: page !important;
    page-break-after: always !important;
  }
  .ec-p2 {
    break-after: auto !important;
    page-break-after: auto !important;
  }
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

Update the `EmploymentContractTemplate` component signature and its `<style>` tag:

```tsx
// Before:
export default function EmploymentContractTemplate({ employee, params }: {
  employee: ContractEmployee;
  params: ContractParams;
}) {
  return (
    <>
      <style>{PRINT_CSS}</style>
      ...

// After:
export default function EmploymentContractTemplate({ employee, params, profile = DEFAULT_PROFILE_ID }: {
  employee: ContractEmployee;
  params: ContractParams;
  profile?: ProfileId;
}) {
  return (
    <>
      <style>{buildContractPrintCSS(profile)}</style>
      ...
```

The rest of the template JSX is **entirely unchanged**.

- [ ] **Step 2: Update `frontend/src/pages/EmploymentContract.tsx`**

Add imports at the top:
```tsx
import { DEFAULT_PROFILE_ID, ProfileId } from '../forms/shared/printProfiles';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
```

Add profile state inside `EmploymentContract` (after `formNumber`, before `mode`):
```tsx
const [profile, setProfile] = useState<ProfileId>(DEFAULT_PROFILE_ID);
```

In the **preview section** (`mode === 'preview' && employee`), add `PrintProfileToggle` to the no-print toolbar:
```tsx
        <div
          className="no-print"
          style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}
        >
          <button className="btn" onClick={() => window.print()}>
            🖨️ طباعة / حفظ PDF
          </button>
          <button className="btn secondary" onClick={() => setMode('params')}>
            ✏️ تعديل البيانات
          </button>
          <button className="btn secondary" onClick={() => employeeId ? navigate(-1) : setMode('selector')}>
            رجوع
          </button>
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
            {formNumber}
          </span>
        </div>
```

Pass `profile` to the template:
```tsx
        <EmploymentContractTemplate employee={employee} params={params} profile={profile} />
```

Update the print log (in the `useEffect` that logs when `mode === 'preview'`):
```tsx
        printMode: profile,   // was: 'full-template'
```

- [ ] **Step 3: Letterhead page-count verification (manual)**

Open the app. Navigate to any employee → Employment Contract → select a contract duration → click "معاينة وطباعة".

In the preview, click "ورق الشركة الرسمي" in the PrintProfileToggle.

On screen, confirm:
- Page 1 area contains Articles 1–6 only
- Page 2 area begins with Article 7
- Content does not visually overflow into a third page area

If the 40mm top margin pushes content into a third page: inside `buildContractPrintCSS`, add a letterhead-specific `font-size` reduction. Example:

```typescript
function buildContractPrintCSS(profile: ProfileId): string {
  const padding = getPrintProfileStyle(PRINT_PROFILES[profile]);
  const fontSize = profile === 'letterhead' ? '8pt' : '8.5pt';
  return `
    ...
    .ec-page {
      ...
      font-size: ${fontSize} !important;
      ...
    }
  `;
}
```

Do not reduce font size unless the verification step shows it is necessary.

- [ ] **Step 4: Type-check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors across the entire frontend

- [ ] **Step 5: Commit**

```bash
git add frontend/src/forms/EmploymentContractTemplate.tsx frontend/src/pages/EmploymentContract.tsx
git commit -m "feat(forms): add profile and buildContractPrintCSS to EmploymentContract"
```

---

## Task 10: Full Validation

- [ ] **Step 1: Prisma validate**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at ... is valid 🚀`

- [ ] **Step 2: Backend TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: zero errors (no backend files were modified)

- [ ] **Step 3: Frontend TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 4: Electron TypeScript**

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: zero errors (no electron files were modified)

- [ ] **Step 5: Backend tests**

```bash
cd backend && npm test
```

Expected: all pass (no backend files were modified)

- [ ] **Step 6: Backend build**

```bash
npm run build:back
```

Expected: exits 0, `backend/dist/` populated

- [ ] **Step 7: Frontend build**

```bash
npm run build:front
```

Expected: exits 0, `frontend/dist/` populated

- [ ] **Step 8: Manual print verification checklist**

Start the dev server: `npm run dev`

For each form listed below, open the form for any employee and verify:

| Check | Form | Expected |
|-------|------|---------|
| Plain A4 default | Any | PrintProfileToggle shows "A4 عادي" active on open |
| Letterhead toggle | Any | Toggle switches to "ورق الشركة الرسمي"; on print, company header is invisible (space preserved); top margin is 40mm |
| ?printMode=letterhead seed | Any | Open URL with `?printMode=letterhead`; toggle shows letterhead active immediately |
| Arabic mode | Any | AR content renders; blankLine shows for empty printFields |
| English mode | Any | EN content renders; blankLine shows for empty printFields |
| certPurpose filled (AR) | SalaryCertificate | "الغرض" row shows typed text, not blankLine |
| certPurpose filled (EN) | SalaryCertificate | "Purpose" row shows typed text |
| certPurpose empty | SalaryCertificate | "الغرض" / "Purpose" row shows blankLine |
| certPurpose filled (AR) | ToWhomItMayConcern | "الغرض من الشهادة:" shows typed text |
| certPurpose filled (EN) | ToWhomItMayConcern | "Purpose:" shows typed text |
| certPurpose empty | ToWhomItMayConcern | blankLine remains in both AR and EN |
| Conditional fields visible | LeaveRequest (employee with no leave) | 5 leave fields appear in no-print panel |
| Conditional fields hidden | LeaveRequest (employee with leave) | Only expectedReturnDate shown in no-print panel |
| Date formatting (AR) | LeaveRequest (printFields.startDate filled) | Prints as "١ يناير ٢٠٢٦", not "2026-01-01" |
| Date formatting (EN) | LeaveRequest (printFields.startDate filled) | Prints as "January 1, 2026" |
| Warning level — click select | EmployeeWarning | Clicking a checkbox fills it blue with ✓; others remain empty |
| Warning level — click deselect | EmployeeWarning | Clicking the active checkbox clears it |
| Warning level — keyboard | EmployeeWarning | Tab to checkbox, press Space → selects; press Space again → deselects |
| Warning level — print | EmployeeWarning (level selected) | Filled blue box with ✓ appears in print output |
| Warning level — color-blind | EmployeeWarning (level selected) | Border changes from grey (#94a3b8) to blue (#1d4e6f) when selected |
| Contract 2-page layout | EmploymentContract | Plain A4: page 1 = Articles 1–6; page 2 = Article 7 + NOTE |
| Contract letterhead layout | EmploymentContract | Letterhead: still exactly 2 pages (not 3) |
| Contract toggle visible | EmploymentContract | PrintProfileToggle appears in preview toolbar only (not in params or selector views) |
| Profile name in toolbar | Any FormLayout form | Toolbar shows "A4 عادي — MNR-xxx" or "ورق الشركة الرسمي — MNR-xxx" |
| No URL update on toggle | Any | Toggling profile does not change browser URL |

- [ ] **Step 9: Final commit (if any last-minute fixes were made)**

```bash
git add -p   # stage only what changed
git commit -m "fix(forms): post-validation corrections"
```

---

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| EmploymentContract letterhead spills to 3 pages | Low–Medium | Task 9 Step 3 verifies this before commit. If triggered, a per-profile font-size in `buildContractPrintCSS` resolves it without touching content. |
| `ProfileId = keyof typeof PRINT_PROFILES` breaks if PRINT_PROFILES is empty | Impossible | Registry always has at least `'plain-a4'` and `'letterhead'` as constants in the file. |
| Warning level `WarningLevel` type duplication between page and template | Low | The page and template define `WarningLevel` independently as `'' \| 'first' \| 'second' \| 'final'`. They are structurally identical — no runtime issue. Future cleanup: export from template and import in page. |
| `getProfileIdFromSearch` returns `'plain-a4'` for unknown `?printMode` values | By design | Unknown values silently fall back to the default. This is intentional. |
| `<style>` tag with dynamic content in EmploymentContractTemplate causes re-render flicker | Low | React's reconciliation reuses the `<style>` tag on re-render. Padding change is CSS-only and does not cause layout flash in practice. |
| Missing `blankLine` import in SalaryCertificateTemplate | Certain to fail if overlooked | Task 5 Step 2 explicitly adds `blankLine` to the import list. TypeScript will catch this at Step 3. |

---

## Rollback Plan

All work is on `feature/print-profiles-forms-completion-v1`. The `production` branch is untouched. Rollback is simply: do not merge the feature branch.

If mid-task rollback is needed (e.g., after Task 4 is committed but Task 5 causes problems): each task produces a clean commit. `git revert <task-commit-sha>` or `git reset --hard <known-good-sha>` restores any individual task's work.

The two new files (`printProfiles.ts`, `PrintProfileToggle.tsx`) have no side effects when not imported. Deleting them removes all profile behavior instantly.

---

## Deferred Items

| Item | Notes |
|------|-------|
| SalaryAdvance conditional print fields | When `latestAdvance === null`, amount and date show blank. Same fallback-chain pattern as LeaveRequest. Implement in follow-up branch. |
| Database persistence of profile preference | Settings module may support this in a future phase. |
| `letterhead-en` profile | One registry entry when needed — no other changes. |
| Invoice template selection UI | `templateId` state, separate from `profile`. Future branch. |
| Landscape orientation support | `page.orientation: 'landscape'` already typed. CSS `@page { size: A4 landscape; }` is the only addition. |

---

## Gemini Review Prompt

```
Please review this frontend-only branch for manarERP (Electron + React + TypeScript).

Branch: feature/print-profiles-forms-completion-v1
Base: production

Summary of changes:
1. New printProfiles.ts — extensible print profile registry (plain-a4, letterhead). ProfileId derived from registry keys. getPrintProfileStyle() returns CSS padding shorthand.
2. New PrintProfileToggle.tsx — segmented button toggle matching LanguageToggle style.
3. FormHeader.tsx — prop changed from printMode: PrintMode to isLetterhead: boolean.
4. FormLayout.tsx — prop changed from printMode: PrintMode to profile: ProfileId. Print CSS padding injected dynamically from profile margins.
5. 8 HR form pages — all migrated from URL-derived printMode to profile React state seeded once from ?printMode URL param.
6. SalaryCertificateTemplate — new certPurpose row in employee table (AR + EN).
7. ToWhomItMayConcernTemplate — existing blankLine in purpose slot now fillable via certPurpose printField.
8. LeaveRequestTemplate — extended PrintFields; 5 conditional fields with fallback chain; date values now pass through fmtDate/fmtDateEn.
9. EmployeeWarningTemplate — unified LEVELS array; interactive checkboxes (role=checkbox, aria-checked, keyboard support); onWarningLevelChange callback prop.
10. EmploymentContractTemplate — buildContractPrintCSS(profile) replaces PRINT_CSS constant; profile prop added.
11. EmploymentContract page — profile state; PrintProfileToggle in preview toolbar; print log updated from 'full-template' to profile.

Please review for:
- Architectural correctness (profile/template separation)
- TypeScript type safety (especially ProfileId derived from Record keys)
- Print CSS correctness — letterhead safe area, margin injection, A4 sizing
- Accessibility — warning level checkboxes: role, aria-checked, keyboard, color-blind border
- Fallback chain correctness in LeaveRequestTemplate (latestLeave → printField → blankLine)
- Date formatting — confirm no raw YYYY-MM-DD reaches print output
- Employment Contract two-page layout preservation under both profiles
- Any regressions in unchanged form templates

No backend, Prisma, or API changes. Frontend-only.
```

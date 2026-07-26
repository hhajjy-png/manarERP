# Operational Polish Suite Phase 4 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Seven focused UI/UX and bug-fix packages — company name standardization, multi-signature support, translation dictionary fix, bank statement import redesign, privacy button simplification, payroll analytics polish, and sidebar navigation cleanup.

**Architecture:** Frontend-only for Packages B–G; backend seed touched for Package A only. No new DB tables, no new permission keys, no route changes. All changes are within existing components and settings storage.

**Tech Stack:** React 18 + TypeScript, Zustand, Axios, Recharts, React Router HashRouter (Electron), i18n (custom `useT`/`t()`)

## Global Constraints

- Company full name Arabic: `شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م`
- Currency: Kuwaiti Dinar (د.ك), 3 decimal places
- All UI is Arabic-RTL unless showing English
- Do NOT commit, push, merge, or tag
- Run `tsc --noEmit` for backend, frontend, and electron after all changes
- HashRouter is mandatory — all routes use `#/` prefix in href anchors
- Setting keys are stored in the `settings` table as plain string key-value pairs

---

## Task 1: Package E — Privacy Button Simplification

**Files:**
- Modify: `frontend/src/components/Layout.tsx:57–77`

**Interfaces:**
- Consumes: `privacyMode: boolean`, `togglePrivacy: () => void`, `t()` from existing stores
- Produces: Simplified button that shows only emoji icon with tooltip

- [ ] **Step 1: Read Layout.tsx lines 57–77 to confirm current button structure**

Current (lines 57–77):
```tsx
<span className="pm-ui-only privacy-toggle-strip">
  {privacyMode ? (
    <button type="button" className="icon-btn privacy-btn privacy-btn--on" onClick={togglePrivacy} title={t('layout.privacy_on_title')}>
      🔒 <span className="privacy-label">{t('layout.privacy_on')}</span>
    </button>
  ) : (
    <button type="button" className="icon-btn privacy-btn privacy-btn--off" onClick={togglePrivacy} title={t('layout.privacy_rehide_title')}>
      🔓 <span className="privacy-label">{t('layout.privacy_rehide')}</span>
    </button>
  )}
</span>
```

- [ ] **Step 2: Replace the privacy toggle strip with icon-only buttons**

In `frontend/src/components/Layout.tsx`, replace lines 57–77 with:
```tsx
<span className="pm-ui-only privacy-toggle-strip">
  {privacyMode ? (
    <button
      type="button"
      className="icon-btn privacy-btn privacy-btn--on"
      onClick={togglePrivacy}
      title={t('layout.privacy_on_title')}
    >
      🔒
    </button>
  ) : (
    <button
      type="button"
      className="icon-btn privacy-btn privacy-btn--off"
      onClick={togglePrivacy}
      title={t('layout.privacy_rehide_title')}
    >
      🔓
    </button>
  )}
</span>
```

- [ ] **Step 3: Verify tooltip text is descriptive enough to stand alone**

Check `frontend/src/lib/i18n.ts` lines 15–20. Current values:
- Arabic: `layout.privacy_on_title` = `'القيم المالية مخفية — انقر للكشف'`  ✓ already informative
- Arabic: `layout.privacy_rehide_title` = `'إعادة تفعيل وضع الخصوصية'`  ✓ already informative

No i18n changes needed.

- [ ] **Step 4: Verify TypeScript — no errors expected**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors (pure JSX removal, no type changes)

---

## Task 2: Package G — Sidebar Navigation Cleanup

**Files:**
- Modify: `frontend/src/config/modules.tsx:331–377`
- Modify: `frontend/src/lib/i18n.ts` (add group translation key)

**Interfaces:**
- Consumes: Existing NAV array, `t()` function
- Produces: New `nav.group.import_center` group containing 4 import/analytics pages, removed from financial group

- [ ] **Step 1: Add import center group i18n keys**

In `frontend/src/lib/i18n.ts`, find the Arabic group translations (near `nav.group.financial`). Add:

Arabic section (find `'nav.group.financial': '...'`, add after):
```
'nav.group.import_center': 'مركز الاستيراد',
```

English section (same pattern, add after `'nav.group.financial'` in English block):
```
'nav.group.import_center': 'Import Center',
```

- [ ] **Step 2: Reorganize NAV array in modules.tsx**

In `frontend/src/config/modules.tsx`, the `nav.group.financial` section currently has these 4 items mixed with financial items:
```
{ key: 'payroll/bank-import',    label: 'nav.bank_import',          icon: 'file_upload',       permission: 'import.read' },
{ key: 'payroll/bank-analytics', label: 'nav.bank_analytics',       icon: 'bar_chart',         permission: 'import.read' },
{ key: 'bank-statement-import',  label: 'nav.bank_statement_import',icon: 'account_balance',   permission: 'bankStatementImport.read' },
{ key: 'bank-reconciliation',    label: 'nav.bank_reconciliation',  icon: 'balance',           permission: 'bankStatementImport.read' },
```

Remove those 4 items from `nav.group.financial` and add a new group after the financial group:
```tsx
{ group: 'nav.group.import_center', items: [
  { key: 'payroll/bank-import',    label: 'nav.bank_import',           icon: 'file_upload',     permission: 'import.read' },
  { key: 'payroll/bank-analytics', label: 'nav.bank_analytics',        icon: 'bar_chart',       permission: 'import.read' },
  { key: 'bank-statement-import',  label: 'nav.bank_statement_import', icon: 'account_balance', permission: 'bankStatementImport.read' },
  { key: 'bank-reconciliation',    label: 'nav.bank_reconciliation',   icon: 'balance',         permission: 'bankStatementImport.read' },
] },
```

Place this group between `nav.group.financial` and `nav.group.warehouse`.

The resulting `nav.group.financial` items list becomes:
```tsx
{ group: 'nav.group.financial', items: [
  { key: 'invoices',     label: 'nav.invoices',     icon: 'receipt_long',             permission: 'invoices.read' },
  { key: 'expenses',     label: 'nav.expenses',     icon: 'payments',                 permission: 'expenses.read' },
  { key: 'cheques',      label: 'nav.cheques',       icon: 'edit_note',               permission: 'cheques.read' },
  { key: 'salaries',     label: 'nav.salaries',     icon: 'account_balance_wallet',   permission: 'payroll.read' },
  { key: 'suppliers',    label: 'nav.suppliers',    icon: 'inventory_2',              permission: 'suppliers.read' },
  { key: 'accounting',   label: 'nav.accounting',   icon: 'account_balance',          permission: 'transactions.read' },
  { key: 'financial',    label: 'nav.financial',    icon: 'account_balance',          permission: 'statements.read' },
  { key: 'financial-ops',label: 'nav.financial_ops',icon: 'monitoring',               permission: 'financialdashboard.read' },
] },
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors

---

## Task 3: Package A — Company Name Standardization

**Target full Arabic name:** `شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م`

**Files:**
- Modify: `frontend/src/forms/shared/FormHeader.tsx:3–4`
- Modify: `frontend/src/pages/InvoicePreview.tsx:564,787`
- Modify: `frontend/src/pages/ReportPrint.tsx:76`
- Modify: `frontend/src/pages/DocumentVerify.tsx:65`
- Modify: `frontend/src/pages/Cheques.tsx:574`
- Modify: `frontend/src/lib/i18n.ts:861,941`
- Modify: `backend/prisma/seed.ts:264`
- Modify: `backend/src/shared/services/reportEngine/brandingLoader.ts:27`
- Modify: `backend/src/shared/services/reportEngine/styles.template.ts:48`
- Note: `frontend/src/print-templates/adapters/companyData.ts` — `nameAr` stays as `'شركة المنار الدولية'` (separate from taglineAr which is already correct); no change needed.

**Interfaces:**
- Produces: Everywhere the shortened company name appeared, the full official name is shown

- [ ] **Step 1: Fix FormHeader.tsx**

In `frontend/src/forms/shared/FormHeader.tsx`, replace line 3–4:
```typescript
const COMPANY_NAME_AR =
  'شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م';
```
With:
```typescript
const COMPANY_NAME_AR =
  'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م';
```

- [ ] **Step 2: Fix InvoicePreview.tsx (two occurrences)**

Occurrence 1 — line 564:
```tsx
<div style={{ fontWeight: 800, fontSize: 16, color: '#1d4e6f' }}>شركة المنار الدولية</div>
```
Replace with:
```tsx
<div style={{ fontWeight: 800, fontSize: 14, color: '#1d4e6f', lineHeight: 1.4 }}>شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م</div>
```
(Slightly smaller font to accommodate the longer name.)

Occurrence 2 — line 787:
```tsx
<div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>شركة المنار الدولية</div>
```
Replace with:
```tsx
<div style={{ fontSize: 10, color: '#64748b', marginBottom: 3 }}>شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م</div>
```

- [ ] **Step 3: Fix ReportPrint.tsx line 76**

Find the line:
```tsx
شركة المنار · تاريخ التقرير: {formatDate(new Date())}
```
Replace with:
```tsx
شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م · تاريخ التقرير: {formatDate(new Date())}
```

- [ ] **Step 4: Fix DocumentVerify.tsx line 65**

Find:
```tsx
شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م
```
Replace with:
```tsx
شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م
```

- [ ] **Step 5: Fix Cheques.tsx line 574**

Find:
```typescript
beneficiaryName: printTarget?.beneficiaryName ?? 'شركة المنار الدولية',
```
Replace with:
```typescript
beneficiaryName: printTarget?.beneficiaryName ?? 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م',
```

- [ ] **Step 6: Fix i18n.ts (two keys)**

Line 861 — payslip company:
```
'page.payslip.company': 'شركة المنار',
```
→
```
'page.payslip.company': 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م',
```

Line 941 — cheque company label:
```
'lbl.cheque.company': 'شركة المنار الدولية',
```
→
```
'lbl.cheque.company': 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م',
```

- [ ] **Step 7: Fix backend/prisma/seed.ts line 264**

Find:
```typescript
{ key: 'company.name', value: 'شركة المنار لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م', group: 'company' },
```
Replace with:
```typescript
{ key: 'company.name', value: 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م', group: 'company' },
```

- [ ] **Step 8: Fix backend brandingLoader.ts line 27**

Find:
```typescript
companyNameAr:  m['company.name']          ?? 'شركة المنار الدولية',
```
Replace with:
```typescript
companyNameAr:  m['company.name']          ?? 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م',
```

- [ ] **Step 9: Fix backend styles.template.ts line 48**

Find:
```typescript
content: "${branding?.companyNameAr ?? 'شركة المنار'}";
```
Replace with:
```typescript
content: "${branding?.companyNameAr ?? 'شركة المنار الدولية'}";
```
(Keep as short fallback in the CSS template — CSS `content` is for print headers where a full 60-char name would overflow. Keep the short form here.)

- [ ] **Step 10: TypeScript check for both frontend and backend**

```bash
cd frontend && npx tsc --noEmit
cd backend && npx tsc --noEmit
```
Expected: 0 errors (string literal changes only)

---

## Task 4: Package C — Translation Dictionary Add-Row Fix

**Files:**
- Modify: `frontend/src/pages/Settings.tsx:468–527`

**Root cause:** The IIFE pattern `{(() => { const setRows = ...; return (...) })()}` creates a fresh closure on every render. The `setRows` functional update should work — but in practice the click may register on the wrong state branch when the component re-renders during the click handler. Extracting to a named sub-component eliminates any ambiguity and also allows adding auto-scroll + focus feedback.

**Interfaces:**
- Consumes: `natDict`, `setNatDict`, `jobDict`, `setJobDict`, `dictTab` from parent Settings state
- Produces: Stable component that adds a row immediately with auto-focus on the new input

- [ ] **Step 1: Add a DictTable sub-component inside Settings.tsx (before the Settings function)**

Add this component directly above `export default function Settings()` (around line 33):

```tsx
function DictTable({
  rows,
  setRows,
}: {
  rows: { ar: string; en: string }[];
  setRows: React.Dispatch<React.SetStateAction<{ ar: string; en: string }[]>>;
}) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);

  function addRow() {
    setRows((prev) => [...prev, { ar: '', en: '' }]);
    // After state update and paint, scroll the new row into view and focus its input
    requestAnimationFrame(() => {
      const tbody = tbodyRef.current;
      if (!tbody) return;
      const lastRow = tbody.lastElementChild;
      if (lastRow) {
        lastRow.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const input = lastRow.querySelector<HTMLInputElement>('input');
        input?.focus();
      }
    });
  }

  return (
    <>
      <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)', width: '45%' }}>عربي</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: '1px solid var(--border)', width: '45%' }}>English</th>
              <th style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', width: '10%' }} aria-label="حذف"></th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px' }}>
                  <input
                    value={row.ar}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, ar: e.target.value } : r))}
                    style={{ width: '100%', fontSize: 13, border: 'none', background: 'transparent', textAlign: 'right' }}
                    title="الجنسية أو المسمى بالعربي"
                  />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input
                    value={row.en}
                    onChange={(e) => setRows((prev) => prev.map((r, j) => j === i ? { ...r, en: e.target.value } : r))}
                    style={{ width: '100%', fontSize: 13, border: 'none', background: 'transparent', direction: 'ltr' }}
                    title="Translation in English"
                  />
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 16, lineHeight: 1 }}
                    title="حذف"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button
        type="button"
        onClick={addRow}
        style={{ marginTop: 10, fontSize: 13, color: 'var(--primary)', background: 'none', border: '1px dashed var(--primary)', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', width: '100%' }}
      >
        + إضافة صف
      </button>
    </>
  );
}
```

Also add `useRef` to the import at the top of Settings.tsx (it already imports `useRef` — verify).

- [ ] **Step 2: Replace the IIFE block (lines 468–526) with DictTable usage**

Find the IIFE block starting with:
```tsx
{/* Dictionary Table */}
{(() => {
  const rows = dictTab === 'nat' ? natDict : jobDict;
  const setRows = dictTab === 'nat' ? setNatDict : setJobDict;
  return (
    <>
      ...
    </>
  );
})()}
```

Replace with:
```tsx
{/* Dictionary Table */}
{dictTab === 'nat'
  ? <DictTable rows={natDict} setRows={setNatDict} />
  : <DictTable rows={jobDict} setRows={setJobDict} />
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors

---

## Task 5: Package B — Multiple Signature Support

**Design:**
- New setting key: `print.signatures` — JSON array: `{ id: string; name?: string; title?: string; imageUrl: string; show: boolean }[]`
- On save, write back `print.signatureImage` = first signature's `imageUrl` and `print.showSignature` = first signature's `show` (backward compat for all print templates)
- On load, if `print.signatures` is absent but `print.signatureImage` exists, auto-migrate to first slot
- Print templates and BrandingLayoutDesigner: unchanged (they still read `print.signatureImage`)

**Files:**
- Modify: `frontend/src/pages/Settings.tsx` (add multi-sig types, state, UI, handlers)

**Interfaces:**
- Consumes: existing branding save pattern (`saveBrandingKey`, `api.put('/settings', ...)`)
- Produces: `print.signatures` JSON setting; `print.signatureImage` kept in sync

- [ ] **Step 1: Add the Signature type and migrate-on-load logic**

At the top of `Settings.tsx` (after imports, before `DEFAULT_VALUES`), add:
```typescript
interface SigSlot {
  id: string;
  name: string;
  title: string;
  imageUrl: string;
  show: boolean;
}

function migrateLegacySig(values: Record<string, string>): SigSlot[] {
  const raw = values['print.signatures'];
  if (raw) {
    try { return JSON.parse(raw) as SigSlot[]; } catch { /* fall through */ }
  }
  const legacy = values['print.signatureImage'];
  if (legacy) {
    return [{ id: 'sig-1', name: '', title: '', imageUrl: legacy, show: (values['print.showSignature'] ?? 'true') !== 'false' }];
  }
  return [];
}
```

- [ ] **Step 2: Add signatures state**

In the Settings component state block (around line 46–50), add:
```typescript
const [signatures, setSignatures] = useState<SigSlot[]>([]);
const sigFileRefs = useRef<Record<string, HTMLInputElement | null>>({});
```

- [ ] **Step 3: Populate signatures state in the useEffect**

In the `useEffect` body, after `setValues(v)` and before `setLoading(false)`, add:
```typescript
setSignatures(migrateLegacySig(v));
```

- [ ] **Step 4: Add signature handlers**

After `handleDeleteStamp()` (around line 217), add:

```typescript
function addSignature() {
  const id = `sig-${Date.now()}`;
  setSignatures((prev) => [...prev, { id, name: '', title: '', imageUrl: '', show: true }]);
}

function removeSignature(id: string) {
  setSignatures((prev) => prev.filter((s) => s.id !== id));
}

function updateSignatureMeta(id: string, field: 'name' | 'title', value: string) {
  setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, [field]: value } : s));
}

function toggleSignatureShow(id: string) {
  setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, show: !s.show } : s));
}

async function handleSigFileUpload(id: string, e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { setBrandingError('يرجى اختيار ملف صورة'); return; }
  if (file.size > 1_048_576) { setBrandingError('حجم الصورة يتجاوز 1 ميغابايت'); return; }
  setBrandingError('');
  setBrandingSaving(true);
  try {
    const dataUrl = await resizeImage(file, 500, 250);
    setSignatures((prev) => prev.map((s) => s.id === id ? { ...s, imageUrl: dataUrl } : s));
  } catch (err) { setBrandingError(err instanceof Error ? err.message : 'فشل رفع التوقيع'); }
  finally { setBrandingSaving(false); e.target.value = ''; }
}

async function saveSignatures(sigs: SigSlot[]) {
  const primary = sigs.find((s) => s.show) ?? sigs[0];
  const toSave = [
    { key: 'print.signatures',  value: JSON.stringify(sigs), group: 'print' },
    { key: 'print.signatureImage', value: primary?.imageUrl ?? '', group: 'print' },
    { key: 'print.showSignature',  value: primary?.show ? 'true' : 'false', group: 'print' },
  ];
  await api.put('/settings', { settings: toSave });
}
```

- [ ] **Step 5: Update the save() function to include signatures**

In the existing `save()` function, after `await api.put('/settings', { settings });`, add:
```typescript
await saveSignatures(signatures);
```

- [ ] **Step 6: Replace the "Signature Row" UI block with multi-sig UI**

Find the existing `{/* Signature Row */}` block (lines 287–335) and replace it with:

```tsx
{/* Multiple Signatures */}
<div style={{ marginBottom: 16 }}>
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
    <div className="branding-row-label">التوقيعات</div>
    <button type="button" className="btn btn-secondary" onClick={addSignature} disabled={brandingSaving} style={{ fontSize: 13 }}>
      + إضافة توقيع
    </button>
  </div>

  {signatures.length === 0 && (
    <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>لا توجد توقيعات — انقر «إضافة توقيع» لإضافة الأول.</p>
  )}

  {signatures.map((sig, idx) => (
    <div key={sig.id} className="branding-row" style={{ alignItems: 'flex-start', gap: 12, marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
      <div style={{ flex: '0 0 auto', fontWeight: 600, fontSize: 13, minWidth: 70, paddingTop: 6, color: 'var(--text-muted)' }}>
        توقيع {idx + 1}
        {idx === 0 && <span style={{ fontSize: 11, display: 'block', color: 'var(--primary)', marginTop: 2 }}>الرئيسي</span>}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>الاسم (اختياري)</label>
            <input
              value={sig.name}
              onChange={(e) => updateSignatureMeta(sig.id, 'name', e.target.value)}
              placeholder="مثال: المدير العام"
              style={{ fontSize: 13 }}
            />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label style={{ fontSize: 12 }}>المسمى الوظيفي (اختياري)</label>
            <input
              value={sig.title}
              onChange={(e) => updateSignatureMeta(sig.id, 'title', e.target.value)}
              placeholder="مثال: CEO"
              style={{ fontSize: 13 }}
            />
          </div>
        </div>
        <div className="branding-row-controls" style={{ marginBottom: 8 }}>
          {sig.imageUrl && (
            <img src={sig.imageUrl} alt={`توقيع ${idx + 1}`} className="branding-preview-img" />
          )}
          <input
            type="file"
            accept="image/*"
            hidden
            ref={(el) => { sigFileRefs.current[sig.id] = el; }}
            onChange={(e) => handleSigFileUpload(sig.id, e)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => sigFileRefs.current[sig.id]?.click()} disabled={brandingSaving}>
            {sig.imageUrl ? 'تغيير الصورة' : 'رفع صورة'}
          </button>
          <label className="branding-toggle-label">
            <input type="checkbox" checked={sig.show} onChange={() => toggleSignatureShow(sig.id)} />
            إظهار في المستندات
          </label>
          <button type="button" className="btn btn-danger" onClick={() => removeSignature(sig.id)} disabled={brandingSaving} style={{ marginInlineStart: 'auto' }}>
            حذف
          </button>
        </div>
      </div>
    </div>
  ))}

  {brandingError && brandingError.includes('توقيع') && (
    <div className="branding-error">{brandingError}</div>
  )}
</div>
```

- [ ] **Step 7: Remove the old single-signature refs (sigInputRef, handleSignatureUpload, handleDeleteSignature)**

The old `sigInputRef`, `handleSignatureUpload`, and `handleDeleteSignature` are now unused. Remove:
- `const sigInputRef = useRef<HTMLInputElement>(null);` (line 40)
- `handleSignatureUpload` function (lines 151–165)
- `handleDeleteSignature` function (lines 183–191)

Also remove from the `save()` function the old `brandingSettings` for `print.showSignature` — that is now handled by `saveSignatures()`.

Actually, `print.showSignature` was already in `save()` via `brandingSettings`. Since `saveSignatures()` now sets it too, remove it from `save()`:
```typescript
// Remove this from brandingSettings in save():
{ key: 'print.showSignature', value: values['print.showSignature'] ?? 'true', group: 'print' },
```

- [ ] **Step 8: Update BrandingLayoutDesigner call**

The `BrandingLayoutDesigner` still receives `signatureUrl`. Pass the primary signature's imageUrl:
```tsx
<BrandingLayoutDesigner
  signatureUrl={signatures.find((s) => s.show)?.imageUrl || signatures[0]?.imageUrl || undefined}
  stampUrl={values['print.stampImage'] || undefined}
  initialLayout={brandingLayout}
  onSave={handleDesignerSave}
  onClose={() => setDesignerOpen(false)}
/>
```

- [ ] **Step 9: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors

---

## Task 6: Package D — Bank Statement Import UX Redesign

**Goal:** Better layout, spacing, information hierarchy, and a working post-import navigation link. The workflow (upload → detect → preview → confirm → done) stays the same.

**Post-import bug:** After `handleExecute()` succeeds, `result.importId` is available. The current link `#/bank-reconciliation/${result.importId}` uses a hash href anchor. In HashRouter the correct format is `#/bank-reconciliation/${result.importId}`. Verify this matches the bank-reconciliation route and fix if needed.

**Files:**
- Modify: `frontend/src/pages/BankStatementImport.tsx` (full visual overhaul, keeping all state/logic)

**Interfaces:**
- Consumes: All existing state hooks, API functions, parseHelpers — unchanged
- Produces: Same 5-step wizard with improved visual design

- [ ] **Step 1: Replace the outer wrapper and header**

Find:
```tsx
return (
  <div className="max-w-6xl mx-auto p-6" dir="rtl">
    {/* Header */}
    <div className="mb-6">
      <h1 className="text-2xl font-bold text-gray-900">استيراد كشف الحساب البنكي</h1>
      <p className="text-gray-500 mt-1">رفع كشف الحساب وإجراء المطابقة الذكية مع السجلات المالية</p>
    </div>
```

Replace with:
```tsx
return (
  <div dir="rtl">
    {/* Header */}
    <div className="page-head">
      <div>
        <h2>استيراد كشف الحساب البنكي</h2>
        <p>رفع كشف الحساب وإجراء المطابقة الذكية مع السجلات المالية</p>
      </div>
    </div>

    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 8px' }}>
```

Close the extra wrapper div before the closing `</div>` at the very end of the JSX (before `}`).

- [ ] **Step 2: Redesign the step indicator**

Find the step indicator block and replace it with a more polished version:
```tsx
{/* Step indicator */}
<div className="card panel" style={{ marginBottom: 20, padding: '12px 20px' }}>
  <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
    {STEPS.map((s, i) => {
      const currentIdx = STEPS.findIndex((x) => x.id === step);
      const isDone = currentIdx > i;
      const isActive = step === s.id;
      return (
        <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontSize: 13,
              background: isDone ? 'var(--success, #22c55e)' : isActive ? 'var(--primary)' : 'var(--surface-2)',
              color: isDone || isActive ? '#fff' : 'var(--text-muted)',
            }}>
              {isDone ? '✓' : i + 1}
            </div>
            <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--primary)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
              {s.labelAr}
            </span>
          </div>
          {i < STEPS.length - 1 && (
            <div style={{ flex: 1, height: 2, background: isDone ? 'var(--success, #22c55e)' : 'var(--border)', margin: '0 8px', marginBottom: 20 }} />
          )}
        </div>
      );
    })}
  </div>
</div>
```

- [ ] **Step 3: Redesign the error display**

Replace:
```tsx
{error && (
  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
    {error}
  </div>
)}
```
With:
```tsx
{error && (
  <div className="card panel" style={{ marginBottom: 16, background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C', padding: '12px 16px', fontSize: 13 }}>
    <span style={{ fontWeight: 600 }}>خطأ: </span>{error}
  </div>
)}
```

- [ ] **Step 4: Redesign Step 1 — Upload**

Replace the upload step JSX:
```tsx
{step === 'upload' && (
  <div className="card panel" style={{ textAlign: 'center', padding: 48, cursor: 'pointer', border: '2px dashed var(--border)', transition: 'border-color 0.2s' }}
    onDragOver={(e) => e.preventDefault()}
    onDrop={onDrop}
    onClick={() => fileInputRef.current?.click()}
    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--primary)')}
    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
  >
    <div style={{ fontSize: 52, marginBottom: 16 }}>📂</div>
    <p style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>اسحب ملف كشف الحساب أو انقر للاختيار</p>
    <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Excel (.xlsx) أو CSV — الحد الأقصى 10 ميغابايت، 10,000 صف</p>
    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" hidden onChange={onFileChange} />
  </div>
)}
```

- [ ] **Step 5: Redesign Step 2 — Detect**

Replace the detect step JSX:
```tsx
{step === 'detect' && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    {/* Detected info card */}
    <div className="card panel">
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>نتيجة كشف البنك</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { label: 'الملف', value: fileName },
          { label: 'البنك المكتشف', value: BANK_NAMES[detectedBank] ?? detectedBank, highlight: true },
          { label: 'عدد الصفوف', value: parsedRows.length.toLocaleString() },
          { label: 'نوع الملف', value: fileType === 'excel' ? 'Excel' : 'CSV' },
        ].map(({ label, value, highlight }) => (
          <div key={label}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 14, fontWeight: 600, color: highlight ? 'var(--primary)' : 'var(--text)' }}>{value}</p>
          </div>
        ))}
      </div>
    </div>

    {/* Override bank */}
    <div className="card panel">
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>تغيير البنك يدوياً (اختياري)</h3>
      <select
        value={detectedBank}
        onChange={(e) => setDetectedBank(e.target.value)}
        style={{ border: '1px solid var(--border)', borderRadius: 6, padding: '8px 12px', fontSize: 13, background: 'var(--surface)' }}
        title="اختر البنك"
      >
        {Object.entries(BANK_NAMES).map(([key, label]) => (
          <option key={key} value={key}>{label}</option>
        ))}
      </select>
    </div>

    {/* Column headers */}
    <div className="card panel">
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>الأعمدة المكتشفة في الكشف</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {headers.map((h) => (
          <span key={h} style={{ padding: '4px 10px', background: 'var(--surface-2)', borderRadius: 20, fontSize: 12, color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{h}</span>
        ))}
      </div>
    </div>

    <div style={{ display: 'flex', gap: 12 }}>
      <button onClick={handlePreview} disabled={previewLoading || parsedRows.length === 0} className="btn" style={{ minWidth: 140 }}>
        {previewLoading ? 'جارٍ التحليل…' : 'تحليل الكشف'}
      </button>
      <button onClick={reset} className="btn btn-secondary">إعادة تعيين</button>
    </div>
  </div>
)}
```

- [ ] **Step 6: Redesign Step 3 — Preview**

Replace the preview step JSX (keep the transaction table logic identical, just improve the layout):
```tsx
{step === 'preview' && preview && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    {/* KPI summary cards */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
      {[
        { label: 'إجمالي الصفوف', value: preview.totalRows.toLocaleString(), color: '#3B82F6' },
        { label: 'صالحة',         value: preview.valid.toLocaleString(),      color: '#22C55E' },
        { label: 'بها أخطاء',    value: preview.invalid.toLocaleString(),     color: '#EF4444' },
        { label: 'مطابقة',       value: preview.matched.toLocaleString(),     color: '#6366F1' },
      ].map(({ label, value, color }) => (
        <div key={label} className="card panel" style={{ padding: '16px', textAlign: 'center' }}>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>{label}</p>
          <p style={{ fontSize: 26, fontWeight: 800, color, margin: 0 }}>{value}</p>
        </div>
      ))}
    </div>

    {/* Financial summary */}
    <div className="card panel">
      <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>الملخص المالي</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>إجمالي المدين</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#EF4444' }}><PrivateAmount value={preview.totalDebits} /></p>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>إجمالي الدائن</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#22C55E' }}><PrivateAmount value={preview.totalCredits} /></p>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>المصاريف البنكية</p>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{preview.bankFees}</p>
        </div>
      </div>
    </div>

    {!preview.canImport && (
      <div className="card panel" style={{ background: '#FEF2F2', borderColor: '#FECACA', color: '#B91C1C', fontSize: 13, padding: '12px 16px' }}>
        لا يمكن استيراد هذا الكشف — يوجد {preview.invalid} صف(وف) بها أخطاء. يرجى مراجعة الملف وإعادة رفعه.
      </div>
    )}

    {/* Transaction table */}
    <div className="card panel" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>معاينة المعاملات ({preview.rows.length} صف)</h3>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: 380 }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--surface-2)', position: 'sticky', top: 0 }}>
            <tr>
              {['#', 'التاريخ', 'الوصف', 'مدين', 'دائن', 'حالة', 'مطابقة'].map((h) => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {preview.rows.slice(0, 500).map((row: PreviewRow) => (
              <tr key={row.rowIndex} style={{ borderBottom: '1px solid var(--border)', background: row.errors.length > 0 ? '#FEF2F2' : row.warnings.length > 0 ? '#FFFBEB' : 'transparent' }}>
                <td style={{ padding: '6px 10px', color: 'var(--text-muted)' }}>{row.rowIndex + 1}</td>
                <td style={{ padding: '6px 10px' }}>{fmtDate(row.statementDate)}</td>
                <td style={{ padding: '6px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={row.description}>{row.description}</td>
                <td style={{ padding: '6px 10px', color: '#EF4444', fontWeight: row.debit > 0 ? 600 : 400 }}>{row.debit > 0 ? fmtAmount(row.debit) : ''}</td>
                <td style={{ padding: '6px 10px', color: '#22C55E', fontWeight: row.credit > 0 ? 600 : 400 }}>{row.credit > 0 ? fmtAmount(row.credit) : ''}</td>
                <td style={{ padding: '6px 10px' }}>
                  {row.errors.length > 0
                    ? <span style={{ padding: '2px 8px', background: '#FEE2E2', color: '#B91C1C', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>خطأ</span>
                    : row.warnings.length > 0
                    ? <span style={{ padding: '2px 8px', background: '#FEF9C3', color: '#92400E', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>تحذير</span>
                    : <span style={{ padding: '2px 8px', background: '#DCFCE7', color: '#166534', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>صالح</span>}
                  {row.isBankFee && <span style={{ marginInlineStart: 4, padding: '2px 8px', background: '#EDE9FE', color: '#5B21B6', borderRadius: 12, fontSize: 11 }}>رسوم</span>}
                </td>
                <td style={{ padding: '6px 10px', fontSize: 11, color: '#6366F1' }}>
                  {row.matchResult.best ? `${row.matchResult.best.confidence}% — ${row.matchResult.best.ref}` : '—'}
                </td>
              </tr>
            ))}
            {preview.rows.length > 500 && (
              <tr>
                <td colSpan={7} style={{ padding: '12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                  يُعرض 500 من {preview.rows.length} صف — جميع الصفوف ستُستورد
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 12 }}>
      <button onClick={() => setStep('confirm')} disabled={!preview.canImport} className="btn" style={{ minWidth: 160 }}>
        متابعة للتأكيد
      </button>
      <button onClick={reset} className="btn btn-secondary">إلغاء</button>
    </div>
  </div>
)}
```

- [ ] **Step 7: Redesign Step 4 — Confirm**

Replace the confirm step JSX:
```tsx
{step === 'confirm' && preview && (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <div className="card panel" style={{ background: '#FFFBEB', borderColor: '#FDE68A', padding: '20px 24px' }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: '#92400E', marginBottom: 8 }}>تأكيد الاستيراد</h2>
      <p style={{ fontSize: 13, color: '#78350F' }}>
        سيتم استيراد <strong>{preview.totalRows}</strong> معاملة بنكية من كشف{' '}
        <strong>{BANK_NAMES[preview.bankName] ?? preview.bankName}</strong>.{' '}
        لا يمكن التراجع عن هذه العملية بعد التأكيد.
      </p>
    </div>

    <div className="card panel">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[
          { label: 'البنك', value: BANK_NAMES[preview.bankName] ?? preview.bankName },
          { label: 'الملف', value: fileName },
          { label: 'من تاريخ', value: fmtDate(preview.fromDate) },
          { label: 'إلى تاريخ', value: fmtDate(preview.toDate) },
        ].map(({ label, value }) => (
          <div key={label}>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{value}</p>
          </div>
        ))}
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>المدين الإجمالي</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#EF4444' }}><PrivateAmount value={preview.totalDebits} /></p>
        </div>
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>الدائن الإجمالي</p>
          <p style={{ fontSize: 16, fontWeight: 700, color: '#22C55E' }}><PrivateAmount value={preview.totalCredits} /></p>
        </div>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 12 }}>
      <button onClick={handleExecute} disabled={loading} className="btn" style={{ minWidth: 160, background: '#16A34A', borderColor: '#16A34A' }}>
        {loading ? 'جارٍ الاستيراد…' : 'تأكيد الاستيراد'}
      </button>
      <button onClick={() => setStep('preview')} className="btn btn-secondary">رجوع</button>
    </div>
  </div>
)}
```

- [ ] **Step 8: Redesign Step 5 — Done (fix post-import link)**

Replace the done step JSX (fix: use `useNavigate` instead of anchor href for proper HashRouter navigation):
```tsx
{step === 'done' && result && (
  <div style={{ textAlign: 'center', padding: '40px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
    <div style={{ fontSize: 64 }}>✅</div>
    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#15803D' }}>تم الاستيراد بنجاح!</h2>

    <div className="card panel" style={{ textAlign: 'right', maxWidth: 400, width: '100%' }}>
      {[
        { label: 'البنك', value: BANK_NAMES[result.bankName] ?? result.bankName },
        { label: 'إجمالي الصفوف', value: result.totalRows.toLocaleString() },
      ].map(({ label, value }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{label}</span>
          <span style={{ fontWeight: 600, fontSize: 13 }}>{value}</span>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>المدين</span>
        <span style={{ fontWeight: 700, color: '#EF4444', fontSize: 13 }}><PrivateAmount value={result.totalDebits} /></span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>الدائن</span>
        <span style={{ fontWeight: 700, color: '#22C55E', fontSize: 13 }}><PrivateAmount value={result.totalCredits} /></span>
      </div>
    </div>

    <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
      <button
        className="btn"
        onClick={() => navigate(`/bank-reconciliation/${result.importId}`)}
      >
        الانتقال إلى مساحة المطابقة
      </button>
      <button onClick={reset} className="btn btn-secondary">استيراد كشف آخر</button>
    </div>
  </div>
)}
```

Also add `useNavigate` to the imports at the top if not already present:
```typescript
import { useNavigate } from 'react-router-dom';
```
And add `const navigate = useNavigate();` inside the component.

- [ ] **Step 9: Close the extra wrapper div**

Before the final `</div>` of the `return (`, add a closing `</div>` for the `maxWidth: 900` wrapper added in Step 1.

- [ ] **Step 10: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors

---

## Task 7: Package F — Payroll Analytics UI Improvement

**Goal:** Improve KPI cards (larger, cleaner), filter panel (grouped sections with Apply/Reset buttons), whitespace, and chart appearance. Backend unchanged.

**Files:**
- Modify: `frontend/src/pages/BankSalaryAnalytics.tsx`

**Interfaces:**
- Consumes: existing state, API calls, Recharts — unchanged
- Produces: Improved visual layout with Apply/Reset filter workflow

**Key change in filter UX:** Introduce explicit Apply/Reset buttons. `draftFilters` already exists — apply on button click instead of immediately on change (this matches current code that already has `appliedFilters` separate from `draftFilters`).

- [ ] **Step 1: Verify current Apply/Reset button pattern**

Read `frontend/src/pages/BankSalaryAnalytics.tsx` lines 200–340 to confirm `draftFilters` and `appliedFilters` are already separate. If `applyFilters` function doesn't exist yet, add:

```typescript
function applyFilters() {
  setAppliedFilters(draftFilters);
  setTxPage(1);
}

function resetFilters() {
  const empty: Filters = {};
  setDraftFilters(empty);
  setAppliedFilters(empty);
  setTxPage(1);
  setMonthQuickFilter(null);
  selectEmployee(null);
}
```

(Check if these already exist under different names like `clearAllFilters` — if so, reuse them.)

- [ ] **Step 2: Improve KPI cards**

Find the KPI cards rendering block (after the header section). The cards currently use Tailwind classes like `bg-white dark:bg-neutral-800 rounded-xl p-4 shadow-sm border`. Replace with a more prominent grid layout:

```tsx
{/* KPI Cards */}
{globalStats && (
  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 4 }}>
    {[
      {
        label: 'إجمالي المبالغ المحوّلة',
        value: fmt3(globalStats.totalAmount),
        unit: 'د.ك',
        icon: '💰',
        color: '#3B82F6',
      },
      {
        label: 'عدد عمليات التحويل',
        value: globalStats.totalPayments.toLocaleString(),
        unit: 'عملية',
        icon: '📋',
        color: '#8B5CF6',
      },
      {
        label: 'الموظفون المدرجون',
        value: globalStats.uniqueEmployees.toLocaleString(),
        unit: 'موظف',
        icon: '👥',
        color: '#10B981',
      },
    ].map(({ label, value, unit, icon, color }) => (
      <div key={label} className={card} style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 500 }}>{label}</p>
            <p style={{ fontSize: 28, fontWeight: 800, color, margin: 0, lineHeight: 1 }}>{value}</p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{unit}</p>
          </div>
          <span style={{ fontSize: 32 }}>{icon}</span>
        </div>
      </div>
    ))}
  </div>
)}
```

- [ ] **Step 3: Improve filter panel layout**

Find the `{filtersOpen && (<div className="mt-4 grid...">` block and replace it with grouped sections:

```tsx
{filtersOpen && (
  <div style={{ marginTop: 16 }}>
    {/* Group 1: Employee & Period */}
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>الموظف والفترة</p>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12 }}>
        {/* Employee autocomplete — keep existing JSX, just remove the ref wrapper's span/col classes */}
        <div ref={autocompleteRef} className="relative" style={{ position: 'relative' }}>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>الموظف</label>
          {/* ... existing autocomplete input and dropdown ... */}
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>السنة</label>
          {/* ... existing year select ... */}
        </div>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500, marginBottom: 4, display: 'block' }}>الشهر</label>
          {/* ... existing month select ... */}
        </div>
      </div>
    </div>

    {/* Group 2: Date range */}
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>نطاق التاريخ</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Date From / Date To — keep existing inputs */}
      </div>
    </div>

    {/* Group 3: Amount range */}
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>نطاق المبلغ (د.ك)</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Amount From / Amount To — keep existing inputs */}
      </div>
    </div>

    {/* Quick period chips */}
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>فترة سريعة:</span>
      {[
        { key: '3m', label: 'آخر 3 أشهر' },
        { key: '6m', label: 'آخر 6 أشهر' },
        { key: 'year', label: 'هذه السنة' },
      ].map(({ key, label }) => (
        <button
          key={key}
          type="button"
          onClick={() => applyMonthQuickFilter(key as '3m' | '6m' | 'year')}
          style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer', fontWeight: 600,
            border: monthQuickFilter === key ? '2px solid var(--primary)' : '1px solid var(--border)',
            background: monthQuickFilter === key ? 'var(--primary)' : 'transparent',
            color: monthQuickFilter === key ? '#fff' : 'var(--text)',
          }}
        >
          {label}
        </button>
      ))}
    </div>

    {/* Apply / Reset buttons */}
    <div style={{ display: 'flex', gap: 10, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
      <button type="button" className="btn" onClick={applyFilters} style={{ minWidth: 120 }}>
        تطبيق الفلاتر
      </button>
      <button type="button" className="btn btn-secondary" onClick={resetFilters}>
        إعادة تعيين
      </button>
    </div>
  </div>
)}
```

Note: Preserve all existing JSX for inputs/selects inside the group wrappers — only change the outer grid structure and add the group labels and Apply/Reset.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors

---

## Validation Task

- [ ] **Step 1: Backend TypeScript check**

```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 2: Frontend TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: Electron TypeScript check**

```bash
tsc -p electron/tsconfig.json --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Backend build**

```bash
npm run build:back
```
Expected: exits 0, `backend/dist/` populated

- [ ] **Step 5: Frontend build**

```bash
npm run build:front
```
Expected: exits 0, `frontend/dist/` populated

- [ ] **Step 6: Backend unit tests**

```bash
cd backend && npm test
```
Expected: all tests pass (company name changes in seed don't break test logic)

- [ ] **Step 7: Prisma validate**

```bash
cd backend && npx prisma validate
```
Expected: schema valid (no schema changes in this package)

---

## Manual QA Checklist

### Package A — Company Name
- [ ] Open Settings → company.name field shows the full correct name after re-seed (fresh install)
- [ ] Open an invoice print preview → company name shows full official name
- [ ] Open a report print → header shows full company name
- [ ] Open a document verification page → shows full correct name
- [ ] Print a payslip → company name in header is correct
- [ ] Cheque print fallback shows correct name when no beneficiary set

### Package B — Multiple Signatures
- [ ] Settings → signature section shows empty state with "إضافة توقيع" button
- [ ] Clicking add signature creates a new slot with name/title inputs and upload button
- [ ] Uploading an image works; preview renders correctly
- [ ] Toggle "إظهار في المستندات" works per slot
- [ ] Delete button removes the slot
- [ ] Adding 3 signatures and saving → reloading shows all 3
- [ ] Invoice print still shows the primary (first `show=true`) signature as before
- [ ] BrandingLayoutDesigner opens correctly and uses primary signature

### Package C — Translation Dictionary
- [ ] Settings → scroll to Translation Dictionary section
- [ ] Click "+ إضافة صف" → new empty row appears immediately and first input is focused
- [ ] Can type in both Arabic and English fields
- [ ] Delete button removes the row
- [ ] Tab switching works correctly (Nationalities ↔ Job Titles)
- [ ] Saving the dictionary works

### Package D — Bank Statement Import
- [ ] Navigate to Import Center → Bank Statement Import
- [ ] Upload step shows improved drag-drop area
- [ ] Step indicator updates correctly as you progress
- [ ] Detect step shows detected bank and columns in improved cards
- [ ] Preview step shows KPI summary cards and transaction table
- [ ] Confirm step shows amber warning card and summary
- [ ] After successful import, "انتقال إلى مساحة المطابقة" navigates to `/bank-reconciliation/{id}`
- [ ] "استيراد كشف آخر" resets and goes back to upload step

### Package E — Privacy Button
- [ ] Header shows only 🔒 icon when privacy mode is ON
- [ ] Header shows only 🔓 icon when privacy mode is OFF
- [ ] Hovering over icon shows descriptive tooltip
- [ ] Clicking toggles privacy mode correctly
- [ ] No text label visible in either state

### Package F — Payroll Analytics
- [ ] Navigate to Import Center → Payroll Analytics
- [ ] KPI cards show larger values with icons
- [ ] "إظهار الفلاتر" expands the filter panel
- [ ] Filter panel shows grouped sections (Employee/Period, Date Range, Amount Range)
- [ ] Quick period chips (آخر 3 أشهر, آخر 6 أشهر, هذه السنة) work
- [ ] "تطبيق الفلاتر" button applies draft filters
- [ ] "إعادة تعيين" clears all filters
- [ ] Charts render correctly after filter application

### Package G — Sidebar
- [ ] "مركز الاستيراد" group appears in sidebar between Financial and Warehouse sections
- [ ] Contains exactly 4 items: Payroll Bank Import, Payroll Analytics, Bank Statement Import, Bank Reconciliation
- [ ] Financial group no longer contains those 4 items
- [ ] All navigation links still work correctly
- [ ] Permissions still apply correctly (only users with `import.read` / `bankStatementImport.read` see the items)

---

## Architecture Notes

- **No DB schema changes** — Package B uses the existing `settings` key-value table
- **Backward compat** — `print.signatureImage` setting remains in sync after every signature save; existing print templates work without changes
- **Seed change** — Updated `company.name` in seed only affects fresh installs; existing installations have this value from their database (admin can update it in Settings)
- **HashRouter** — All in-app navigation in Package D uses `useNavigate()` not anchor href to respect the HashRouter pattern
- **i18n** — All new group labels added in both `ar` and `en` sections of `i18n.ts`

---

## Risks

1. **Package B — settings data size**: Each signature's `imageUrl` is a base64 string (~100–400KB). Storing 5 signatures in one settings row means `print.signatures` could be ~2MB. SQLite TEXT fields handle this fine; the `api.put('/settings')` payload may be large — acceptable for a desktop-only Electron app.
2. **Package D — bank-reconciliation route param**: The route `/bank-reconciliation/:importId` must exist in `App.tsx`. Verify before implementing `navigate('/bank-reconciliation/${result.importId}')`.
3. **Package F — applyMonthQuickFilter vs setMonthQuickFilter**: Current code immediately applies quick filters (`setAppliedFilters(newF)` inside `applyMonthQuickFilter`). With the new Apply button pattern, quick filters should also immediately apply (they're presets, not free-form). Keep this behavior.
4. **Package A — seed change**: Updating `company.name` in seed.ts does not automatically update existing databases. This is expected and noted in Architecture Notes. Add a migration note in the QA checklist to manually update via Settings if needed.

---

## Recommendations

- Run all 7 packages in a single feature branch (`feat/polish-phase4`) to keep the diff reviewable
- Implement in the task order above (E, G, A, C, B, D, F) — smallest first, building confidence before the larger packages
- Use Playwright to snapshot the Bank Statement Import before/after to verify layout improvements

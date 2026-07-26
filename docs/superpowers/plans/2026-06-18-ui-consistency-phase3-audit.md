# UI Consistency Phase 3 — Audit Report

Generated: 2026-06-18

---

## Summary

Five dominant inconsistency themes:

1. **Three competing input-styling systems** coexist: (a) CSS classes `.form-grid`/`.field` used by `FormDialog` and most Modal-based forms; (b) local `const inp: React.CSSProperties` objects repeated in at least six files — `Invoices.tsx`, `Expenses.tsx`, `Accounting.tsx`, `Attendance.tsx`, `Inventory.tsx`, and `Prices.tsx`; (c) `className="form-input"` in `Cheques.tsx`. None of these three systems maps to the other.
2. **Button order in footers is reversed** in `Attendance.tsx` (Cancel first, Save second) vs every other dialog (Save first, Cancel second).
3. **Validation error display is inconsistent**: standard pattern is `div.alert.error` at top of modal body; `Attendance.tsx` puts formError in the footer `<span>`; `Cheques.tsx` shows a page-level dismissable alert bar instead.
4. **Required markers are inconsistent**: `FormDialog` appends ` *` to label text; `Prices.tsx` uses `{!isEdit && '*'}` conditional rendering; `Expenses.tsx` embeds `*` directly in the label string.
5. **Dialog size is entirely unconstrained** — the `Modal` component has no `size` prop; all sizing relies on global `.modal` CSS. One confirmation dialog in `Cheques.tsx` uses raw divs instead of the `<Modal>` component.

---

## FormDialog Component Analysis

**What it standardises:**
- Renders inside `Modal`; uses `.form-grid` + `.field` CSS classes for all fields
- Auto-focuses first non-select field (`autoFocus={i === 0 && f.type !== 'select'}`)
- Required marker: appends `' *'` to label string
- No per-field inline styles; fields defined entirely via data schema
- Dirty-check guard via `canClose()` / `confirm()` before closing
- Error shown as `<div className="alert error">⚠️ {error}</div>` at top of form body
- Footer: `<button className="btn">{حفظ}</button>` first, then `<button className="btn secondary">{إلغاء}</button>`
- Save button disabled while `saving === true`
- No `size`/`width` prop; inherits global `.modal` width

**What it leaves to callers:**
- Dialog title (free string)
- Field schema (labels, types, required flags, options, placeholders)
- No Escape key handling beyond modal overlay click

**Files that use FormDialog directly:** Only `ResourcePage.tsx` (for Customers, Suppliers, Employees, Contracts, Equipment — all via `MODULES` config).

---

## Per-Page Findings

### ResourcePage.tsx
- **FormDialog usage:** Yes
- **Button order:** Save first, Cancel second (inherited from FormDialog) ✅
- **Save label:** `t('action.save')` ✅
- **Cancel label:** `t('action.cancel')` ✅
- **Save disabled on submit:** Yes ✅
- **Field heights:** No explicit height; `.field` CSS class ✅
- **Required markers:** `' *'` appended in label ✅
- **Validation messages:** `div.alert.error` top of modal body ✅
- **Auto-focus:** Yes ✅
- **Double-submit prevention:** Yes ✅
- **Inline styles:** `style={{ display: 'flex', alignItems: 'center', gap: 12 }}` on error alert div
- **Archive confirmation modal:** Uses `Modal` directly; **button order reversed — Cancel first, then "أرشفة"** ⚠️; hardcoded Arabic strings without `t()` ⚠️
- **Issues:** Archive dialog button order; hardcoded Arabic (i18n out of scope for Phase 3)

---

### Invoices.tsx
- **FormDialog usage:** No — three inline modals: CreateInvoice, EditInvoice, AddPayment, MonthlyReportModal
- **`const inp`** at file scope: `{ padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none' }`
- **Button order:** Save first, Cancel second ✅
- **Save disabled:** Yes ✅
- **Field heights:** `style={inp}` or `style={{ ...inp, ... }}` — no `.field` class ⚠️
- **Labels:** Some hardcoded Arabic (i18n out of scope); `' *'` required markers ✅
- **Validation messages:** `div.alert.error` at top ✅
- **Auto-focus:** None ⚠️
- **Double-submit prevention:** Yes (`submittingRef.current` + `setSaving`) ✅
- **Inline styles:** Pervasive — every input, select, container uses `style={{ }}`. `inp` constant spread on nearly all form elements.
- **Issues:** `const inp` inline style system; no auto-focus

---

### Expenses.tsx
- **FormDialog usage:** No — `ExpenseForm` component (inline)
- **`const INP`** at file scope: same values as `inp` in Invoices
- **Button order:** Save first, Cancel second ✅
- **Save disabled:** Yes ✅
- **Field heights:** `style={INP}` — no `.field` class ⚠️
- **Labels:** Some hardcoded Arabic with `*` embedded in label string (e.g., `'التصنيف *'`) ⚠️
- **Required markers:** Embedded in label string, not separate marker ⚠️
- **Validation messages:** `div.alert.error` at top ✅
- **Auto-focus:** None ⚠️
- **Inline styles:** All form fields use `style={INP}` spread
- **Issues:** `const INP` inline style system; `*` embedded in label string

---

### Salaries.tsx
- **FormDialog usage:** No — no modal dialogs
- **Pattern:** Toolbar filters with bare `<input>` and `<select>`; inline payment flow in table rows
- **Inline styles:** Minor: `style={{ marginBottom: 14 }}` on alerts, `style={{ fontSize: 12, padding: '2px 4px' }}` on inline select
- **Issues:** Inline payment select has hardcoded small padding — minor; acceptable for table-row context

---

### Users.tsx
- **FormDialog usage:** No — `Modal` used directly
- **Button order:** Save first, Cancel second ✅
- **Save disabled:** Yes ✅
- **Field heights:** No explicit height; `.form-grid`/`.field` classes ✅
- **Labels:** `t()` keys throughout ✅
- **Required markers:** `' *'` in label JSX ✅
- **Validation messages:** `div.alert.error` with `style={{ marginBottom: 12 }}` — minor inline style ⚠️
- **Auto-focus:** None ⚠️
- **Issues:** Minor inline style on alert; no auto-focus

---

### Settings.tsx
- **FormDialog usage:** No — page-level form (no modal)
- **Pattern:** `.form-grid`/`.field` classes ✅
- **`htmlFor`/`id`:** Used — best practice ✅
- **Issues:** None

---

### Backup.tsx
- **FormDialog usage:** No — no modals
- **Pattern:** Settings table with bare inputs inside `<td>` cells; no `<label>` elements
- **Inline styles:** `style={{ width: 120 }}` on time input; `style={{ width: 80 }}` on number input — hardcoded pixel widths ⚠️
- **Issues:** Hardcoded pixel widths on inputs; no label association (accessibility, low priority)

---

### Accounting.tsx
- **FormDialog usage:** No — `AccountForm` and `JournalEntryForm` use `Modal` directly
- **`const inp`** at file scope: same pattern as Invoices/Expenses
- **AccountForm button order:** Save first, Cancel second ✅
- **JournalEntryForm button order:** Save first, Cancel second ✅
- **JournalEntryDetails:** Single Close button — no save needed ✅
- **Save labels:** `t('action.save')` in AccountForm; `t('btn.acc.post_entry')` in JournalEntryForm (context-specific, acceptable) ✅
- **Close/Cancel labels:** `t('action.cancel')` and `t('action.close')` mixed — minor
- **Save disabled:** Yes ✅
- **Field heights:** `inp` on some fields; `.form-grid`/`.field` on others — **mixed approach** ⚠️
- **Validation messages:** `div.alert.error` at top ✅
- **Inline styles:** Line items use `style={{ ...inp, fontSize: 13 }}`; layout uses inline grid styles
- **Issues:** Mixed `inp` + CSS class system; inline grid styles on line item rows

---

### Reports.tsx
- **FormDialog usage:** No — no modal dialogs; filter bar only
- **Pattern:** `.field` class wrappers with `style={{ margin: 0, minWidth: ... }}` overrides
- **Labels:** `style={{ fontSize: 12 }}` hardcoded on every label ⚠️
- **Issues:** Inline label font-size; `style` overrides on `.field` class

---

### Dashboard.tsx
- **FormDialog usage:** No
- **Forms/Dialogs:** None — display-only page
- **Issues:** None ✅

---

### Cheques.tsx
- **FormDialog usage:** No — fully custom inline form
- **Pattern:** `className="form-input"` — unique class not used by any other page ⚠️
- **Button order (main form):** Save first, Cancel/Reset second ✅
- **Button order (mark-as-printed confirm modal):** **Cancel first, Save second — REVERSED** ⚠️
- **Cancel label:** `t('page.cheques.reset')` — unique label ⚠️
- **Save disabled:** Yes ✅
- **Labels:** All use `style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}` — fully inline styled, `fontSize: 12` ⚠️
- **Required markers:** `' *'` in label text ✅
- **Validation messages:** Page-level dismissable alert bar — NOT inside dialog ⚠️
- **Auto-focus:** None ⚠️
- **Print confirm modal:** Uses raw `div.modal-overlay > div.modal > div.modal-head/body/foot` instead of `<Modal>` component ⚠️
- **Issues:** `form-input` class; inline label styles; raw div modal; reversed button order in confirm; page-level error vs dialog-level

---

### Prices.tsx
- **FormDialog usage:** No — `PriceForm` uses `Modal` directly
- **`const inp`** at file scope: same pattern as Invoices/Expenses
- **Button order:** Save first, Cancel second ✅
- **Save disabled:** Yes ✅
- **Field heights:** `inp` on some fields, `.field` on others — **mixed** ⚠️
- **Labels:** Mix of `t()` and hardcoded Arabic ⚠️
- **Required markers:** `{!isEdit && '*'}` conditional — unique pattern ⚠️
- **Validation messages:** `div.alert.error` ✅
- **Inline styles:** `style={inp}` on inputs
- **Usage modal:** Close button labeled `t('action.close')` ✅
- **Issues:** Mixed `inp` + CSS system; unique required marker pattern; some hardcoded labels (i18n out of scope)

---

### Inventory.tsx
- **FormDialog usage:** No — all forms use `Modal` directly
- **`const inp`** at file scope: same pattern + `width: '100%', boxSizing: 'border-box'`
- **All form button orders:** Save first, Cancel second ✅
- **Save labels:** `t('action.save')` throughout ✅
- **Cancel labels:** `t('action.cancel')` throughout ✅
- **Save disabled:** Yes ✅
- **Field heights:** `inp` on line items; `.field` on others — **mixed** ⚠️
- **Validation messages:** `div.alert.error` ✅
- **`DetailModal`:** No footer! Only header ✕ to close ⚠️
- **Inline styles:** `style={inp}` on line item inputs; `style={{ gridColumn: '1 / -1' }}` on full-width fields
- **Issues:** Mixed `inp` + CSS system; DetailModal missing footer close button

---

### Attendance.tsx
- **FormDialog usage:** No — custom `AttendanceForm` + `Modal`
- **`const inp`** at file scope
- **Button order (Create/Edit footers):** **REVERSED — Cancel first, Save second** ⚠️⚠️
- **Button order (Delete modal):** Cancel first, Delete second (acceptable for destructive)
- **Save disabled:** Yes ✅
- **Labels:** All fully inline styled: `style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 13, color: 'var(--text-muted)' }}` ⚠️
- **Required markers:** `' *'` in label text ✅
- **Validation messages:** `formError` shown as `<span style={{ color: 'var(--red)', fontSize: 13, flex: 1 }}>` in the **footer** — unique/wrong pattern ⚠️⚠️
- **Auto-focus:** None ⚠️
- **Inline styles:** All labels fully inline styled; footer uses `style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}`
- **Issues:** Reversed button order; error in footer; all labels inline styled; `inp` system

---

## Cross-Cutting Issues (Priority Order)

### 🔴 HIGH — Issue 1: Three Competing Input Style Systems
- **Affected:** `Invoices.tsx`, `Expenses.tsx`, `Accounting.tsx`, `Attendance.tsx`, `Prices.tsx`, `Inventory.tsx` (local `const inp`); `Cheques.tsx` (`className="form-input"`)
- **Fix:** Create CSS class `.form-field-input` (values from `inp` object). Replace all `style={inp}` / `style={{ ...inp }}` with `className="form-field-input"`. Replace `className="form-input"` with `className="form-field-input"`.

### 🔴 HIGH — Issue 2: Button Order Reversed (Attendance.tsx)
- **Affected:** `Attendance.tsx` (Create, Edit modals)
- **Fix:** Swap buttons to: primary action first, Cancel second.

### 🔴 HIGH — Issue 3: Validation Error in Footer (Attendance.tsx)
- **Affected:** `Attendance.tsx` formError rendered in footer `<span>`
- **Fix:** Move to `<div className="alert error">⚠️ {formError}</div>` at top of modal body.

### 🟡 MEDIUM — Issue 4: Cheques Print Confirm Uses Raw Div Modal
- **Affected:** `Cheques.tsx` print confirmation
- **Fix:** Replace raw `div.modal-overlay > div.modal` with `<Modal>` component.

### 🟡 MEDIUM — Issue 5: Cheques Print Confirm Button Order Reversed
- **Affected:** `Cheques.tsx` print confirmation modal
- **Fix:** Swap to primary action first.

### 🟡 MEDIUM — Issue 6: Label Inline Styles (Attendance.tsx, Cheques.tsx, Reports.tsx)
- **Affected:** `Attendance.tsx` (`fontSize: 13, color: var(--text-muted)`), `Cheques.tsx` (`fontSize: 12`), `Reports.tsx` (`fontSize: 12`)
- **Fix:** Remove all inline `fontSize`/`color` from labels; let CSS cascade.

### 🟡 MEDIUM — Issue 7: Mixed inp+CSS in Accounting.tsx, Prices.tsx, Inventory.tsx
- **Affected:** `Accounting.tsx`, `Prices.tsx`, `Inventory.tsx` — use both `inp` and `.field` on different fields
- **Fix:** Replace `inp` with CSS class; use `.field` wrapper consistently.

### 🟢 LOW — Issue 8: Inventory DetailModal Missing Footer Close Button
- **Affected:** `Inventory.tsx` `DetailModal`
- **Fix:** Add close button in footer.

### 🟢 LOW — Issue 9: Backup.tsx Hardcoded Pixel Widths on Inputs
- **Affected:** `Backup.tsx`
- **Fix:** Remove `style={{ width: 120 }}` / `style={{ width: 80 }}`; use Tailwind or CSS class.

### 🟢 LOW — Issue 10: Reports.tsx `.field` Override with inline styles
- **Affected:** `Reports.tsx`
- **Fix:** Use Tailwind width utilities instead of inline `minWidth`; remove inline label fontSize.

---

## Recommended Unified Standards

### Input Fields
- **Class:** `form-field-input` (defines `padding: 10px 12px`, `border: 1px solid var(--border)`, `border-radius: 10px`, `background: var(--bg)`, `color: var(--text)`, `font-family: inherit`, `font-weight: 600`, `font-size: 14px`, standard `outline`/`focus` ring)
- **Wrapper:** `.field` class wrapping label + input

### Buttons
- **Primary action:** First in footer (leading side in RTL)
- **Cancel:** Second (trailing side)
- **Disabled during submit:** Yes always

### Validation Messages
- **Pattern:** `<div className="alert error">⚠️ {error}</div>` at top of modal body
- **Never** in footer, never as page-level bar for dialog-specific errors

### Dialog Width
- Current: global `.modal` CSS handles width — keep for now
- **Out of scope for Phase 3**: adding size prop to Modal component

### Required Markers
- **Standard:** `' *'` appended to label text (consistent with FormDialog)
- Fix `Prices.tsx` `{!isEdit && '*'}` → standard pattern

---

## Implementation Scope for Phase 3

### IN SCOPE
- Create `.form-field-input` CSS class and replace all `const inp` usages
- Fix button order in `Attendance.tsx` (Create, Edit modals)
- Move form error from `Attendance.tsx` footer to modal body top
- Replace `Cheques.tsx` raw div modal with `<Modal>` component
- Fix `Cheques.tsx` confirm button order
- Remove inline label font-size from `Attendance.tsx`, `Cheques.tsx`, `Reports.tsx`
- Remove inline pixel widths from `Backup.tsx` inputs
- Fix mixed `inp`+CSS in `Accounting.tsx`, `Prices.tsx`, `Inventory.tsx`
- Add footer close button to `Inventory.tsx` `DetailModal`
- Fix `Expenses.tsx` required marker (extract `*` from label string)

### OUT OF SCOPE (Phase 3)
- i18n wrapping of hardcoded Arabic strings (separate effort)
- Adding `htmlFor`/`id` associations (accessibility pass, separate)
- Adding `required` HTML attribute (accessibility pass, separate)
- Modal `size` prop (separate enhancement)
- Archive dialog i18n in `ResourcePage.tsx`

---

## Files Modified by Phase 3

| File | Changes |
|------|---------|
| `frontend/src/index.css` (or global CSS) | Add `.form-field-input` class |
| `Invoices.tsx` | Replace `inp` with `form-field-input` |
| `Expenses.tsx` | Replace `INP` with `form-field-input`; fix required marker |
| `Accounting.tsx` | Replace `inp` with `form-field-input` |
| `Attendance.tsx` | Replace `inp`; fix button order; move error to top; remove label inline styles |
| `Cheques.tsx` | Replace `form-input`; replace raw div modal with `<Modal>`; fix button order; remove label inline styles |
| `Prices.tsx` | Replace `inp`; fix required marker |
| `Inventory.tsx` | Replace `inp`; add DetailModal footer close button |
| `Backup.tsx` | Remove hardcoded pixel widths |
| `Reports.tsx` | Remove inline label font-size |

## Files Needing No Changes

| File | Reason |
|------|--------|
| `Dashboard.tsx` | Display-only |
| `FormDialog.tsx` | Already well-structured ✅ |
| `DataTable.tsx` | No inline forms |
| `Modal.tsx` | Minimal and clean |
| `Salaries.tsx` | No modal dialogs; toolbar acceptable |
| `Users.tsx` | Closest to standard; no critical issues |
| `Settings.tsx` | Best practice; no dialogs |
| `ResourcePage.tsx` | FormDialog handles it; archive dialog i18n is Phase 4 |

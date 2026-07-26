# Micro UX Audit — Phase 4 (2026-06-18)

## Summary: Top 5 Most Impactful Issues

1. **Modal.tsx has no Escape key handler** — every modal in the app can only be closed by clicking the X button or the overlay. Affects all users system-wide. One 8-line fix in Modal.tsx covers everything.

2. **`alert()` used as error display in 7+ pages** — ResourcePage (onDelete/onApprove), Invoices (cancel), Expenses (approve/reject/remove), Accounting (deleteAccount/cancelEntry), Inventory (all tab-level actions), Prices (archiveRow) — native alert blocks UI, breaks RTL, gives no recovery options.

3. **No success messages after mutations in 7 pages** — ResourcePage, Invoices, Expenses, Accounting, Attendance, Inventory, Prices all perform create/edit/delete/approve operations with zero confirmation feedback. Users don't know if actions completed.

4. **14 unguarded async handlers across 9 files** — no busy flag, button not disabled during submit. Double-clicking can silently create duplicate records or fire duplicate state mutations.

5. **Settings.tsx CSS bug** — both save-success and save-error render as `alert warn` (yellow), making success and failure visually indistinguishable.

---

## Per-Page Findings

### FormDialog.tsx — reference baseline ✅
- Double-Submit: `saving` state + `disabled={saving}` ✅
- Auto-Focus: first non-select field via `autoFocus={i === 0 && f.type !== 'select'}` ✅
- Keyboard UX: inherits Modal.tsx Escape gap
- Success/Error: error as `div.alert.error`; no success (calls onSaved) — acceptable

### Modal.tsx
- **Escape key: MISSING** — `onMouseDown={handleClose}` only handles overlay click; keyboard Escape ignored
- Fix: `useEffect` to add/remove `keydown` listener that calls `handleClose` on `e.key === 'Escape'`

### DataTable.tsx — reference baseline ✅
- Empty states: `isFiltered` → `t('msg.empty_filtered')` + reset button; else `emptyText ?? t('msg.empty')` ✅
- Pagination: no filter-reset-on-page-change issue ✅

### ResourcePage.tsx
- Double-Submit: `onConfirmArchive()` — button not disabled, no busy flag ❌; `onApprove()` — same ❌
- Error: `alert(errorMessage(err))` in onDelete + onApprove ❌
- Success: none after approve, archive, or delete ❌
- Technical debt: archive modal title/body hardcoded Arabic (not `t()`); `console.warn` lines 118, 124

### Invoices.tsx
- Double-Submit: `cancel()` — no guard at all ❌; AddPayment — `saving` but no `submittingRef` (acceptable)
- Error: `alert(errorMessage(e))` in cancel() ❌
- Success: none after invoice create/edit/payment ❌
- Technical debt: `ARABIC_MONTHS` duplicate #1; `billingYearOptions()` duplicate #1; `console.warn` lines 444, 1049

### Expenses.tsx
- Double-Submit: `ExpenseForm.submit()` — `setSaving` without `submittingRef` ❌; `approve()/reject()/remove()` — no busy flag ❌
- Error: `alert(errorMessage(e))` in approve/reject/remove ❌
- Success: none on any operation ❌
- Technical debt: `ARABIC_MONTHS` duplicate #2; `billingYearOptions()` duplicate #2; filter options/titles/errors hardcoded Arabic

### Salaries.tsx — reference baseline ✅
- Double-Submit: `busy` flag on all async ops ✅
- Success: `t('page.salaries.generated')` etc. ✅
- Error: inline `div.alert.error` ✅

### Accounting.tsx
- Double-Submit: `deleteAccount()` — no guard ❌; `cancelEntry()` — no guard ❌
- Error: `alert(errorMessage(e))` on deleteAccount + cancelEntry ❌
- Success: none on any operation ❌
- Auto-Focus: AccountForm, JournalEntryForm — no `autoFocus` on first field ❌

### Attendance.tsx
- Double-Submit: `saving` + `deleting` states, all guarded ✅
- Error: modal error — `div.alert.error` ✅; page-level error — missing ⚠️ prefix ❌
- Success: none on create/edit/delete ❌
- Auto-Focus: create/edit form — no `autoFocus` ❌

### Cheques.tsx
- Double-Submit: `handleSave()` guarded ✅; `handleCancel()` — button not disabled during async ❌; `handleMarkPrinted()` — no busy guard ❌
- Error: `formError` div missing ⚠️ prefix ❌
- Success: `alert success` div ✅

### Inventory.tsx
- Double-Submit: all 5 tab forms guarded ✅; `remove() x5`, `doPost()`, `post() x2`, `cancel()` — all unguarded ❌
- Error: `alert()` on all tab-level action handlers ❌; form errors inline ✅
- Success: none on any operation ❌
- Auto-Focus: all 5 forms — no `autoFocus` on first field ❌

### Prices.tsx
- Double-Submit: PriceForm guarded ✅; `archiveRow()` — no guard ❌
- Error: `alert()` in archiveRow ❌
- Success: none on create/edit ❌
- Auto-Focus: PriceForm — no `autoFocus` ❌

### Reports.tsx ✅ (no critical issues)
- Technical debt: `ARABIC_MONTHS` duplicate #3; report type labels hardcoded Arabic

### Backup.tsx ✅ (mostly good)
- `remove()` — button not disabled during delete (minor)

### Users.tsx
- Double-Submit: `onSave()` guarded ✅; `toggleActive()` — button not disabled during PUT ❌
- Auto-Focus: user form — no explicit `autoFocus` ❌
- Success: `showMsg(t('msg.users.X'))` ✅

### Settings.tsx
- **BUG**: both save-success and save-error render `<div className="alert warn">` — indistinguishable ❌

### Dashboard.tsx
- Technical debt: operational pending section all hardcoded Arabic (not `t()`)

### Maintenance.tsx
- Technical debt: `const inp: React.CSSProperties = { ... }` — sole remaining Phase 3 missed instance ❌

---

## Cross-Cutting Issues

### A. Double-Submit Gaps (must fix)
| File | Handler |
|------|---------|
| ResourcePage.tsx | onConfirmArchive(), onApprove() |
| Invoices.tsx | cancel() |
| Expenses.tsx | ExpenseForm.submit() (add submittingRef), approve(), reject(), remove() |
| Accounting.tsx | deleteAccount(), cancelEntry() |
| Cheques.tsx | handleCancel(), handleMarkPrinted() |
| Inventory.tsx | remove() ×5 tabs, doPost(), post() ×2, cancel() |
| Prices.tsx | archiveRow() |
| Users.tsx | toggleActive() |
| Backup.tsx | remove() (minor) |

### B. Replace alert() with Inline Errors
Files: ResourcePage, Invoices (cancel), Expenses, Accounting, Inventory, Prices

Replace with page-level `setError` state rendered as `<div className="alert error">⚠️ {error}</div>`
or (for modal actions) set `formError` before returning.

### C. Auto-Focus Gaps
Files: Accounting (AccountForm, JournalEntryForm), Attendance (create/edit), Inventory (5 forms), Prices (PriceForm), Users (form)

Add `autoFocus` to first `<input>` in each form.

### D. Success Messages Missing
Pages: ResourcePage, Invoices, Expenses, Accounting, Attendance, Inventory, Prices

Pattern from Salaries/Users:
```tsx
const [msg, setMsg] = useState('');
const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(''), 5000); };
// after successful mutation:
showMsg('تم الحفظ بنجاح');
// rendered:
{msg && <div className="alert ok">{msg}</div>}
```

### E. Missing ⚠️ on Error Divs
- Attendance.tsx page-level error
- Cheques.tsx formError div

### F. Technical Debt
- `ARABIC_MONTHS` defined in 4 files → extract to `frontend/src/utils/dateUtils.ts`
- `billingYearOptions()` defined in 2 files → same extraction target
- `console.warn` in ResourcePage (lines 118, 124) and Invoices (lines 444, 1049) → remove
- `Maintenance.tsx` — `const inp` remains → replace with `.field`/`.line-input`
- Settings.tsx — save message uses `alert warn` class for both success and failure → fix class

---

## Phase 4 Scope — IN SCOPE

- Modal.tsx Escape key handler (system-wide, tiny)
- Settings.tsx alert class bug fix
- Replace all `alert()` calls with inline error display
- Add busy guards to unguarded async handlers
- Add success messages to key pages (ResourcePage, Invoices, Expenses, Accounting, Attendance, Inventory, Prices)
- Add `autoFocus` to Modal-based forms (6 files)
- Add missing ⚠️ prefix to Attendance + Cheques error divs
- Extract ARABIC_MONTHS + billingYearOptions to shared util
- Remove console.warn from ResourcePage + Invoices
- Fix Maintenance.tsx const inp

## Phase 4 Scope — OUT OF SCOPE

- Hardcoded Arabic → t() translation (separate i18n pass)
- Search clear buttons (risky, many files)
- Cheques pagination usePersistedState (separate enhancement)
- Pagination UX (DataTable already handles correctly)

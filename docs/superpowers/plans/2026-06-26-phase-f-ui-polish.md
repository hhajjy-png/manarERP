# Phase F — UI Polish: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Improve the usability of shared UI components without redesigning any page. Deliver: column-visibility toggles on DataTable, inline field validation in FormDialog, a global keyboard-shortcut hook, a TruncatedText component for long strings, and improved empty states.

**Architecture:** Pure frontend work — no backend, no Prisma, no Electron changes. All improvements are additive: new optional props on existing components, new utility hooks, new small components. Existing callers continue to work unchanged.

**Tech Stack:** React 18, TypeScript 5.5, existing CSS classes.

**See also:** Master plan — `2026-06-26-operations-suite-master-plan.md`

## Global Constraints

- Do NOT change the visual design language — match existing spacing, colors, font sizes.
- All new props on existing components are **optional** with sane defaults so existing callers need zero changes.
- No new npm dependencies.
- `cd frontend && npx tsc --noEmit` must pass after every task.

---

## Repository Snapshot

### Files to create

| Path | Purpose |
|---|---|
| `frontend/src/utils/shortcuts.ts` | `useShortcut(key, handler)` hook |
| `frontend/src/components/TruncatedText.tsx` | Long text with tooltip |

### Files to modify

| Path | Change |
|---|---|
| `frontend/src/components/DataTable.tsx` | Add `columnVisibility` prop + toggle UI, improved empty state |
| `frontend/src/components/FormDialog.tsx` | Add inline required-field validation |

---

## Task F-1 — Keyboard shortcut hook

**Files:**
- Create: `frontend/src/utils/shortcuts.ts`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — produces:**
```typescript
export function useShortcut(
  key: string,        // e.g. 'Escape', 's', 'F5'
  handler: () => void,
  options?: { ctrl?: boolean; shift?: boolean; alt?: boolean; enabled?: boolean }
): void
```

- [ ] **Step 1:** Create `frontend/src/utils/shortcuts.ts`:

```typescript
import { useEffect } from 'react';

interface Options {
  ctrl?:    boolean;
  shift?:   boolean;
  alt?:     boolean;
  enabled?: boolean; // default true
}

export function useShortcut(
  key: string,
  handler: () => void,
  options: Options = {},
): void {
  const { ctrl = false, shift = false, alt = false, enabled = true } = options;

  useEffect(() => {
    if (!enabled) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== key) return;
      if (ctrl  && !e.ctrlKey)  return;
      if (shift && !e.shiftKey) return;
      if (alt   && !e.altKey)   return;
      // Don't fire when user is typing in an input/textarea/select
      const tag = (e.target as HTMLElement).tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) {
        // Allow Escape to fire even inside inputs
        if (key !== 'Escape') return;
      }
      e.preventDefault();
      handler();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [key, ctrl, shift, alt, enabled, handler]);
}
```

- [ ] **Step 2:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit:

```
git add frontend/src/utils/shortcuts.ts
git commit -m "feat(ui): add useShortcut keyboard hook"
```

---

## Task F-2 — TruncatedText component

**Files:**
- Create: `frontend/src/components/TruncatedText.tsx`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — produces:**
```typescript
interface Props {
  text: string | null | undefined;
  maxChars?: number; // default 40
  className?: string;
}
export default function TruncatedText(props: Props): JSX.Element
```

- [ ] **Step 1:** Create `frontend/src/components/TruncatedText.tsx`:

```typescript
interface Props {
  text: string | null | undefined;
  maxChars?: number;
  className?: string;
}

export default function TruncatedText({ text, maxChars = 40, className }: Props) {
  if (!text) return <span className={className}>—</span>;

  if (text.length <= maxChars) {
    return <span className={className}>{text}</span>;
  }

  const truncated = text.slice(0, maxChars) + '…';

  return (
    <span
      className={className}
      title={text}
      style={{ cursor: 'help' }}
    >
      {truncated}
    </span>
  );
}
```

- [ ] **Step 2:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit:

```
git add frontend/src/components/TruncatedText.tsx
git commit -m "feat(ui): add TruncatedText component with tooltip"
```

---

## Task F-3 — DataTable: column visibility toggle

**Files:**
- Modify: `frontend/src/components/DataTable.tsx`
- Test: `cd frontend && npx tsc --noEmit`, visual check

**New optional props:**
```typescript
interface Props {
  // ... existing props ...
  hiddenColumns?: string[];              // keys of columns to hide by default
  onColumnVisibilityChange?: (hidden: string[]) => void; // called when user toggles
}
```

- [ ] **Step 1:** In `DataTable.tsx`, add the two optional props to the `Props` interface:

```typescript
hiddenColumns?: string[];
onColumnVisibilityChange?: (hidden: string[]) => void;
```

- [ ] **Step 2:** Add internal state for hidden columns:

```typescript
const [hiddenCols, setHiddenCols] = useState<Set<string>>(
  () => new Set(hiddenColumns ?? []),
);
const [showColMenu, setShowColMenu] = useState(false);

function toggleCol(key: string) {
  setHiddenCols(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    onColumnVisibilityChange?.([...next]);
    return next;
  });
}
```

- [ ] **Step 3:** Replace the `columns.map` in `<thead>` with:

```tsx
{columns
  .filter(c => !hiddenCols.has(c.key))
  .map(c => <th key={c.key} scope="col">{t(c.label)}</th>)
}
```

Do the same in `<tbody>` cells: filter `columns` by `!hiddenCols.has(c.key)` before rendering.

- [ ] **Step 4:** Add a column-visibility toggle button in the table header area (above the table, aligned right). It opens a small dropdown menu listing all columns with checkboxes:

```tsx
<div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
  <div style={{ position: 'relative' }}>
    <button
      onClick={() => setShowColMenu(v => !v)}
      style={{ fontSize: 12, padding: '3px 10px', background: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 4, cursor: 'pointer' }}
    >
      الأعمدة ▾
    </button>
    {showColMenu && (
      <div
        style={{
          position: 'absolute', top: '100%', insetInlineEnd: 0, zIndex: 50,
          background: 'white', border: '1px solid #E5E7EB', borderRadius: 6,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', padding: '6px 0', minWidth: 160,
        }}
      >
        {columns.map(c => (
          <label
            key={c.key}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px', cursor: 'pointer', fontSize: 13 }}
          >
            <input
              type="checkbox"
              checked={!hiddenCols.has(c.key)}
              onChange={() => toggleCol(c.key)}
            />
            {t(c.label)}
          </label>
        ))}
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 5:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6:** Open app, navigate to any table page (e.g., Contracts), click "الأعمدة", toggle a column off and back on. Confirm table updates without errors.

- [ ] **Step 7:** Commit:

```
git add frontend/src/components/DataTable.tsx
git commit -m "feat(ui): add column visibility toggle to DataTable"
```

---

## Task F-4 — DataTable: improved empty state

**Files:**
- Modify: `frontend/src/components/DataTable.tsx`
- Test: `cd frontend && npx tsc --noEmit`

The current empty state is a plain "لا توجد بيانات" row. Improve it to show an icon and contextual text.

- [ ] **Step 1:** In `DataTable.tsx`, replace the existing empty-state `<tr>` with:

```tsx
{rows.length === 0 && !loading && (
  <tr>
    <td colSpan={colSpan} style={{ textAlign: 'center', padding: '40px 16px', color: '#9CA3AF' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>📋</div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        {isFiltered ? 'لا توجد نتائج مطابقة' : (emptyText || t('msg.empty'))}
      </div>
      {isFiltered && onResetFilters && (
        <button
          onClick={onResetFilters}
          style={{ marginTop: 8, fontSize: 13, color: '#3B82F6', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          مسح الفلاتر
        </button>
      )}
      {!isFiltered && emptyAction && (
        <div style={{ marginTop: 10 }}>{emptyAction}</div>
      )}
    </td>
  </tr>
)}
```

- [ ] **Step 2:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit:

```
git add frontend/src/components/DataTable.tsx
git commit -m "feat(ui): improve DataTable empty state"
```

---

## Task F-5 — FormDialog: inline required-field validation

**Files:**
- Modify: `frontend/src/components/FormDialog.tsx`
- Test: `cd frontend && npx tsc --noEmit`

The current `FormDialog` submits without client-side validation and relies entirely on server errors. Add browser-side validation for `required: true` fields before the API call.

- [ ] **Step 1:** In `FormDialog.tsx`, add a `fieldErrors` state:

```typescript
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
```

- [ ] **Step 2:** Before the `api.post` / `api.put` call in the submit handler, add validation:

```typescript
function validate(values: Record<string, string>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const field of fields) {
    if (field.required && !values[field.name]?.trim()) {
      errors[field.name] = `الحقل «${field.label}» مطلوب`;
    }
  }
  return errors;
}

// In submit handler:
const errors = validate(form);
if (Object.keys(errors).length > 0) {
  setFieldErrors(errors);
  return; // stop — do not call API
}
setFieldErrors({});
```

- [ ] **Step 3:** In the JSX rendering each field, show the error message below the input if one exists:

```tsx
{fieldErrors[f.name] && (
  <span style={{ color: '#EF4444', fontSize: 12, marginTop: 2, display: 'block' }}>
    {fieldErrors[f.name]}
  </span>
)}
```

Also add a red border to the input when an error exists:

```tsx
style={{ borderColor: fieldErrors[f.name] ? '#EF4444' : undefined }}
```

- [ ] **Step 4:** Clear the specific field error when the user starts editing that field:

```tsx
onChange={e => {
  setForm(prev => ({ ...prev, [f.name]: e.target.value }));
  if (fieldErrors[f.name]) {
    setFieldErrors(prev => { const n = { ...prev }; delete n[f.name]; return n; });
  }
}}
```

- [ ] **Step 5:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6:** Open app, open any FormDialog with a required field, click Save without filling it. Confirm the red error message appears. Fill in the field, confirm the error clears.

- [ ] **Step 7:** Commit:

```
git add frontend/src/components/FormDialog.tsx
git commit -m "feat(ui): add inline required-field validation to FormDialog"
```

---

## Phase F Summary

| | Count |
|---|---|
| Files created | 2 |
| Files modified | 2 |
| Estimated new LOC | ~300 |
| Prisma migrations | 0 |
| Backend changes | None |
| Electron changes | None |

**Risks:**
- The column-visibility menu closes on the next click outside (standard dropdown behavior). A `useEffect` that listens for `mousedown` outside the menu ref is the standard pattern — if the menu stays open after clicking away, add an outside-click handler.
- `FormDialog` validates only `required: true` fields. Type-specific validation (e.g., number ranges, date formats) is out of scope for this phase.
- `useShortcut` is exported but not wired into any page in Phase F — it is infrastructure for future use. This is intentional.

# UI Consistency Pack — Phase 3: Forms & Dialogs

**Date:** 2026-06-18
**Branch:** feature/ui-consistency-phase3-forms
**Checkpoint Tag:** pre-ui-consistency-phase3-forms
**Stable Tag:** (assigned after Gemini review)

---

## Objective

Unify all Dialogs and Forms across manarERP without changing business logic or redesigning the UI.
Polish and consistency only.

---

## Global Constraints

- NO API changes
- NO database/schema changes
- NO new permissions or permission keys
- NO workflow changes
- NO redesign
- NO new libraries
- Frontend TypeScript must pass (`cd frontend && npx tsc --noEmit`)
- Backend TypeScript must pass (`cd backend && npx tsc --noEmit`)
- Electron TypeScript must pass (`tsc -p electron/tsconfig.json --noEmit`)
- All backend tests must pass (`cd backend && npm test`)
- Every Dialog must still open, close, save, cancel correctly
- No functional regressions
- Merge blocked until Gemini review completes

---

## Tasks

### Task 1: Audit — Catalog all Form/Dialog inconsistencies

**Scope:** Read-only exploration of all pages and components that contain forms or dialogs.

Catalog every inconsistency across:
- FormDialog component (`frontend/src/components/FormDialog.tsx`)
- All pages: Customers, Suppliers, Employees, Contracts, Invoices, Expenses,
  Equipment, Cheques, Payroll/Salaries, Users, Settings, Backup, Accounting, Reports, Dashboard
- Any inline form or modal not using FormDialog

Extract inconsistencies in:
- Label styles / spacing / Arabic RTL alignment
- Required marker (*, text color, position)
- Placeholder text style
- Field heights and sizing (input, textarea, select, date, number)
- Field margins / gaps
- Button order (Save → Cancel vs Cancel → Save)
- Header/footer padding
- Dialog width/max-width
- Validation message styling/spacing
- Tab order / auto-focus
- Keyboard navigation (Escape to close, Enter behavior)
- Double-submit prevention
- Inline styles (one-off styles that should move to classes)

**Deliverable:** A detailed audit report written to `docs/superpowers/plans/2026-06-18-ui-consistency-phase3-audit.md`
listing every file, every inconsistency found, and the recommended fix.

---

### Task 2: Unify FormDialog core component

**Scope:** `frontend/src/components/FormDialog.tsx` and shared CSS/Tailwind patterns.

Using the audit findings from Task 1:
- Standardize Dialog header: consistent padding, font size, close button position
- Standardize Dialog footer: consistent padding, button order (primary action left, cancel right)
- Standardize Dialog width/max-width per dialog size (sm/md/lg)
- Add standard auto-focus behavior (first focusable field)
- Ensure Escape closes dialog
- Prevent double-submit on save buttons (disable while submitting)
- Standardize required marker (consistent color/position)
- Standardize validation message spacing below fields

---

### Task 3: Unify field styles across all forms

**Scope:** All form fields (input, textarea, select, date, number) across all pages.

- Unify field height (all inputs same height)
- Unify field margins (consistent vertical gap between fields)
- Unify font size in fields
- Unify placeholder style
- Unify disabled style
- Unify focus ring style
- Remove one-off inline styles on fields (move to CSS class or Tailwind)

Focus on pages: Customers, Suppliers, Employees, Contracts, Invoices, Expenses, Equipment, Cheques.

---

### Task 4: Unify button order and keyboard UX across remaining pages

**Scope:** Payroll/Salaries, Users, Settings, Backup, Accounting, Reports, and any pages not covered in Task 3.

- Fix button order where it differs from standard (primary → cancel)
- Add auto-focus to first logical field in each dialog
- Ensure Tab order follows visual order (top-left to bottom-right)
- Ensure Enter key does not accidentally submit forms
- Ensure Escape closes modals
- Fix any double-submit vulnerability

---

### Task 5: Validation UX unification

**Scope:** All forms with validation feedback.

- Unify error message style (color, font size, spacing)
- Ensure required field indicators are consistent
- Ensure error messages appear in same relative position (below field)
- No overlapping/truncated error messages
- Clean up any inconsistent Zod/backend error display patterns

---

### Task 6: Remove unnecessary inline styles

**Scope:** All form/dialog files touched in Tasks 2–5.

- Remove inline styles that duplicate Tailwind classes
- Remove inline styles that were one-off overrides now unified by the shared classes
- Document (in audit report) any inline styles that MUST remain (e.g., dynamic widths driven by data)

---

## Validation Steps (after all tasks)

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit
cd backend && npx prisma validate
cd backend && npm test
```

---

## Self-Review Checklist

- [ ] Every Dialog opens and closes correctly
- [ ] Save works in every Dialog
- [ ] Cancel works in every Dialog
- [ ] No accidental submit
- [ ] No functional changes
- [ ] No breaking changes
- [ ] No new permissions
- [ ] No API changes
- [ ] No schema changes

---

## Deliverable for Gemini

A final report covering:
1. Implementation plan
2. Pages/components reviewed
3. Files modified
4. What was unified
5. What was NOT changed and why
6. Functional changes: none
7. New permissions: none
8. Migrations: none
9. TypeScript results
10. Prisma results
11. Test results
12. Ready for Gemini review: yes/no

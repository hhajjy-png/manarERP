# UI Consistency Pack — Phase 4: Micro UX (Final Polish)

**Date:** 2026-06-18
**Branch:** feature/ui-consistency-phase4-micro-ux
**Checkpoint Tag:** pre-ui-consistency-phase4-micro-ux

---

## Objective

Raise UX quality across all pages with micro-polish: prevent double-submit, add
auto-focus, unify success/error messages, fix empty states, clean up small technical
debt. No business logic changes. No redesign. Polish only.

---

## Global Constraints

- NO API changes
- NO database/schema changes
- NO new permissions
- NO workflow changes
- NO redesign
- NO new libraries
- Frontend TypeScript must pass (`cd frontend && npx tsc --noEmit`)
- Backend TypeScript must pass (`cd backend && npx tsc --noEmit`)
- Electron TypeScript must pass (`npx tsc -p electron/tsconfig.json --noEmit`)
- All 349 backend tests must pass
- No functional regressions
- Merge blocked until Gemini review

---

## Task 1: Audit — Catalog all Micro UX gaps

Read-only exploration of all frontend pages and components.

Produce a detailed audit report at:
`docs/superpowers/plans/2026-06-18-ui-consistency-phase4-audit.md`

Catalog per page:
- Double-submit risk (buttons without disabled-during-submit)
- Auto-focus gaps (dialogs that open without focusing first field)
- Keyboard UX (Escape closes, Enter safety, Tab order)
- Success message consistency (text, duration, placement)
- Error message consistency (no stack traces, no English leakage)
- Empty state messages (consistency across ResourcePage modules)
- Search UX (clear button, placeholder, reset behavior)
- Pagination UX issues
- Scroll / overflow issues
- Small inline styles or technical debt

---

## Task 2: Double-Submit Prevention

**Scope:** Any save/update/approve/delete/print/export button not yet guarded.

Audit findings from Task 1 will identify which buttons are unprotected.

Standard pattern:
```tsx
const [saving, setSaving] = useState(false);
// in handler:
if (saving) return;
setSaving(true);
try { ... } finally { setSaving(false); }
// on button:
<button disabled={saving}>
  {saving ? '...' : t('action.save')}
</button>
```

Do NOT re-implement buttons already guarded in Phase 1–3.

---

## Task 3: Auto-Focus + Keyboard UX

**Scope:** Dialogs identified in audit as missing auto-focus.

Standard: first logical field gets `autoFocus` prop.
For Escape: Modal component already handles overlay-click close; check if
`onKeyDown` Escape is needed on the modal-body for dialogs that don't use
the Modal component overlay.
Do NOT add Ctrl+S shortcuts (out of scope).

---

## Task 4: Success/Error Message Unification

**Scope:** All pages with success/error toast or inline alerts.

Check for:
- Mixed Arabic/English in the same message
- Missing ⚠️ prefix on errors
- Success messages that differ unnecessarily between pages
- Hardcoded strings that should use i18n keys

Only fix clear inconsistencies. Do not refactor the entire i18n system.

---

## Task 5: Empty States + Search UX

**Scope:** ResourcePage and any page with a data table.

Empty state unification:
- Standard: `<div className="center-msg">لا توجد بيانات</div>` (existing class)
- Check all pages use this or an equivalent consistent message

Search UX:
- Clear/reset button present on all pages with search
- Placeholder text meaningful and Arabic

---

## Task 6: Technical Debt Cleanup

**Scope:** Small items from audit — inline styles, duplicate consts, minor
CSS inconsistencies not covered in Phases 1–3.

Keep changes minimal. One-line fixes only. No refactoring.

---

## Validation

```bash
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
npx tsc -p electron/tsconfig.json --noEmit
cd backend && npx prisma validate
cd backend && npm test
```

---

## Self-Review Checklist

- [ ] No functional changes
- [ ] No breaking changes
- [ ] No new permissions
- [ ] No API changes
- [ ] No schema changes
- [ ] All dialogs open/close/save/cancel correctly
- [ ] No regression in existing features

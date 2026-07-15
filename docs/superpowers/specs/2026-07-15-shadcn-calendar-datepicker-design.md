# DateInput Calendar Picker — shadcn/react-day-picker Integration v1

**Status:** Approved (architecture + four implementation rules), 2026-07-15
**Scope:** Frontend only. Replaces `DateInput`'s internal picker mechanism only.

## Goal

`DateInput` (`frontend/src/components/DateInput.tsx`) shows a masked DD/MM/YYYY
text field with a calendar icon that today only triggers the **native
OS/browser** date picker (a hidden `<input type="date">` + `showPicker()`).
There is no custom-drawn calendar anywhere in the app, and no date library is
installed.

Goal: replace that native picker with an official, actively-maintained
calendar UI (fast month/year navigation, on-brand later, Arabic-aware) —
**without hand-rolling calendar/date-grid logic**, and **without changing
`DateInput`'s public API** so its 34+ existing call sites need zero changes.

## Decision: adopt shadcn's official Calendar, full toolchain

Considered and rejected: a hand-rolled calendar component (rejected — the
project decision is to avoid maintaining bespoke calendar logic), and a
"hybrid" install of only `react-day-picker` while skinning it with the
project's existing plain-CSS system (rejected — the explicit direction is the
full official shadcn toolchain, installed as-is).

**New dependencies** (in `frontend/`):
- `react-day-picker` + `date-fns` — the calendar engine (date grid, leap
  years, keyboard nav, ARIA, month/year navigation, disabled-date matching).
- `tailwindcss` + `@tailwindcss/vite` — Tailwind v4, registered via the
  `tailwindcss()` Vite plugin. Build-time only; no runtime/CDN dependency
  (compatible with the offline-only Electron constraint).
- `lucide-react` — icons used by shadcn's `Calendar`/`Button` reference
  files. Material Symbols elsewhere in the app is untouched; scoped to this
  new component tree only.
- `class-variance-authority`, `clsx`, `tailwind-merge`, `@radix-ui/react-slot`,
  `@radix-ui/react-popover` — shadcn's `Button`/`Popover`/`cn()` plumbing.

**New scaffolding** (via `npx shadcn@latest init` + `add calendar button
popover`, run inside `frontend/`):
- `frontend/components.json`
- `frontend/src/lib/utils.ts` (`cn()`)
- `frontend/src/components/ui/{calendar,button,popover}.tsx` — official
  reference files
- `@/*` → `frontend/src/*` path alias in `tsconfig.json` + `vite.config.ts`
  (verified not to collide with any existing alias/import)
- A new Tailwind entry stylesheet (e.g. `frontend/src/app/tailwind.css`),
  imported once at the app root alongside the existing `theme.css`

### Preflight is disabled

Tailwind's default `@import "tailwindcss";` bundles **Preflight**, a global
element reset (resets margins, headings, buttons, form elements app-wide via
bare-tag selectors). Loading that over 295 releases of hand-rolled CSS would
almost certainly regress unrelated pages. The entry stylesheet instead uses
Tailwind's documented granular import, keeping the theme + utilities layers
without the base reset:

```css
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```

Tailwind v4 auto-scans source files for class usage (no content-glob config
needed), so generated utility CSS naturally stays scoped to what the new
components actually use.

## Standing architectural rule (governs all future shadcn adoption, not just this component)

> Official shadcn component files (`components/ui/*`) should remain as close
> to upstream as practical. They are **initially imported as the official
> reference implementation**; after integration is verified working,
> ERP-specific customization is expected, but always **preserving
> compatibility with the upstream component where practical**. ERP-specific
> behavior, styling, and business presentation are implemented through
> **wrappers, composition, theme overrides, or extension points** (props like
> `formatters`/`modifiers`/`classNames`, or a wrapper component) whenever
> practical, instead of editing the vendor files directly. This keeps future
> `npx shadcn@latest add <component>` updates low-conflict.

## Component composition

**New wrapper** (ERP-specific; lives outside `components/ui/`):
`frontend/src/components/DateCalendarPicker.tsx`

- **Props**: `value: string` (ISO `YYYY-MM-DD` or `''`), `onChange: (iso:
  string) => void`, `min?`, `max?` (ISO), `disabled?: boolean`.
- **ISO ⇄ Date**: react-day-picker works in JS `Date`. Per this codebase's
  established date-safety convention (never build a `Date` from a date-only
  string via UTC parsing — see `lib/date.ts`'s `toLocalDateOnly` /
  `todayDateOnly`), conversion is local-component based: `new Date(year,
  month-1, day)` in, zero-padded local getters out. Never `.toISOString()` /
  `new Date(isoString)`.
- **Month/year dropdowns**: `<Calendar mode="single" captionLayout="dropdown"
  .../>` — the react-day-picker v9 prop that renders Month+Year `<select>`s
  instead of prev/next-arrows-only.
- **Year range**: `startMonth`/`endMonth` bound to `min`/`max` when the field
  provides them; otherwise a default range of **1940 → (current year + 10
  years)** (explicit years, not date arithmetic, to avoid ambiguity).
- **Week start / weekend muting**: Sunday-start via the `locale` prop;
  Friday/Saturday muted via a `modifiers`/`modifiersClassNames` `weekend`
  modifier (`getDay() === 5 || getDay() === 6`), styled in the wrapper's own
  CSS.
- **Today button**: composed inside `PopoverContent`, driving a controlled
  `month` state (`setMonth(new Date())`). react-day-picker already highlights
  the actual current date by default via its `today` modifier — the button
  only needs to move the visible month into view.
- **Arabic month/weekday labels**: via react-day-picker's `formatters` prop
  (`formatMonthDropdown`, `formatWeekdayName`, etc.), sourced from the
  project's **existing** `lib/date.ts` Arabic month helpers — not
  `date-fns`'s Arabic locale strings, and not a `ui/calendar.tsx` edit.
- **Disabled/out-of-range days**: `min`/`max` → react-day-picker's `disabled`
  matcher, mirroring `DateInput`'s existing `isWithinRange`.
- **Auto-close + a11y**: selecting a day calls `onChange` then closes the
  Popover. Outside-click/Escape-to-close and focus handling come from Radix
  Popover itself.

### Four implementation rules (approved, permanent)

1. **Default year-range fallback is "current year + 10 years"** (not "today +
   10" — avoids date-arithmetic ambiguity). Combined with `min`/`max`
   override: `startMonth`/`endMonth` respect the field's `min`/`max` ISO
   props when given, else fall back to `[1940-01-01, (currentYear+10)-12-31]`.

2. **Never introduce a hardcoded z-index.** The codebase's existing overlay
   hierarchy (documented in `frontend/src/app/theme.css` near `.modal-overlay`)
   is: ExplorerKit Drawer `400`/`401` < ExplorerKit Dialog `410` < legacy
   Modal/ConfirmModal `500` < toasts `9999` < skip-link `10000`. Because
   `DateInput` renders inside Modals/Dialogs/Drawers, the Calendar Popover
   must out-stack all of them. Shadcn's default `PopoverContent` ships a
   Tailwind `z-50` utility (literal `z-index: 50`), which is **not** enough on
   its own. Fix: add one new documented CSS custom property in `theme.css`,
   extending the existing hierarchy comment —
   ```css
   /* z-index 550: DateCalendarPicker's Popover (shadcn Calendar) — must
      out-stack the legacy Modal (500) since DateInput renders inside
      Modal/Dialog/Drawer-hosted forms. Stays below toasts (9999). */
   --z-popover: 550;
   ```
   — then override the vendor `PopoverContent`'s z-index **at the call site**
   in `DateCalendarPicker.tsx` via a Tailwind arbitrary-value class merged
   through `cn()`/`tailwind-merge` (e.g. `className={cn("z-[var(--z-popover)]")}`),
   which cleanly wins over the vendor's own `z-50` class without editing
   `ui/popover.tsx`.

3. **Popup width follows the DateInput field by default.** `PopoverContent`
   uses Radix's built-in `--radix-popover-trigger-width` CSS custom property
   (`w-[var(--radix-popover-trigger-width)]`) so the popup visually feels
   attached to its field, with a `min-w-*` floor (tuned during implementation
   to whatever comfortably fits the day-grid) so it only expands beyond the
   field's width when required for usability.

4. **Reopening always shows a freshly-computed month — never a stale
   navigated-to month from a prior open.** The wrapper's `month` state is not
   long-lived: on every open transition it resets to the parsed current
   `value`'s month if the field has a value, otherwise to today's month
   (`useEffect(() => { if (open) setMonth(value ? parseIsoLocal(value) : new
   Date()); }, [open])`).

## `DateInput.tsx` change (surgical)

Replace only the calendar-icon `<button>` + hidden native `<input
type="date">` block (and remove `nativeRef`, the `PickerInput` type,
`openPicker()`) with:

```tsx
<DateCalendarPicker
  value={value}
  onChange={emit}
  min={min}
  max={max}
  disabled={disabled || readOnly}
/>
```

Everything else — the masked text field, typing/paste/blur/commit logic, and
the entire `DateInputProps` contract — is untouched. All 34+ existing call
sites (Invoices, Expenses, Cheques, Prices, Reports, Salaries, Accounting,
BankAccountExplorer, BankReconciliation, BankSalaryAnalytics, FinancialCenter,
Inventory, Maintenance, Quotation, ReceiptVoucher, Resignation, ReturnToWork,
SalaryAdvance, PurchaseRequest, PerformanceEvaluation, EmploymentContract,
LeaveRequest, EmployeeWarning, AuditLog, Attendance,
`period/PeriodLockSettings`, `period/PeriodControl`, `financial/FilterBar`,
`InvoiceFastEntryDialog`, `FormDialog` (covers Equipment/Employee/Contract/
Customer/Supplier config-driven forms), `FastMonthlyExpenseDialog`) need zero
changes.

## RTL / localization

- `PopoverContent` renders portalled (not nested inside `DateInput`'s
  deliberately `dir="ltr"`-pinned wrapper), so it gets its own `dir="rtl"`
  independently — Arabic month names, RTL day-of-week ordering.
- Month/weekday label text is sourced from the project's own `lib/date.ts`
  helpers via `formatters` (see composition section above) — not
  `date-fns`'s Arabic locale — to keep terminology consistent with the rest
  of the app.

## Edge cases to verify during testing (not blocking design decisions)

- Radix `Popover` portals to `document.body` with its own stacking context.
  Verify it isn't clipped by any `overflow: hidden` ancestor when `DateInput`
  is rendered inside a Modal/Drawer/Dialog, and that the new `--z-popover:
  550` value actually renders above all three in a live DOM check (not just
  asserted in isolation), consistent with
  `explorerKitDialogConfirmStacking.test.tsx`'s existing style of regression
  test.
- `min`/`max`-bounded year dropdowns for narrow ranges (e.g. a single valid
  year) render sensibly (no empty/degenerate dropdown).
- Disabled/read-only `DateInput` instances render `DateCalendarPicker` fully
  inert (no trigger button, matching today's `{!readOnly && ...}` guard on
  the calendar icon).

## Testing plan

- Unit tests: ISO⇄Date conversion (leap years, month boundaries, empty
  value), year-range fallback math, min/max disabled-day matching, the
  open-transition month-reset rule (rule 4).
- Component tests: month/year dropdown navigation, day selection emits the
  correct ISO value and closes the popover, "Today" button jumps the visible
  month without altering the selected value, weekend muting applied to
  Friday/Saturday columns.
- Regression: extend or add to `DateInput.test.tsx` to confirm typing, paste,
  blur/commit, and `min`/`max` validation behave identically to before this
  change — the explicit goal being zero behavior change for existing
  consumers.
- `tsc --noEmit` (frontend) and `npm run build` (frontend) both clean, per
  standard workflow gates.

## Out of scope (deferred, explicitly agreed)

- Visual restyling of the shadcn Calendar/Button/Popover to match manarERP's
  `--xpl-*` design tokens — explicitly a follow-up phase, once the official
  components are integrated and verified working.
- Any other `DateInput` behavior change beyond the picker mechanism.
- Any business logic, API, validation, or permission change (none is
  entailed by this work).

## Known limitation, tracked for the restyling phase

The scaffolded vendor `ui/calendar.tsx`/`ui/button.tsx` target React 19's
ref-as-prop convention (no `forwardRef`), while this app is React 18. This
logs a "Function components cannot be given refs" console warning on every
calendar open, and silently no-ops react-day-picker's programmatic
keyboard day-focus (arrow-key navigation moving DOM focus). Found and
verified during the final whole-branch review. Accepted as-is for this
release: the trigger is `aria-hidden`/mouse-only by design (matching
`DateInput`'s pre-existing icon-button convention), so keyboard day-focus
was never part of the shipped interaction. Per the standing "shadcn files
stay upstream-pure" rule this was not patched now — revisit when the
deferred restyling phase happens, or sooner if keyboard-accessible day
navigation becomes a requirement.

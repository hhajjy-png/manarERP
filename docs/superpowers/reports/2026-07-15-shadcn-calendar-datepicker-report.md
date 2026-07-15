# Production Release Report — shadcn Calendar / DateInput Integration v1

## Executive Summary

`DateInput`'s native `<input type="date">` picker has been replaced with the official shadcn Calendar (react-day-picker v10), reached through a new `DateCalendarPicker` wrapper, with zero changes to `DateInput`'s public API — all 34+ existing call sites required no changes. The integration went through two real production regressions (a global CSS token collision and a Calendar-scoped rendering bug), both root-caused and fixed; a full official-vs-implementation visual comparison, with the one real gap (Popover sizing) corrected; and a measured (not assumed) performance investigation, which found the reported "navigation is slower" perception does not reproduce. All temporary investigation/comparison artifacts have been removed. The branch is scoped exclusively to this feature and is production-ready.

**This release establishes the official architectural pattern for future shadcn component adoption within manarERP.** This Calendar integration is no longer just a Calendar feature — it becomes the architectural reference implementation for future shadcn integrations (Buttons, Tables, Dialogs, Popovers, Selects, etc.): the `--sh-*` token namespacing rule, the "vendor files stay upstream-pure, ERP behavior lives in a composing wrapper" pattern, the Tailwind-scoped-not-global integration approach, and the root-cause-first response to any visual regression are all now the standing precedent for that future work.

## Scope
- Replace `DateInput`'s native date picker with the shadcn Calendar, preserving its existing `value`/`onChange`/`min`/`max`/`disabled` API exactly.
- Bring in the shadcn toolchain (Button/Popover/Calendar, Tailwind v4 with Preflight disabled, scoped to this component subtree) without regressing any existing page.
- Match the official upstream Calendar appearance as closely as possible, with exactly one approved deviation (month/year dropdowns).
- Investigate and either fix or rule out a reported navigation-performance regression, with measurements.
- Backend and Electron main process: **untouched** (confirmed via diff — zero files changed outside `frontend/`).

## Files Changed
Full diff against `production` (merge-base `9307be3`), 17 commits:

| File | Purpose |
|---|---|
| `frontend/package.json`, `package-lock.json` | New deps: `radix-ui`, `react-day-picker`, `lucide-react`, `tailwindcss`, `@tailwindcss/vite`, `class-variance-authority`, `clsx`, `tailwind-merge` |
| `frontend/components.json` | shadcn CLI config |
| `frontend/vite.config.ts`, `tsconfig.json` | Tailwind v4 Vite plugin, path alias for shadcn's `@/` imports |
| `frontend/src/app/tailwind.css` | shadcn design tokens, namespaced `--sh-*` (see Architecture) |
| `frontend/src/app/theme.css` | No functional change — only the token-namespace fix's downstream effect |
| `frontend/src/components/ui/button.tsx`, `calendar.tsx`, `popover.tsx` | Vendor shadcn components, kept upstream-pure (no direct edits) |
| `frontend/src/components/DateCalendarPicker.tsx`, `.css` | New wrapper composing Calendar+Popover for `DateInput` |
| `frontend/src/components/DateInput.tsx` | Swapped native picker for `DateCalendarPicker`; re-synced visible text on calendar-driven selection |
| `frontend/src/lib/date.ts`, `lib/utils.ts` | `cn()` helper; Arabic month/weekday exports (now dead code — see Known Future Improvements) |
| `frontend/src/main.tsx` | +1 line: import `app/tailwind.css` |
| `frontend/src/__tests__/*` | New/updated tests: `DateCalendarPicker.test.tsx`, `DateInput.test.tsx`, `date.test.ts`, `radixPopoverSmoke.test.tsx`, `setup.ts` |
| `docs/superpowers/plans/...`, `specs/...` | Design spec and implementation plan |
| `frontend/src/styles/financial.css` | 1-character incidental comment-spacing fix, zero behavioral effect — pre-existing, left as-is |

## Architecture
- **Composition, not modification:** `components/ui/*.tsx` are the vendor's files, untouched — all ERP-specific behavior lives in `DateCalendarPicker.tsx`/`.css`, composed on top. **This is now the mandatory pattern for any future shadcn component.**
- **Token isolation:** shadcn's design tokens are declared as `--sh-*` (not bare `--primary`/`--accent`/etc.) specifically because the app already used those bare names as its own brand tokens; this was the root cause of the first regression (Part A) and is now permanently documented in `tailwind.css`. **This namespacing rule is mandatory for every future shadcn component's tokens.**
- **Tailwind scoping:** Preflight is disabled; Tailwind utilities apply only to the shadcn component subtree, not app-wide.
- **RTL/z-index integration points** (the only two non-upstream-default props on `PopoverContent`): `dir="ltr"` (app root is `dir="rtl"`; verified live that omitting it mirrors the whole Calendar) and `z-[var(--z-popover)]` (so it renders above the app's Modal/Dialog/Drawer stack). `w-auto p-0` mirrors every official Calendar-in-Popover reference usage (Calendar already brings its own `w-fit`/`p-3`). These three are the only deviations from bare upstream defaults; `captionLayout="dropdown"` is the one approved visual deviation (month/year dropdowns, an explicit ERP requirement and an officially-supported upstream option).
- **`react-day-picker` v10** depends on `date-fns`/`@date-fns/tz` internally for its own date math — not something this integration added directly, and the reason its shared chunk is nontrivial in size (see Testing/performance below).
- **Language:** the Calendar is entirely English — months, weekdays, dropdown labels, and all internal UI. This is a **permanent design decision** (see Known Future Improvements), not a temporary gap.

## Testing
- `npx tsc --noEmit` (frontend): clean.
- `npx vitest run`: **106 test files / 1737 tests passing** (full suite, not just calendar-scoped).
- `npm run build` (production): succeeds; no `popover-*.js` split chunk remains post-cleanup — Rollup now folds that code directly into `DateInput`'s own chunk, since the temporary comparison page (the only other importer) is gone.
- Live verification via Chrome DevTools MCP throughout: Calendar-scoped bleed-through fix, dark/light theme after Part A, RTL mirroring proof on the bare reference page, production `DateInput` after the `w-auto p-0` fix, and the full Part C performance investigation (isolated pre/post-shadcn builds, real login→Dashboard traces, network-request diffing).
- Performance investigation (Part C, approved): one new ~54 KB gzip chunk loads once per session (first Dashboard visit), ~5.5 ms measured main-thread cost, zero CLS, zero recurring per-navigation cost (confirmed via HTTP 304 on second navigation). The reported "navigation is slower" perception did not reproduce under measurement.

## Branch
`feature/shadcn-calendar-datepicker-v1`, forked from `production` at `9307be3`. 17 commits, all calendar-scoped. `git status` clean relative to this branch's own files. Diff against `production` touches only `frontend/` and `docs/` — zero `backend/`/`electron/` changes.

## Feature Commit
No squash performed — full history preserved (per this repo's standing convention: fix→re-review cycles are kept, not amended). Full commit list available via `git log production..HEAD`.

## Production Readiness
- TypeScript, full test suite, and production build all pass.
- Zero API changes to `DateInput` — no call site elsewhere in the app needed touching.
- Zero backend/Electron surface touched.
- Branch contains only production-ready files — the temporary `/dev/calendar-official` comparison page and route have been removed and confirmed absent from the build output.
- Two housekeeping items outside this repo/branch (untracked scratch files at the repo root from an earlier matcher-semantics investigation; a sibling git-worktree directory used for the Part C comparison, git-side registration already removed) — neither affects `production` or this branch.
- Approved for production via direct final release review.

## Known Future Improvements

**Calendar UX & Visual Polish Pack** (deferred to a future release):
- Refine spacing.
- Refine dropdown sizing.
- Refine popup proportions.
- Refine visual rhythm.
- Improve visual balance.
- Bring the Calendar visually even closer to the official shadcn reference while preserving the approved manarERP identity.

This future pack is **visual-only**: no architectural changes, no API changes, no `DateInput` behavior changes.

**Final design decision (permanent):** the Calendar remains entirely English — month names, weekday names, dropdown labels, and internal Calendar UI. Arabic month/weekday labels are **not** on the roadmap. This decision stands unless explicitly revisited in a future architectural review.

**Note:** `lib/date.ts` still exports `ARABIC_MONTHS`/`WEEKDAY_SHORT_AR`, unused since Part B and now permanently unused per the above decision. Not removed in this release (out of scope for the requested documentation-only pass); worth a follow-up cleanup whenever `lib/date.ts` is next touched.

**Separately, unresolved from the earlier comparison report:** `formatMonthDropdown`'s `date.toLocaleString("default", ...)` (vendor `calendar.tsx`, unmodified) resolves to the JS runtime's default locale at call time. Given the permanent English-only decision above, it would be worth a live check (not yet performed) that this doesn't render Arabic month abbreviations on an Arabic-locale OS — this is a compliance-verification item for the permanent decision, not a roadmap feature.

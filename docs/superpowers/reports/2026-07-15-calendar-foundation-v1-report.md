# Calendar Foundation v1 — Final Production Release Report

**Date:** 2026-07-15
**Branch:** `feature/calendar-visual-polish-v1`
**Baseline:** `production` @ `5922890`
**Scope:** Visual polish and correctness fixes for the shadcn Calendar / `DateCalendarPicker` integration shipped in `stable-shadcn-calendar-datepicker-v1`. Wrapper-level CSS only — no vendor file, API, or behavioral change.

---

## Background

This pack picks up where `stable-shadcn-calendar-datepicker-v1` left off. That release deliberately deferred a "Calendar UX & Visual Polish Pack" — closing the visual gap between the integrated Calendar and the official shadcn reference while preserving manarERP's architecture (RTL shell, non-Radix overlay system, `--sh-*` token namespacing, Preflight disabled app-wide).

Work proceeded in four phases:

1. **Architecture review** against the officially installed shadcn Skill (`.agents/skills/shadcn`), verified with the shadcn CLI itself (`add --dry-run`/`--diff`) rather than by inspection alone. Conclusion: all three vendor files (`calendar.tsx`, `button.tsx`, `popover.tsx`) are byte-identical to the upstream `new-york` registry. Every deviation in the wrapper (`dir="ltr"`, the popover z-index override, `--sh-*` token prefixing, `rgb()` instead of `oklch()`) was individually justified against a real, verified constraint (RTL shell, a separate non-Radix Modal/Dialog/Drawer stacking system, a pre-existing brand-token collision, and a reproduced Electron/Chromium `oklch()` paint bug) — no unnecessary deviation was found or rolled back.
2. **Live visual comparison**, using a temporary, unauthenticated diff harness (`/dev/calendar-official`, matching a pattern already used once for the original integration) to render the ERP Calendar next to a "minimal vanilla" Popover+Calendar with only the three documented non-default props, in the same app/token/font environment. This isolated exactly what wrapper CSS changes, with zero confounds.
3. **Rendering-environment investigation**, comparing the live `ui.shadcn.com` docs site against manarERP at the CSS/token/Preflight level, and — on request — proving via direct source fetches (not visual inspection) that part of the perceived gap is not reproducible at all: the live docs site's interactive demos are built from `apps/v4/registry/bases/radix` on the `shadcn-ui/ui` GitHub repo, an internal, in-development implementation of the site itself (confirmed by a literal import path reaching into the site's own internal Next.js app, `@/app/(create)/components/icon-placeholder`), not the same artifact published to the versioned registry endpoint (`/r/styles/{style}/{name}.json`) that this project's CLI and `components.json` consume. That newer recipe was explicitly *not* adopted — doing so would mean changing the actual component architecture (semantic `cn-*` classes backed by an unpublished stylesheet), which is out of scope for a wrapper-CSS-only pack.
4. **Fix and verify**, live, in both light and dark mode, via `getComputedStyle` — not visual guessing — before and after each change.

## Fixes shipped (all in `frontend/src/components/DateCalendarPicker.css`, wrapper-scoped to `.mnr-cal-pop`)

| # | Defect (live-verified via `getComputedStyle`) | Root cause | Fix |
|---|---|---|---|
| 1 | Nav prev/next chevrons rendered backwards | `calendar.tsx`'s own `rtl:` rotation classes compile to a plain `[dir="rtl"] .rdp-button_previous > svg` ancestor-attribute selector, which still matches the app's real `<html dir="rtl">` root through the Popover's portal, regardless of the wrapper's own `dir="ltr"` | `.rdp-button_previous/_next > svg { rotate: 0deg }`, unlayered |
| 2 | Popover/dropdown borders rendered `currentColor` (near-black) instead of light gray | This app's `tailwind.css` necessarily omits shadcn's own `@layer base { * { @apply border-border } }` default (a global `*` selector that would apply site-wide) | `border-color: var(--color-border)` scoped to `.mnr-cal-pop, .mnr-cal-pop *`, inside the pre-established (empty) `base` layer |
| 3 | Nav/day buttons showed native browser chrome (visible border, gray background) instead of the intended flat "ghost" look | Same missing-Preflight gap — nothing else zeroes native `<button>`/`<select>` UA styling for this app | `border: 0; background: transparent; appearance: none; font: inherit; color: inherit;` scoped to `.mnr-cal-pop button, select`, inside `@layer base` |
| 4 | Native Month/Year dropdown option list rendered light-themed even in dark mode | Nothing ever set `color-scheme`, so Chromium's native listbox popup defaulted to a light rendering regardless of the app's theme | `color-scheme: dark` on `.mnr-cal-pop select`, scoped to the app's dark-mode toggle |
| 5 | Weekday header (`Su Mo Tu ...`) showed the app's own `--text-muted` color and left-alignment instead of the shadcn `--muted-foreground` token and centered text | This app's pre-existing unlayered `theme.css` `thead th {...}` rule beats the vendor's layered `text-muted-foreground` utility regardless of specificity; the original th/td fix covered padding/border/background/weight but not color/alignment | `.mnr-cal-pop th { color: var(--color-muted-foreground); text-align: center; white-space: normal; }` |

Each fix was reproduced in a from-scratch vanilla Popover+Calendar (proving it's an app-wide gap, not something specific to this wrapper's own choices) before being applied, and re-verified live in both themes afterward.

## Explicitly not changed (reviewed and confirmed correct as-is)

- **Typography** — the Calendar renders in this app's global Arabic font stack (`IBM Plex Sans Arabic, Cairo, Tajawal...`), not the shadcn docs site's `Geist`. This is the app's own architecture (global `body` font, Preflight disabled), and matching Geist would make the Calendar visually inconsistent with the rest of the ERP.
- **`--radius` / border technique differences** vs. the live docs site — traced to the site showing its own newer, unpublished component generation (see Background §3), not something reproducible via CSS.
- No vendor file (`components/ui/calendar.tsx`, `button.tsx`, `popover.tsx`) was ever modified — reconfirmed at release time via `npx shadcn@latest add button popover calendar --dry-run` → all three "skip (identical)".

## Release verification (run fresh at release time)

| Check | Result |
|---|---|
| Vendor files vs. registry | `button.tsx`, `popover.tsx`, `calendar.tsx` — all 3 identical (CLI `--dry-run`) |
| Frontend `tsc --noEmit` | ✅ clean |
| Backend `tsc --noEmit` | ✅ clean |
| Frontend `vitest run` | ✅ 106 files, 1737 tests passing |
| Backend `npm test` | ✅ 101 files, 1670 tests passing |
| Frontend `npm run build` | ✅ clean |
| Backend `npm run build:back` | ✅ clean |
| Temporary artifacts | Comparison harness (`_TempCalendarOfficial.tsx`, `/dev/calendar-official` route) fully removed; `App.tsx` diff-clean against `production` |
| Dependencies | Zero new/changed packages (`package.json`/lockfiles untouched) |

## Release scope

**1 file changed:** `frontend/src/components/DateCalendarPicker.css` — additive CSS only, no other source file touched.

## Deferred (explicitly out of scope for this release)

Any further subjective/visual refinement is deferred to a future, separately-scoped **"Calendar UX Refresh Pack"** — not part of this release.

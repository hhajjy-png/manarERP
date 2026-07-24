# Production Release Report — Official Cheque Template System v1

**Release date:** 2026-07-24
**Status:** RELEASED

## Release identifiers

| Field | Value |
|-------|-------|
| Release name | Official Cheque Template System v1 |
| Feature branch | `feature/official-cheque-template-system-v1` (kept) |
| Production baseline | `325c0cf` (`stable-google-drive-database-restore-reliability-pack-v1`) |
| Feature commit | `19029ca` |
| Merge commit (`--no-ff`) | `fa8f315` |
| Stable tag | `stable-official-cheque-template-system-v1` (annotated) → merge `fa8f315` |

## Scope

A new, self-contained Official Cheque Template architecture, built alongside and fully isolated from Classic Calibration and the Professional Cheque Printing module:

- **Reusable `ChequeTemplateDesigner`** — generic WYSIWYG editor (selection, drag, resize, rotation, keyboard nudge, alignment/snap guides, undo/redo). Business-logic-free; extension slots for host-injected controls, display-text resolution, and a bound-field indicator.
- **"Cheque Template" tab** in the cheque studio overlay; **Classic Calibration remains the default tab and is byte-for-byte unchanged** (hosted in a screen-only CSS containing block so its print path is untouched).
- **Template Manager** — New / Open / Save / Save As / Rename / Delete / Default, on an independent `chequeDesigner.*` localStorage namespace (layout-only persistence; never `cheque.template.*`).
- **Runtime Engine** — pure, UI-independent: template + runtime data → fully-resolved render model (validation, graceful handling, painting order). The single rendering authority.
- **Semantic Data Binding** — per-field Data Source dropdown; stable semantic ids persisted (never display text).
- **Live Preview** + shared **`ChequeRenderSurface`** — one renderer used by both preview and print (no duplicated rendering logic).
- **Printing pipeline** — real cheque record → runtime data (reusing existing tafqeet/amount logic) → engine → render surface → existing Electron print flow. Dedicated `/cheque-template/print` route.
- **Native physical cheque surface 178 × 89 mm**, native **Landscape** (`@page` + native Electron `landscape` enforcement).
- **Background separation** — Live Preview shows the cheque background + data; **print outputs data only** (ink onto pre-printed stock).
- **Architectural fix** for the designer host-notification infinite render loop (notification decoupled from `onChange` identity; fires only on genuine field changes).

## Untouched

Classic Calibration (workflow / storage / rendering / printing / APIs), the Professional module, backend, Prisma schema, database, and Settings.

## Validation

- electron `tsc --noEmit` ✅
- frontend `tsc --noEmit` ✅
- backend `vitest` — **1897 / 1897 pass** (135 files)
- frontend `vitest` — 1829 passing / 17 failing (7 files), **all within the established pre-existing baseline** (cheque print isolation, financial center tables, print preview, format balance, invoice fast entry, currency headers, WYSIWYG preview POC) — **none from this release; zero regressions**. +21 passing vs prior baseline (new Runtime Engine + designer-notify tests, 20 passing).
- frontend production build (`vite build`) ✅

## Reviews

- Product Owner manual visual review — **completed & approved**.
- Claude implementation — complete; Claude architectural review — passed.
- Gemini final review — **approved**.

## Notes

- Scoped release: only Official Cheque Template System v1 files were committed. Unrelated in-progress work present in the working tree (dashboard, Prisma schema/seed, the Professional module, migrations, screenshots, docs) was deliberately left uncommitted and out of scope.
- `frontend/src/App.tsx` was committed as `HEAD` + only the two cheque-template lines (lazy import + `/cheque-template/print` route); the working tree retains its other uncommitted route edits untouched.

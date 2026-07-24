# Production Release Report — Default Cheque Print Provider v1

**Release date:** 2026-07-24
**Status:** RELEASED

## Release identifiers

| Field | Value |
|-------|-------|
| Release name | Default Cheque Print Provider v1 |
| Feature branch | `feature/default-cheque-print-provider-v1` (kept) |
| Production baseline | `7400b34` (`stable-official-cheque-template-system-v1` documentation commit) |
| Feature commit | `afc97ac` |
| Merge commit (`--no-ff`) | `83f2246` |
| Stable tag | `stable-default-cheque-print-provider-v1` (annotated) → merge `83f2246` |

## Scope

Users can now permanently choose the default cheque printing provider from the Cheques Management page. This release bundles five sequential, dependent packs built and validated together this session on top of Official Cheque Template System v1's print pipeline:

1. **A4 Surface Mode v1** — a second presentation surface (`ChequeA4Sheet`) placing the *same* cheque render surface, fixed/undraggable/unresizable, centered vertically and anchored to the right paper edge with a printer-safe margin, on an A4 landscape page. No second Runtime/Render/Print engine.
2. **Force Landscape fix** — corrected an invalid `@page` CSS declaration (explicit two-length `size` combined with the `landscape` keyword, disallowed by the CSS Paged Media spec) that caused Chromium/Windows to silently drop the page-size rule and default to Portrait. A4 mode now uses the named `A4 landscape` page size.
3. **Cheque Printing Provider Selection v1** — a `طريقة الطباعة` dropdown next to `طباعة الشيك` routing the print request to one of the three existing, unmodified printing systems (Classic / Cheque Template Real 178×89mm / Cheque Template A4). Default: Classic.
4. **Cheques Management Workspace Refresh v1** — removed the large decorative on-screen cheque preview image; consolidated print/voucher/calibration actions into one toolbar, reclaiming vertical space for the cheque table. Columns/business logic/actions/sorting/filtering unchanged.
5. **Default Cheque Print Provider v1** — a `تعيين كافتراضي` toggle persisting the selected provider via the existing Settings infrastructure (`cheques.defaultPrintProvider`, upserted via `PUT /settings`), restored automatically on page load. No schema change, no migration; included in DB backups. Existing users continue to default to Classic (setting absent → unchanged behavior).

## Untouched

Runtime Engine, `ResolvedRenderModel`, `ChequeRenderSurface`, `ChequePrintOutput`, Template Manager persistence, Semantic Data Binding, Classic Calibration, the Professional module, backend, Prisma schema, database, and any other Settings.

## Validation

- electron `tsc --noEmit` ✅
- frontend `tsc --noEmit` ✅
- backend `vitest` — **1897 / 1897 pass** (135 files)
- frontend `vitest` (on the committed merge state) — 1829 passing / 17 failing (7 files), identical to the prior release's established baseline — **zero regressions**. A local working-tree copy of `App.tsx` (unrelated, uncommitted Professional-module route additions predating this release) transiently caused an 18th failure (`routerFutureFlags.test.tsx`) during ad-hoc validation; proven not a regression by counting `lazy(` calls in the actual committed merge commit's `App.tsx` — exactly 48, matching the test's expectation. `App.tsx` was never part of the feature or merge commit (0 files touched, confirmed via `git show --stat`).
- frontend production build (`vite build`) ✅

## Reviews

- Product Owner manual visual review — **completed & approved**.
- Gemini review — **approved**.

## Notes

- Scoped release, matching the prior release's convention: only the 8 files needed for this feature (all under `frontend/src/components/chequeTemplateManager/` and `frontend/src/pages/Cheques.{tsx,css}`) were committed. Unrelated in-progress work present in the working tree (dashboard, Prisma schema/seed, the Professional module, migrations, screenshots, docs) was deliberately left uncommitted and out of scope.
- `frontend/src/App.tsx` was **not** touched by this release — the `/cheque-template/print` route it needs was already committed in the prior release.

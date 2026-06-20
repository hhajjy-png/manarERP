# Repository Cleanup Report — 2026-06-20

> **Status:** Informational. No changes have been made. Recommendations require explicit approval before action.
> **Branch at time of report:** `feature/forms-operations-polish-v3`

---

## Summary

A `git status` audit on 2026-06-20 found **33 untracked paths** in the repository. This report classifies them by severity and recommends a disposition for each.

---

## CRITICAL — Breaks Fresh Clone

### `frontend/src/assets/fonts/` (36 files)

**Problem:** `frontend/src/styles/fonts.css` declares `@font-face` rules pointing to relative paths inside this folder:
```css
url("../assets/fonts/IBMPlexSansArabic-Regular.woff2")
url("../assets/fonts/IBMPlexSansArabic-Medium.woff2")
url("../assets/fonts/IBMPlexSansArabic-SemiBold.woff2")
url("../assets/fonts/IBMPlexSansArabic-Bold.woff2")
url("../assets/fonts/Tajawal-Regular.woff2")
url("../assets/fonts/Tajawal-Medium.woff2")
url("../assets/fonts/Tajawal-Bold.woff2")
```

None of these files are tracked in git. The current build succeeds because the files exist on this machine. On a fresh clone (new developer, new machine, CI pipeline) the files would be absent and `npm run build:front` would produce a broken CSS bundle — the primary UI font (IBM Plex Sans Arabic) and second fallback (Tajawal) would silently fail to load.

**Folder contents:**
| File | Used by fonts.css | Notes |
|------|-------------------|-------|
| `IBMPlexSansArabic-Regular.woff2` | ✓ | Primary UI font weight 400 |
| `IBMPlexSansArabic-Medium.woff2` | ✓ | Primary UI font weight 500 |
| `IBMPlexSansArabic-SemiBold.woff2` | ✓ | Primary UI font weight 600 |
| `IBMPlexSansArabic-Bold.woff2` | ✓ | Primary UI font weight 700 |
| `Tajawal-Regular.woff2` | ✓ | Fallback weight 400 |
| `Tajawal-Medium.woff2` | ✓ | Fallback weight 500 |
| `Tajawal-Bold.woff2` | ✓ | Fallback weights 600 + 700 |
| `IBMPlexSansArabic-*.woff` (non-woff2 variants) | ✗ | Unused — CSS only loads woff2 |
| `IBMPlexSansArabic-ExtraLight/Light/Thin.*` | ✗ | Unused weights |
| `Cairo-*.ttf` (8 files) | ✗ | Unused — Cairo loaded via @fontsource/cairo npm package |
| `Tajawal-Black/ExtraBold/ExtraLight/Light.*` | ✗ | Unused weights |

**Recommendation:** Commit only the 7 WOFF2 files actually referenced in `fonts.css`. Omit the unused TTF and non-woff2 files — they have no effect on the build and add binary weight.

**Exact files to add:**
```
frontend/src/assets/fonts/IBMPlexSansArabic-Regular.woff2
frontend/src/assets/fonts/IBMPlexSansArabic-Medium.woff2
frontend/src/assets/fonts/IBMPlexSansArabic-SemiBold.woff2
frontend/src/assets/fonts/IBMPlexSansArabic-Bold.woff2
frontend/src/assets/fonts/Tajawal-Regular.woff2
frontend/src/assets/fonts/Tajawal-Medium.woff2
frontend/src/assets/fonts/Tajawal-Bold.woff2
```

A `.gitignore` entry for the rest:
```
# Font files not referenced by fonts.css — local extras only
frontend/src/assets/fonts/*.ttf
frontend/src/assets/fonts/*.woff
frontend/src/assets/fonts/IBMPlexSansArabic-ExtraLight*
frontend/src/assets/fonts/IBMPlexSansArabic-Light*
frontend/src/assets/fonts/IBMPlexSansArabic-Thin*
frontend/src/assets/fonts/Tajawal-Black*
frontend/src/assets/fonts/Tajawal-ExtraBold*
frontend/src/assets/fonts/Tajawal-ExtraLight*
frontend/src/assets/fonts/Tajawal-Light*
```

---

## MEDIUM — Should Be Tracked

### `docs/superpowers/plans/` (12 plan files)

These are implementation plans produced during development. They document what was built, why decisions were made, and how future engineers should approach related work. Leaving them untracked means they disappear on a fresh clone.

| File | Contents |
|------|----------|
| `2026-06-08-cheques-management.md` | Cheques management feature plan |
| `2026-06-08-manar-ui-lab.md` | UI lab exploration plan |
| `2026-06-09-page-level-improvements-phase1.md` | Page improvements phase 1 |
| `2026-06-14-auto-backup-phase1.md` | Auto-backup feature plan |
| `2026-06-17-strategic-finance-agreements-pack.md` | Finance agreements feature plan |
| `2026-06-18-employment-contract-form.md` | Employment contract form plan |
| `2026-06-18-ui-consistency-phase3-audit.md` | UI consistency audit phase 3 |
| `2026-06-18-ui-consistency-phase3-forms.md` | UI consistency forms phase 3 |
| `2026-06-18-ui-consistency-phase4-audit.md` | UI consistency audit phase 4 |
| `2026-06-18-ui-consistency-phase4-micro-ux.md` | UI micro-UX phase 4 |
| `2026-06-19-print-profiles-forms-completion.md` | Print profiles + forms completion plan |
| `2026-06-20-forms-operations-polish-v3.md` | Forms & Operations Polish Pack v3 plan |
| `2026-06-20-ui-typography-refresh-v1.md` | UI typography refresh plan |

**Recommendation:** Commit all. These are documentation, not generated artifacts.

### `docs/superpowers/specs/` (3 spec files)

Design specification documents. Same rationale — should be tracked.

| File | Contents |
|------|----------|
| `2026-06-09-page-level-improvements-phase1-design.md` | Phase 1 page improvements design |
| `2026-06-10-invoice-custom-fields-and-prices-phase1-design.md` | Invoice custom fields design |
| `2026-06-18-employment-contract-form-design.md` | Employment contract form design spec |

**Recommendation:** Commit all.

### `docs/PROJECT_HISTORY_FULL.md`

Project history document. Should be tracked alongside `PROJECT_STATE.md`.

**Recommendation:** Commit.

### `docs/PROJECT_PRICES_PHASE1_AUDIT.md`

Price audit documentation. Should be tracked.

**Recommendation:** Commit.

### `scripts/extract_forms_png.py`

Python utility for extracting form screenshots. Utility script — belongs in `scripts/`.

**Recommendation:** Commit.

### `scripts/full-operational-reset.ts`

TypeScript utility for full operational reset of the database. This is a one-time-use admin tool that has already been run (2026-06-13). Keeping it in `scripts/` is fine for future reference.

**Recommendation:** Commit (with a comment in the script noting it has already been run once).

---

## LOW — Evaluate Before Committing

### Root-level PNG files

`cheakv1.png`, `logo.png`, `contract_letterhead_bottom.png`, `contract_letterhead_top.png`, `contract_preview_bottom.png`, `contract_preview_plain_a4.png`

These appear to be reference screenshots or print preview captures produced during development. No code references them directly from root. They are probably safe to delete or move to `docs/` if they serve as visual reference.

**Recommendation:** Move useful ones to `docs/` and commit, or delete. Do not commit images to root.

### `docs/contract_image1.png`, `docs/contract_image2.png`

Reference images for the employment contract form (likely used during design review). Small impact.

**Recommendation:** Commit to `docs/` if they are used in the documentation PDF. Otherwise delete.

### `docs/AlManar_Official_Forms_v1.pdf`, `docs/AlManar_Official_Forms_v2.pdf`

Scanned PDF documents. PDFs can be large binary files that inflate repository size and cause slow clones. Check file sizes before committing.

**Recommendation:** If < 2MB each and needed for reference, commit. If larger, store elsewhere and link.

### `docs/contractv2.xlsx`

Excel file. Same caution as PDFs — binary files.

**Recommendation:** Same as PDFs. Check size first.

---

## DO NOT COMMIT

### `manarERP-production-26ae2da.zip`

Production build artifact (likely created by `npm run dist`). Committing build artifacts creates a permanently large git history. This should be stored as a release artifact, not in the repository.

**Recommendation:** Delete from working directory. Do NOT commit.

---

## Action Priority

| Priority | Action | Files |
|----------|--------|-------|
| 🔴 CRITICAL | Commit the 7 referenced WOFF2 files | `frontend/src/assets/fonts/*.woff2` (7 files) |
| 🔴 CRITICAL | Add `.gitignore` entries for unused font variants | `.gitignore` |
| 🟡 MEDIUM | Commit all plans and specs | `docs/superpowers/plans/*.md`, `docs/superpowers/specs/*.md` |
| 🟡 MEDIUM | Commit project history and audit docs | `docs/PROJECT_HISTORY_FULL.md`, `docs/PROJECT_PRICES_PHASE1_AUDIT.md` |
| 🟡 MEDIUM | Commit utility scripts | `scripts/extract_forms_png.py`, `scripts/full-operational-reset.ts` |
| 🟢 LOW | Evaluate and move/delete root PNG files | `*.png` at root |
| 🟢 LOW | Check PDF and XLSX sizes before committing | `docs/*.pdf`, `docs/*.xlsx` |
| ⛔ NEVER | Delete build artifact | `manarERP-production-26ae2da.zip` |

---

## Notes

- This report was generated as part of Forms & Operations Polish Pack v3 (Task 13 — Documentation).
- No files were modified or deleted as part of generating this report.
- The CRITICAL font issue predates Pack v3 — it was introduced when the UI Typography Refresh v1 feature committed `fonts.css` but did not commit the referenced font files.

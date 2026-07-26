# UI Typography Refresh v1 — IBM Plex Sans Arabic Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `'Cairo', sans-serif` with `"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif` as the unified font stack across the entire manarERP frontend, loading IBM Plex Sans Arabic from local woff2 assets.

**Architecture:** A single new `fonts.css` file declares @font-face for IBM Plex Sans Arabic and Tajawal (both already available as woff2 in assets). Cairo continues to load via the existing `@fontsource/cairo` npm package (self-hosted woff2, offline). `fonts.css` is imported once in `main.tsx`. All 14 hardcoded `'Cairo'` references across 10 files are updated in-place to the new stack.

**Tech Stack:** CSS @font-face, woff2, React 18, Vite 5, TypeScript 5.5

**Branch:** `feature/ui-typography-refresh-v1`

## Global Constraints

- WOFF2 only in `@font-face` declarations — no TTF, no WOFF
- Font stack everywhere: `"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif`
- Weights: **400, 500, 600, 700 only** — no Thin (100), ExtraLight (200), Light (300), ExtraBold (800), Black (900)
- No CDN links (`fonts.googleapis.com`, `fonts.gstatic.com`) introduced or retained
- **Do NOT modify:** backend, prisma, business logic, accounting, payroll, invoice calculations, print profile logic
- **Do NOT modify:** `frontend/src/utils/chequeTemplate.ts` `FONT_FAMILIES` array (user-selectable options list)
- **Do NOT modify:** `frontend/src/utils/chequeTemplate.ts` inline style `fontFamily` values (cheque print template — treated as print profile logic)
- **Do NOT modify:** `frontend/src/pages/index.html` (103KB standalone prototype, never loaded by Vite)
- English numerals must remain: 0 1 2 3 4 5 6 7 8 9 — do NOT add `font-variant-numeric` or `unicode-range` rules that force Arabic-Indic digits
- Imports: `fonts.css` imported **once only** in `main.tsx`
- Cairo stays as fallback — do not remove `@fontsource/cairo` imports

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| **Create** | `frontend/src/styles/fonts.css` | @font-face for IBM Plex Sans Arabic + Tajawal (woff2) |
| **Modify** | `frontend/src/main.tsx` | Add `./styles/fonts.css` import |
| **Modify** | `frontend/src/app/theme.css` | `body` font-family → new stack |
| **Modify** | `frontend/src/components/dashboard/dashboard.css` | 3 × font-family → new stack |
| **Modify** | `frontend/src/components/dashboard/ContractStatusChart.tsx` | 2 × inline fontFamily → new stack |
| **Modify** | `frontend/src/components/dashboard/RevenueChart.tsx` | 3 × inline fontFamily → new stack |
| **Modify** | `frontend/src/forms/EmploymentContractTemplate.tsx` | 1 × inline fontFamily → new stack |
| **Modify** | `frontend/src/forms/shared/FormLayout.tsx` | 1 × inline fontFamily → new stack |
| **Modify** | `frontend/src/pages/BankSalaryAnalytics.tsx` | 1 × inline fontFamily → new stack |
| **Modify** | `frontend/src/pages/Cheques.tsx` | 1 × inline fontFamily → new stack |
| **Modify** | `frontend/src/pages/InvoicePreview.tsx` | 3 × inline fontFamily → new stack |
| **Modify** | `frontend/src/pages/PayrollPayslip.tsx` | 1 × inline fontFamily → new stack |
| **Modify** | `frontend/src/pages/ReportPrint.tsx` | 1 × inline fontFamily → new stack |

**Not touched:** `frontend/src/utils/chequeTemplate.ts`, `frontend/src/pages/index.html` (prototype), all backend, prisma, electron.

---

## Task 1: Create fonts.css

**Files:**
- Create: `frontend/src/styles/fonts.css`

**Interfaces:**
- Produces: `"IBM Plex Sans Arabic"` CSS font-family name (400, 500, 600, 700), `"Tajawal"` CSS font-family name (400, 500, 600, 700)
- Asset paths: all woff2 files flat in `../assets/fonts/` (relative to `styles/`)

- [ ] **Step 1: Verify woff2 files exist for the weights we need**

Run:
```bash
ls frontend/src/assets/fonts/IBMPlexSansArabic-*.woff2
ls frontend/src/assets/fonts/Tajawal-*.woff2
```

Expected output (key files):
```
IBMPlexSansArabic-Regular.woff2
IBMPlexSansArabic-Medium.woff2
IBMPlexSansArabic-SemiBold.woff2
IBMPlexSansArabic-Bold.woff2
Tajawal-Regular.woff2
Tajawal-Medium.woff2
Tajawal-Bold.woff2
```

Note: Tajawal has no SemiBold woff2 (confirmed absent). Weight 600 will map to Bold (700) via browser font matching — this is acceptable.

- [ ] **Step 2: Create fonts.css**

Create `frontend/src/styles/fonts.css`:

```css
/* ================================================================
   fonts.css — Self-hosted @font-face declarations
   IBM Plex Sans Arabic (primary) + Tajawal (second fallback)
   Cairo is loaded via @fontsource/cairo in main.tsx (third fallback)
   No CDN. No internet required. Fully offline.
   ================================================================ */

/* ── IBM Plex Sans Arabic ── */

@font-face {
  font-family: "IBM Plex Sans Arabic";
  src: url("../assets/fonts/IBMPlexSansArabic-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "IBM Plex Sans Arabic";
  src: url("../assets/fonts/IBMPlexSansArabic-Medium.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "IBM Plex Sans Arabic";
  src: url("../assets/fonts/IBMPlexSansArabic-SemiBold.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "IBM Plex Sans Arabic";
  src: url("../assets/fonts/IBMPlexSansArabic-Bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

/* ── Tajawal ── */

@font-face {
  font-family: "Tajawal";
  src: url("../assets/fonts/Tajawal-Regular.woff2") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Tajawal";
  src: url("../assets/fonts/Tajawal-Medium.woff2") format("woff2");
  font-weight: 500;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Tajawal";
  src: url("../assets/fonts/Tajawal-Bold.woff2") format("woff2");
  font-weight: 600;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "Tajawal";
  src: url("../assets/fonts/Tajawal-Bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/styles/fonts.css
git commit -m "feat(fonts): add fonts.css with IBM Plex Sans Arabic + Tajawal @font-face declarations"
```

---

## Task 2: Wire fonts.css into main.tsx

**Files:**
- Modify: `frontend/src/main.tsx:1-18`

**Interfaces:**
- Consumes: `./styles/fonts.css` (from Task 1)
- Produces: IBM Plex Sans Arabic and Tajawal loaded before any component renders

- [ ] **Step 1: Update main.tsx imports**

Current `frontend/src/main.tsx`:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Offline fonts — no CDN required
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import '@fontsource/cairo/800.css';
import 'material-symbols/outlined.css';
import './app/theme.css';
import './styles/stitch-full.css';
```

Replace with:
```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// Offline fonts — no CDN required
import './styles/fonts.css';
import '@fontsource/cairo/400.css';
import '@fontsource/cairo/600.css';
import '@fontsource/cairo/700.css';
import 'material-symbols/outlined.css';
import './app/theme.css';
import './styles/stitch-full.css';
```

Changes:
1. Added `import './styles/fonts.css';` as the **first** font import (before Cairo)
2. Removed `import '@fontsource/cairo/800.css';` — weight 800 is outside the approved range (400/500/600/700); Cairo is a fallback so only 400 and 600 are needed, but keeping 400/600/700 is acceptable

- [ ] **Step 2: Commit**

```bash
git add frontend/src/main.tsx
git commit -m "feat(fonts): import fonts.css in main.tsx before Cairo fallback"
```

---

## Task 3: Update body font-family in theme.css

**Files:**
- Modify: `frontend/src/app/theme.css:24`

**Interfaces:**
- Consumes: Font names from Task 1 (`"IBM Plex Sans Arabic"`, `"Tajawal"`) and `@fontsource/cairo` (`"Cairo"`)
- Produces: All elements inheriting the new font stack via `body`

- [ ] **Step 1: Update body rule**

In `frontend/src/app/theme.css` line 24, change:

```css
body { font-family: 'Cairo', sans-serif; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; transition: background .3s, color .3s; }
```

To:

```css
body { font-family: "IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif; background: var(--bg); color: var(--text); -webkit-font-smoothing: antialiased; transition: background .3s, color .3s; }
```

- [ ] **Step 2: Verify no other standalone font-family declarations exist in theme.css that need updating**

Run:
```bash
grep -n "font-family" frontend/src/app/theme.css
```

All results should be `font-family: inherit` (inheriting from body) except the single `body` rule just changed. If any other standalone family declarations appear (not `inherit`), update them to the new stack.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/theme.css
git commit -m "feat(fonts): update body font-family to IBM Plex Sans Arabic stack"
```

---

## Task 4: Update dashboard.css

**Files:**
- Modify: `frontend/src/components/dashboard/dashboard.css:29,657,757`

**Interfaces:**
- Consumes: Font names from Task 1

- [ ] **Step 1: Update the three font-family declarations**

Run this check first to confirm line numbers:
```bash
grep -n "font-family.*Cairo" frontend/src/components/dashboard/dashboard.css
```

Expected: lines 29, 657, 757 — all with `'Cairo', sans-serif`.

For each occurrence, change:
```css
font-family: 'Cairo', sans-serif;
```
To:
```css
font-family: "IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif;
```

- [ ] **Step 2: Verify**

```bash
grep -n "font-family" frontend/src/components/dashboard/dashboard.css
```

Expected: the 3 occurrences now show the new stack. `font-family: monospace` at line 613 must remain unchanged (it is for code/mono output — do not touch).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/dashboard.css
git commit -m "feat(fonts): update dashboard.css to IBM Plex Sans Arabic stack"
```

---

## Task 5: Update chart components

**Files:**
- Modify: `frontend/src/components/dashboard/ContractStatusChart.tsx:67,77`
- Modify: `frontend/src/components/dashboard/RevenueChart.tsx:33,85,98`

**Interfaces:**
- Consumes: Font names from Task 1

The Recharts `fontFamily` config prop and inline style `fontFamily` values use the string `'Cairo, sans-serif'` or `'Cairo, sans-serif'`. Replace with the new stack string.

- [ ] **Step 1: Update ContractStatusChart.tsx**

Check exact content around lines 67 and 77:
```bash
grep -n "Cairo\|fontFamily" frontend/src/components/dashboard/ContractStatusChart.tsx
```

Change every occurrence of `'Cairo, sans-serif'` or `"Cairo, sans-serif"` or `"Cairo"` (as fontFamily value) to:
```
'"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif'
```

Concretely, line 67 will go from:
```tsx
fontFamily: 'Cairo, sans-serif',
```
To:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

And line 77 from:
```tsx
fontFamily: 'Cairo, sans-serif', fontWeight: 700
```
To:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', fontWeight: 700
```

- [ ] **Step 2: Update RevenueChart.tsx**

Check exact content:
```bash
grep -n "Cairo\|fontFamily" frontend/src/components/dashboard/RevenueChart.tsx
```

Apply same replacement for all 3 occurrences (lines 33, 85, 98). Example — line 33:
```tsx
fontFamily: 'Cairo, sans-serif',
```
→
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

For line 85 (the Recharts `tick` prop):
```tsx
tick={{ fill: '#9CA3AF', fontSize: 12, fontFamily: 'Cairo' }}
```
→
```tsx
tick={{ fill: '#9CA3AF', fontSize: 12, fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif' }}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/dashboard/ContractStatusChart.tsx
git add frontend/src/components/dashboard/RevenueChart.tsx
git commit -m "feat(fonts): update chart components to IBM Plex Sans Arabic stack"
```

---

## Task 6: Update print page components

**Files:**
- Modify: `frontend/src/pages/InvoicePreview.tsx:101,112,207`
- Modify: `frontend/src/pages/PayrollPayslip.tsx:88`
- Modify: `frontend/src/pages/ReportPrint.tsx:54`

**Interfaces:**
- Consumes: Font names from Task 1
- These are print-layout components — preserving layout fidelity is critical

- [ ] **Step 1: Update InvoicePreview.tsx**

Check current state:
```bash
grep -n "fontFamily\|Cairo" frontend/src/pages/InvoicePreview.tsx | head -20
```

For all 3 occurrences of `fontFamily: "'Cairo', sans-serif"`, change to:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

- [ ] **Step 2: Update PayrollPayslip.tsx**

Check current state:
```bash
grep -n "fontFamily\|Cairo" frontend/src/pages/PayrollPayslip.tsx
```

Change `fontFamily: "'Cairo', sans-serif"` to:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

- [ ] **Step 3: Update ReportPrint.tsx**

Check current state:
```bash
grep -n "fontFamily\|Cairo" frontend/src/pages/ReportPrint.tsx
```

Change `fontFamily: "'Cairo', sans-serif"` to:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/InvoicePreview.tsx
git add frontend/src/pages/PayrollPayslip.tsx
git add frontend/src/pages/ReportPrint.tsx
git commit -m "feat(fonts): update print page components to IBM Plex Sans Arabic stack"
```

---

## Task 7: Update form and payroll components

**Files:**
- Modify: `frontend/src/forms/EmploymentContractTemplate.tsx:80`
- Modify: `frontend/src/forms/shared/FormLayout.tsx:67`
- Modify: `frontend/src/pages/BankSalaryAnalytics.tsx:794`
- Modify: `frontend/src/pages/Cheques.tsx:160`

**Interfaces:**
- Consumes: Font names from Task 1
- Note: EmploymentContractTemplate and FormLayout are **print templates** — preserve exact spacing and page-break behavior

- [ ] **Step 1: Update EmploymentContractTemplate.tsx**

Check current:
```bash
grep -n "fontFamily\|Cairo\|Tajawal" frontend/src/forms/EmploymentContractTemplate.tsx
```

Current (line 80):
```tsx
fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
```
Change to:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

- [ ] **Step 2: Update FormLayout.tsx**

Check current:
```bash
grep -n "fontFamily\|Cairo\|Tajawal" frontend/src/forms/shared/FormLayout.tsx
```

Current (line 67):
```tsx
fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
```
Change to:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

- [ ] **Step 3: Update BankSalaryAnalytics.tsx**

Check current:
```bash
grep -n "fontFamily\|Cairo" frontend/src/pages/BankSalaryAnalytics.tsx
```

Current (line 794):
```tsx
fontFamily: 'Cairo, sans-serif',
```
Change to:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

- [ ] **Step 4: Update Cheques.tsx**

Check current:
```bash
grep -n "fontFamily\|Cairo\|Tajawal" frontend/src/pages/Cheques.tsx
```

Current (line 160):
```tsx
fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
```
Change to:
```tsx
fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/forms/EmploymentContractTemplate.tsx
git add frontend/src/forms/shared/FormLayout.tsx
git add frontend/src/pages/BankSalaryAnalytics.tsx
git add frontend/src/pages/Cheques.tsx
git commit -m "feat(fonts): update form, HR, and payroll components to IBM Plex Sans Arabic stack"
```

---

## Task 8: CDN audit

**Files:**
- Read-only scan — no modifications unless CDN found in production files

- [ ] **Step 1: Scan all production source files for CDN references**

```bash
grep -rn "googleapis\|gstatic" \
  frontend/src/main.tsx \
  frontend/index.html \
  frontend/src/app/ \
  frontend/src/components/ \
  frontend/src/pages/ \
  frontend/src/forms/ \
  frontend/src/styles/ \
  frontend/src/utils/
```

Expected: **zero results**

If any results appear outside `frontend/src/pages/index.html` (the standalone prototype), fix them.

- [ ] **Step 2: Scan for any unexpected IBM font references still pointing to CDN**

```bash
grep -rn "fonts.googleapis\|fonts.gstatic" frontend/src/ --include="*.tsx" --include="*.ts" --include="*.css" --include="*.html" | grep -v "src/pages/index.html"
```

Expected: **zero results**

- [ ] **Step 3: Confirm IBM Plex fonts load from assets, not CDN**

```bash
grep -rn "IBMPlex\|ibm-plex\|IBM Plex" frontend/src/ --include="*.css" --include="*.tsx" --include="*.ts"
```

All results should reference `assets/fonts/` or `"IBM Plex Sans Arabic"` (the CSS name), never a CDN URL.

- [ ] **Step 4: Commit result**

```bash
git add -A
git commit -m "audit(fonts): CDN scan passed — all fonts loaded locally"
```

If nothing was changed in this task (all clean), skip the commit.

---

## Task 9: TypeScript validation and build

**Files:**
- No changes — validation only

- [ ] **Step 1: Frontend TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: **zero errors**

If errors appear, they will be type errors introduced in Tasks 5–7 (JSX `style` prop misuse). Fix by ensuring string values are properly quoted.

- [ ] **Step 2: Backend TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: **zero errors** (no backend files were modified)

- [ ] **Step 3: Electron TypeScript check**

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: **zero errors** (no electron files were modified)

- [ ] **Step 4: Run backend tests**

```bash
cd backend && npm test
```

Expected: all pass (no logic changed)

- [ ] **Step 5: Build frontend**

```bash
npm run build:front
```

Expected: builds successfully. Check that `dist/assets/` contains the woff2 files (Vite should bundle them when imported via `@font-face` in CSS). Run:
```bash
ls frontend/dist/assets/*.woff2 2>/dev/null | wc -l
```
Expected: > 0 woff2 files bundled.

- [ ] **Step 6: Build backend**

```bash
npm run build:back
```

Expected: zero errors.

- [ ] **Step 7: Commit if any fixes were required**

If you had to fix TypeScript errors in this task:
```bash
git add <affected-files>
git commit -m "fix(fonts): resolve TypeScript errors from font stack update"
```

---

## Deliverables Checklist

Fill this out when all tasks are complete. Include in your report to the user.

| Check | Result |
|---|---|
| fonts.css created | |
| IBM Plex Sans Arabic weights loaded (400, 500, 600, 700) | |
| Tajawal weights loaded (400, 500, 600, 700) | |
| WOFF2 only in @font-face | |
| Cairo retained as fallback via @fontsource/cairo | |
| body font-family updated (theme.css) | |
| dashboard.css updated (3 occurrences) | |
| ContractStatusChart.tsx updated | |
| RevenueChart.tsx updated | |
| EmploymentContractTemplate.tsx updated | |
| FormLayout.tsx updated | |
| BankSalaryAnalytics.tsx updated | |
| Cheques.tsx updated | |
| InvoicePreview.tsx updated | |
| PayrollPayslip.tsx updated | |
| ReportPrint.tsx updated | |
| chequeTemplate.ts NOT touched | |
| frontend/index.html NOT touched (already clean) | |
| No googleapis/gstatic in production source | |
| frontend tsc --noEmit: 0 errors | |
| backend tsc --noEmit: 0 errors | |
| electron tsc --noEmit: 0 errors | |
| npm test: all pass | |
| npm run build:front: success | |
| npm run build:back: success | |

---

## Visual Verification Guide

After all tasks complete and the dev server is running (`npm run dev`), verify these pages manually in the browser:

| Page | What to check |
|---|---|
| Dashboard | Numbers render as 0–9 (not ٠–٩), charts have IBM Plex text |
| Customers table | No text cutoff, Arabic renders cleanly |
| Suppliers table | Same as Customers |
| Employees table | Same |
| Invoices list | Table doesn't break, amounts readable |
| Invoice Preview | Font loads, layout matches reference |
| Reports page | Text clean, no overflow |
| HR Forms | Fields render, labels not clipped |
| Employment Contract | Still exactly 2 pages when printed — open print preview to verify |
| Payroll Bank Analytics | Dark-mode panel text readable |
| Cheques page | Font visible, cheque rendering unchanged |
| Settings | UI intact |
| Login page | Arabic renders, no overflow |

**Specific risk — employment contract page count:** IBM Plex Sans Arabic has slightly different metrics from Cairo. Open the employment contract in print preview (`Ctrl+P`) and confirm it is still 2 pages. If it overflows to 3 pages, reduce the container font-size by 0.5px or reduce line-height by 0.05 in `EmploymentContractTemplate.tsx`. Do not touch layout margins.

---

## Gemini Review Prompt

Use this prompt verbatim when submitting the diff for Gemini review:

---

```
You are reviewing a typography-only CSS change in the manarERP Electron desktop ERP application (React + Vite, RTL Arabic, offline-only).

## What Changed
- A new `frontend/src/styles/fonts.css` was added with @font-face declarations for IBM Plex Sans Arabic (400, 500, 600, 700) and Tajawal (400, 500, 600, 700), loading from local woff2 files in `frontend/src/assets/fonts/`.
- `frontend/src/main.tsx` now imports `fonts.css` before the existing @fontsource/cairo imports.
- `frontend/src/app/theme.css` body rule updated to: `"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif`.
- 14 hardcoded `fontFamily: "'Cairo', sans-serif"` inline-style values across 10 files updated to the new stack.
- No backend, prisma, auth, business logic, or print profile files were touched.

## Review Focus
1. **Offline compatibility:** Do the @font-face `src` paths resolve correctly in the Vite build and in Electron file:// protocol? Are there any CDN URLs?
2. **Font loading order:** Is the import order in main.tsx correct — fonts.css before Cairo fallback before theme.css?
3. **Arabic numeral safety:** Does any CSS rule (unicode-range, font-variant-numeric, digit-specific rules) risk converting 0–9 to ٠–٩?
4. **Print layout risk:** The employment contract must stay at 2 pages. Does the new font's metrics differ enough from Cairo to risk page overflow?
5. **Missed occurrences:** Are there any remaining hardcoded `'Cairo'` or `'Tajawal'` font-family declarations that were not updated?
6. **Weight range:** Are any weights outside 400/500/600/700 being declared or imported?
7. **Cascade correctness:** With body declaring the new stack, do all `font-family: inherit` usages correctly cascade without needing explicit override?
8. **chequeTemplate.ts:** Was the FONT_FAMILIES array or cheque inline styles left untouched?
9. **Security:** Any risk from the local font asset paths? Any path traversal or asset-loading issue in Electron?
10. **Regression risk:** Which UI components carry the highest regression risk from this font change?

Please provide: (a) PASS / CONCERN / FAIL for each point, (b) specific file + line references for any concerns, (c) overall merge recommendation.
```

---

## Known Limitations / Out of Scope

- **Cairo woff2 not in assets:** Cairo TTF files exist in `frontend/src/assets/fonts/` but are not woff2. Cairo is served as woff2 via `@fontsource/cairo` npm package. Future cleanup could extract Cairo woff2 from node_modules into the assets folder.
- **Tajawal SemiBold (600) absent:** No `Tajawal-SemiBold.woff2` in assets. Weight 600 maps to `Tajawal-Bold.woff2`. Acceptable since Tajawal is a second fallback.
- **Cheque templates unchanged:** `frontend/src/utils/chequeTemplate.ts` inline `fontFamily: 'Cairo'` styles retained. These are print-profile templates for physical cheque printing. A separate task should handle these after confirming cheque print dimensions are unaffected.
- **Font reorganization deferred:** The spec suggests organizing fonts into subdirectories (`ibm-plex-sans-arabic/`, `cairo/`, `tajawal/`). Since fonts already exist as flat files and no code currently imports them by path (IBM/Tajawal were unused before this task), reorganization would be a pure rename operation. Deferred to a follow-up cleanup task.

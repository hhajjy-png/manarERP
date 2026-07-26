# Universal Export File Naming Standard v1 — Final Report

**Date:** 2026-07-07
**Branch:** `feature/universal-export-file-naming` (off `production`, base `b8d552a`)
**Checkpoint tag:** `checkpoint/pre-export-naming-b8d552a`
**Status:** Implementation complete. NOT merged / NOT pushed — awaiting Gemini review + merge decision per CLAUDE.md workflow.

---

## Result

Every user-facing export in the frontend now produces a filename in the official format:

```
manarERP_<ReportName>_<Identifier>_<YYYY-MM-DD>.<extension>
```

A coverage grep across `frontend/src` confirms **zero in-scope ad-hoc export filenames remain**.

Validation: frontend `tsc --noEmit` clean · electron `tsc --noEmit` clean · `npm test` 736/738 pass (the 2 failures are pre-existing `printWorkspace.test.tsx` CSS assertions, unrelated — this branch never touches print-workspace source/test) · `npm run build` succeeds.

---

## The single source of truth

**`frontend/src/utils/exportFilename.ts`** (new) — the only place export filenames are built:

```ts
generateExportFileName({ reportName, identifier?, date?, extension }): string
```

- Fixed prefix `manarERP`; segments joined with `_`; empty/absent identifier omitted entirely (no blank `__`).
- `sanitizeFilenameSegment`: removes `/ \ : * ? " < > |` + control chars → whitespace→`_` → collapse `_` → trim leading/trailing `_ - .`. Arabic preserved verbatim, never translated.
- Extension passed **without** leading dot; a stray dot is stripped defensively and lowercased.
- `ReportName` const map = the canonical report-name vocabulary.

Supporting changes:
- **`frontend/src/lib/date.ts`** — added `formatFileDate()` → local `YYYY-MM-DD` (fixes the UTC-rollover bug in the old `toISOString().slice(0,10)`).
- **`frontend/src/utils/pdfFilename.ts`** — reduced to a thin wrapper delegating to the utility (existing callers keep working; output is now standardized).
- **`electron/ipc/pdf.ipc.ts`** — `.pdf` append made idempotent in both handlers, so the frontend can pass a full standardized `.pdf` name without `name.pdf.pdf`.

Backend is untouched (its `Content-Disposition` is invisible to users — the frontend re-derives every name).

---

## Before / After examples

| Report | Before | After |
|---|---|---|
| Invoice PDF | `INV-10254-2026-07-07` | `manarERP_Invoice_INV-10254_2026-07-07.pdf` |
| Customer statement Excel | `statement-مؤسسة الخليج-2026-07-07.xlsx` | `manarERP_CustomerStatement_مؤسسة_الخليج_2026-07-07.xlsx` |
| Trial balance Excel | `trial-balance.xlsx` | `manarERP_TrialBalance_2026-07-07.xlsx` |
| GL statement Excel | `gl-statement-42.xlsx` | `manarERP_GeneralLedger_42_2026-07-07.xlsx` |
| Generic CRUD export (e.g. customers) | `customers-export.xlsx` | `manarERP_Customers_2026-07-07.xlsx` |
| Expenses list Excel | `expenses_2026-07-07.xlsx` | `manarERP_Expenses_2026-07-07.xlsx` |
| Payroll export Excel | `payroll-7-2026.xlsx` | `manarERP_PayrollReport_2026-07_2026-07-07.xlsx` |
| Bank timeline CSV | `bank-account-timeline-gulf-2026-01-01-to-2026-07-07.csv` | `manarERP_BankAccountTimeline_gulf_2026-07-07.csv` |
| Payroll import report | `import-report-2026-07-07.pdf` | `manarERP_PayrollImport_2026-07-07.pdf` |

---

## Files modified (12 commits, 24 files)

**Core / infra:** `utils/exportFilename.ts` (new) · `utils/__tests__/exportFilename.test.ts` (new) · `lib/date.ts` · `lib/__tests__/date.test.ts` (new) · `utils/pdfFilename.ts` · `__tests__/pdfFilename.test.ts` · `electron/ipc/pdf.ipc.ts`

**Migrated export sites:** `pages/FinancialCenter.tsx` (statement + AR/AP aging + GL statement + GL report + trial balance + journal book, PDF **and** Excel) · `components/financial/FinancialReportsTab.tsx` · `api/statements.ts` · `api/bankStatementImport.ts` · `pages/BankSalaryAnalytics.tsx` · `pages/BankReconciliation.tsx` (timeline + batch CSV) · `pages/BankAccountExplorer.tsx` · `pages/DocumentExpirationCenter.tsx` · `pages/ExecutiveDecisionCenter.tsx` · `pages/ReportPrint.tsx` · `pages/Reports.tsx` (PDF + Excel) · `pages/ResourcePage.tsx` (generic CRUD export for all data modules) · `pages/Expenses.tsx` · `pages/Invoices.tsx` (list + monthly report) · `pages/Prices.tsx` · `pages/Salaries.tsx` · `pages/PayrollBankImport.tsx` (Excel + PDF)

Every `exportToPDF` / `exportToExcel` / `exportToCSV` / `download()` / `saveBlob` / Electron save path now routes through `generateExportFileName`.

---

## Coverage additions beyond the original plan

The plan's per-site inventory was incomplete; the review loops + final grep gate caught and fixed:
- 5 **PDF** export sites in FinancialCenter (plan listed only their Excel siblings).
- Reports.tsx Excel export (plan listed only its PDF).
- BankReconciliation batch-CSV export (sweep-found).
- The generic **ResourcePage** export (serves every data-driven CRUD module) + Expenses, Invoices (×2), Prices, Salaries, PayrollBankImport (×2) — all missed by the initial reconnaissance.

---

## Out of scope (intentionally unchanged)

Per the approved scope (reports & data exports only): DB backups (`manar-backup-*.db`), blank import templates (`DataImport.tsx`), print-template / layout-designer / cheque-calibration JSON exports, AI-result `.txt` dumps. Backend left untouched.

---

## Post-review fix (done)

`ResourcePage.tsx` now resolves module keys to canonical PascalCase report names via a new `resourceReportName()` helper in `exportFilename.ts` (backed by a `RESOURCE_REPORT_NAMES` map for the 7 data modules — contracts, customers, suppliers, equipment, employees, expenses, users — with a PascalCase fallback so a future module is never left un-standardized). Generic CRUD exports now read `manarERP_Customers_2026-07-07.xlsx`. Added `Customers`/`Suppliers`/`Equipment`/`Employees`/`Contracts`/`Users` to `ReportName` and 3 unit tests. Commit `b7a619a`. Re-validated: tsc clean, 739/741 tests pass (same 2 pre-existing `printWorkspace` failures), build OK.

## Known follow-up (non-blocking Minor — for a future `/simplify` pass)

1. `BankReconciliation.tsx` `exportTimelineCsv` has now-dead `today`/`from`/`to` locals (and their feeding params) after the from-to range was dropped from the filename. Does not affect behavior; deferred per user.

---

## Next steps (owner: user)

1. Gemini review (mandatory before production merge per CLAUDE.md).
2. On approval: merge `--no-ff` into `production`, stable tag, update PROJECT_STATE.
3. Optional `/simplify` pass for the two Minors above.

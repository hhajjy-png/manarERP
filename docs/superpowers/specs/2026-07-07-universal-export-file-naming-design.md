# Universal Export File Naming Standard v1 — Design Spec

**Date:** 2026-07-07
**Status:** Approved (design), pending implementation plan
**Scope:** Frontend-only. Reports & data exports (PDF / Excel / CSV).
**Mode:** Feature (per `docs/development-workflow.md`)

---

## 1. Goal

Provide one professional, unified standard for naming every file the system
exports (PDF / Excel / CSV, and any future type). All export operations must
route through a single shared utility — the Single Source of Truth.

This package changes **file names only**. It must not change report logic, file
content, report design, or printing.

### Official format

```
manarERP_<ReportName>_<Identifier>_<YYYY-MM-DD>.<extension>
```

Examples:

```
manarERP_Invoice_INV-10254_2026-07-07.pdf
manarERP_CustomerStatement_CUST-001_2026-07-07.xlsx
manarERP_GeneralLedger_110100_2026-07-07.pdf
manarERP_TrialBalance_2026-07-07.xlsx          (no identifier segment)
manarERP_BankStatement_GulfBank_2026-07-07.pdf
manarERP_PayrollReport_2026-07-07.pdf
```

---

## 2. Architecture decisions (approved)

1. **`frontend/src/utils/exportFilename.ts`** is the single canonical source of
   truth for all export filename generation.
2. **`frontend/src/utils/pdfFilename.ts`** becomes a thin backward-compatible
   wrapper that delegates to `exportFilename.ts`. Its existing exports
   (`sanitizePdfFilename`, `buildInvoicePdfName`, `buildQuotationPdfName`,
   `buildFilenameFromDate`) keep their current signatures so existing callers do
   not break, but their output now follows the new standard where they are
   migrated. (See §7 for the migration decision per caller.)
3. **`formatFileDate()`** is added to `frontend/src/lib/date.ts` so all date
   formatting stays centralized under the existing Global Date Standardization
   architecture. It produces a filesystem-safe `YYYY-MM-DD` using **local** date
   components (not `toISOString()`, which is UTC and returns the wrong day near
   midnight in Kuwait, UTC+3).
4. **Scope is frontend-only.** The backend is untouched: its
   `Content-Disposition` headers are already invisible to the user because the
   frontend re-derives every filename client-side and ignores the server name.
5. **Electron safeguard:** `electron/ipc/pdf.ipc.ts` currently appends `.pdf`
   unconditionally. Make the append **idempotent** so the frontend can pass a
   fully standardized name (already ending in `.pdf`) without producing
   `name.pdf.pdf`. Old callers that pass a name without extension keep working.

### Why frontend-only is complete coverage

Every user-facing download is named at the frontend or Electron layer:

- **Blob / anchor downloads** set `a.download` inline and discard the server's
  `Content-Disposition`.
- **Electron PDF path** passes a `suggestedName` to `window.manar.exportPdf*`.

No backend-generated filename reaches the user. Therefore standardizing at the
frontend covers 100% of user-facing files with zero cross-process logic
duplication (the spec requirement "Shared Utility واحدة فقط / لا يوجد أي تكرار").

---

## 3. Utility API

```ts
// frontend/src/utils/exportFilename.ts

/** Canonical, type-safe report-name vocabulary. Spelled ONE way everywhere. */
export const ReportName = {
  Invoice: 'Invoice',
  Quotation: 'Quotation',
  CustomerStatement: 'CustomerStatement',
  SupplierStatement: 'SupplierStatement',
  ARAging: 'ARAging',
  APAging: 'APAging',
  GeneralLedger: 'GeneralLedger',
  GeneralLedgerReport: 'GeneralLedgerReport',
  TrialBalance: 'TrialBalance',
  JournalBook: 'JournalBook',
  FinancialSummary: 'FinancialSummary',
  BankStatement: 'BankStatement',
  BankAnalytics: 'BankAnalytics',
  BankAccountTimeline: 'BankAccountTimeline',
  BankAccountLedger: 'BankAccountLedger',
  PayrollReport: 'PayrollReport',
  PayrollImport: 'PayrollImport',
  ExecutiveReport: 'ExecutiveReport',
  DocumentExpirations: 'DocumentExpirations',
  Report: 'Report', // generic reports engine; identifier carries the report type
} as const;

export type ReportNameValue = (typeof ReportName)[keyof typeof ReportName];

export interface ExportFileNameParts {
  /** Canonical report name. Prefer a ReportName.* value. */
  reportName: string;
  /** Best available identifier (invoice no., customer code, account code…).
   *  Omitted from the filename entirely when empty/null after sanitizing. */
  identifier?: string | number | null;
  /** Defaults to "now". Formatted YYYY-MM-DD via lib/date.formatFileDate. */
  date?: Date | string | number;
  /** Extension WITHOUT the leading dot: 'pdf' | 'xlsx' | 'csv'. A leading dot,
   *  if mistakenly passed, is stripped defensively. */
  extension: string;
}

/** Build a filename following the official manarERP export standard. */
export function generateExportFileName(parts: ExportFileNameParts): string;
```

### Assembly algorithm

1. Start with fixed prefix constant `manarERP`.
2. Build the segment list: `[prefix, reportName, identifier?, dateStr]`.
3. Sanitize each segment (§4). Drop any segment that is empty after sanitizing —
   this is how Trial Balance and other identifier-less reports naturally omit the
   identifier slot (no empty `__`).
4. Join surviving segments with `_`.
5. Normalize the joined base name (collapse repeated `_`, trim leading/trailing
   `_ - .`).
6. Normalize the extension: strip a leading dot, lowercase, sanitize.
7. Return `` `${base}.${ext}` ``.

### Extension contract

`extension` is always passed **without** the leading dot (`'pdf'`, `'xlsx'`,
`'csv'`). The utility strips a leading dot defensively but callers must follow
the no-dot convention.

---

## 4. Sanitization rules (exactly per spec)

Applied per-segment and to the final base name:

- Remove illegal characters: `/ \ : * ? " < > |` plus ASCII control characters.
- Replace whitespace runs with a single `_`.
- Collapse repeated `_` into one.
- Trim leading/trailing `_`, `-`, `.`.
- **Preserve Arabic and English.** Only the illegal set above is removed —
  non-ASCII letters (Arabic customer names, etc.) are kept verbatim.
- **Never translate** identifiers/names; a customer whose name is Arabic is used
  as-is.

Difference from legacy `sanitizePdfFilename`: the legacy version replaced illegal
chars with `-` and also stripped `&`. The new rule follows the spec's exact
illegal set (keeps `&`, which is legal on Windows) and uses `_` as the space
replacement. The legacy wrapper is re-pointed at the new core (§7).

---

## 5. Date handling

Add to `frontend/src/lib/date.ts`:

```ts
/** 2026-07-07 — filesystem-safe, LOCAL date (not UTC). */
export function formatFileDate(value?: unknown): string;
```

- Uses local `getFullYear/getMonth/getDate` (consistent with the existing
  display formatters in the same module), zero-padded.
- Defaults to the current date when `value` is omitted/invalid.
- This is the ONLY place a filename date is formatted. No call site uses
  `toISOString().slice(0,10)` after migration.

The display formatter (`formatDate` → `DD/MM/YYYY`) is unsuitable for filenames
(slashes are illegal), which is why a distinct file-safe formatter is required.

---

## 6. Identifier selection per report type

| Report | Identifier | Fallback |
|---|---|---|
| Invoice | Invoice number (`INV-…`) | none → `manarERP_Invoice_<date>` |
| Quotation | Quotation number (`QT-…`) | none |
| Customer statement | Customer **code** | Customer **name**, else numeric id |
| Supplier statement | Supplier **code** | Supplier name, else id |
| Employee report | Employee **code** | — |
| Bank statement (reconciliation) | Bank name / account | import id |
| Bank analytics | Employee code (when scoped) | none |
| General Ledger (account) | Account **code** | account id |
| GL report / Journal / Trial Balance / Financial Summary | none | — |
| AR / AP Aging | none | — |
| Payroll report / Payroll import | none | — |
| Executive report | `Dashboard` | — |
| Document expirations | none | — |
| Generic reports engine | report `type` as identifier | — |

When no suitable identifier exists, the identifier segment is omitted entirely
(never blank).

---

## 7. Migration surface (frontend)

All sites below are migrated to `generateExportFileName`. Full before/after
table and exact call signatures are produced in the implementation plan; the
inventory below is the authoritative site list.

**Electron PDF path (currently via `pdfFilename.ts`):**
- `pages/InvoicePreview.tsx` (invoice) — `ReportName.Invoice`, id = invoice number
- `pages/Quotation.tsx` (quotation) — `ReportName.Quotation`
- `pages/ExecutiveDecisionCenter.tsx` — `ReportName.ExecutiveReport`, id = `Dashboard`
- `pages/ReportPrint.tsx` — `ReportName.Report`, id = report type
- `pages/Reports.tsx` — via `pdfExport.ts`

**Blob / anchor / CSV path:**
- `pages/FinancialCenter.tsx` — statement (customer code), AR/AP aging, GL
  statement (account code), GL report, trial balance, journal book
- `components/financial/FinancialReportsTab.tsx` — financial summary (PDF + Excel)
- `api/statements.ts` — customer / supplier statement Excel
- `api/bankStatementImport.ts` — bank statement export (xlsx/pdf), CSV export
- `pages/BankSalaryAnalytics.tsx` — bank analytics CSV + Excel
- `pages/BankReconciliation.tsx` — account timeline CSV
- `pages/BankAccountExplorer.tsx` — account ledger CSV
- `pages/DocumentExpirationCenter.tsx` — expirations Excel

**Shared helpers touched:**
- `utils/pdfFilename.ts` → delegate all four exports to `exportFilename.ts`.
- `utils/pdfExport.ts`, `utils/exportUtils.ts` → accept the standardized name
  from callers (no internal name-building change needed; they already take a
  filename param).

**Electron:**
- `electron/ipc/pdf.ipc.ts` — idempotent `.pdf` append in both `pdf:export` and
  `pdf:exportHtml`.

### Out of scope (unchanged)

DB backups (`manar-backup-*.db`), print-template / layout-designer JSON exports,
cheque-calibration JSON, AI-result `.txt` dumps. These retain their existing
conventions per the approved scope decision.

---

## 8. Testing

`exportFilename.ts` is a pure function → unit-tested. Cases:

- Full format assembly with all segments present.
- Identifier omitted when absent/empty (no `__`, no trailing `_`).
- Arabic identifier preserved verbatim.
- Illegal characters (`/ \ : * ? " < > |`) removed.
- Whitespace → `_`; repeated `_` collapsed; leading/trailing `_ - .` trimmed.
- Extension normalized (leading dot stripped, lowercased).
- Date defaults to today; explicit Date/ISO string formatted local `YYYY-MM-DD`.
- `formatFileDate` local-vs-UTC boundary (near-midnight Kuwait case).

Confirm the frontend test harness during planning; if none exists, add a
lightweight Vitest setup scoped to `utils/` (matches backend's Vitest choice).

---

## 9. Explicitly NOT changed

- Report logic / queries / calculations.
- File content (PDF/Excel/CSV bytes).
- Report design & print layouts.
- Backend behavior (beyond nothing — it is untouched).
- DB backup, config-JSON, AI-txt naming conventions.

---

## 10. Deliverables

- `exportFilename.ts` shared utility (single source of truth).
- `formatFileDate()` in `lib/date.ts`.
- `pdfFilename.ts` delegating wrapper.
- Idempotent Electron `.pdf` append.
- All export sites in §7 migrated.
- Unit tests for the utility.
- Final report: files modified, before/after examples, confirmation that every
  export type now follows `manarERP_<ReportName>_<Identifier>_<YYYY-MM-DD>.<ext>`.

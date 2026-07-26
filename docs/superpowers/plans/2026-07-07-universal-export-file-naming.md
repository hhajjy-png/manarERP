# Universal Export File Naming Standard v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route every frontend export/download through one shared utility that produces `manarERP_<ReportName>_<Identifier>_<YYYY-MM-DD>.<extension>`.

**Architecture:** A new pure module `frontend/src/utils/exportFilename.ts` is the single source of truth. A file-safe date formatter is added to `frontend/src/lib/date.ts`. `frontend/src/utils/pdfFilename.ts` is reduced to a delegating wrapper. Every export site is migrated to the utility. Backend is untouched; Electron's `.pdf` append is made idempotent.

**Tech Stack:** React + TypeScript + Vite, Vitest (`npm test` → `vitest run`), Electron main process.

**Spec:** `docs/superpowers/specs/2026-07-07-universal-export-file-naming-design.md`

## Global Constraints

- Output format is exactly `manarERP_<ReportName>_<Identifier>_<YYYY-MM-DD>.<extension>`.
- Fixed prefix constant: `manarERP`.
- Identifier segment is **omitted entirely** when empty/absent (never a blank `__`).
- Date is always `YYYY-MM-DD`, computed from **local** date components (never `toISOString()`).
- `extension` is always passed **without** the leading dot (`'pdf'`, `'xlsx'`, `'csv'`); the utility strips a stray leading dot defensively.
- Illegal characters removed: `/ \ : * ? " < > |` + ASCII control chars. Whitespace → `_`. Repeated `_` collapsed. Leading/trailing `_ - .` trimmed.
- Arabic and English preserved verbatim; identifiers/names never translated.
- Change file **names only** — never report logic, file content, report design, or printing.
- Frontend-only scope. Backend untouched. Out of scope: DB backups, config/layout JSON exports, cheque-calibration JSON, AI `.txt` dumps.
- Run TypeScript validation (`cd frontend && npx tsc --noEmit`) and `npm test` before declaring done. Do not commit/merge without explicit user approval (project CLAUDE.md).

---

## File Structure

- **Create** `frontend/src/utils/exportFilename.ts` — the canonical utility: `ReportName` map, `sanitizeFilenameSegment`, `generateExportFileName`.
- **Create** `frontend/src/utils/__tests__/exportFilename.test.ts` — unit tests.
- **Modify** `frontend/src/lib/date.ts` — add `formatFileDate`.
- **Modify** `frontend/src/utils/pdfFilename.ts` — delegate to `exportFilename.ts`.
- **Modify** `frontend/src/__tests__/pdfFilename.test.ts` — update expectations to the new standard.
- **Modify** `electron/ipc/pdf.ipc.ts` — idempotent `.pdf` append (both handlers).
- **Modify** the export sites (Tasks 5–8): `pages/ExecutiveDecisionCenter.tsx`, `pages/ReportPrint.tsx`, `pages/Reports.tsx`, `pages/FinancialCenter.tsx`, `components/financial/FinancialReportsTab.tsx`, `api/statements.ts`, `api/bankStatementImport.ts`, `pages/BankSalaryAnalytics.tsx`, `pages/BankReconciliation.tsx`, `pages/BankAccountExplorer.tsx`, `pages/DocumentExpirationCenter.tsx`.

---

## Task 1: Core utility `exportFilename.ts` + tests

**Files:**
- Create: `frontend/src/utils/exportFilename.ts`
- Test: `frontend/src/utils/__tests__/exportFilename.test.ts`

**Interfaces:**
- Consumes: `formatFileDate` from `../../lib/date` (added in Task 2). For Task 1, add a temporary local date fallback inside the test only if Task 2 not yet done; otherwise implement Task 2 first. **Recommended order: do Task 2 before Task 1** so `formatFileDate` exists. Steps below assume Task 2 is complete.
- Produces:
  - `export const ReportName` (const map, values are strings).
  - `export type ReportNameValue`.
  - `export interface ExportFileNameParts { reportName: string; identifier?: string | number | null; date?: Date | string | number; extension: string; }`
  - `export function sanitizeFilenameSegment(input: string | number | null | undefined): string`
  - `export function generateExportFileName(parts: ExportFileNameParts): string`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/utils/__tests__/exportFilename.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  generateExportFileName,
  sanitizeFilenameSegment,
  ReportName,
} from '../exportFilename';

describe('sanitizeFilenameSegment', () => {
  it('removes Windows/POSIX illegal characters', () => {
    expect(sanitizeFilenameSegment('a\\b/c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });
  it('replaces whitespace runs with a single underscore', () => {
    expect(sanitizeFilenameSegment('my  file   name')).toBe('my_file_name');
  });
  it('collapses repeated underscores', () => {
    expect(sanitizeFilenameSegment('a__b___c')).toBe('a_b_c');
  });
  it('trims leading/trailing underscore, dash and dot', () => {
    expect(sanitizeFilenameSegment('_-.name.-_')).toBe('name');
  });
  it('preserves Arabic characters verbatim', () => {
    expect(sanitizeFilenameSegment('شركة المنار')).toBe('شركة_المنار');
  });
  it('returns empty string for null/undefined', () => {
    expect(sanitizeFilenameSegment(null)).toBe('');
    expect(sanitizeFilenameSegment(undefined)).toBe('');
  });
});

describe('generateExportFileName', () => {
  const date = '2026-07-07';

  it('assembles the full standard format', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.Invoice,
        identifier: 'INV-10254',
        date,
        extension: 'pdf',
      }),
    ).toBe('manarERP_Invoice_INV-10254_2026-07-07.pdf');
  });

  it('omits the identifier segment when absent', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.TrialBalance,
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_TrialBalance_2026-07-07.xlsx');
  });

  it('omits the identifier segment when empty/whitespace', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.TrialBalance,
        identifier: '   ',
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_TrialBalance_2026-07-07.xlsx');
  });

  it('keeps an Arabic identifier without translating', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.CustomerStatement,
        identifier: 'مؤسسة الخليج',
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_CustomerStatement_مؤسسة_الخليج_2026-07-07.xlsx');
  });

  it('strips a stray leading dot on the extension and lowercases it', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.Report,
        identifier: 'payroll',
        date,
        extension: '.PDF',
      }),
    ).toBe('manarERP_Report_payroll_2026-07-07.pdf');
  });

  it('accepts a numeric identifier', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.GeneralLedger,
        identifier: 110100,
        date,
        extension: 'pdf',
      }),
    ).toBe('manarERP_GeneralLedger_110100_2026-07-07.pdf');
  });

  it('defaults to today (YYYY-MM-DD) when no date is given', () => {
    const name = generateExportFileName({
      reportName: ReportName.PayrollReport,
      extension: 'pdf',
    });
    expect(name).toMatch(/^manarERP_PayrollReport_\d{4}-\d{2}-\d{2}\.pdf$/);
  });

  it('sanitizes illegal characters inside the identifier', () => {
    expect(
      generateExportFileName({
        reportName: ReportName.CustomerStatement,
        identifier: 'CUST/001:A',
        date,
        extension: 'xlsx',
      }),
    ).toBe('manarERP_CustomerStatement_CUST001A_2026-07-07.xlsx');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/utils/__tests__/exportFilename.test.ts`
Expected: FAIL — `Failed to resolve import "../exportFilename"`.

- [ ] **Step 3: Write the implementation**

Create `frontend/src/utils/exportFilename.ts`:

```ts
import { formatFileDate } from '../lib/date';

/** Fixed product prefix for every exported file. */
const PREFIX = 'manarERP';

/** Illegal on Windows/most filesystems, plus ASCII control characters. */
const ILLEGAL_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/** Canonical, type-safe report-name vocabulary — spelled ONE way everywhere. */
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
  Report: 'Report',
} as const;

export type ReportNameValue = (typeof ReportName)[keyof typeof ReportName];

export interface ExportFileNameParts {
  /** Canonical report name. Prefer a ReportName.* value. */
  reportName: string;
  /** Best available identifier; omitted from the name when empty after sanitizing. */
  identifier?: string | number | null;
  /** Defaults to now. Formatted YYYY-MM-DD (local) via lib/date.formatFileDate. */
  date?: Date | string | number;
  /** Extension WITHOUT the leading dot ('pdf' | 'xlsx' | 'csv'). */
  extension: string;
}

/** Sanitize a single filename segment per the manarERP export standard. */
export function sanitizeFilenameSegment(
  input: string | number | null | undefined,
): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(ILLEGAL_CHARS, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function normalizeExtension(ext: string): string {
  return sanitizeFilenameSegment(ext.replace(/^\.+/, '')).toLowerCase();
}

/** Build a filename following the official manarERP export standard. */
export function generateExportFileName(parts: ExportFileNameParts): string {
  const dateStr = formatFileDate(parts.date);
  const base = [PREFIX, parts.reportName, parts.identifier, dateStr]
    .map(sanitizeFilenameSegment)
    .filter((segment) => segment.length > 0)
    .join('_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  const ext = normalizeExtension(parts.extension);
  return ext ? `${base}.${ext}` : base;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/utils/__tests__/exportFilename.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/exportFilename.ts frontend/src/utils/__tests__/exportFilename.test.ts
git commit -m "feat(export): add universal export filename utility"
```

---

## Task 2: `formatFileDate` in `lib/date.ts`

> Do this **before** Task 1 (Task 1 imports it). Listed second for narrative clarity only.

**Files:**
- Modify: `frontend/src/lib/date.ts` (append a new export; reuse the existing private `parse`)
- Test: `frontend/src/lib/__tests__/date.test.ts` (create if absent)

**Interfaces:**
- Produces: `export function formatFileDate(value?: unknown): string` → local `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/date.test.ts` (or add this `describe` if the file exists):

```ts
import { describe, it, expect } from 'vitest';
import { formatFileDate } from '../date';

describe('formatFileDate', () => {
  it('formats a Date as local YYYY-MM-DD', () => {
    expect(formatFileDate(new Date(2026, 6, 7))).toBe('2026-07-07'); // month is 0-based
  });
  it('zero-pads month and day', () => {
    expect(formatFileDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
  it('parses an ISO string', () => {
    expect(formatFileDate('2026-12-31T09:00:00')).toBe('2026-12-31');
  });
  it('defaults to today when no value given', () => {
    expect(formatFileDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('falls back to today for an invalid value', () => {
    expect(formatFileDate('not-a-date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/__tests__/date.test.ts`
Expected: FAIL — `formatFileDate is not a function` / import unresolved.

- [ ] **Step 3: Add the implementation**

Append to `frontend/src/lib/date.ts` (the private `parse` already exists at the top of the file):

```ts
/** 2026-07-07 — filesystem-safe, LOCAL date (never UTC). Defaults to today. */
export function formatFileDate(value?: unknown): string {
  const d = value === undefined || value === null ? new Date() : parse(value) ?? new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/__tests__/date.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/date.ts frontend/src/lib/__tests__/date.test.ts
git commit -m "feat(date): add filesystem-safe formatFileDate"
```

---

## Task 3: `pdfFilename.ts` delegating wrapper

**Files:**
- Modify: `frontend/src/utils/pdfFilename.ts`
- Modify: `frontend/src/__tests__/pdfFilename.test.ts`

**Interfaces:**
- Consumes: `generateExportFileName`, `sanitizeFilenameSegment`, `ReportName` from `./exportFilename`.
- Produces (unchanged signatures, new standardized output, all now include the `.pdf` extension): `sanitizePdfFilename(name, fallback)`, `buildInvoicePdfName(invoiceNumber)`, `buildQuotationPdfName(quotationNumber)`, `buildFilenameFromDate(prefix)`.

- [ ] **Step 1: Confirm no other importers depend on the OLD output shape**

Run: `cd frontend && grep -rn "from '.*pdfFilename'" src` (or use the Grep tool for `pdfFilename`).
Expected callers: `pages/InvoicePreview.tsx`, `pages/Quotation.tsx`, `pages/ExecutiveDecisionCenter.tsx`, `pages/ReportPrint.tsx`, and the test. These pass the result to `window.manar.exportPdf*` as `suggestedName`; the new `.pdf`-suffixed output is handled by the idempotent Electron append (Task 4). If any OTHER caller relies on a bare (no-extension) name, note it and adjust in its migration task.

- [ ] **Step 2: Update the test to the new standard**

Replace the contents of `frontend/src/__tests__/pdfFilename.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import {
  sanitizePdfFilename,
  buildInvoicePdfName,
  buildQuotationPdfName,
} from '../utils/pdfFilename';

describe('sanitizePdfFilename', () => {
  it('returns fallback for empty string', () => {
    expect(sanitizePdfFilename('', 'fallback')).toBe('fallback');
  });
  it('returns fallback for whitespace-only string', () => {
    expect(sanitizePdfFilename('   ', 'fb')).toBe('fb');
  });
  it('removes all Windows-forbidden characters', () => {
    expect(sanitizePdfFilename('a\\b/c:d*e?f"g<h>i|j', 'fb')).toBe('abcdefghij');
  });
  it('preserves a valid ASCII filename', () => {
    expect(sanitizePdfFilename('INV-001-2026-06-22', 'fb')).toBe('INV-001-2026-06-22');
  });
  it('collapses whitespace into a single underscore', () => {
    expect(sanitizePdfFilename('my  file  name', 'fb')).toBe('my_file_name');
  });
});

describe('buildInvoicePdfName', () => {
  it('produces the standard Invoice name', () => {
    expect(buildInvoicePdfName('MN-2026-001')).toMatch(
      /^manarERP_Invoice_INV-MN-2026-001_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
  it('omits the identifier when the invoice number is empty', () => {
    expect(buildInvoicePdfName('')).toMatch(/^manarERP_Invoice_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});

describe('buildQuotationPdfName', () => {
  it('produces the standard Quotation name', () => {
    expect(buildQuotationPdfName('240601')).toMatch(
      /^manarERP_Quotation_QT-240601_\d{4}-\d{2}-\d{2}\.pdf$/,
    );
  });
  it('omits the identifier when the quotation number is empty', () => {
    expect(buildQuotationPdfName('')).toMatch(/^manarERP_Quotation_\d{4}-\d{2}-\d{2}\.pdf$/);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/__tests__/pdfFilename.test.ts`
Expected: FAIL — old implementation still returns `INV-...` without prefix/extension.

- [ ] **Step 4: Rewrite `pdfFilename.ts` to delegate**

Replace the entire contents of `frontend/src/utils/pdfFilename.ts` with:

```ts
import {
  generateExportFileName,
  sanitizeFilenameSegment,
  ReportName,
} from './exportFilename';

/**
 * Backward-compatible wrappers that delegate to the single source of truth,
 * `exportFilename.ts`. All builders now return the full standardized name,
 * including the `.pdf` extension (the Electron export handler appends `.pdf`
 * idempotently, so a name that already ends in `.pdf` is passed through).
 */

/** Sanitize a filename, returning `fallback` when the result is empty. */
export function sanitizePdfFilename(name: string, fallback: string): string {
  return sanitizeFilenameSegment(name) || fallback;
}

export function buildInvoicePdfName(invoiceNumber: string): string {
  return generateExportFileName({
    reportName: ReportName.Invoice,
    identifier: invoiceNumber.trim() ? `INV-${invoiceNumber}` : null,
    extension: 'pdf',
  });
}

export function buildQuotationPdfName(quotationNumber: string): string {
  return generateExportFileName({
    reportName: ReportName.Quotation,
    identifier: quotationNumber.trim() ? `QT-${quotationNumber}` : null,
    extension: 'pdf',
  });
}

/** Generic builder kept for compatibility: `manarERP_<prefix>_<YYYY-MM-DD>.pdf`. */
export function buildFilenameFromDate(prefix: string): string {
  return generateExportFileName({ reportName: prefix, extension: 'pdf' });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/__tests__/pdfFilename.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/utils/pdfFilename.ts frontend/src/__tests__/pdfFilename.test.ts
git commit -m "refactor(export): delegate pdfFilename to shared utility"
```

---

## Task 4: Idempotent `.pdf` append in Electron

**Files:**
- Modify: `electron/ipc/pdf.ipc.ts:10` and `electron/ipc/pdf.ipc.ts:75`

**Interfaces:**
- Consumes: `suggestedName` from the renderer (now may already end in `.pdf`).
- Produces: `defaultPath` that never double-appends `.pdf`.

- [ ] **Step 1: Make the `pdf:exportHtml` append idempotent**

In `electron/ipc/pdf.ipc.ts`, replace line 10:

```ts
    const safeDefault = suggestedName ? `${suggestedName}.pdf` : 'report.pdf';
```

with:

```ts
    const safeDefault = suggestedName
      ? (suggestedName.toLowerCase().endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`)
      : 'report.pdf';
```

- [ ] **Step 2: Make the `pdf:export` append idempotent**

In the same file, replace line 75:

```ts
    const safeDefault = suggestedName ? `${suggestedName}.pdf` : 'document.pdf';
```

with:

```ts
    const safeDefault = suggestedName
      ? (suggestedName.toLowerCase().endsWith('.pdf') ? suggestedName : `${suggestedName}.pdf`)
      : 'document.pdf';
```

- [ ] **Step 3: Type-check Electron**

Run: `tsc -p electron/tsconfig.json --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add electron/ipc/pdf.ipc.ts
git commit -m "fix(electron): idempotent .pdf extension append"
```

---

## Task 5: Migrate remaining Electron-PDF sites

> Invoice (`InvoicePreview.tsx`) and Quotation (`Quotation.tsx`) already call the delegating `buildInvoicePdfName`/`buildQuotationPdfName` and now emit standard names automatically — verify only. The two below build names inline and must migrate.

**Files:**
- Modify: `frontend/src/pages/ExecutiveDecisionCenter.tsx` (~line 175)
- Modify: `frontend/src/pages/ReportPrint.tsx` (~line 62)
- Modify: `frontend/src/pages/Reports.tsx` (~lines 605, 797)

**Interfaces:**
- Consumes: `generateExportFileName`, `ReportName` from `../utils/exportFilename`.

- [ ] **Step 1: ExecutiveDecisionCenter — replace the inline name**

Add the import near the top (with the other util imports):

```ts
import { generateExportFileName, ReportName } from '../utils/exportFilename';
```

Locate the `suggestedName`/filename argument that currently reads `executive-report-${date}` (a `buildFilenameFromDate('executive-report')` or inline literal) and replace the value passed to `window.manar.exportPdf*` with:

```ts
generateExportFileName({ reportName: ReportName.ExecutiveReport, identifier: 'Dashboard', extension: 'pdf' })
```

- [ ] **Step 2: ReportPrint — replace the inline name**

Add the import:

```ts
import { generateExportFileName, ReportName } from '../utils/exportFilename';
```

Replace the current `` `report-${type ?? 'report'}` `` argument with:

```ts
generateExportFileName({ reportName: ReportName.Report, identifier: type ?? null, extension: 'pdf' })
```

- [ ] **Step 3: Reports.tsx — replace the two `exportReportAsPdf` filename args**

Add the import:

```ts
import { generateExportFileName, ReportName } from '../utils/exportFilename';
```

For each `exportReportAsPdf(endpoint, params, filename)` call (lines ~605 and ~797), replace the `filename` argument (currently a `report-<type>` string) with:

```ts
generateExportFileName({ reportName: ReportName.Report, identifier: <reportType>, extension: 'pdf' })
```

where `<reportType>` is the report-type variable already in scope at that call site.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ExecutiveDecisionCenter.tsx frontend/src/pages/ReportPrint.tsx frontend/src/pages/Reports.tsx
git commit -m "feat(export): standardize Electron-PDF report filenames"
```

---

## Task 6: Migrate Financial Center exports

**Files:**
- Modify: `frontend/src/pages/FinancialCenter.tsx` (lines ~181, 190, 505, 572, 663, 781, 865)
- Modify: `frontend/src/components/financial/FinancialReportsTab.tsx` (lines ~38, 48)

**Interfaces:**
- Consumes: `generateExportFileName`, `ReportName` from `../utils/exportFilename` (FinancialCenter) / `../../utils/exportFilename` (FinancialReportsTab).

- [ ] **Step 1: Add the import to FinancialCenter.tsx**

```ts
import { generateExportFileName, ReportName } from '../utils/exportFilename';
```

- [ ] **Step 2: Replace each inline filename literal**

Apply these before → after replacements (the PDF calls go through `exportReportAsPdf`; the Excel calls through the local `saveBlob`):

| Line | Before (literal) | After (value expression) |
|---|---|---|
| ~181 | `` `statement-${entity?.code ?? entityId}` `` | `generateExportFileName({ reportName: ReportName.CustomerStatement, identifier: entity?.code ?? entity?.name ?? entityId, extension: 'pdf' })` |
| ~190 | `` `statement-${entity?.code ?? entityId}.xlsx` `` | `generateExportFileName({ reportName: ReportName.CustomerStatement, identifier: entity?.code ?? entity?.name ?? entityId, extension: 'xlsx' })` |
| ~505 | `` `${agingSubTab}-aging.xlsx` `` | `generateExportFileName({ reportName: agingSubTab === 'ap' ? ReportName.APAging : ReportName.ARAging, extension: 'xlsx' })` |
| ~572 | `` `gl-statement-${glAccountId}.xlsx` `` | `generateExportFileName({ reportName: ReportName.GeneralLedger, identifier: glAccountCode ?? glAccountId, extension: 'xlsx' })` |
| ~663 | `'gl-report.xlsx'` | `generateExportFileName({ reportName: ReportName.GeneralLedgerReport, extension: 'xlsx' })` |
| ~781 | `'trial-balance.xlsx'` | `generateExportFileName({ reportName: ReportName.TrialBalance, extension: 'xlsx' })` |
| ~865 | `'journal-book.xlsx'` | `generateExportFileName({ reportName: ReportName.JournalBook, extension: 'xlsx' })` |

Notes:
- For the customer/supplier statement, if the FinancialCenter distinguishes entity type, use `ReportName.SupplierStatement` when the current tab/entityType is supplier; otherwise `ReportName.CustomerStatement`.
- Line ~572: prefer an account **code** identifier if one is in scope (`glAccountCode` or similar); fall back to `glAccountId` if only the id is available.

- [ ] **Step 3: Migrate FinancialReportsTab.tsx**

Add the import:

```ts
import { generateExportFileName, ReportName } from '../../utils/exportFilename';
```

- Line ~38 (PDF via `exportReportAsPdf`): replace `'financial-summary'` with
  `generateExportFileName({ reportName: ReportName.FinancialSummary, extension: 'pdf' })`.
- Line ~48 (Excel via inline anchor): replace `'financial-summary.xlsx'` with
  `generateExportFileName({ reportName: ReportName.FinancialSummary, extension: 'xlsx' })`.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FinancialCenter.tsx frontend/src/components/financial/FinancialReportsTab.tsx
git commit -m "feat(export): standardize financial center filenames"
```

---

## Task 7: Migrate statements API + bank statement import

**Files:**
- Modify: `frontend/src/api/statements.ts` (lines 67, 78)
- Modify: `frontend/src/api/bankStatementImport.ts` (line ~338)

**Interfaces:**
- Consumes: `generateExportFileName`, `ReportName` from `../utils/exportFilename`.

- [ ] **Step 1: statements.ts — add import**

```ts
import { generateExportFileName, ReportName } from '../utils/exportFilename';
```

- [ ] **Step 2: Replace the two statement filenames**

Line 67 (`exportCustomer`) — replace:

```ts
      `statement-${entityName}-${new Date().toISOString().slice(0, 10)}.xlsx`,
```

with:

```ts
      generateExportFileName({
        reportName: ReportName.CustomerStatement,
        identifier: entityName,
        extension: 'xlsx',
      }),
```

Line 78 (`exportSupplier`) — replace the analogous literal with:

```ts
      generateExportFileName({
        reportName: ReportName.SupplierStatement,
        identifier: entityName,
        extension: 'xlsx',
      }),
```

- [ ] **Step 3: bankStatementImport.ts — standardize the export name**

Add the import:

```ts
import { generateExportFileName, ReportName } from '../utils/exportFilename';
```

At line ~338, replace the `` `bank-statement-${importId}.${ext}` `` filename with:

```ts
generateExportFileName({
  reportName: ReportName.BankStatement,
  identifier: bankName ?? importId,
  extension: format, // 'xlsx' | 'pdf', already without a dot
})
```

If `bankName` is not in scope at that function, use `identifier: importId`.

- [ ] **Step 4: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/statements.ts frontend/src/api/bankStatementImport.ts
git commit -m "feat(export): standardize statement and bank-statement filenames"
```

---

## Task 8: Migrate bank analytics, reconciliation, explorer, expirations

**Files:**
- Modify: `frontend/src/pages/BankSalaryAnalytics.tsx` (lines ~488, 501)
- Modify: `frontend/src/pages/BankReconciliation.tsx` (line ~144)
- Modify: `frontend/src/pages/BankAccountExplorer.tsx` (line ~88)
- Modify: `frontend/src/pages/DocumentExpirationCenter.tsx` (line ~195)

**Interfaces:**
- Consumes: `generateExportFileName`, `ReportName` from `../utils/exportFilename`.

- [ ] **Step 1: BankSalaryAnalytics.tsx**

Add the import, then replace:

- Line ~488 (CSV): `` empId ? `bank-analytics-employee-${empId}.csv` : 'bank-analytics.csv' `` →
  `generateExportFileName({ reportName: ReportName.BankAnalytics, identifier: empId ?? null, extension: 'csv' })`
- Line ~501 (Excel): `` empId ? `bank-analytics-employee-${empId}.xlsx` : 'bank-analytics.xlsx' `` →
  `generateExportFileName({ reportName: ReportName.BankAnalytics, identifier: empId ?? null, extension: 'xlsx' })`

- [ ] **Step 2: BankReconciliation.tsx**

Add the import, then replace line ~144:

```ts
`bank-account-timeline-${bankSlug}-${from}-to-${to}.csv`
```

with:

```ts
generateExportFileName({ reportName: ReportName.BankAccountTimeline, identifier: bankSlug, extension: 'csv' })
```

(The from/to range is dropped from the filename per the standard, which uses a single export date. The report content is unchanged.)

- [ ] **Step 3: BankAccountExplorer.tsx**

Add the import, then replace line ~88:

```ts
`bank-account-${slug}-${today}.csv`
```

with:

```ts
generateExportFileName({ reportName: ReportName.BankAccountLedger, identifier: slug, extension: 'csv' })
```

- [ ] **Step 4: DocumentExpirationCenter.tsx**

Add the import, then replace the hardcoded `'expirations.xlsx'` at line ~195 with:

```ts
generateExportFileName({ reportName: ReportName.DocumentExpirations, extension: 'xlsx' })
```

- [ ] **Step 5: Type-check**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/BankSalaryAnalytics.tsx frontend/src/pages/BankReconciliation.tsx frontend/src/pages/BankAccountExplorer.tsx frontend/src/pages/DocumentExpirationCenter.tsx
git commit -m "feat(export): standardize bank and expirations filenames"
```

---

## Task 9: Full validation, coverage gate, and report

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS (including `exportFilename.test.ts`, `pdfFilename.test.ts`, `date.test.ts`, and all pre-existing tests).

- [ ] **Step 2: Type-check frontend and electron**

Run: `cd frontend && npx tsc --noEmit`
Run: `tsc -p electron/tsconfig.json --noEmit`
Expected: no errors in either.

- [ ] **Step 3: Coverage gate — prove no ad-hoc export names remain**

Use the Grep tool over `frontend/src` for each pattern and confirm every hit is now inside `exportFilename.ts` (definition) or is intentionally out of scope (DB backup, config/layout JSON, AI `.txt`):

- `\.download\s*=` — every programmatic anchor download.
- `toISOString\(\)\.slice\(0, ?10\)` — should have **zero** hits in export/filename code (all routed through `formatFileDate`).
- `\.(pdf|xlsx|csv)['"\`]` — literal extensions in filename strings; confirm none build a user-facing export name outside the utility.
- `saveBlob|downloadBlob|exportReportAsPdf|exportToCsv` — every call passes a `generateExportFileName(...)` result (or a delegating `build*PdfName`).

Record any remaining hit with a one-line justification (in-scope-migrated / out-of-scope).

- [ ] **Step 4: Build validation**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Write the final report**

Produce a short report covering:
- Files modified (list).
- Each export site now using the shared utility (before → after example).
- Confirmation that PDF, Excel, and CSV exports all follow `manarERP_<ReportName>_<Identifier>_<YYYY-MM-DD>.<extension>`.
- Any out-of-scope download sites intentionally left unchanged.

- [ ] **Step 6: (No auto-commit/merge)** Stop and hand back to the user for the Gemini review + merge steps per the project workflow. Do NOT merge or push automatically.

---

## Self-Review

**Spec coverage:**
- Shared utility (single source of truth) → Task 1. ✔
- Official format + prefix + identifier omission → Task 1 tests. ✔
- Sanitization rules (illegal chars, spaces→`_`, collapse, trim, Arabic preserved) → Task 1. ✔
- Date `YYYY-MM-DD`, centralized → Task 2. ✔
- Extension without leading dot (+ defensive strip) → Task 1 (`normalizeExtension`). ✔
- Works with PDF / Excel / CSV / browser download / Electron save dialog → Tasks 4–8. ✔
- `pdfFilename.ts` delegating wrapper → Task 3. ✔
- Backend untouched; Electron idempotent append → Task 4. ✔
- Identifier-per-report-type table → Tasks 5–8 mappings. ✔
- Quality-gate searches (download/saveAs/exportToPDF/Excel/CSV) → Task 9 Step 3. ✔
- Final report deliverable → Task 9 Step 5. ✔

**Placeholder scan:** No `TBD`/`TODO`; every code step shows real code. The `<reportType>` / `entityType` notes in Tasks 5–6 are explicit "use the variable in scope" instructions, not placeholders — the exact literal to replace is given for each.

**Type consistency:** `generateExportFileName`, `sanitizeFilenameSegment`, `ReportName`, `formatFileDate`, and `ExportFileNameParts` are named identically across every task that consumes them. `ReportName` values referenced in Tasks 5–8 all exist in the Task 1 map.

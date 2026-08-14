// ─────────────────────────────────────────────────────────────────────────
//  Shared Bank Export Engine — types.
//
//  Extracted verbatim from `modules/payrollBankExport/types.ts` so that MORE THAN ONE
//  bank statement can be produced from the SAME engine without copy/pasting the bank
//  format. Two consumers exist today, and they are fully independent of each other:
//
//      Shared Bank Export Engine (here)
//              ↑                    ↑
//    Salary Bank Statement   Monthly Entitlements Bank Statement
//      (modules/payrollBankExport)   (modules/entitlementsBankExport)
//
//  A profile-driven, ADDITIVE engine that turns a list of already-approved transfer
//  rows into a bank-ready file. Each bank is an isolated "profile" (columns / formats /
//  sheets / validation), so Gulf Bank / KFH / Boubyan profiles can be added later
//  WITHOUT touching payroll business logic, compensation logic, or accounting.
//
//  The engine produces structured sheet data + validation + totals. The actual binary
//  serialisation (legacy .xls / BIFF8) is performed by the client, which already bundles
//  SheetJS (and, inside Electron, native Excel COM); the backend adds no new dependency.
// ─────────────────────────────────────────────────────────────────────────

/** Registered bank profiles across ALL consumers. Each consumer owns its own registry. */
export type BankExportProfileId = 'nbk_salary_xls' | 'nbk_entitlements_xls';

/** A column in an export sheet. Column ORDER is the array order — must match the bank template. */
export interface ExportColumn {
  /** Exact header text required by the bank template. */
  header: string;
  /** Key into a mapped row object (see ExportSheet.rows). */
  key: string;
  /** Optional cell number format for this column's data cells (e.g. '0' for the template's
   *  integer Civil Id column). Omitted → General format, matching the template. */
  numFmt?: string;
}

/** A logical sheet in the output workbook (e.g. "Salary Details", "Bank Codes"). */
export interface ExportSheet {
  /** Exact sheet name required by the bank template. */
  name: string;
  columns: ExportColumn[];
  /** Row objects keyed by column.key; values are already typed/formatted per the profile
   *  (numbers stay numbers so the .xls cell type matches the template). */
  rows: Array<Record<string, string | number>>;
  /** Column widths (Excel character units, `wch`) copied from the bank template, applied
   *  to the worksheet's `!cols` so the generated file preserves the template layout. */
  widthsWch?: number[];
}

/** One BLOCKING validation problem on a specific export row. */
export interface ExportValidationError {
  serial: number | null;
  employeeCode: string | null;
  employeeName: string | null;
  /** 'name' | 'civilId' | 'account' | 'amount' | 'currency' | 'general' */
  field: string;
  /** Arabic, user-facing. */
  message: string;
}

export interface BankExportSummary {
  employeeCount: number;
  /** Sum of the exported Payment Amounts, rounded to the profile's decimals (KWD 3dp). */
  totalAmount: number;
  currency: string;
}

/** Full engine result for a (profile, month, year). */
export interface BankExportResult {
  profileId: BankExportProfileId;
  profileLabel: string;
  fileExtension: 'xls';
  currency: string;
  amountDecimals: number;
  month: number;
  year: number;
  /** [Salary Details, Bank Codes] in the exact bank order. */
  sheets: ExportSheet[];
  summary: BankExportSummary;
  /** true only when there is at least one row AND zero blocking errors. */
  valid: boolean;
  /** Blocking validation errors (empty when valid). A file must NOT be generated while non-empty. */
  errors: ExportValidationError[];
}

/**
 * One transfer row the bank profile maps from (never mutated).
 *
 * `amount` is deliberately source-agnostic: the salary statement passes the approved
 * payroll net salary, the entitlements statement passes `netAmount − basicSalary` from
 * an approved monthly compensation calculation. The bank file format is identical —
 * only where the number came from differs, and that stays in the caller.
 */
export interface BankTransferSource {
  employeeCode: string;
  fullName: string | null;
  fullNameEn: string | null;
  civilId: string | null;
  bankAccount: string | null;
  amount: number;
}

/** A bank export profile — isolates ALL bank-specific column/format/validation/sheet logic. */
export interface BankExportProfile {
  id: BankExportProfileId;
  /** Arabic UI label. */
  label: string;
  fileExtension: 'xls';
  currency: string;
  amountDecimals: number;
  /** Build the full result (sheets + summary + validation). Pure. */
  build(sources: BankTransferSource[], month: number, year: number): BankExportResult;
}

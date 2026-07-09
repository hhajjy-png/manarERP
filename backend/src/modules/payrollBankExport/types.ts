// ─────────────────────────────────────────────────────────────────────────
//  Bank Payroll Export Engine — types.
//
//  A profile-driven, ADDITIVE, READ-ONLY engine that turns an approved payroll
//  month into a bank-ready salary transfer file. Each bank is an isolated
//  "profile" (columns / formats / sheets / validation), so Gulf Bank / KFH /
//  Boubyan profiles can be added later WITHOUT touching payroll business logic,
//  accounting, or the existing bank-import modules.
//
//  The engine produces structured sheet data + validation + totals. The actual
//  binary serialisation (legacy .xls / BIFF8) is performed by the client, which
//  already bundles SheetJS; the backend adds no new dependency and never mutates
//  payroll, employees, or the ledger.
// ─────────────────────────────────────────────────────────────────────────

export type BankExportProfileId = 'nbk_salary_xls';

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

export interface PayrollBankExportSummary {
  employeeCount: number;
  /** Sum of the exported Payment Amounts, rounded to the profile's decimals (KWD 3dp). */
  totalAmount: number;
  currency: string;
}

/** Full engine result for a (profile, month, year). */
export interface PayrollBankExportResult {
  profileId: BankExportProfileId;
  profileLabel: string;
  fileExtension: 'xls';
  currency: string;
  amountDecimals: number;
  month: number;
  year: number;
  /** [Salary Details, Bank Codes] in the exact bank order. */
  sheets: ExportSheet[];
  summary: PayrollBankExportSummary;
  /** true only when there is at least one row AND zero blocking errors. */
  valid: boolean;
  /** Blocking validation errors (empty when valid). A file must NOT be generated while non-empty. */
  errors: ExportValidationError[];
}

/** Read-only employee+payroll snapshot the profile maps from (never mutated). */
export interface PayrollExportSource {
  employeeCode: string;
  fullName: string | null;
  fullNameEn: string | null;
  civilId: string | null;
  bankAccount: string | null;
  netSalary: number;
}

/** A bank export profile — isolates ALL bank-specific column/format/validation/sheet logic. */
export interface BankExportProfile {
  id: BankExportProfileId;
  /** Arabic UI label. */
  label: string;
  fileExtension: 'xls';
  currency: string;
  amountDecimals: number;
  /** Build the full result (Salary Details + Bank Codes sheets + summary + validation). Pure. */
  build(sources: PayrollExportSource[], month: number, year: number): PayrollBankExportResult;
}

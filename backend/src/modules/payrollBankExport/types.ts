// ─────────────────────────────────────────────────────────────────────────
//  Bank Payroll Export — types.
//
//  The engine itself now lives in `shared/services/bankExport` so the Monthly
//  Entitlements bank statement can produce the SAME bank format from the SAME code
//  instead of a copy. This file keeps the payroll-facing names stable: every existing
//  import of `PayrollBankExportResult` / `PayrollExportSource` / `ExportSheet` … still
//  resolves here, unchanged.
// ─────────────────────────────────────────────────────────────────────────

import type {
  BankExportProfileId,
  BankExportResult,
  BankExportSummary,
} from '../../shared/services/bankExport/types';

export type {
  BankExportProfileId,
  ExportColumn,
  ExportSheet,
  ExportValidationError,
  BankTransferSource,
} from '../../shared/services/bankExport/types';

/** Payroll-facing aliases of the shared engine result types (identical shapes). */
export type PayrollBankExportSummary = BankExportSummary;
export type PayrollBankExportResult = BankExportResult;

/** Read-only employee+payroll snapshot the profile maps from (never mutated). */
export interface PayrollExportSource {
  employeeCode: string;
  fullName: string | null;
  fullNameEn: string | null;
  civilId: string | null;
  bankAccount: string | null;
  netSalary: number;
}

/** A SALARY bank export profile — same engine, payroll-shaped input. */
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

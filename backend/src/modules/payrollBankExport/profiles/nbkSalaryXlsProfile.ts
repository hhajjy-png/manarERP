// ─────────────────────────────────────────────────────────────────────────
//  NBK Salary XLS — the salary bank export profile.
//
//  The NBK file format (sheets, headers, column order, widths, Bank Codes list, numeric
//  cell types, English-name / civil-id / account validation, KWD 3-decimal rounding) lives
//  in the shared engine: `shared/services/bankExport/nbkTransferCore`. It was moved there
//  VERBATIM so the Monthly Entitlements statement produces a byte-identical bank layout
//  from the same code instead of a copy. Nothing about the salary file changed.
//
//  What remains here is the only salary-specific part: mapping the approved payroll row's
//  `netSalary` onto the engine's source-agnostic `amount`.
// ─────────────────────────────────────────────────────────────────────────

import {
  NBK_AMOUNT_DECIMALS,
  NBK_CURRENCY,
  buildNbkTransferResult,
} from '../../../shared/services/bankExport/nbkTransferCore';
import type { BankTransferSource } from '../../../shared/services/bankExport/types';
import type { BankExportProfile, PayrollBankExportResult, PayrollExportSource } from '../types';

// Re-exported: the salary profile's public surface is unchanged for existing importers.
export { deriveBeneficiaryBank } from '../../../shared/services/bankExport/nbkTransferCore';

const LABEL = 'NBK — ملف الرواتب (XLS)';

/** Approved payroll row → engine transfer row. The ONLY salary-specific mapping. */
function toTransferSource(src: PayrollExportSource): BankTransferSource {
  return {
    employeeCode: src.employeeCode,
    fullName: src.fullName,
    fullNameEn: src.fullNameEn,
    civilId: src.civilId,
    bankAccount: src.bankAccount,
    amount: src.netSalary,
  };
}

export const nbkSalaryXlsProfile: BankExportProfile = {
  id: 'nbk_salary_xls',
  label: LABEL,
  fileExtension: 'xls',
  currency: NBK_CURRENCY,
  amountDecimals: NBK_AMOUNT_DECIMALS,

  build(sources: PayrollExportSource[], month: number, year: number): PayrollBankExportResult {
    return buildNbkTransferResult('nbk_salary_xls', LABEL, sources.map(toTransferSource), month, year);
  },
};

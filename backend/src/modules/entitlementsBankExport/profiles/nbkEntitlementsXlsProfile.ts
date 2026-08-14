// ─────────────────────────────────────────────────────────────────────────
//  NBK Monthly Entitlements XLS — the entitlements bank export profile.
//
//  Produces a workbook whose layout is BYTE-IDENTICAL to the salary file: the same
//  shared engine (`shared/services/bankExport/nbkTransferCore`) builds the same two
//  sheets, the same seven columns in the same order, the same "Bank Codes" reference
//  list, the same numeric cell types, the same English-name / civil-id / account
//  validation, and the same KWD 3-decimal rounding. The bank therefore ingests it
//  exactly as it ingests the salary file — no format change was made anywhere.
//
//  The two statements are told apart by the FILE NAME (NBK_Entitlements_YYYY_MM.xls)
//  and by the profile label shown in the UI, never by the workbook layout.
//
//  What is entitlements-specific and lives ONLY here:
//    • the amount is `netAmount − basicSalarySnapshot` — computed by the service from
//      an APPROVED monthly compensation calculation, and passed in already resolved;
//    • the "amount must be > 0" blocker says «مبلغ المستحقات», not «مبلغ الراتب».
// ─────────────────────────────────────────────────────────────────────────

import {
  NBK_AMOUNT_DECIMALS,
  NBK_CURRENCY,
  buildNbkTransferResult,
} from '../../../shared/services/bankExport/nbkTransferCore';
import type { NbkTransferLabels } from '../../../shared/services/bankExport/nbkTransferCore';
import type {
  BankExportProfile,
  BankExportResult,
  BankTransferSource,
} from '../../../shared/services/bankExport/types';

const LABEL = 'NBK — كشف المستحقات الشهرية (XLS)';

/** Entitlements wording for the shared amount blocker. Same rule, correct noun. */
export const ENTITLEMENTS_LABELS: NbkTransferLabels = {
  amountError: (code) => `الموظف ${code}: مبلغ المستحقات للتحويل يجب أن يكون أكبر من صفر`,
};

export const nbkEntitlementsXlsProfile: BankExportProfile = {
  id: 'nbk_entitlements_xls',
  label: LABEL,
  fileExtension: 'xls',
  currency: NBK_CURRENCY,
  amountDecimals: NBK_AMOUNT_DECIMALS,

  build(sources: BankTransferSource[], month: number, year: number): BankExportResult {
    return buildNbkTransferResult('nbk_entitlements_xls', LABEL, sources, month, year, ENTITLEMENTS_LABELS);
  },
};

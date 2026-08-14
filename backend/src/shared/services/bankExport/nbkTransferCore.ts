// ─────────────────────────────────────────────────────────────────────────
//  NBK transfer core — the National Bank of Kuwait monthly transfer file format.
//
//  Extracted VERBATIM from `modules/payrollBankExport/profiles/nbkSalaryXlsProfile.ts`
//  so a second statement (Monthly Entitlements) can produce a byte-identical bank
//  format without copy/pasting it. NOTHING about the format changed in the extraction:
//    • Sheet 1 "Salary Details" — the 7 bank-required columns, exact headers/order.
//    • Sheet 2 "Bank Codes"     — the bank reference list (Bank Code / Bank Name).
//  Currency KWD. Amounts are numeric (the template uses the General format, not a forced
//  3-decimal display — the KWD 3-decimal PRECISION is preserved in the value). Civil Id
//  is numeric with the template's '0' integer format. Western digits.
//
//  The SHEET NAME stays "Salary Details" for BOTH statements on purpose: it is the bank
//  template's own sheet name, and the bank parses the uploaded workbook by it. Renaming
//  it for the entitlements file would change a format the bank already accepts.
//  The two statements are distinguished by their FILE NAME, not by the workbook layout.
//
//  ISOLATION: every NBK-specific detail lives here. Adding another bank = another core.
// ─────────────────────────────────────────────────────────────────────────

import { roundMoney } from '../../utils/money';
import type {
  BankExportProfileId,
  BankExportResult,
  BankTransferSource,
  ExportColumn,
  ExportSheet,
  ExportValidationError,
} from './types';

export const NBK_CURRENCY = 'KWD';
export const NBK_AMOUNT_DECIMALS = 3;

/** مُعاد تصديرها من وحدة النقود القانونية (`shared/utils/money`) — سياسة واحدة، لا تعريف ثانٍ. */
const round3 = (n: number) => roundMoney(Number(n));

// Salary Details columns — EXACT header text, order, and per-column format from the template.
const SALARY_DETAILS_COLUMNS: ExportColumn[] = [
  { header: 'Payment Serial Number',                                                key: 'serial' },
  { header: 'Beneficiary Name',                                                     key: 'name' },
  { header: 'Beneficiary Civil Id',                                                 key: 'civilId', numFmt: '0' },
  { header: 'Account # for NBK A/C & IBAN for other Bank',                           key: 'account' },
  { header: "Beneficiary Bank (Refer next sheet 'Bank Codes' for list of Banks)",   key: 'bank' },
  { header: 'Payment Currency (only KWD)',                                           key: 'currency' },
  { header: 'Payment Amount',                                                        key: 'amount' },
];
// Column widths (wch) copied from the template's Salary Details sheet.
const SALARY_DETAILS_WIDTHS = [14.5, 44.21, 20.07, 35.07, 24.93, 17.79, 16.21];

// Bank Codes reference sheet (Sheet 2) — reproduced EXACTLY from the template (order, codes,
// names, including the trailing space on NBK and the two entries without a "CODE-" prefix).
// This IS the bank's source-of-truth list.
const BANK_CODES: { code: string; name: string }[] = [
  { code: 'NBK', name: 'NBK-National Bank of Kuwait ' },
  { code: 'BNP', name: 'BNP-BNP Paribas' },
  { code: 'BOB', name: 'BOB-Boubyan Bank' },
  { code: 'BUR', name: 'BUR-Burgan Bank of Kuwait' },
  { code: 'CBK', name: 'CBK-Central Bank of Kuwait Central' },
  { code: 'CIT', name: 'CIT-CitiBank Kuwait' },
  { code: 'COB', name: 'COB-Commercial Bank of Kuwait' },
  { code: 'DOH', name: 'DOH-DOHA BANK' },
  { code: 'GBK', name: 'GBK-Gulf Bank' },
  { code: 'HSB', name: 'HSB-HSBC' },
  { code: 'IBK', name: 'IBK-Industrial Bank of Kuwait' },
  { code: 'ABK', name: 'ABK-Al Ahli Bank of Kuwait' },
  { code: 'BBK', name: 'BBK-Bank of Bahrain and Kuwait' },
  { code: 'KFH', name: 'KFH-Kuwait Finance House' },
  { code: 'KIB', name: 'KIB-Kuwait International Bank' },
  { code: 'MSQ', name: 'MSQ-Masqat Bank' },
  { code: 'MSR', name: 'MSR-Mashreq Bank' },
  { code: 'NBA', name: 'NBA-National Bank of Abu Dhabi' },
  { code: 'QNB', name: 'QNB-Qatar National Bank Kuwait' },
  { code: 'RAJ', name: 'RAJ-Al-Rajhi Bank' },
  { code: 'SCB', name: 'SCB-Saving' },
  { code: 'WRB', name: 'WRB-Warba Bank' },
  { code: 'UNB', name: 'Union National Bank - Kuwait' },
  { code: 'ICK', name: 'Industrial and Commercial Bank of China Limited - Kuwait' },
  { code: 'KWD', name: '' },
];
const BANK_CODES_COLUMNS: ExportColumn[] = [
  { header: 'Bank Code', key: 'code' },
  { header: 'Bank Name', key: 'name' },
];
const BANK_CODES_WIDTHS = [35.93, 52.5];

// Kuwaiti IBAN 4-char bank identifier → the template's short Bank Code. A plain account number
// (no IBAN) is an NBK own account (all template sample rows use "NBK"). Unknown IBANs default to
// NBK. Display/reference only — never used for accounting or routing.
const IBAN_TO_BANK_CODE: Record<string, string> = {
  NBOK: 'NBK', GULB: 'GBK', KFHO: 'KFH', BBYN: 'BOB', BURG: 'BUR',
  WRBA: 'WRB', ABKK: 'ABK', KWTI: 'KIB', CBKW: 'COB', COMK: 'COB',
};

/** "Beneficiary Bank" value = a template Bank Code (e.g. "NBK"). */
export function deriveBeneficiaryBank(account: string | null | undefined): string {
  const acc = (account ?? '').replace(/\s+/g, '').toUpperCase();
  if (/^KW\d{2}[A-Z0-9]{4}/.test(acc)) {
    return IBAN_TO_BANK_CODE[acc.substring(4, 8)] ?? 'NBK';
  }
  return 'NBK';
}

/** Numeric when the value is all digits (template stores Civil Id / NBK account as numbers);
 *  otherwise the raw string (IBANs contain letters). */
function numericOrString(value: string): string | number {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : value;
}

/**
 * Beneficiary name for the NBK file — ENGLISH name ONLY. No Arabic fallback, no
 * transliteration, no generated/guessed name: the bank file must never contain an Arabic
 * name under any condition. Empty when the employee has no English name (which BLOCKS the
 * export via validation below). This is the exact value written to the .xls and shown in the
 * preview, so they always match.
 */
export function beneficiaryName(src: BankTransferSource): string {
  return src.fullNameEn?.trim() || '';
}

/** Per-statement wording for the "amount must be > 0" blocker. The RULE is identical for
 *  both statements; only the noun differs, so the operator is told which number is wrong. */
export interface NbkTransferLabels {
  /** Arabic message builder for a non-positive transfer amount. */
  amountError: (employeeCode: string) => string;
}

const DEFAULT_LABELS: NbkTransferLabels = {
  amountError: (code) => `الموظف ${code}: مبلغ الراتب يجب أن يكون أكبر من صفر`,
};

function validateRow(
  src: BankTransferSource,
  serial: number,
  amount: number,
  labels: NbkTransferLabels,
): ExportValidationError[] {
  const errors: ExportValidationError[] = [];
  // employeeName here is only error-list metadata to identify the row; it is never written to the file.
  const base = { serial, employeeCode: src.employeeCode, employeeName: beneficiaryName(src) || src.fullName };

  if (!beneficiaryName(src)) {
    errors.push({ ...base, field: 'name', message: `الموظف ${src.employeeCode}: اسم الموظف الإنجليزي مطلوب للتصدير البنكي NBK` });
  }
  if (!src.civilId?.trim()) {
    errors.push({ ...base, field: 'civilId', message: `الموظف ${src.employeeCode}: الرقم المدني مفقود` });
  }
  if (!src.bankAccount?.trim()) {
    errors.push({ ...base, field: 'account', message: `الموظف ${src.employeeCode}: رقم الحساب / IBAN مفقود` });
  }
  if (!(amount > 0)) {
    errors.push({ ...base, field: 'amount', message: labels.amountError(src.employeeCode) });
  }
  return errors;
}

/**
 * Bank-account validation for a SINGLE row, exposed so a caller can report per-employee
 * eligibility in its own UI **using the exact same rules** the file generator enforces —
 * instead of re-implementing "is this employee bankable?" and drifting from it.
 */
export function validateBankFields(src: BankTransferSource, amount: number, labels: NbkTransferLabels = DEFAULT_LABELS): ExportValidationError[] {
  return validateRow(src, 0, amount, labels);
}

/**
 * Build the full NBK workbook result. Pure — no I/O, no DB, no mutation.
 * `profileId`/`profileLabel` identify the CALLER's statement; the sheets they produce are
 * intentionally identical because the bank accepts exactly one layout.
 */
export function buildNbkTransferResult(
  profileId: BankExportProfileId,
  profileLabel: string,
  sources: BankTransferSource[],
  month: number,
  year: number,
  labels: NbkTransferLabels = DEFAULT_LABELS,
): BankExportResult {
  const errors: ExportValidationError[] = [];
  const detailRows: Array<Record<string, string | number>> = [];
  let total = 0;

  sources.forEach((src, i) => {
    const serial = i + 1;
    const amount = round3(src.amount);
    errors.push(...validateRow(src, serial, amount, labels));

    detailRows.push({
      serial,
      name: beneficiaryName(src),
      civilId: numericOrString((src.civilId ?? '').trim()),
      account: numericOrString((src.bankAccount ?? '').trim()),
      bank: deriveBeneficiaryBank(src.bankAccount),
      currency: NBK_CURRENCY,
      amount, // numeric; template uses the General format (no forced 3-decimal display)
    });
    total += amount;
  });

  total = round3(total);

  const salaryDetails: ExportSheet = {
    name: 'Salary Details',
    columns: SALARY_DETAILS_COLUMNS,
    rows: detailRows,
    widthsWch: SALARY_DETAILS_WIDTHS,
  };
  const bankCodes: ExportSheet = {
    name: 'Bank Codes',
    columns: BANK_CODES_COLUMNS,
    rows: BANK_CODES.map((b) => ({ code: b.code, name: b.name })),
    widthsWch: BANK_CODES_WIDTHS,
  };

  return {
    profileId,
    profileLabel,
    fileExtension: 'xls',
    currency: NBK_CURRENCY,
    amountDecimals: NBK_AMOUNT_DECIMALS,
    month,
    year,
    sheets: [salaryDetails, bankCodes],
    summary: { employeeCount: sources.length, totalAmount: total, currency: NBK_CURRENCY },
    valid: sources.length > 0 && errors.length === 0,
    errors,
  };
}

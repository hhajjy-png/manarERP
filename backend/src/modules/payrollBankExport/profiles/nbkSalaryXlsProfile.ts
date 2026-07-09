// ─────────────────────────────────────────────────────────────────────────
//  NBK Salary XLS — the first bank export profile.
//
//  Reproduces the National Bank of Kuwait monthly salary-transfer template
//  (docs/exelform/Salary_File.xls, verified against the workbook):
//    • Sheet 1 "Salary Details" — the 7 bank-required columns, exact headers/order.
//    • Sheet 2 "Bank Codes"     — the bank reference list (Bank Code / Bank Name).
//  Currency KWD. Amounts are numeric (the template uses the General format, not a forced
//  3-decimal display — the KWD 3-decimal PRECISION is preserved in the value). Civil Id
//  is numeric with the template's '0' integer format. Western digits.
//
//  Only the profile-shaped ROWS are exported — the template's previous-month sample rows
//  are never used (rows come solely from approved payroll preview data).
//
//  ISOLATION: every NBK-specific detail lives here. Adding another bank = another profile.
// ─────────────────────────────────────────────────────────────────────────

import type {
  BankExportProfile,
  ExportColumn,
  ExportSheet,
  ExportValidationError,
  PayrollBankExportResult,
  PayrollExportSource,
} from '../types';

const CURRENCY = 'KWD';
const AMOUNT_DECIMALS = 3;

function round3(n: number): number {
  return Math.round((Number(n) + Number.EPSILON) * 1000) / 1000;
}

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
function beneficiaryName(src: PayrollExportSource): string {
  return src.fullNameEn?.trim() || '';
}

function validateRow(src: PayrollExportSource, serial: number, amount: number): ExportValidationError[] {
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
    errors.push({ ...base, field: 'amount', message: `الموظف ${src.employeeCode}: مبلغ الراتب يجب أن يكون أكبر من صفر` });
  }
  return errors;
}

export const nbkSalaryXlsProfile: BankExportProfile = {
  id: 'nbk_salary_xls',
  label: 'NBK — ملف الرواتب (XLS)',
  fileExtension: 'xls',
  currency: CURRENCY,
  amountDecimals: AMOUNT_DECIMALS,

  build(sources: PayrollExportSource[], month: number, year: number): PayrollBankExportResult {
    const errors: ExportValidationError[] = [];
    const detailRows: Array<Record<string, string | number>> = [];
    let total = 0;

    sources.forEach((src, i) => {
      const serial = i + 1;
      const amount = round3(src.netSalary);
      errors.push(...validateRow(src, serial, amount));

      detailRows.push({
        serial,
        name: beneficiaryName(src),
        civilId: numericOrString((src.civilId ?? '').trim()),
        account: numericOrString((src.bankAccount ?? '').trim()),
        bank: deriveBeneficiaryBank(src.bankAccount),
        currency: CURRENCY,
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
      profileId: 'nbk_salary_xls',
      profileLabel: nbkSalaryXlsProfile.label,
      fileExtension: 'xls',
      currency: CURRENCY,
      amountDecimals: AMOUNT_DECIMALS,
      month,
      year,
      sheets: [salaryDetails, bankCodes],
      summary: { employeeCount: sources.length, totalAmount: total, currency: CURRENCY },
      valid: sources.length > 0 && errors.length === 0,
      errors,
    };
  },
};

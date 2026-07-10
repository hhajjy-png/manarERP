import type { BankTemplate, ParsedBankRow } from './types';
import { parseImportDate } from '../../shared/utils/dateParse';

// ── Column header maps per bank ────────────────────────────────────────────────

export interface BankColumnMap {
  employeeCode: string[];
  civilId: string[];
  iban: string[];
  bankAccount: string[];
  beneficiaryName: string[];
  amount: string[];
  currency: string[];
  transactionId: string[];
  paymentDate: string[];
  paymentStatus: string[];
}

export interface BankTemplateConfig {
  nameAr: string;
  nameEn: string;
  /** Headers that must ALL be present to trigger detection. */
  detectionSignature: string[];
  columns: BankColumnMap;
}

export const BANK_CONFIGS: Record<BankTemplate, BankTemplateConfig> = {
  NBK: {
    nameAr: 'بنك الكويت الوطني',
    nameEn: 'National Bank of Kuwait',
    detectionSignature: ['transaction id', 'beneficiary account number'],
    columns: {
      employeeCode:    [],
      civilId:         ['civil id', 'civil no', 'civil number'],
      iban:            ['iban'],
      bankAccount:     ['beneficiary account number', 'account number'],
      beneficiaryName: ['beneficiary account name', 'beneficiary name'],
      amount:          ['payment amount', 'amount'],
      currency:        ['currency'],
      transactionId:   ['transaction id', 'reference'],
      paymentDate:     ['payment date', 'date'],
      paymentStatus:   ['status', 'transaction status'],
    },
  },

  KFH: {
    nameAr: 'بيت التمويل الكويتي',
    nameEn: 'Kuwait Finance House',
    detectionSignature: ['civil number', 'transaction reference'],
    columns: {
      employeeCode:    [],
      civilId:         ['civil number', 'civil id'],
      iban:            ['iban'],
      bankAccount:     ['account number'],
      beneficiaryName: ['beneficiary name', 'name'],
      amount:          ['amount', 'transfer amount'],
      currency:        ['currency'],
      transactionId:   ['transaction reference', 'ref no', 'reference'],
      paymentDate:     ['value date', 'payment date', 'date'],
      paymentStatus:   ['status'],
    },
  },

  Boubyan: {
    nameAr: 'بنك بوبيان',
    nameEn: 'Boubyan Bank',
    detectionSignature: ['civil id', 'iban'],
    columns: {
      employeeCode:    [],
      civilId:         ['civil id'],
      iban:            ['iban'],
      bankAccount:     ['account number', 'bank account'],
      beneficiaryName: ['beneficiary name', 'name'],
      amount:          ['amount'],
      currency:        ['currency'],
      transactionId:   ['reference no', 'transaction id', 'reference'],
      paymentDate:     ['payment date', 'date'],
      paymentStatus:   ['status'],
    },
  },

  GulfBank: {
    nameAr: 'بنك الخليج',
    nameEn: 'Gulf Bank',
    detectionSignature: ['employee code', 'civil id', 'bank account'],
    columns: {
      employeeCode:    ['employee code', 'emp code', 'emp id'],
      civilId:         ['civil id', 'civil number', 'civil no'],
      iban:            ['iban'],
      bankAccount:     ['bank account', 'account'],
      beneficiaryName: ['employee name', 'name'],
      amount:          ['salary', 'net salary', 'amount'],
      currency:        ['currency'],
      transactionId:   ['reference', 'transaction id', 'ref no'],
      paymentDate:     ['payment date', 'date'],
      paymentStatus:   ['status', 'payment status'],
    },
  },

  Warba: {
    nameAr: 'بنك وربة',
    nameEn: 'Warba Bank',
    detectionSignature: ['reference number', 'civil number'],
    columns: {
      employeeCode:    [],
      civilId:         ['civil number', 'civil id'],
      iban:            ['iban'],
      bankAccount:     ['account number', 'bank account'],
      beneficiaryName: ['beneficiary name', 'name'],
      amount:          ['amount', 'transfer amount'],
      currency:        ['currency'],
      transactionId:   ['reference number', 'ref no'],
      paymentDate:     ['payment date', 'value date'],
      paymentStatus:   ['status', 'payment status'],
    },
  },

  AhliUnited: {
    nameAr: 'بنك الأهلي المتحد',
    nameEn: 'Ahli United Bank',
    detectionSignature: ['employee id', 'national id'],
    columns: {
      employeeCode:    ['employee id', 'emp id'],
      civilId:         ['national id', 'civil id'],
      iban:            ['iban'],
      bankAccount:     ['account', 'bank account'],
      beneficiaryName: ['employee name', 'name'],
      amount:          ['net salary', 'amount'],
      currency:        ['currency'],
      transactionId:   ['reference', 'transaction ref', 'transaction id'],
      paymentDate:     ['payment date', 'date'],
      paymentStatus:   ['status'],
    },
  },

  Unknown: {
    nameAr: 'نموذج غير معروف',
    nameEn: 'Unknown Template',
    detectionSignature: [],
    columns: {
      employeeCode:    ['employee code', 'emp code', 'employee id'],
      civilId:         ['civil id', 'civil number', 'national id'],
      iban:            ['iban'],
      bankAccount:     ['bank account', 'account number', 'account'],
      beneficiaryName: ['beneficiary name', 'name', 'employee name'],
      amount:          ['amount', 'payment amount', 'net salary', 'salary'],
      currency:        ['currency'],
      transactionId:   ['transaction id', 'reference', 'reference number'],
      paymentDate:     ['payment date', 'date', 'value date'],
      paymentStatus:   ['status', 'transaction status', 'payment status'],
    },
  },
};

// ── Template detection ─────────────────────────────────────────────────────────

/**
 * Normalize a raw Excel column header for case/space-tolerant matching.
 * "  Civil ID  " → "civil id"
 */
export function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Detect which bank template the file belongs to by inspecting normalized headers.
 * Returns the first template whose detection signature is fully contained in the header set.
 * Falls back to 'Unknown'.
 */
export function detectTemplate(rawHeaders: string[]): BankTemplate {
  const normalized = new Set(rawHeaders.map(normalizeHeader));

  const ORDER: BankTemplate[] = ['GulfBank', 'AhliUnited', 'KFH', 'Warba', 'Boubyan', 'NBK'];
  for (const bank of ORDER) {
    const sig = BANK_CONFIGS[bank].detectionSignature;
    if (sig.length > 0 && sig.every((h) => normalized.has(h))) return bank;
  }
  return 'Unknown';
}

// ── Row value extraction ───────────────────────────────────────────────────────

/**
 * Extract the first non-empty value from a raw row using the candidate column keys.
 * Keys are normalized (lowercase, trimmed) before lookup.
 */
export function extractValue(
  normalizedRow: Record<string, unknown>,
  candidates: string[],
): string {
  for (const key of candidates) {
    const val = normalizedRow[normalizeHeader(key)];
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return String(val).trim();
    }
  }
  return '';
}

/** Guard against Excel formula injection — reject cells starting with formula chars. */
export function isSafeValue(val: string): boolean {
  if (!val) return true;
  return !['=', '+', '-', '@', '\t', '\r'].includes(val[0]);
}

/** Escape a string value: strip leading/trailing whitespace and reject formulas. */
export function escapeCell(raw: string): string {
  const trimmed = raw.trim();
  if (!isSafeValue(trimmed)) return '';
  return trimmed;
}

// ── Month helpers ──────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

export function parseSheetMonth(name: string): { month: number; year: number } | null {
  const clean = name.trim().toLowerCase();
  // "mar-2025" or "march-2025"
  const m1 = clean.match(/^([a-z]+)[-\s](\d{4})$/);
  if (m1) {
    const month = MONTH_NAMES[m1[1]];
    const year = parseInt(m1[2], 10);
    if (month && year >= 2000 && year <= 2100) return { month, year };
  }
  return null;
}

export function parseMonthColumn(value: unknown): { month: number; year: number } | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const month = value.getMonth() + 1;
    const year = value.getFullYear();
    return year >= 2000 && year <= 2100 ? { month, year } : null;
  }
  if (typeof value !== 'string') return null;
  const clean = value.trim().toLowerCase();
  const m2 = clean.match(/^([a-z]+)-(\d{2})$/);
  if (m2) {
    const month = MONTH_NAMES[m2[1]];
    const year = 2000 + parseInt(m2[2], 10);
    if (month && year <= 2100) return { month, year };
  }
  return null;
}

export function formatSourceMonth(month: number, year: number): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[month - 1]}-${String(year).slice(2)}`;
}

// ── Normalize a raw row into a ParsedBankRow ───────────────────────────────────

/**
 * Normalize a raw XLSX row (from sheet_to_json) into the canonical ParsedBankRow format.
 * The caller provides template, sheetName, and payroll period.
 * All string values are formula-escaped.
 */
export function normalizeRow(
  rawRow: Record<string, unknown>,
  template: BankTemplate,
  sheetName: string,
  payrollMonth: number,
  payrollYear: number,
  rowIndex: number,
): ParsedBankRow {
  const cols = BANK_CONFIGS[template].columns;

  // Build normalized key→value map once
  const nr: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    nr[normalizeHeader(k)] = v;
  }

  const get = (keys: string[]) => escapeCell(extractValue(nr, keys));

  const amountRaw = extractValue(nr, cols.amount);
  const amount = parseFloat(amountRaw.replace(/,/g, '')) || 0;

  const paymentDateRaw = nr[normalizeHeader(cols.paymentDate[0] ?? '')] ?? extractValue(nr, cols.paymentDate);
  // كان `new Date(string)` يقرأ "05/03/2024" بصيغة MM/DD الأمريكية — انظر `dateParse`.
  // عند تعذّر التفسير نُبقي النص الخام كما كان سابقًا ليظهر للمستخدم في المعاينة.
  const parsedPaymentDate = parseImportDate(paymentDateRaw);
  const paymentDate: string | null = parsedPaymentDate
    ? parsedPaymentDate.toISOString()
    : (typeof paymentDateRaw === 'string' && paymentDateRaw.trim() ? paymentDateRaw.trim() : null);

  return {
    employeeCode: get(cols.employeeCode) || null,
    civilId:      get(cols.civilId) || null,
    iban:         get(cols.iban) || null,
    bankAccount:  get(cols.bankAccount) || null,
    beneficiaryName: get(cols.beneficiaryName),
    amount,
    currency:     (get(cols.currency) || 'KWD').toUpperCase(),
    transactionId: get(cols.transactionId) || null,
    paymentDate,
    paymentStatus: get(cols.paymentStatus) || null,
    payrollMonth,
    payrollYear,
    _rowIndex:  rowIndex,
    _sheetName: sheetName,
  };
}

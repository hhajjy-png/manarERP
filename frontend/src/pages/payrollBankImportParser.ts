// Payroll Bank Import — workbook parser (pure, client-side).
//
// Extracted verbatim from PayrollBankImport.tsx so the parsing logic is unit
// testable. Behavior for the two historically-supported layouts is unchanged:
//   • Priority 1 — monthly worksheet names (e.g. "mar-2025")
//   • Priority 2 — an "All_Transactions" sheet with a Month column
// A third layout is added additively (Priority 3, see parseWorkbook):
//   • "File Upload - Transactions Details" — the official monthly report whose
//     header row is NOT guaranteed to be row 1 and whose sheet name is arbitrary
//     (e.g. "Sheet0"). Detected by scanning each sheet's first rows for the
//     header signature; the payroll month/year is derived from each row's
//     Payment Date (the layout has no month column / monthly sheet name).
//
// This module mirrors backend excelParser.ts, which is inert at runtime (the
// server receives already-parsed rows) — same pre-existing note as before.

import * as XLSX from 'xlsx';
import type { BankTemplate, ParsedBankRow } from '../api/payrollBankImport';

// ── Bank template configs (mirrors backend excelParser.ts) ────────────────────

interface BankColumnMap {
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

interface BankTemplateConfig {
  // i18n fallback: Arabic literal, byte-for-byte identical to DICT.ar[nameKey].
  // Consumers should call t(nameKey) rather than reading nameAr directly — see
  // PayrollBankImport.tsx.
  nameKey: string;
  nameAr: string;
  detectionSignature: string[];
  columns: BankColumnMap;
}

export const BANK_CONFIGS: Record<BankTemplate, BankTemplateConfig> = {
  NBK: {
    nameKey: 'bank.payroll_name.nbk',
    nameAr: 'بنك الكويت الوطني (NBK)',
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
    nameKey: 'bank.payroll_name.kfh',
    nameAr: 'بيت التمويل الكويتي (KFH)',
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
    nameKey: 'bank.name.boubyan',
    nameAr: 'بنك بوبيان',
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
    nameKey: 'bank.name.gulf',
    nameAr: 'بنك الخليج',
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
    nameKey: 'bank.name.warba',
    nameAr: 'بنك وربة',
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
    nameKey: 'bank.payroll_name.ahli_united',
    nameAr: 'بنك الأهلي المتحد',
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
    nameKey: 'bank.payroll_name.unknown_format',
    nameAr: 'نموذج غير معروف',
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

// ── Parser helpers ────────────────────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/\s+/g, ' ');
}

function detectTemplate(rawHeaders: string[]): BankTemplate {
  const normalized = new Set(rawHeaders.map(normalizeHeader));
  const ORDER: BankTemplate[] = ['GulfBank', 'AhliUnited', 'KFH', 'Warba', 'Boubyan', 'NBK'];
  for (const bank of ORDER) {
    const sig = BANK_CONFIGS[bank].detectionSignature;
    if (sig.length > 0 && sig.every((h) => normalized.has(h))) return bank;
  }
  return 'Unknown';
}

function isSafeValue(val: string): boolean {
  if (!val) return true;
  return !['=', '+', '-', '@', '\t', '\r'].includes(val[0]);
}

function escapeCell(raw: string): string {
  const t = raw.trim();
  return isSafeValue(t) ? t : '';
}

function extractValue(nr: Record<string, unknown>, candidates: string[]): string {
  for (const key of candidates) {
    const v = nr[normalizeHeader(key)];
    if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};

function parseSheetMonth(name: string): { month: number; year: number } | null {
  const clean = name.trim().toLowerCase();
  const m = clean.match(/^([a-z]+)[-\s](\d{4})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[1]];
  const year  = parseInt(m[2], 10);
  if (month && year >= 2000 && year <= 2100) return { month, year };
  return null;
}

function parseMonthColumn(value: unknown): { month: number; year: number } | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const y = value.getFullYear();
    return y >= 2000 && y <= 2100 ? { month: value.getMonth() + 1, year: y } : null;
  }
  if (typeof value !== 'string') return null;
  const m = value.trim().toLowerCase().match(/^([a-z]+)-(\d{2})$/);
  if (!m) return null;
  const month = MONTH_MAP[m[1]];
  const year  = 2000 + parseInt(m[2], 10);
  return month && year <= 2100 ? { month, year } : null;
}

/**
 * Payment Date for the P1/P2 monthly-sheet layouts.
 *
 * Delegates to {@link parseFlexibleDate} — the SAME column (`payment date` /
 * `date` / `value date`), from the SAME `BANK_CONFIGS` bank templates, differing
 * only in which sheet layout the row came from. Two different readings of one
 * bank column would be incoherent, so there is one parser.
 *
 * It used to be `new Date(String(v))`, which had three live defects:
 *
 *  1. **MM/DD misread.** `'05/03/2024'` was read by V8's non-standard heuristic
 *     as 3 May instead of 5 March. The backend twin (`payrollBankImport/
 *     excelParser.ts`) was already corrected away from this exact pattern,
 *     citing this exact literal; this was the one site the fix missed.
 *  2. **Timezone day shift.** XLSX `cellDates:true` builds date cells with the
 *     LOCAL `Date` constructor, so a bare `toISOString()` rolled a
 *     month-boundary date (the 1st, on the UTC+3 Kuwait deployment) into the
 *     previous month — and the payroll month is derived from this value.
 *  3. **No Excel-serial support.** A General-formatted date cell arrives as a
 *     number and was stringified into the raw-text fallback.
 *
 * The unparseable-text fallback is preserved deliberately: the raw string is
 * kept so it still surfaces in the import preview and raises the validator's
 * existing warning — matching the backend twin's documented behaviour. A
 * non-string that cannot be parsed still yields `null`, exactly as before.
 */
function parseDateValue(v: unknown): string | null {
  if (!v) return null;
  const iso = parseFlexibleDate(v);
  if (iso) return iso;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/**
 * Flexible date parser for the "Transaction Details" layout, which may store the
 * Payment Date as an Excel date-object (cellDates), an Excel serial number, an
 * ISO string, or a day-first `DD/MM/YYYY` / `DD-MM-YYYY` string. Returns an ISO
 * string, or null when the value cannot be interpreted as a real date (so the
 * row falls to a blocking "invalid payroll month/year" validation rather than
 * silently importing with a wrong period).
 */
/**
 * Builds UTC midnight from explicit calendar components, rejecting any date the
 * calendar does not contain. `Date.UTC(2024, 1, 31)` silently rolls over to
 * 2 March — the component round-trip catches that and yields `null` instead, so
 * an impossible cell can never import as a plausible-looking wrong day.
 */
function utcCalendarDate(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (isNaN(dt.getTime())) return null;
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString();
}

export function parseFlexibleDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null;
    // XLSX `cellDates:true` builds date cells with the LOCAL Date constructor, so
    // read the LOCAL calendar fields and re-anchor them to UTC midnight. A plain
    // `toISOString()` would shift by the host offset and roll a month-boundary
    // date (e.g. the 1st on the UTC+3 Kuwait deployment) into the wrong month.
    return new Date(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate())).toISOString();
  }
  if (typeof v === 'number' && isFinite(v)) {
    const parsed = XLSX.SSF?.parse_date_code?.(v);
    if (parsed && parsed.y) {
      return new Date(Date.UTC(parsed.y, (parsed.m || 1) - 1, parsed.d || 1)).toISOString();
    }
    return null;
  }
  const s = String(v).trim();
  if (!s) return null;
  // Canonical ISO `YYYY-MM-DD` — matched explicitly rather than left to the
  // engine, and validated against the real calendar.
  const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoM) return utcCalendarDate(+isoM[1], +isoM[2], +isoM[3]);
  // Day-first DD/MM/YYYY or DD-MM-YYYY (Kuwaiti bank convention — proven for
  // this column by the backend twin `payrollBankImport/excelParser.ts`, which
  // routes it through the day-first `parseImportDate`).
  //
  // Once this ambiguous shape matches we NEVER fall through to `new Date(s)`:
  // doing so would hand `'31/02/2024'` straight to the MM/DD heuristic this
  // branch exists to prevent. An impossible date is `null`, not a guess.
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) return utcCalendarDate(+m[3], +m[2], +m[1]);
  // Remaining shapes are UNAMBIGUOUS by construction — the `d/d/yyyy` form was
  // already consumed above, so what reaches here (e.g. `'29 May 2026'`) names
  // its month explicitly and carries no day/month ordering risk.
  const dd = new Date(s);
  return isNaN(dd.getTime()) ? null : dd.toISOString();
}

/** Payroll month/year derived from a parsed ISO payment date (0/0 when absent). */
export function monthYearFromIso(iso: string | null): { month: number; year: number } {
  if (!iso) return { month: 0, year: 0 };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { month: 0, year: 0 };
  const y = d.getUTCFullYear();
  return y >= 2000 && y <= 2100 ? { month: d.getUTCMonth() + 1, year: y } : { month: 0, year: 0 };
}

/** Re-key a raw row by normalized header so lookups are case/space-insensitive. */
function normalizeRow(raw: Record<string, unknown>): Record<string, unknown> {
  const nr: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) nr[normalizeHeader(k)] = v;
  return nr;
}

function buildParsedRow(
  rawRow: Record<string, unknown>,
  template: BankTemplate,
  sheetName: string,
  payrollMonth: number,
  payrollYear: number,
  rowIndex: number,
): ParsedBankRow {
  const cols = BANK_CONFIGS[template].columns;
  const nr = normalizeRow(rawRow);
  const get = (keys: string[]) => escapeCell(extractValue(nr, keys));
  const amount = parseFloat(extractValue(nr, cols.amount).replace(/,/g, '')) || 0;
  const pdRaw  = nr[normalizeHeader(cols.paymentDate[0] ?? '')] ?? extractValue(nr, cols.paymentDate);

  return {
    employeeCode:  get(cols.employeeCode) || null,
    civilId:       get(cols.civilId) || null,
    iban:          get(cols.iban) || null,
    bankAccount:   get(cols.bankAccount) || null,
    beneficiaryName: get(cols.beneficiaryName),
    amount,
    currency:      (get(cols.currency) || 'KWD').toUpperCase(),
    transactionId: get(cols.transactionId) || null,
    paymentDate:   parseDateValue(pdRaw),
    paymentStatus: get(cols.paymentStatus) || null,
    payrollMonth,
    payrollYear,
    _rowIndex: rowIndex,
    _sheetName: sheetName,
  };
}

export interface ParseResult {
  rows: ParsedBankRow[];
  templateName: BankTemplate;
  skippedSheets: string[];
}

export const MAX_ROWS = 2000;

/** True when a row carries at least one identifier worth importing. */
function hasIdentifier(row: ParsedBankRow): boolean {
  return Boolean(row.transactionId || row.civilId || row.bankAccount || row.employeeCode);
}

/** Extract the header row (first row) from a worksheet as string[]. */
function sheetHeaders(ws: XLSX.WorkSheet): string[] {
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
  return (raw[0] ?? []).map(String);
}

/** Read data rows from a worksheet (workbook already parsed with cellDates:true). */
function sheetRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}

// Minimum header signature that identifies the "File Upload - Transactions
// Details" report, regardless of sheet name or how many metadata rows precede it.
const TXN_DETAILS_REQUIRED = [
  'transaction id',
  'beneficiary account number',
  'payment amount',
  'payment date',
  'status',
];
const TXN_DETAILS_HEADER_SCAN = 15;

/**
 * Scan the first rows of a worksheet grid for the Transaction-Details header row.
 * Returns the 0-based row index (aligned with the sheet, usable as sheet_to_json
 * `range`) or null. `header:1` keeps blank rows so the index stays row-aligned.
 */
function findTxnDetailsHeaderRow(grid: unknown[][]): number | null {
  const scan = Math.min(TXN_DETAILS_HEADER_SCAN, grid.length);
  for (let r = 0; r < scan; r++) {
    const cells = new Set((grid[r] ?? []).map((c) => normalizeHeader(String(c ?? ''))));
    if (TXN_DETAILS_REQUIRED.every((h) => cells.has(h))) return r;
  }
  return null;
}

export function parseWorkbook(wb: XLSX.WorkBook): ParseResult {
  // Priority 1: Monthly-named sheets (e.g. "mar-2025")
  const monthlySheets = wb.SheetNames.filter((n) => parseSheetMonth(n) !== null);

  if (monthlySheets.length > 0) {
    const template = detectTemplate(sheetHeaders(wb.Sheets[monthlySheets[0]]));
    const rows: ParsedBankRow[] = [];

    for (const sheetName of monthlySheets) {
      const { month, year } = parseSheetMonth(sheetName)!;
      const rawRows = sheetRows(wb.Sheets[sheetName]);
      for (let i = 0; i < rawRows.length && rows.length < MAX_ROWS; i++) {
        const row = buildParsedRow(rawRows[i], template, sheetName, month, year, i);
        if (hasIdentifier(row)) rows.push(row);
      }
    }
    return { rows, templateName: template, skippedSheets: wb.SheetNames.filter((n) => !monthlySheets.includes(n)) };
  }

  // Priority 2: All_Transactions sheet with Month column
  const allTxName = wb.SheetNames.find((n) => n.trim().toLowerCase() === 'all_transactions');
  if (allTxName) {
    const ws = wb.Sheets[allTxName];
    const template = detectTemplate(sheetHeaders(ws));
    const allRaw   = sheetRows(ws);
    const rows: ParsedBankRow[] = [];

    for (let i = 0; i < allRaw.length && rows.length < MAX_ROWS; i++) {
      const nr = normalizeRow(allRaw[i]);
      const parsed = parseMonthColumn(nr['month']) ?? { month: 0, year: 0 };
      const row = buildParsedRow(allRaw[i], template, allTxName, parsed.month, parsed.year, i);
      if (hasIdentifier(row)) rows.push(row);
    }
    return { rows, templateName: template, skippedSheets: [] };
  }

  // Priority 3 (additive): "File Upload - Transactions Details" report — see the
  // module header. Scan each sheet for the header signature, then parse relative
  // to the detected header row and derive month/year from each row's Payment Date.
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
    const headerRow = findTxnDetailsHeaderRow(grid);
    if (headerRow === null) continue;

    const template = detectTemplate((grid[headerRow] ?? []).map(String));
    const dataRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: headerRow, defval: '' });
    const rows: ParsedBankRow[] = [];

    for (let i = 0; i < dataRows.length && rows.length < MAX_ROWS; i++) {
      const nr = normalizeRow(dataRows[i]);
      const iso = parseFlexibleDate(nr[normalizeHeader('payment date')] ?? nr[normalizeHeader('date')]);
      const { month, year } = monthYearFromIso(iso);
      const row = buildParsedRow(dataRows[i], template, sheetName, month, year, i);
      // Re-derived here (not inside buildParsedRow) to keep that P1/P2-shared
      // helper untouched; normalises DD/MM/YYYY & Excel serials for this layout.
      if (iso) row.paymentDate = iso;
      if (hasIdentifier(row)) rows.push(row);
    }

    if (rows.length > 0) {
      return { rows, templateName: template, skippedSheets: wb.SheetNames.filter((n) => n !== sheetName) };
    }
  }

  // Fallback: first sheet, attempt detection
  const firstSheetName = wb.SheetNames[0];
  const ws = wb.Sheets[firstSheetName];
  const template = detectTemplate(sheetHeaders(ws));
  const allRaw   = sheetRows(ws);
  const rows: ParsedBankRow[] = [];

  for (let i = 0; i < allRaw.length && rows.length < MAX_ROWS; i++) {
    const row = buildParsedRow(allRaw[i], template, firstSheetName, 0, 0, i);
    if (hasIdentifier(row)) rows.push(row);
  }
  return { rows, templateName: template, skippedSheets: [] };
}

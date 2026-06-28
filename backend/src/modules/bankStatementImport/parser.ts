import type { BankTemplate, BankColumnMap, StatementTransaction } from './types.js';

// ── Per-bank column header configurations ──────────────────────────────────────

export const STATEMENT_CONFIGS: Record<string, BankTemplate> = {
  NBK: {
    bankName: 'NBK',
    displayNameAr: 'بنك الكويت الوطني',
    headerRow: 0,
    dataStartRow: 1,
    columnMap: {
      transactionId:  'Transaction ID',
      statementDate:  'Date',
      postingDate:    'Value Date',
      description:    'Description',
      reference:      'Reference',
      debit:          'Debit',
      credit:         'Credit',
      balance:        'Balance',
      currency:       'Currency',
      chequeNumber:   'Cheque No',
    },
    dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY'],
    currencyDefault: 'KWD',
  },
  KFH: {
    bankName: 'KFH',
    displayNameAr: 'بيت التمويل الكويتي',
    headerRow: 0,
    dataStartRow: 1,
    columnMap: {
      statementDate:  'Transaction Date',
      postingDate:    'Posting Date',
      description:    'Narration',
      reference:      'Reference Number',
      debit:          'Debit Amount',
      credit:         'Credit Amount',
      balance:        'Running Balance',
      chequeNumber:   'Cheque Number',
    },
    dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD'],
    currencyDefault: 'KWD',
  },
  GULF_BANK: {
    bankName: 'GULF_BANK',
    displayNameAr: 'بنك الخليج',
    headerRow: 0,
    dataStartRow: 1,
    columnMap: {
      statementDate:  'Txn Date',
      postingDate:    'Value Date',
      description:    'Transaction Description',
      reference:      'Ref No',
      amount:         'Amount',
      balance:        'Balance',
      currency:       'CCY',
    },
    dateFormats: ['DD-MM-YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
    currencyDefault: 'KWD',
  },
  BOUBYAN: {
    bankName: 'BOUBYAN',
    displayNameAr: 'بنك بوبيان',
    headerRow: 0,
    dataStartRow: 1,
    columnMap: {
      transactionId:  'Seq No',
      statementDate:  'Date',
      description:    'Details',
      reference:      'Reference',
      debit:          'Withdrawal',
      credit:         'Deposit',
      balance:        'Balance',
    },
    dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD'],
    currencyDefault: 'KWD',
  },
  WARBA: {
    bankName: 'WARBA',
    displayNameAr: 'بنك وربة',
    headerRow: 0,
    dataStartRow: 1,
    columnMap: {
      statementDate:  'Transaction Date',
      description:    'Description',
      reference:      'Reference',
      debit:          'Debit',
      credit:         'Credit',
      balance:        'Balance',
    },
    dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD'],
    currencyDefault: 'KWD',
  },
  AHLI_UNITED: {
    bankName: 'AHLI_UNITED',
    displayNameAr: 'البنك الأهلي المتحد',
    headerRow: 0,
    dataStartRow: 1,
    columnMap: {
      transactionId:  'Trans ID',
      statementDate:  'Trans Date',
      postingDate:    'Value Date',
      description:    'Remarks',
      reference:      'Cheque/Ref No',
      debit:          'Debit',
      credit:         'Credit',
      balance:        'Balance',
      currency:       'Currency',
    },
    dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY'],
    currencyDefault: 'KWD',
  },
  UNKNOWN: {
    bankName: 'UNKNOWN',
    displayNameAr: 'بنك غير معروف',
    headerRow: 0,
    dataStartRow: 1,
    columnMap: {
      statementDate:  'Date',
      description:    'Description',
      debit:          'Debit',
      credit:         'Credit',
      balance:        'Balance',
    },
    dateFormats: ['DD/MM/YYYY', 'YYYY-MM-DD', 'DD-MM-YYYY', 'MM/DD/YYYY'],
    currencyDefault: 'KWD',
  },
};

// ── Template detection ─────────────────────────────────────────────────────────

export function detectBankTemplate(headers: string[]): BankTemplate {
  const normalized = headers.map((h) => h.trim().toLowerCase());

  if (normalized.includes('cheque no') || normalized.includes('value date') && normalized.includes('debit')) {
    // NBK has 'Cheque No' and separate Debit/Credit
    const hasNBK = normalized.some((h) => h === 'cheque no');
    if (hasNBK) return STATEMENT_CONFIGS.NBK;
  }
  if (normalized.includes('narration') || normalized.includes('debit amount')) {
    return STATEMENT_CONFIGS.KFH;
  }
  if (normalized.includes('txn date') || normalized.includes('transaction description')) {
    return STATEMENT_CONFIGS.GULF_BANK;
  }
  if (normalized.includes('withdrawal') || normalized.includes('deposit')) {
    return STATEMENT_CONFIGS.BOUBYAN;
  }
  if (normalized.includes('trans id') || normalized.includes('trans date') || normalized.includes('remarks')) {
    return STATEMENT_CONFIGS.AHLI_UNITED;
  }
  if (normalized.includes('wording') || normalized.includes('montant')) {
    // Generic Arabic fallback — Warba sometimes uses Arabic headers
    return STATEMENT_CONFIGS.WARBA;
  }
  return STATEMENT_CONFIGS.UNKNOWN;
}

// ── Date parsing ───────────────────────────────────────────────────────────────

const MONTH_ABBR: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

function parseDateString(raw: unknown): string | null {
  if (raw == null || raw === '') return null;

  // Excel serial date number
  if (typeof raw === 'number') {
    // Excel epoch: Jan 0 1900 = day 0
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(raw));
    return epoch.toISOString().substring(0, 10);
  }

  const s = String(raw).trim();
  if (!s) return null;

  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);

  // DD/MM/YYYY or DD-MM-YYYY
  const dmySlash = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmySlash) {
    const [, d, m, y] = dmySlash;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // MM/DD/YYYY
  const mdySlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdySlash) {
    // Ambiguous — if day > 12 must be MDY
    const [, a, b, y] = mdySlash;
    if (parseInt(a, 10) > 12) {
      // a is day
      return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
    }
    // Treat as DD/MM/YYYY by default (Arab bank convention)
    return `${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }

  // "29 May 2026" — verbose month name (Excel 2003 XML Spreadsheet format)
  const verboseM = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (verboseM) {
    const m = MONTH_ABBR[verboseM[2].slice(0, 3).toLowerCase()];
    if (m) return `${verboseM[3]}-${m}-${verboseM[1].padStart(2, '0')}`;
  }

  return null;
}

// ── Positional fallback for headerless XML Spreadsheet files ───────────────────

// Column layout (0-indexed): date | description | currency | debit | credit | currency | balance
export const POSITIONAL_COL = {
  DATE:    0,
  DESC:    1,
  DEBIT:   3,
  CREDIT:  4,
  BALANCE: 6,
} as const;

// Returns true when the first cell of the sheet parses as a date — meaning row 0
// is a data row, not a header row (headerless Excel 2003 XML Spreadsheet).
export function isLikelyHeaderless(sheetData: unknown[][]): boolean {
  const firstRow = sheetData[0];
  if (!firstRow || firstRow.length < 4) return false;
  return parseDateString(firstRow[POSITIONAL_COL.DATE]) !== null;
}

// ── Preamble-aware transaction header detection ────────────────────────────────

const DATE_KEYWORDS    = ['date', 'transaction date', 'trans date', 'txn date', 'statement date', 'التاريخ'];
const DESC_KEYWORDS    = ['description', 'desc', 'narration', 'details', 'remarks', 'بيان', 'البيان', 'وصف'];
const MONEY_KEYWORDS   = ['debit', 'credit', 'withdrawal', 'deposit', 'amount', 'debit amount', 'credit amount', 'مدين', 'دائن'];
const BALANCE_KEYWORDS = ['balance', 'running balance', 'closing balance', 'رصيد', 'الرصيد'];

function rowHasKeyword(cells: unknown[], keywords: string[]): boolean {
  return cells.some((c) => {
    if (c == null || c === '') return false;
    const norm = String(c).trim().toLowerCase();
    return keywords.some((k) => norm === k || norm.includes(k));
  });
}

// Scans the first maxRows rows and returns the 0-based index of the first row
// that looks like a transaction header (date + description + money + balance
// keywords all present). Returns null if no such row is found within the limit.
export function findTransactionHeaderRow(sheetData: unknown[][], maxRows = 30): number | null {
  const limit = Math.min(maxRows, sheetData.length);
  for (let i = 0; i < limit; i++) {
    const row = sheetData[i];
    if (!row || row.length < 3) continue;
    if (
      rowHasKeyword(row, DATE_KEYWORDS) &&
      rowHasKeyword(row, DESC_KEYWORDS) &&
      rowHasKeyword(row, MONEY_KEYWORDS) &&
      rowHasKeyword(row, BALANCE_KEYWORDS)
    ) {
      return i;
    }
  }
  return null;
}

export function parseExcelRowsPositional(sheetData: unknown[][]): StatementTransaction[] {
  const { DATE, DESC, DEBIT, CREDIT, BALANCE } = POSITIONAL_COL;
  const results: StatementTransaction[] = [];

  for (const row of sheetData) {
    if (!row || row.every((c) => c == null || c === '')) continue;
    if (row.length < BALANCE + 1) continue;

    const dateStr = parseDateString(row[DATE]);
    if (!dateStr) continue; // skip any non-date rows (header remnants, summary rows)

    const description = row[DESC] != null ? String(row[DESC]).trim() : '';
    const debit  = parseAmount(row[DEBIT]);
    const credit = parseAmount(row[CREDIT]);
    const balance = row[BALANCE] != null && row[BALANCE] !== ''
      ? parseSignedAmount(row[BALANCE]) : null;

    if (!description && debit === 0 && credit === 0) continue;

    results.push({
      transactionId: null,
      bankName: 'Headerless XML Statement',
      statementDate: dateStr,
      postingDate: null,
      description,
      reference: null,
      debit,
      credit,
      balance,
      currency: 'KWD',
      accountNumber: null,
      iban: null,
      chequeNumber: null,
      rawRow: {
        date: row[DATE], description: row[DESC],
        debit: row[DEBIT], credit: row[CREDIT], balance: row[BALANCE],
      },
    });
  }
  return results;
}

// ── Amount parsing ─────────────────────────────────────────────────────────────

function parseAmount(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return Math.abs(raw);
  const s = String(raw).replace(/[,\s]/g, '').replace(/[()]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseSignedAmount(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).replace(/[,\s]/g, '');
  const neg = s.startsWith('(') || s.startsWith('-');
  const n = parseFloat(s.replace(/[()]/g, ''));
  return isNaN(n) ? 0 : (neg ? -Math.abs(n) : Math.abs(n));
}

// ── Row extraction ─────────────────────────────────────────────────────────────

function cell(row: Record<string, unknown>, key: string | undefined): unknown {
  if (!key) return undefined;
  return row[key];
}

export function rowToTransaction(
  rawRow: Record<string, unknown>,
  colMap: BankColumnMap,
  bankName: string,
  currencyDefault: string,
): StatementTransaction {
  let debit = 0;
  let credit = 0;

  if (colMap.amount !== undefined) {
    const signed = parseSignedAmount(cell(rawRow, colMap.amount));
    if (signed < 0) debit = Math.abs(signed);
    else credit = signed;
  } else {
    debit  = parseAmount(cell(rawRow, colMap.debit));
    credit = parseAmount(cell(rawRow, colMap.credit));
  }

  const currencyRaw = cell(rawRow, colMap.currency);
  const currency =
    typeof currencyRaw === 'string' && currencyRaw.trim()
      ? currencyRaw.trim().toUpperCase()
      : currencyDefault;

  const descRaw = cell(rawRow, colMap.description);
  const description = typeof descRaw === 'string' ? descRaw.trim() : String(descRaw ?? '').trim();

  const txIdRaw = cell(rawRow, colMap.transactionId);
  const transactionId = txIdRaw != null && String(txIdRaw).trim() ? String(txIdRaw).trim() : null;

  const refRaw = cell(rawRow, colMap.reference);
  const reference = refRaw != null && String(refRaw).trim() ? String(refRaw).trim() : null;

  const cheqRaw = cell(rawRow, colMap.chequeNumber);
  const chequeNumber = cheqRaw != null && String(cheqRaw).trim() ? String(cheqRaw).trim() : null;

  const ibanRaw = cell(rawRow, colMap.iban);
  const iban = ibanRaw != null && String(ibanRaw).trim() ? String(ibanRaw).trim() : null;

  const accRaw = cell(rawRow, colMap.accountNumber);
  const accountNumber = accRaw != null && String(accRaw).trim() ? String(accRaw).trim() : null;

  const balRaw = cell(rawRow, colMap.balance);
  const balance = balRaw != null && balRaw !== '' ? parseSignedAmount(balRaw) : null;

  return {
    transactionId,
    bankName,
    statementDate:  parseDateString(cell(rawRow, colMap.statementDate)),
    postingDate:    parseDateString(cell(rawRow, colMap.postingDate)),
    description,
    reference,
    debit,
    credit,
    balance,
    currency,
    accountNumber,
    iban,
    chequeNumber,
    rawRow,
  };
}

// ── Excel parsing ──────────────────────────────────────────────────────────────

export function parseExcelRows(
  sheetData: unknown[][],
  template: BankTemplate,
): StatementTransaction[] {
  // Headerless detection: if row 0 starts with a date the file has no header row.
  if (isLikelyHeaderless(sheetData)) {
    return parseExcelRowsPositional(sheetData);
  }

  // Preamble detection: actual transaction header may start after metadata rows.
  const foundHeaderRow = findTransactionHeaderRow(sheetData);
  const effectiveHeaderRow = foundHeaderRow !== null ? foundHeaderRow : template.headerRow;
  const effectiveDataStart = effectiveHeaderRow + 1;

  const { columnMap, bankName, currencyDefault } = template;

  const headerRowData = sheetData[effectiveHeaderRow] ?? [];
  const colIndexMap: Record<string, number> = {};
  headerRowData.forEach((h, i) => {
    // First occurrence wins — handles duplicate column names (e.g. Currency…Currency).
    if (typeof h === 'string' && h.trim() && !(h.trim() in colIndexMap)) {
      colIndexMap[h.trim()] = i;
    }
  });

  // Build per-row dict using header names
  const results: StatementTransaction[] = [];
  for (let r = effectiveDataStart; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row || row.every((c) => c == null || c === '')) continue;

    const rowDict: Record<string, unknown> = {};
    Object.entries(colIndexMap).forEach(([header, idx]) => {
      rowDict[header] = row[idx];
    });

    const tx = rowToTransaction(rowDict, columnMap, bankName, currencyDefault);
    // Skip empty rows (no description and no amounts)
    if (!tx.description && tx.debit === 0 && tx.credit === 0) continue;
    results.push(tx);
  }
  return results;
}

// ── CSV parsing ────────────────────────────────────────────────────────────────

export function detectCsvDelimiter(sample: string): string {
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of sample) {
    if (ch in counts) counts[ch as keyof typeof counts]++;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsvRows(
  csvText: string,
  template: BankTemplate,
): StatementTransaction[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const delimiter = detectCsvDelimiter(lines[0]);

  const splitRow = (line: string): string[] =>
    line.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim());

  const headers = splitRow(lines[template.headerRow] ?? lines[0]);
  const colIndexMap: Record<string, number> = {};
  headers.forEach((h, i) => { colIndexMap[h] = i; });

  const results: StatementTransaction[] = [];
  for (let r = template.dataStartRow; r < lines.length; r++) {
    const values = splitRow(lines[r]);
    if (values.every((v) => !v)) continue;

    const rowDict: Record<string, unknown> = {};
    headers.forEach((h, i) => { rowDict[h] = values[i] ?? ''; });

    const tx = rowToTransaction(rowDict, template.columnMap, template.bankName, template.currencyDefault);
    if (!tx.description && tx.debit === 0 && tx.credit === 0) continue;
    results.push(tx);
  }
  return results;
}

// Client-side bank statement parser (mirrors backend parser.ts)
// This runs in the browser — no DB access, no Node.js APIs

import type { StatementTransaction } from '../api/bankStatementImport';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BankColumnMap {
  transactionId?: string;
  statementDate:  string;
  postingDate?:   string;
  description:    string;
  reference?:     string;
  debit?:         string;
  credit?:        string;
  amount?:        string;
  balance?:       string;
  currency?:      string;
  accountNumber?: string;
  iban?:          string;
  chequeNumber?:  string;
}

export interface ClientBankTemplate {
  bankName:        string;
  headerRow:       number;
  dataStartRow:    number;
  columnMap:       BankColumnMap;
  currencyDefault: string;
}

// ── Bank configs ───────────────────────────────────────────────────────────────

export const CLIENT_STATEMENT_CONFIGS: Record<string, ClientBankTemplate> = {
  NBK: {
    bankName: 'NBK', headerRow: 0, dataStartRow: 1, currencyDefault: 'KWD',
    columnMap: {
      transactionId: 'Transaction ID', statementDate: 'Date', postingDate: 'Value Date',
      description: 'Description', reference: 'Reference', debit: 'Debit', credit: 'Credit',
      balance: 'Balance', currency: 'Currency', chequeNumber: 'Cheque No',
    },
  },
  KFH: {
    bankName: 'KFH', headerRow: 0, dataStartRow: 1, currencyDefault: 'KWD',
    columnMap: {
      statementDate: 'Transaction Date', postingDate: 'Posting Date', description: 'Narration',
      reference: 'Reference Number', debit: 'Debit Amount', credit: 'Credit Amount',
      balance: 'Running Balance', chequeNumber: 'Cheque Number',
    },
  },
  GULF_BANK: {
    bankName: 'GULF_BANK', headerRow: 0, dataStartRow: 1, currencyDefault: 'KWD',
    columnMap: {
      statementDate: 'Txn Date', postingDate: 'Value Date', description: 'Transaction Description',
      reference: 'Ref No', amount: 'Amount', balance: 'Balance', currency: 'CCY',
    },
  },
  BOUBYAN: {
    bankName: 'BOUBYAN', headerRow: 0, dataStartRow: 1, currencyDefault: 'KWD',
    columnMap: {
      transactionId: 'Seq No', statementDate: 'Date', description: 'Details',
      reference: 'Reference', debit: 'Withdrawal', credit: 'Deposit', balance: 'Balance',
    },
  },
  WARBA: {
    bankName: 'WARBA', headerRow: 0, dataStartRow: 1, currencyDefault: 'KWD',
    columnMap: {
      statementDate: 'Transaction Date', description: 'Description',
      reference: 'Reference', debit: 'Debit', credit: 'Credit', balance: 'Balance',
    },
  },
  AHLI_UNITED: {
    bankName: 'AHLI_UNITED', headerRow: 0, dataStartRow: 1, currencyDefault: 'KWD',
    columnMap: {
      transactionId: 'Trans ID', statementDate: 'Trans Date', postingDate: 'Value Date',
      description: 'Remarks', reference: 'Cheque/Ref No', debit: 'Debit',
      credit: 'Credit', balance: 'Balance', currency: 'Currency',
    },
  },
  UNKNOWN: {
    bankName: 'UNKNOWN', headerRow: 0, dataStartRow: 1, currencyDefault: 'KWD',
    columnMap: {
      statementDate: 'Date', description: 'Description',
      debit: 'Debit', credit: 'Credit', balance: 'Balance',
    },
  },
};

// ── Template detection ─────────────────────────────────────────────────────────

export function detectBankTemplateClient(headers: string[]): ClientBankTemplate {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  if (normalized.includes('cheque no'))              return CLIENT_STATEMENT_CONFIGS.NBK;
  if (normalized.includes('narration') || normalized.includes('debit amount')) return CLIENT_STATEMENT_CONFIGS.KFH;
  if (normalized.includes('txn date') || normalized.includes('transaction description')) return CLIENT_STATEMENT_CONFIGS.GULF_BANK;
  if (normalized.includes('withdrawal') || normalized.includes('deposit'))    return CLIENT_STATEMENT_CONFIGS.BOUBYAN;
  if (normalized.includes('trans id') || normalized.includes('trans date'))   return CLIENT_STATEMENT_CONFIGS.AHLI_UNITED;
  return CLIENT_STATEMENT_CONFIGS.UNKNOWN;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const MONTH_ABBR: Record<string, string> = {
  jan:'01', feb:'02', mar:'03', apr:'04', may:'05', jun:'06',
  jul:'07', aug:'08', sep:'09', oct:'10', nov:'11', dec:'12',
};

function parseDateStr(raw: unknown): string | null {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number') {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    epoch.setUTCDate(epoch.getUTCDate() + Math.floor(raw));
    return epoch.toISOString().substring(0, 10);
  }
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.substring(0, 10);
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  // "29 May 2026" — verbose month name (Excel 2003 XML Spreadsheet format)
  const verbose = s.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (verbose) {
    const m = MONTH_ABBR[verbose[2].slice(0, 3).toLowerCase()];
    if (m) return `${verbose[3]}-${m}-${verbose[1].padStart(2, '0')}`;
  }
  return null;
}

// ── Positional fallback for headerless XML Spreadsheet files ───────────────────

const POSITIONAL_COL = {
  DATE:    0,
  DESC:    1,
  DEBIT:   3,
  CREDIT:  4,
  BALANCE: 6,
} as const;

export function isLikelyHeaderless(sheetData: unknown[][]): boolean {
  const firstRow = sheetData[0];
  if (!firstRow || firstRow.length < 4) return false;
  return parseDateStr(firstRow[POSITIONAL_COL.DATE]) !== null;
}

export function parseExcelRowsPositionalClient(
  sheetData: unknown[][],
): StatementTransaction[] {
  const { DATE, DESC, DEBIT, CREDIT, BALANCE } = POSITIONAL_COL;
  const results: StatementTransaction[] = [];

  for (const row of sheetData) {
    if (!row || (row as unknown[]).every((c) => c == null || c === '')) continue;
    if ((row as unknown[]).length < BALANCE + 1) continue;

    const dateStr = parseDateStr((row as unknown[])[DATE]);
    if (!dateStr) continue;

    const description = (row as unknown[])[DESC] != null
      ? String((row as unknown[])[DESC]).trim() : '';
    const debit  = parseAmt((row as unknown[])[DEBIT]);
    const credit = parseAmt((row as unknown[])[CREDIT]);
    const balRaw = (row as unknown[])[BALANCE];
    const balance = balRaw != null && balRaw !== '' ? parseSignedAmt(balRaw) : null;

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
        date: (row as unknown[])[DATE], description: (row as unknown[])[DESC],
        debit: (row as unknown[])[DEBIT], credit: (row as unknown[])[CREDIT],
        balance: (row as unknown[])[BALANCE],
      },
    });
  }
  return results;
}

function parseAmt(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return Math.abs(raw);
  const n = parseFloat(String(raw).replace(/[,\s()]/g, ''));
  return isNaN(n) ? 0 : Math.abs(n);
}

function parseSignedAmt(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  if (typeof raw === 'number') return raw;
  const s = String(raw).replace(/[,\s]/g, '');
  const neg = s.startsWith('(') || s.startsWith('-');
  const n   = parseFloat(s.replace(/[()]/g, ''));
  return isNaN(n) ? 0 : (neg ? -Math.abs(n) : Math.abs(n));
}

function cell(row: Record<string, unknown>, key: string | undefined): unknown {
  // Keys in rowDict are always lowercased (see parseExcelRowsClient / parseCsvRowsClient),
  // so lowercase the lookup key to match regardless of how the bank named its columns.
  return key ? row[key.toLowerCase()] : undefined;
}

function rowToTx(
  rawRow: Record<string, unknown>,
  col:    BankColumnMap,
  bank:   string,
  cur:    string,
): StatementTransaction {
  let debit = 0, credit = 0;
  if (col.amount !== undefined) {
    const s = parseSignedAmt(cell(rawRow, col.amount));
    if (s < 0) debit = Math.abs(s); else credit = s;
  } else {
    debit  = parseAmt(cell(rawRow, col.debit));
    credit = parseAmt(cell(rawRow, col.credit));
  }

  const currRaw = cell(rawRow, col.currency);
  const currency = typeof currRaw === 'string' && currRaw.trim() ? currRaw.trim().toUpperCase() : cur;

  const descRaw   = cell(rawRow, col.description);
  const description = typeof descRaw === 'string' ? descRaw.trim() : String(descRaw ?? '').trim();

  const txIdRaw    = cell(rawRow, col.transactionId);
  const transactionId = txIdRaw != null && String(txIdRaw).trim() ? String(txIdRaw).trim() : null;

  const refRaw  = cell(rawRow, col.reference);
  const reference = refRaw != null && String(refRaw).trim() ? String(refRaw).trim() : null;

  const cheqRaw = cell(rawRow, col.chequeNumber);
  const chequeNumber = cheqRaw != null && String(cheqRaw).trim() ? String(cheqRaw).trim() : null;

  const ibanRaw = cell(rawRow, col.iban);
  const iban = ibanRaw != null && String(ibanRaw).trim() ? String(ibanRaw).trim() : null;

  const accRaw = cell(rawRow, col.accountNumber);
  const accountNumber = accRaw != null && String(accRaw).trim() ? String(accRaw).trim() : null;

  const balRaw = cell(rawRow, col.balance);
  const balance = balRaw != null && balRaw !== '' ? parseSignedAmt(balRaw) : null;

  return {
    transactionId, bankName: bank,
    statementDate: parseDateStr(cell(rawRow, col.statementDate)),
    postingDate:   parseDateStr(cell(rawRow, col.postingDate)),
    description, reference, debit, credit, balance,
    currency, accountNumber, iban, chequeNumber, rawRow,
  };
}

// ── Excel rows parsing ─────────────────────────────────────────────────────────

export function parseExcelRowsClient(
  sheetData: unknown[][],
  tpl: ClientBankTemplate,
): StatementTransaction[] {
  // Headerless detection: if row 0 starts with a date the file has no header row.
  if (isLikelyHeaderless(sheetData)) {
    return parseExcelRowsPositionalClient(sheetData);
  }

  const headerRowData = sheetData[tpl.headerRow] ?? [];
  const colIdx: Record<string, number> = {};
  (headerRowData as unknown[]).forEach((h, i) => {
    // Lowercase all keys so cell() lookups are case-insensitive.
    // Bank statement exports vary in capitalisation (e.g. 'DEBIT' vs 'Debit').
    if (typeof h === 'string' && h.trim()) colIdx[h.trim().toLowerCase()] = i;
  });

  const results: StatementTransaction[] = [];
  for (let r = tpl.dataStartRow; r < sheetData.length; r++) {
    const row = sheetData[r];
    if (!row || (row as unknown[]).every((c) => c == null || c === '')) continue;
    const rowDict: Record<string, unknown> = {};
    Object.entries(colIdx).forEach(([h, i]) => { rowDict[h] = (row as unknown[])[i]; });
    const tx = rowToTx(rowDict, tpl.columnMap, tpl.bankName, tpl.currencyDefault);
    if (!tx.description && tx.debit === 0 && tx.credit === 0) continue;
    results.push(tx);
  }
  return results;
}

// ── CSV rows parsing ───────────────────────────────────────────────────────────

export function detectCsvDelimiterClient(sample: string): string {
  const counts: Record<string, number> = { ',': 0, ';': 0, '\t': 0 };
  for (const ch of sample) if (ch in counts) counts[ch]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsvRowsClient(
  csvText: string,
  tpl: ClientBankTemplate,
): StatementTransaction[] {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const delimiter = detectCsvDelimiterClient(lines[0]);
  const split = (l: string) => l.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim());

  const headers = split(lines[tpl.headerRow] ?? lines[0]);
  const results: StatementTransaction[] = [];
  for (let r = tpl.dataStartRow; r < lines.length; r++) {
    const vals = split(lines[r]);
    if (vals.every((v) => !v)) continue;
    const rowDict: Record<string, unknown> = {};
    headers.forEach((h, i) => { rowDict[h.toLowerCase()] = vals[i] ?? ''; });
    const tx = rowToTx(rowDict, tpl.columnMap, tpl.bankName, tpl.currencyDefault);
    if (!tx.description && tx.debit === 0 && tx.credit === 0) continue;
    results.push(tx);
  }
  return results;
}

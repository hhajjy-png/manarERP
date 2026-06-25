import type { StatementTransaction, RowValidation, ValidationRule } from './types.js';

const VALID_CURRENCIES = new Set(['KWD', 'USD', 'EUR', 'GBP', 'SAR', 'AED', 'QAR', 'BHD', 'OMR']);
const MAX_DESCRIPTION_LEN = 500;

// ── Individual rule validators ─────────────────────────────────────────────────

function checkCurrency(tx: StatementTransaction): ValidationRule | null {
  if (!VALID_CURRENCIES.has(tx.currency)) return 'INVALID_CURRENCY';
  return null;
}

function checkDate(tx: StatementTransaction): ValidationRule | null {
  if (!tx.statementDate) return 'INVALID_DATE';
  const d = new Date(tx.statementDate);
  if (isNaN(d.getTime())) return 'INVALID_DATE';
  // Reject dates before 2000 or more than 1 year in the future
  const year = d.getFullYear();
  const now = new Date();
  if (year < 2000 || d > new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())) {
    return 'INVALID_DATE';
  }
  return null;
}

function checkNegativeAmount(tx: StatementTransaction): ValidationRule | null {
  if (tx.debit < 0 || tx.credit < 0) return 'NEGATIVE_AMOUNT';
  return null;
}

function checkZeroAmount(tx: StatementTransaction): ValidationRule | null {
  if (tx.debit === 0 && tx.credit === 0) return 'ZERO_AMOUNT';
  return null;
}

function checkMissingDescription(tx: StatementTransaction): ValidationRule | null {
  if (!tx.description.trim()) return 'MISSING_DESCRIPTION';
  return null;
}

function checkDescriptionLength(tx: StatementTransaction): ValidationRule | null {
  if (tx.description.length > MAX_DESCRIPTION_LEN) return 'DESCRIPTION_TOO_LONG';
  return null;
}

function checkMissingTransactionId(tx: StatementTransaction): ValidationRule | null {
  // Only a warning — not all banks provide IDs
  if (!tx.transactionId) return 'MISSING_TRANSACTION_ID';
  return null;
}

// ── Balance continuity check (across sorted rows) ─────────────────────────────

export function checkBalanceContinuity(rows: StatementTransaction[]): Set<number> {
  const breakIndices = new Set<number>();
  let prev: number | null = null;

  for (let i = 0; i < rows.length; i++) {
    const tx = rows[i];
    if (tx.balance == null) { prev = null; continue; }

    if (prev !== null) {
      // Expected balance: prev - debit + credit (for standard bank view)
      const expected = Math.round((prev - tx.debit + tx.credit) * 1000) / 1000;
      const actual   = Math.round(tx.balance * 1000) / 1000;
      // Allow 0.001 KWD tolerance
      if (Math.abs(expected - actual) > 0.005) {
        breakIndices.add(i);
      }
    }
    prev = tx.balance;
  }
  return breakIndices;
}

// ── Duplicate detection within the file ───────────────────────────────────────

export function detectFileDuplicates(rows: StatementTransaction[]): Set<number> {
  const seen = new Map<string, number>();
  const dups = new Set<number>();

  for (let i = 0; i < rows.length; i++) {
    const tx = rows[i];
    // Key: date + amount (debit or credit) + description (first 60 chars)
    const key = [
      tx.statementDate ?? '',
      String(tx.debit),
      String(tx.credit),
      tx.description.substring(0, 60).toLowerCase(),
      tx.transactionId ?? '',
    ].join('|');

    if (seen.has(key)) {
      dups.add(i);
      const firstIdx = seen.get(key)!;
      dups.add(firstIdx);
    } else {
      seen.set(key, i);
    }
  }
  return dups;
}

// ── Master validate function ───────────────────────────────────────────────────

export function validateRows(rows: StatementTransaction[]): RowValidation[] {
  const balanceBreaks = checkBalanceContinuity(rows);
  const fileDuplicates = detectFileDuplicates(rows);

  return rows.map((tx, i): RowValidation => {
    const errors: ValidationRule[]   = [];
    const warnings: ValidationRule[] = [];

    // Errors (block import)
    const dateErr = checkDate(tx);
    if (dateErr) errors.push(dateErr);

    const currErr = checkCurrency(tx);
    if (currErr) errors.push(currErr);

    const negErr = checkNegativeAmount(tx);
    if (negErr) errors.push(negErr);

    const descErr = checkMissingDescription(tx);
    if (descErr) errors.push(descErr);

    const zeroErr = checkZeroAmount(tx);
    if (zeroErr) errors.push(zeroErr);

    if (balanceBreaks.has(i)) errors.push('BALANCE_BREAK');

    // Warnings (flagged but do not block import)
    const txIdWarn = checkMissingTransactionId(tx);
    if (txIdWarn) warnings.push(txIdWarn);

    const descLenWarn = checkDescriptionLength(tx);
    if (descLenWarn) warnings.push(descLenWarn);

    if (fileDuplicates.has(i)) warnings.push('DUPLICATE_IN_FILE');

    return { rowIndex: i, errors, warnings };
  });
}

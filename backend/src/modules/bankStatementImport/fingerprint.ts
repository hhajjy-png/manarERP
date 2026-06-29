import crypto from 'crypto';
import type { StatementTransaction } from './types.js';

// ── Account Key ────────────────────────────────────────────────────────────────
// Stable identifier for a bank account across multiple imports.
// Priority: IBAN > accountNumber > bankName-only fallback.

export function buildAccountKey(tx: StatementTransaction): string {
  const iban = tx.iban?.trim().toUpperCase().replace(/\s+/g, '');
  if (iban && iban.length > 6) return `IBAN:${iban}`;

  const acct = tx.accountNumber?.trim().replace(/\s+/g, '');
  if (acct && acct.length > 2) return `ACCT:${tx.bankName}:${acct}`;

  // Fallback: bank name only — deduplication still works within same bank
  return `BANK:${tx.bankName}`;
}

// ── Transaction Fingerprint ────────────────────────────────────────────────────
// Deterministic hash for a transaction within an account.
// Returns null if there is not enough data to produce a reliable fingerprint.

export function computeFingerprint(tx: StatementTransaction): string | null {
  const date = tx.statementDate?.substring(0, 10);
  if (!date) return null;

  const debit  = Math.round((tx.debit  ?? 0) * 1000);
  const credit = Math.round((tx.credit ?? 0) * 1000);

  // Prefer transactionId — most stable anchor
  if (tx.transactionId?.trim()) {
    const raw = `txid:${tx.transactionId.trim()}:${date}:${debit}:${credit}`;
    return sha256short(raw);
  }

  // Fall back to date + amounts + reference/description/cheque
  const refPart  = (tx.reference    ?? '').trim().substring(0, 64);
  const descPart = (tx.description  ?? '').trim().replace(/\s+/g, ' ').substring(0, 64);
  const cheqPart = (tx.chequeNumber ?? '').trim();

  const raw = `${date}:${debit}:${credit}:${refPart}:${descPart}:${cheqPart}`;
  return sha256short(raw);
}

function sha256short(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex').substring(0, 32);
}

// ── Fuzzy Description Similarity ───────────────────────────────────────────────
// Used in stage-4 potential-duplicate detection.

export function isSimilarDescription(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase()
     .replace(/[أإآ]/g, 'ا')
     .replace(/ة/g, 'ه')
     .replace(/ى/g, 'ي')
     .replace(/[^؀-ۿ0-9a-z\s]/g, '')
     .replace(/\s+/g, ' ')
     .trim();

  const na = norm(a);
  const nb = norm(b);

  if (!na || !nb) return false;
  if (na === nb)  return true;

  // One string is contained in the other
  const shorter = na.length <= nb.length ? na : nb;
  const longer  = na.length <= nb.length ? nb : na;
  if (shorter.length >= 6 && longer.includes(shorter)) return true;

  // First 8 characters match
  if (na.length >= 8 && nb.length >= 8 && na.substring(0, 8) === nb.substring(0, 8)) return true;

  return false;
}

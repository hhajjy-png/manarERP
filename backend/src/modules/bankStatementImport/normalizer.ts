import type { StatementTransaction } from './types.js';

// ── Arabic normalization ───────────────────────────────────────────────────────

function normalizeArabic(text: string): string {
  return text
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/ً-ٟ/g, '') // strip harakat
    .trim();
}

// ── Build normalized search text from transaction fields ──────────────────────

export function buildNormalizedText(tx: StatementTransaction): string {
  const parts = [
    tx.description,
    tx.reference ?? '',
    tx.transactionId ?? '',
    tx.chequeNumber ?? '',
    tx.accountNumber ?? '',
    tx.iban ?? '',
  ]
    .map((s) => s.trim().toLowerCase())
    .map(normalizeArabic);

  return parts.filter(Boolean).join(' ');
}

// ── Amount normalization ───────────────────────────────────────────────────────

export function roundKwd(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// ── Normalize a raw transaction ────────────────────────────────────────────────

export function normalizeRow(tx: StatementTransaction): StatementTransaction {
  return {
    ...tx,
    description:   tx.description.trim().replace(/\s+/g, ' ').substring(0, 500),
    reference:     tx.reference?.trim().substring(0, 128) ?? null,
    transactionId: tx.transactionId?.trim().substring(0, 128) ?? null,
    chequeNumber:  tx.chequeNumber?.trim().substring(0, 64) ?? null,
    iban:          tx.iban?.trim().toUpperCase().substring(0, 34) ?? null,
    accountNumber: tx.accountNumber?.trim().substring(0, 64) ?? null,
    currency:      tx.currency.trim().toUpperCase().substring(0, 8) || 'KWD',
    debit:         roundKwd(tx.debit),
    credit:        roundKwd(tx.credit),
    balance:       tx.balance != null ? roundKwd(tx.balance) : null,
  };
}

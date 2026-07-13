import type { StatementTransaction } from './types.js';
import { roundMoney } from '../../shared/utils/money.js';

// Some Kuwaiti banks export the currency as 'KD' instead of the ISO code 'KWD'.
// Normalise here so the currency validator sees a recognised code.
const CURRENCY_ALIASES: Record<string, string> = { KD: 'KWD' };

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

/** مُعاد تصديرها من وحدة النقود القانونية — نفس سياسة الترحيل، لا قاعدة خاصة بالبنك. */
export const roundKwd = roundMoney;

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
    currency:      (() => { const c = tx.currency.trim().toUpperCase().substring(0, 8) || 'KWD'; return CURRENCY_ALIASES[c] ?? c; })(),
    debit:         roundKwd(tx.debit),
    credit:        roundKwd(tx.credit),
    balance:       tx.balance != null ? roundKwd(tx.balance) : null,
  };
}

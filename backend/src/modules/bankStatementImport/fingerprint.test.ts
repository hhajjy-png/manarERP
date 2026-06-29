import { describe, it, expect } from 'vitest';
import { buildAccountKey, computeFingerprint, isSimilarDescription } from './fingerprint.js';
import type { StatementTransaction } from './types.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

function tx(overrides: Partial<StatementTransaction> = {}): StatementTransaction {
  return {
    transactionId:  null,
    bankName:       'NBK',
    statementDate:  '2026-01-15',
    postingDate:    null,
    description:    'Payment',
    reference:      null,
    debit:          100,
    credit:         0,
    balance:        null,
    currency:       'KWD',
    accountNumber:  null,
    iban:           null,
    chequeNumber:   null,
    rawRow:         {},
    ...overrides,
  };
}

// ── buildAccountKey ────────────────────────────────────────────────────────────

describe('buildAccountKey', () => {
  it('prefers IBAN over accountNumber', () => {
    const key = buildAccountKey(tx({ iban: 'KW81CBKU0000000000001234560101', accountNumber: '1234' }));
    expect(key).toBe('IBAN:KW81CBKU0000000000001234560101');
  });

  it('normalises IBAN whitespace and casing', () => {
    const key = buildAccountKey(tx({ iban: 'kw81 cbku 0000 0000 0000 1234 5601 01' }));
    expect(key).toBe('IBAN:KW81CBKU0000000000001234560101');
  });

  it('falls back to accountNumber when IBAN is absent', () => {
    const key = buildAccountKey(tx({ iban: null, accountNumber: '123456' }));
    expect(key).toBe('ACCT:NBK:123456');
  });

  it('falls back to bankName when no IBAN and no accountNumber', () => {
    const key = buildAccountKey(tx({ iban: null, accountNumber: null }));
    expect(key).toBe('BANK:NBK');
  });

  it('ignores short IBAN (≤6 chars)', () => {
    const key = buildAccountKey(tx({ iban: 'KW1', accountNumber: '999999' }));
    expect(key).toBe('ACCT:NBK:999999');
  });

  it('ignores short accountNumber (≤2 chars)', () => {
    const key = buildAccountKey(tx({ iban: null, accountNumber: '12' }));
    expect(key).toBe('BANK:NBK');
  });
});

// ── computeFingerprint ─────────────────────────────────────────────────────────

describe('computeFingerprint', () => {
  it('returns null when statementDate is missing', () => {
    expect(computeFingerprint(tx({ statementDate: null }))).toBeNull();
  });

  it('returns a 32-char hex string', () => {
    const fp = computeFingerprint(tx());
    expect(fp).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is deterministic — same input produces same fingerprint', () => {
    const a = computeFingerprint(tx({ description: 'Salary', debit: 500, credit: 0 }));
    const b = computeFingerprint(tx({ description: 'Salary', debit: 500, credit: 0 }));
    expect(a).toBe(b);
  });

  it('differs when amount changes', () => {
    const a = computeFingerprint(tx({ debit: 100 }));
    const b = computeFingerprint(tx({ debit: 101 }));
    expect(a).not.toBe(b);
  });

  it('differs when date changes', () => {
    const a = computeFingerprint(tx({ statementDate: '2026-01-15' }));
    const b = computeFingerprint(tx({ statementDate: '2026-01-16' }));
    expect(a).not.toBe(b);
  });

  it('uses transactionId path when transactionId is present', () => {
    const withId    = computeFingerprint(tx({ transactionId: 'TXN001', description: 'X' }));
    const withoutId = computeFingerprint(tx({ transactionId: null,     description: 'X' }));
    // Both valid fingerprints but derived differently
    expect(withId).toMatch(/^[0-9a-f]{32}$/);
    expect(withoutId).toMatch(/^[0-9a-f]{32}$/);
    expect(withId).not.toBe(withoutId);
  });

  it('transactionId path is stable regardless of description changes', () => {
    const a = computeFingerprint(tx({ transactionId: 'TXN001', description: 'Desc A' }));
    const b = computeFingerprint(tx({ transactionId: 'TXN001', description: 'Desc B' }));
    expect(a).toBe(b);
  });

  it('rounds amounts to 3 decimal millis to avoid float drift', () => {
    const a = computeFingerprint(tx({ debit: 1.001 }));
    const b = computeFingerprint(tx({ debit: 1.0009999 }));
    expect(a).toBe(b);
  });
});

// ── isSimilarDescription ───────────────────────────────────────────────────────

describe('isSimilarDescription', () => {
  it('returns true for identical strings', () => {
    expect(isSimilarDescription('Payment', 'Payment')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(isSimilarDescription('SALARY', 'salary')).toBe(true);
  });

  it('returns true when one string contains the other (≥6 chars)', () => {
    expect(isSimilarDescription('Monthly salary transfer', 'salary transfer')).toBe(true);
  });

  it('returns true for matching first 8 characters', () => {
    expect(isSimilarDescription('TRANSFER12345', 'TRANSFER67890')).toBe(true);
  });

  it('returns false for short, different descriptions', () => {
    expect(isSimilarDescription('A', 'B')).toBe(false);
  });

  it('returns false for empty strings', () => {
    expect(isSimilarDescription('', '')).toBe(false);
  });

  it('normalises Arabic diacritics (أ/إ/آ → ا)', () => {
    expect(isSimilarDescription('إيداع راتب', 'ايداع راتب')).toBe(true);
  });

  it('normalises ة → ه', () => {
    expect(isSimilarDescription('تحويلة', 'تحويله')).toBe(true);
  });

  it('returns false for unrelated strings', () => {
    expect(isSimilarDescription('Water bill payment', 'Electricity refund')).toBe(false);
  });
});

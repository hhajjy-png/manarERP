import { describe, it, expect } from 'vitest';
import { validateKuwaitIban, ibanMod97, normalizeIban } from '../ibanValidator';

// Canonical valid Kuwait IBAN (ISO example): KW + 81 + CBKU + 22-digit account.
const VALID_KW = 'KW81CBKU0000000000001234560101';

describe('normalizeIban', () => {
  it('strips spaces and upper-cases', () => {
    expect(normalizeIban('kw81 cbku 0000 0000 0000 1234 5601 01')).toBe(VALID_KW);
  });
});

describe('ibanMod97', () => {
  it('returns 1 for a valid IBAN', () => {
    expect(ibanMod97(VALID_KW)).toBe(1);
  });
  it('returns non-1 for a corrupted IBAN', () => {
    expect(ibanMod97('KW82CBKU0000000000001234560101')).not.toBe(1);
  });
});

describe('validateKuwaitIban', () => {
  it('accepts a valid Kuwait IBAN and extracts the bank code', () => {
    const r = validateKuwaitIban(VALID_KW);
    expect(r.valid).toBe(true);
    expect(r.reasons).toHaveLength(0);
    expect(r.countryCode).toBe('KW');
    expect(r.bankCode).toBe('CBKU');
  });

  it('accepts spaced input', () => {
    expect(validateKuwaitIban('KW81 CBKU 0000 0000 0000 1234 5601 01').valid).toBe(true);
  });

  it('rejects a bad checksum', () => {
    const r = validateKuwaitIban('KW82CBKU0000000000001234560101');
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('CHECKSUM');
  });

  it('rejects a non-Kuwait country code', () => {
    // A structurally valid GB IBAN is not accepted for Kuwait payroll.
    const r = validateKuwaitIban('GB82WEST12345698765432');
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('COUNTRY');
  });

  it('rejects a wrong length', () => {
    const r = validateKuwaitIban('KW81CBKU00001234');
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('LENGTH');
  });

  it('rejects malformed format', () => {
    const r = validateKuwaitIban('12KWCBKU0000000000001234560101');
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('FORMAT');
  });

  it('flags empty input', () => {
    const r = validateKuwaitIban('');
    expect(r.valid).toBe(false);
    expect(r.reasons).toContain('EMPTY');
  });
});

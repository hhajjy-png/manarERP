import { describe, it, expect } from 'vitest';
import { tafqeetKWD } from '../tafqeet';

describe('tafqeetKWD — edge cases', () => {
  it('returns the zero string for 0 KWD', () => {
    expect(tafqeetKWD(0)).toBe('فقط صفر لا غير');
  });

  it('returns empty string for negative amounts', () => {
    expect(tafqeetKWD(-1)).toBe('');
  });

  it('returns empty string for NaN', () => {
    expect(tafqeetKWD(NaN)).toBe('');
  });

  it('returns empty string for Infinity', () => {
    expect(tafqeetKWD(Infinity)).toBe('');
  });
});

describe('tafqeetKWD — dinar-only amounts', () => {
  it('returns singular masculine for 1 KWD', () => {
    expect(tafqeetKWD(1)).toBe('فقط دينار كويتي واحد لا غير');
  });

  it('returns dual form for 2 KWD', () => {
    expect(tafqeetKWD(2)).toBe('فقط ديناران كويتيان لا غير');
  });
});

describe('tafqeetKWD — fils amounts', () => {
  it('returns 1 fils correctly', () => {
    expect(tafqeetKWD(0.001)).toBe('فقط فلس واحد لا غير');
  });

  it('formats 10.500 KWD correctly', () => {
    const result = tafqeetKWD(10.5);
    expect(result).toContain('عشرة دنانير كويتية');
    expect(result).toContain('خمسمائة فلس');
  });
});

describe('tafqeetKWD — canonical rounding (matches numeral display at boundary values)', () => {
  it('rounds 1.0005 up to 1 dinar 1 fils (Number.EPSILON-corrected)', () => {
    const result = tafqeetKWD(1.0005);
    expect(result).toContain('دينار كويتي واحد');
    expect(result).toContain('فلس واحد');
  });

  it('rounds 0.9995 to exactly 1 dinar with no fils', () => {
    const result = tafqeetKWD(0.9995);
    expect(result).toBe('فقط دينار كويتي واحد لا غير');
  });
});

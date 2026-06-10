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

  it('returns empty string for -Infinity', () => {
    expect(tafqeetKWD(-Infinity)).toBe('');
  });

  it('never returns a string containing "NaN"', () => {
    const problematic = [0, 0.001, 0.5, 1, 1.5, 100, 1000, 99999.999];
    for (const n of problematic) {
      expect(tafqeetKWD(n)).not.toContain('NaN');
    }
  });
});

describe('tafqeetKWD — dinar-only amounts', () => {
  it('returns singular masculine for 1 KWD', () => {
    expect(tafqeetKWD(1)).toBe('فقط دينار كويتي واحد لا غير');
  });

  it('returns dual form for 2 KWD', () => {
    expect(tafqeetKWD(2)).toBe('فقط ديناران كويتيان لا غير');
  });

  it('returns plural form for 3 KWD', () => {
    expect(tafqeetKWD(3)).toBe('فقط ثلاثة دنانير كويتية لا غير');
  });

  it('returns plural form for 10 KWD', () => {
    expect(tafqeetKWD(10)).toBe('فقط عشرة دنانير كويتية لا غير');
  });

  it('returns tamyeez (ديناراً) for 11–99 KWD', () => {
    const result = tafqeetKWD(25);
    expect(result).toContain('ديناراً كويتياً');
  });

  it('returns singular (دينار) for 100 KWD (round hundred)', () => {
    const result = tafqeetKWD(100);
    expect(result).toContain('دينار كويتي');
    expect(result).not.toContain('ديناراً');
  });

  it('returns correct result for 1000 KWD', () => {
    expect(tafqeetKWD(1000)).toBe('فقط ألف دينار كويتي لا غير');
  });

  it('returns correct result for 100,000 KWD', () => {
    expect(tafqeetKWD(100000)).toBe('فقط مائة ألف دينار كويتي لا غير');
  });
});

describe('tafqeetKWD — fils-only amounts', () => {
  it('returns 1 fils correctly', () => {
    expect(tafqeetKWD(0.001)).toBe('فقط فلس واحد لا غير');
  });

  it('returns 2 fils as dual', () => {
    expect(tafqeetKWD(0.002)).toBe('فقط فلسان لا غير');
  });

  it('returns plural form for 3–10 fils', () => {
    const result = tafqeetKWD(0.005);
    expect(result).toContain('فلوس');
  });

  it('returns tamyeez (فلساً) for 11–99 fils', () => {
    const result = tafqeetKWD(0.050);
    expect(result).toContain('فلساً');
  });

  it('returns plain (فلس) for 100 fils (round hundred)', () => {
    const result = tafqeetKWD(0.100);
    expect(result).toContain('فلس');
    expect(result).not.toContain('فلساً');
  });
});

describe('tafqeetKWD — mixed dinar and fils', () => {
  it('includes both dinar and fils parts joined by و', () => {
    // 1.005 = 1 dinar + 5 fils → 'فلوس' (plural 3–10)
    const result = tafqeetKWD(1.005);
    expect(result).toContain('دينار');
    expect(result).toContain('فلوس');
    expect(result).toContain(' و');
  });

  it('formats 10.500 KWD correctly', () => {
    const result = tafqeetKWD(10.5);
    expect(result).toContain('عشرة دنانير كويتية');
    expect(result).toContain('خمسمائة فلس');
  });

  it('formats 125.750 KWD correctly', () => {
    const result = tafqeetKWD(125.75);
    expect(result).toContain('ديناراً كويتياً');
    expect(result).toContain('فلساً');
  });

  it('wraps result with فقط and لا غير', () => {
    const result = tafqeetKWD(5.250);
    expect(result.startsWith('فقط ')).toBe(true);
    expect(result.endsWith(' لا غير')).toBe(true);
  });
});

describe('tafqeetKWD — rounding behaviour', () => {
  it('rounds to the nearest fils (0.001 KWD)', () => {
    // 1.0005 should round to 1.001 → 1 dinar 1 fils
    const result = tafqeetKWD(1.0005);
    expect(result).toContain('دينار');
    expect(result).toContain('فلس');
    expect(result).not.toContain('NaN');
  });

  it('handles 0.9995 rounding to 1 dinar 0 fils correctly', () => {
    // 0.9995 rounds to 1.000 → 1 dinar, no fils
    const result = tafqeetKWD(0.9995);
    expect(result).toContain('دينار كويتي واحد');
    expect(result).not.toContain('فلس');
  });
});

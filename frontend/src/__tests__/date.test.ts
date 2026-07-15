import { describe, it, expect } from 'vitest';
import { ARABIC_MONTHS, WEEKDAY_SHORT_AR } from '../lib/date';

describe('ARABIC_MONTHS (exported for the Calendar picker)', () => {
  it('has 12 entries, January first', () => {
    expect(ARABIC_MONTHS).toHaveLength(12);
    expect(ARABIC_MONTHS[0]).toBe('يناير');
    expect(ARABIC_MONTHS[11]).toBe('ديسمبر');
  });
});

describe('WEEKDAY_SHORT_AR', () => {
  it('has 7 entries indexed like Date.getDay() (0 = Sunday)', () => {
    expect(WEEKDAY_SHORT_AR).toHaveLength(7);
    expect(WEEKDAY_SHORT_AR[0]).toBe('أح');
    expect(WEEKDAY_SHORT_AR[6]).toBe('سب');
  });

  it('every entry is genuinely short (<=2 chars) — a full weekday name in a flex header row overflows the Calendar popup', () => {
    for (const w of WEEKDAY_SHORT_AR) expect(w.length).toBeLessThanOrEqual(2);
  });

  it('every entry is distinct (no two weekdays collide once abbreviated)', () => {
    expect(new Set(WEEKDAY_SHORT_AR).size).toBe(WEEKDAY_SHORT_AR.length);
  });
});

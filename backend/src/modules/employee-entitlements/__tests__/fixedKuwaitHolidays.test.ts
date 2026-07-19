import { describe, it, expect } from 'vitest';
import { FIXED_KUWAIT_HOLIDAYS, generateFixedHolidaysForYear } from '../holidays/fixedKuwaitHolidays';

describe('generateFixedHolidaysForYear', () => {
  it('generates exactly the 3 fixed Kuwait holidays (1 Jan, 25 Feb, 26 Feb) for a given year', () => {
    const candidates = generateFixedHolidaysForYear(2027);
    expect(candidates).toHaveLength(3);

    const [jan1, feb25, feb26] = candidates;
    expect(jan1.date.toISOString().slice(0, 10)).toBe('2027-01-01');
    expect(feb25.date.toISOString().slice(0, 10)).toBe('2027-02-25');
    expect(feb26.date.toISOString().slice(0, 10)).toBe('2027-02-26');
  });

  it('tags every fixed holiday as FIXED_GREGORIAN / OFFICIAL', () => {
    for (const c of generateFixedHolidaysForYear(2030)) {
      expect(c.origin).toBe('FIXED_GREGORIAN');
      expect(c.status).toBe('OFFICIAL');
    }
  });

  it('produces different calendar years for different input years, same month/day', () => {
    const y2025 = generateFixedHolidaysForYear(2025);
    const y2026 = generateFixedHolidaysForYear(2026);
    expect(y2025[0].date.getUTCFullYear()).toBe(2025);
    expect(y2026[0].date.getUTCFullYear()).toBe(2026);
    expect(y2025[0].date.getUTCMonth()).toBe(y2026[0].date.getUTCMonth());
    expect(y2025[0].date.getUTCDate()).toBe(y2026[0].date.getUTCDate());
  });

  it('FIXED_KUWAIT_HOLIDAYS constant has exactly 3 definitions', () => {
    expect(FIXED_KUWAIT_HOLIDAYS).toHaveLength(3);
  });
});

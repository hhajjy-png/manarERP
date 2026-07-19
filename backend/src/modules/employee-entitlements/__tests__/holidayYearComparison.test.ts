import { describe, it, expect } from 'vitest';
import { compareHolidayYear } from '../holidays/holidayYearComparison';
import type { HolidayCandidate } from '../holidays/holidayCandidate';

function candidate(dateIso: string, name: string): HolidayCandidate {
  return { date: new Date(dateIso), name, origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' };
}

describe('compareHolidayYear', () => {
  it('classifies a candidate with no existing match as NEW', () => {
    const result = compareHolidayYear([candidate('2027-01-01T00:00:00Z', 'رأس السنة')], []);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].category).toBe('NEW');
    expect(result.summary.NEW).toBe(1);
  });

  it('classifies a candidate matching an existing row exactly (same date + name) as EXISTING', () => {
    const result = compareHolidayYear(
      [candidate('2027-01-01T00:00:00Z', 'رأس السنة')],
      [{ date: new Date('2027-01-01T00:00:00Z'), name: 'رأس السنة' }],
    );
    expect(result.entries[0].category).toBe('EXISTING');
    expect(result.summary.EXISTING).toBe(1);
  });

  it('classifies a candidate whose date exists with a DIFFERENT name as CHANGED (informational only)', () => {
    const result = compareHolidayYear(
      [candidate('2027-01-01T00:00:00Z', 'رأس السنة الميلادية')],
      [{ date: new Date('2027-01-01T00:00:00Z'), name: 'عطلة مُدخلة يدويًا' }],
    );
    expect(result.entries[0].category).toBe('CHANGED');
    expect(result.entries[0].existingName).toBe('عطلة مُدخلة يدويًا');
    expect(result.entries[0].reason).toContain('عطلة مُدخلة يدويًا');
  });

  it('classifies a second candidate on the same day with the same name as SKIPPED (in-plan duplicate)', () => {
    const result = compareHolidayYear(
      [candidate('2027-01-01T00:00:00Z', 'رأس السنة'), candidate('2027-01-01T00:00:00Z', 'رأس السنة')],
      [],
    );
    const categories = result.entries.map((e) => e.category).sort();
    expect(categories).toEqual(['NEW', 'SKIPPED']);
    expect(result.summary.SKIPPED).toBe(1);
  });

  it('classifies two candidates on the same day with DIFFERENT names as CONFLICT for both (generated overlap)', () => {
    const result = compareHolidayYear(
      [candidate('2027-04-10T00:00:00Z', 'عيد الفطر (تقدير 1)'), candidate('2027-04-10T00:00:00Z', 'عيد الفطر (تقدير 2)')],
      [],
    );
    expect(result.entries).toHaveLength(2);
    expect(result.entries.every((e) => e.category === 'CONFLICT')).toBe(true);
    expect(result.summary.CONFLICT).toBe(2);
  });

  it('does not create a CONFLICT/CHANGED entry from unrelated existing holidays on other days', () => {
    const result = compareHolidayYear(
      [candidate('2027-01-01T00:00:00Z', 'رأس السنة')],
      [{ date: new Date('2027-06-15T00:00:00Z'), name: 'عطلة أخرى' }],
    );
    expect(result.entries[0].category).toBe('NEW');
  });

  it('sorts entries chronologically', () => {
    const result = compareHolidayYear(
      [candidate('2027-12-25T00:00:00Z', 'ب'), candidate('2027-01-01T00:00:00Z', 'أ')],
      [],
    );
    expect(result.entries[0].date.getUTCMonth()).toBe(0);
    expect(result.entries[1].date.getUTCMonth()).toBe(11);
  });

  it('returns a zeroed summary for an empty candidate list', () => {
    const result = compareHolidayYear([], []);
    expect(result.entries).toEqual([]);
    expect(result.summary).toEqual({ NEW: 0, EXISTING: 0, CHANGED: 0, SKIPPED: 0, CONFLICT: 0 });
  });
});

import { describe, it, expect } from 'vitest';
import { HolidayConflictService } from '../services/HolidayConflictService';
import { compareHolidayYear } from '../holidays/holidayYearComparison';
import type { HolidayCandidate } from '../holidays/holidayCandidate';

function candidate(dateIso: string, name: string): HolidayCandidate {
  return { date: new Date(dateIso), name, origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' };
}

describe('HolidayConflictService', () => {
  const service = new HolidayConflictService();

  it('extracts CHANGED and CONFLICT entries only — never NEW/EXISTING/SKIPPED', () => {
    const comparison = compareHolidayYear(
      [
        candidate('2027-01-01T00:00:00Z', 'رأس السنة'), // NEW
        candidate('2027-02-25T00:00:00Z', 'اسم مختلف'), // CHANGED (vs existing below)
      ],
      [{ date: new Date('2027-02-25T00:00:00Z'), name: 'العيد الوطني' }],
    );
    const conflicts = service.extractConflicts(comparison);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].category).toBe('CHANGED');
  });

  it('hasBlockingConflicts is false when the plan is entirely NEW/EXISTING/SKIPPED', () => {
    const comparison = compareHolidayYear([candidate('2027-01-01T00:00:00Z', 'رأس السنة')], []);
    expect(service.hasBlockingConflicts(comparison)).toBe(false);
  });

  it('hasBlockingConflicts is true when a CONFLICT entry exists', () => {
    const comparison = compareHolidayYear(
      [candidate('2027-04-10T00:00:00Z', 'أ'), candidate('2027-04-10T00:00:00Z', 'ب')],
      [],
    );
    expect(service.hasBlockingConflicts(comparison)).toBe(true);
  });
});

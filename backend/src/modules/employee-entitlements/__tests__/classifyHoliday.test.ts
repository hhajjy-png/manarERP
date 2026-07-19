import { describe, it, expect } from 'vitest';
import { classifyHoliday } from '../holidays/classifyHoliday';

describe('classifyHoliday', () => {
  it('classifies 1 January as FIXED_GREGORIAN / OFFICIAL regardless of year', () => {
    expect(classifyHoliday(new Date('2020-01-01T00:00:00Z'))).toEqual({ origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' });
    expect(classifyHoliday(new Date('2031-01-01T00:00:00Z'))).toEqual({ origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' });
  });

  it('classifies 25/26 February as FIXED_GREGORIAN / OFFICIAL', () => {
    expect(classifyHoliday(new Date('2026-02-25T00:00:00Z')).origin).toBe('FIXED_GREGORIAN');
    expect(classifyHoliday(new Date('2026-02-26T00:00:00Z')).origin).toBe('FIXED_GREGORIAN');
  });

  it('classifies any other date as HIJRI / MANUALLY_ADJUSTED (no auto-generation source exists yet)', () => {
    expect(classifyHoliday(new Date('2026-04-20T00:00:00Z'))).toEqual({ origin: 'HIJRI', status: 'MANUALLY_ADJUSTED' });
  });
});

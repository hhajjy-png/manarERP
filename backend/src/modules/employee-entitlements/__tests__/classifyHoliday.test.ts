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

  it('classifies any other date with no notes tag as HIJRI / MANUALLY_ADJUSTED (manual entry heuristic)', () => {
    expect(classifyHoliday(new Date('2026-04-20T00:00:00Z'))).toEqual({ origin: 'HIJRI', status: 'MANUALLY_ADJUSTED' });
    expect(classifyHoliday(new Date('2026-04-20T00:00:00Z'), null)).toEqual({ origin: 'HIJRI', status: 'MANUALLY_ADJUSTED' });
  });

  describe('notes tag parsing (Al-Ojairi Integration Pack v1, Part 3)', () => {
    it('prefers an explicit [HIJRI:EXPECTED_ALOJAIRI] tag over the date heuristic — status survives read-back', () => {
      expect(classifyHoliday(new Date('2026-04-20T00:00:00Z'), '[HIJRI:EXPECTED_ALOJAIRI]')).toEqual({
        origin: 'HIJRI',
        status: 'EXPECTED_ALOJAIRI',
      });
    });

    it('parses a [FIXED_GREGORIAN:OFFICIAL] tag too, even on a non-matching date', () => {
      expect(classifyHoliday(new Date('2026-04-20T00:00:00Z'), '[FIXED_GREGORIAN:OFFICIAL]')).toEqual({
        origin: 'FIXED_GREGORIAN',
        status: 'OFFICIAL',
      });
    });

    it('falls back to the date heuristic when notes do not start with a recognizable tag', () => {
      expect(classifyHoliday(new Date('2026-04-20T00:00:00Z'), 'ملاحظة يدوية عادية')).toEqual({
        origin: 'HIJRI',
        status: 'MANUALLY_ADJUSTED',
      });
    });
  });
});

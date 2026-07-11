import { describe, it, expect } from 'vitest';
import { formatFileDate, todayDateOnly, toLocalDateOnly } from '../date';

describe('formatFileDate', () => {
  it('formats a Date as local YYYY-MM-DD', () => {
    expect(formatFileDate(new Date(2026, 6, 7))).toBe('2026-07-07'); // month is 0-based
  });
  it('zero-pads month and day', () => {
    expect(formatFileDate(new Date(2026, 0, 3))).toBe('2026-01-03');
  });
  it('parses an ISO string', () => {
    expect(formatFileDate('2026-12-31T09:00:00')).toBe('2026-12-31');
  });
  it('defaults to today when no value given', () => {
    expect(formatFileDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
  it('falls back to today for an invalid value', () => {
    expect(formatFileDate('not-a-date')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('todayDateOnly / toLocalDateOnly — local business-date defaults (no UTC day shift)', () => {
  it('uses ONLY local date getters, never toISOString (proven with a getter stub)', () => {
    // A real UTC-based impl would call getTimezoneOffset/toISOString and produce a
    // different result; this stub exposes only local getters + a valid getTime.
    const localMidnight = {
      getTime: () => 1,
      getFullYear: () => 2026,
      getMonth: () => 6, // July (0-based)
      getDate: () => 2,
    } as unknown as Date;
    expect(toLocalDateOnly(localMidnight)).toBe('2026-07-02');
  });

  it('just after local midnight returns the LOCAL day (the UTC+3 bug returned the day before)', () => {
    // 00:30 local on 2 July. new Date(...).toISOString().slice(0,10) in UTC+3 → "2026-07-01".
    expect(todayDateOnly(new Date(2026, 6, 2, 0, 30, 0))).toBe('2026-07-02');
  });

  it('handles a month boundary', () => {
    expect(todayDateOnly(new Date(2026, 6, 31, 23, 30))).toBe('2026-07-31');
    expect(todayDateOnly(new Date(2026, 7, 1, 0, 30))).toBe('2026-08-01');
  });

  it('handles a year boundary', () => {
    expect(todayDateOnly(new Date(2025, 11, 31, 23, 59))).toBe('2025-12-31');
    expect(todayDateOnly(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
  });

  it('handles a leap day', () => {
    expect(todayDateOnly(new Date(2024, 1, 29, 12, 0))).toBe('2024-02-29');
  });

  it('defaults to now and returns a zero-padded YYYY-MM-DD', () => {
    expect(todayDateOnly()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('invalid Date → empty string', () => {
    expect(toLocalDateOnly(new Date('not-a-date'))).toBe('');
  });
});

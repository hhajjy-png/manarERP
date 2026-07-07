import { describe, it, expect } from 'vitest';
import { formatFileDate } from '../date';

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

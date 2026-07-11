import { describe, it, expect } from 'vitest';
import {
  isoToDisplay,
  displayToIso,
  isValidDisplayDate,
  normalizeDateOnly,
  isWithinRange,
  toWesternDigits,
  sanitizeDateTyping,
  isLeapYear,
  daysInMonth,
  isRealYmd,
} from '../dateInput';

describe('dateInput — isoToDisplay (YYYY-MM-DD → DD/MM/YYYY)', () => {
  it('formats a bare date-only value', () => {
    expect(isoToDisplay('2026-07-01')).toBe('01/07/2026');
    expect(isoToDisplay('2025-12-31')).toBe('31/12/2025');
  });
  it('formats the date portion of an ISO datetime without timezone shift', () => {
    // 22:00Z would shift to the next day under UTC math — string slicing must NOT shift it.
    expect(isoToDisplay('2026-07-01T22:00:00.000Z')).toBe('01/07/2026');
    expect(isoToDisplay('2026-07-01T00:00:00')).toBe('01/07/2026');
  });
  it('returns empty for junk / empty / non-string', () => {
    expect(isoToDisplay('')).toBe('');
    expect(isoToDisplay('not-a-date')).toBe('');
    expect(isoToDisplay(null)).toBe('');
    expect(isoToDisplay(undefined)).toBe('');
    expect(isoToDisplay('2026-13-01')).toBe(''); // impossible month
  });
});

describe('dateInput — displayToIso (DD/MM/YYYY → YYYY-MM-DD)', () => {
  it('parses valid day-first dates', () => {
    expect(displayToIso('01/07/2026')).toBe('2026-07-01');
    expect(displayToIso('31/12/2025')).toBe('2025-12-31');
  });
  it('accepts a valid leap day', () => {
    expect(displayToIso('29/02/2024')).toBe('2024-02-29');
  });
  it('rejects an invalid leap day (no JS rollover)', () => {
    expect(displayToIso('29/02/2025')).toBeNull();
  });
  it('rejects impossible day/month combinations', () => {
    expect(displayToIso('31/02/2026')).toBeNull();
    expect(displayToIso('31/04/2026')).toBeNull(); // April has 30
    expect(displayToIso('00/07/2026')).toBeNull();
    expect(displayToIso('07/31/2026')).toBeNull(); // month 31 → invalid (guards MM/DD input)
    expect(displayToIso('07/00/2026')).toBeNull();
  });
  it('rejects raw ISO / partial / garbage', () => {
    expect(displayToIso('2026-07-01')).toBeNull();
    expect(displayToIso('1/7/26')).toBeNull(); // 2-digit year not accepted
    expect(displayToIso('01/07')).toBeNull();
    expect(displayToIso('')).toBeNull();
  });
  it('normalizes single-digit day/month with 4-digit year', () => {
    expect(displayToIso('1/7/2026')).toBe('2026-07-01');
  });
  it('accepts Arabic-Indic digits and returns Western ISO', () => {
    expect(displayToIso('٠١/٠٧/٢٠٢٦')).toBe('2026-07-01');
  });
});

describe('dateInput — isValidDisplayDate', () => {
  it('is true for valid, false for invalid', () => {
    expect(isValidDisplayDate('01/07/2026')).toBe(true);
    expect(isValidDisplayDate('31/02/2026')).toBe(false);
    expect(isValidDisplayDate('')).toBe(false);
  });
});

describe('dateInput — normalizeDateOnly (rehydration, no timezone shift)', () => {
  it('passes a bare date-only string through verbatim', () => {
    expect(normalizeDateOnly('2026-07-01')).toBe('2026-07-01');
  });
  it('takes the date portion of an ISO datetime WITHOUT shifting the day', () => {
    // The classic bug: new Date(...).toISOString().slice(0,10) shifts this in UTC+3.
    expect(normalizeDateOnly('2026-07-01T00:00:00.000Z')).toBe('2026-07-01');
    expect(normalizeDateOnly('2026-07-01T23:30:00')).toBe('2026-07-01');
  });
  it('empty / null / undefined → empty string (never Invalid Date or 1970)', () => {
    expect(normalizeDateOnly('')).toBe('');
    expect(normalizeDateOnly(null)).toBe('');
    expect(normalizeDateOnly(undefined)).toBe('');
  });
  it('formats a Date via LOCAL getters (not UTC)', () => {
    expect(normalizeDateOnly(new Date(2026, 6, 1))).toBe('2026-07-01'); // month 0-based
  });
  it('invalid input → empty string', () => {
    expect(normalizeDateOnly('not-a-date')).toBe('');
  });
  it('round-trips an existing edit value unchanged', () => {
    const stored = '2024-02-29';
    const display = isoToDisplay(normalizeDateOnly(stored)); // 29/02/2024
    expect(display).toBe('29/02/2024');
    expect(displayToIso(display)).toBe(stored); // saved unchanged if untouched
  });
});

describe('dateInput — isWithinRange (min/max on canonical ISO, not display strings)', () => {
  it('respects min and max inclusively', () => {
    expect(isWithinRange('2026-07-01', '2026-01-01', '2026-12-31')).toBe(true);
    expect(isWithinRange('2026-07-01', '2026-08-01', undefined)).toBe(false);
    expect(isWithinRange('2026-07-01', undefined, '2026-06-30')).toBe(false);
    expect(isWithinRange('2026-07-01', '2026-07-01', '2026-07-01')).toBe(true);
  });
});

describe('dateInput — digit + typing helpers', () => {
  it('toWesternDigits converts Arabic-Indic and Eastern-Arabic', () => {
    expect(toWesternDigits('٠١٢٣٤٥٦٧٨٩')).toBe('0123456789');
    expect(toWesternDigits('۰۱۲۳')).toBe('0123');
    expect(toWesternDigits('01/07/2026')).toBe('01/07/2026'); // Western untouched
  });
  it('sanitizeDateTyping keeps only digits and slashes, caps length, normalizes digits', () => {
    expect(sanitizeDateTyping('01/07/2026')).toBe('01/07/2026');
    expect(sanitizeDateTyping('01-07-2026')).toBe('01072026'); // dashes stripped
    expect(sanitizeDateTyping('ab01/07/2026xy')).toBe('01/07/2026');
    expect(sanitizeDateTyping('٠١/٠٧/٢٠٢٦')).toBe('01/07/2026');
    expect(sanitizeDateTyping('01/07/2026999')).toHaveLength(10);
  });
});

describe('dateInput — calendar math', () => {
  it('isLeapYear', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
  });
  it('daysInMonth', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 1)).toBe(31);
  });
  it('isRealYmd', () => {
    expect(isRealYmd(2026, 7, 1)).toBe(true);
    expect(isRealYmd(2026, 2, 29)).toBe(false);
    expect(isRealYmd(2024, 2, 29)).toBe(true);
    expect(isRealYmd(2026, 13, 1)).toBe(false);
  });
});

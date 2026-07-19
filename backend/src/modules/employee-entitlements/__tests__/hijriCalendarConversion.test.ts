import { describe, it, expect } from 'vitest';
import {
  gregorianToJDN,
  jdnToGregorian,
  hijriToGregorianDate,
  isYearSupportedForHijriGeneration,
  SUPPORTED_HIJRI_GENERATION_YEARS,
} from '../holidays/hijriCalendarConversion';

describe('gregorianToJDN / jdnToGregorian — round trip', () => {
  it('round-trips a wide range of Gregorian dates through Julian Day Number with no drift', () => {
    for (let year = 1950; year <= 2100; year += 5) {
      for (const month of [1, 6, 12]) {
        const jdn = gregorianToJDN(year, month, 15);
        const back = jdnToGregorian(jdn);
        expect(back).toEqual({ year, month, day: 15 });
      }
    }
  });
});

describe('hijriToGregorianDate — Kuwaiti/tabular algorithm', () => {
  it('matches the well-documented civil Islamic calendar epoch (1 Muharram 1 AH = 19 July 622 CE)', () => {
    const date = hijriToGregorianDate(1, 1, 1);
    expect(date.getUTCFullYear()).toBe(622);
    expect(date.getUTCMonth()).toBe(6); // July (0-indexed)
    expect(date.getUTCDate()).toBe(19);
  });

  it('produces a Hijri year length of 354 or 355 days (never fabricates an out-of-range calendar)', () => {
    const start = hijriToGregorianDate(1447, 1, 1);
    const nextStart = hijriToGregorianDate(1448, 1, 1);
    const diffDays = Math.round((nextStart.getTime() - start.getTime()) / 86_400_000);
    expect([354, 355]).toContain(diffDays);
  });

  it('is monotonically increasing as the Hijri day advances within a month', () => {
    const d1 = hijriToGregorianDate(1446, 10, 1);
    const d2 = hijriToGregorianDate(1446, 10, 2);
    expect(d2.getTime() - d1.getTime()).toBe(86_400_000);
  });

  it('applies the standard 11-leap-years-per-30-year tabular pattern (355-day leap years)', () => {
    // Leap years within a 30-year cycle (civil/tabular algorithm): 2,5,7,10,13,16,18,21,24,26,29
    let leapCount = 0;
    for (let y = 1; y <= 30; y++) {
      const start = hijriToGregorianDate(y, 1, 1);
      const nextStart = hijriToGregorianDate(y + 1, 1, 1);
      const days = Math.round((nextStart.getTime() - start.getTime()) / 86_400_000);
      if (days === 355) leapCount += 1;
    }
    expect(leapCount).toBe(11);
  });
});

describe('isYearSupportedForHijriGeneration', () => {
  it('accepts years within the documented supported range', () => {
    expect(isYearSupportedForHijriGeneration(SUPPORTED_HIJRI_GENERATION_YEARS.min)).toBe(true);
    expect(isYearSupportedForHijriGeneration(SUPPORTED_HIJRI_GENERATION_YEARS.max)).toBe(true);
    expect(isYearSupportedForHijriGeneration(2027)).toBe(true);
  });

  it('rejects years outside the documented supported range — no fabricated dates beyond it', () => {
    expect(isYearSupportedForHijriGeneration(SUPPORTED_HIJRI_GENERATION_YEARS.min - 1)).toBe(false);
    expect(isYearSupportedForHijriGeneration(SUPPORTED_HIJRI_GENERATION_YEARS.max + 1)).toBe(false);
  });
});

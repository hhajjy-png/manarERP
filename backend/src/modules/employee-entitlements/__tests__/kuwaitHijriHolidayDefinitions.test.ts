import { describe, it, expect } from 'vitest';
import { KUWAIT_HIJRI_HOLIDAY_DEFINITIONS, findHijriOccurrencesInGregorianYear } from '../holidays/kuwaitHijriHolidayDefinitions';

describe('KUWAIT_HIJRI_HOLIDAY_DEFINITIONS', () => {
  it('covers at minimum the 5 required Kuwait Hijri holidays (Al-Ojairi Integration Pack v1, Part 2)', () => {
    const names = KUWAIT_HIJRI_HOLIDAY_DEFINITIONS.map((d) => d.name);
    expect(names).toEqual(
      expect.arrayContaining(['رأس السنة الهجرية', 'المولد النبوي الشريف', 'عيد الفطر', 'يوم عرفة', 'عيد الأضحى']),
    );
  });

  it('uses fixed Hijri month/day facts, not any Gregorian date', () => {
    for (const def of KUWAIT_HIJRI_HOLIDAY_DEFINITIONS) {
      expect(def.hijriMonth).toBeGreaterThanOrEqual(1);
      expect(def.hijriMonth).toBeLessThanOrEqual(12);
      expect(def.hijriDay).toBeGreaterThanOrEqual(1);
      expect(def.hijriDay).toBeLessThanOrEqual(30);
    }
  });
});

describe('findHijriOccurrencesInGregorianYear', () => {
  it('finds exactly one occurrence of a single-day holiday within a supported year', () => {
    const newYear = KUWAIT_HIJRI_HOLIDAY_DEFINITIONS.find((d) => d.name === 'رأس السنة الهجرية')!;
    const occurrences = findHijriOccurrencesInGregorianYear(newYear, 2027);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].getUTCFullYear()).toBe(2027);
  });

  it('finds all days of a multi-day holiday (Eid Al-Adha, 4 days) within the target year', () => {
    const adha = KUWAIT_HIJRI_HOLIDAY_DEFINITIONS.find((d) => d.name === 'عيد الأضحى')!;
    const occurrences = findHijriOccurrencesInGregorianYear(adha, 2027);
    expect(occurrences).toHaveLength(4);
    const days = occurrences.map((d) => d.getTime()).sort((a, b) => a - b);
    for (let i = 1; i < days.length; i++) {
      expect(days[i] - days[i - 1]).toBe(86_400_000); // consecutive calendar days
    }
  });

  it('drifts to an earlier day-of-year year-over-year (lunar calendar, ~11 days earlier per year)', () => {
    const dayOfYear = (d: Date) => Math.round((d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000);
    const newYear = KUWAIT_HIJRI_HOLIDAY_DEFINITIONS.find((d) => d.name === 'رأس السنة الهجرية')!;
    const [y2026] = findHijriOccurrencesInGregorianYear(newYear, 2026);
    const [y2027] = findHijriOccurrencesInGregorianYear(newYear, 2027);
    const diffDays = dayOfYear(y2026) - dayOfYear(y2027);
    expect(diffDays).toBeGreaterThan(0);
    expect(diffDays).toBeLessThan(15);
  });
});

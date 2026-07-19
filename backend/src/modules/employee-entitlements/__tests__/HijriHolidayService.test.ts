import { describe, it, expect } from 'vitest';
import { HijriHolidayService } from '../services/HijriHolidayService';
import { SUPPORTED_HIJRI_GENERATION_YEARS } from '../holidays/hijriCalendarConversion';

describe('HijriHolidayService.generateExpectedHijriHolidays — real Kuwaiti-algorithm generation', () => {
  it('generates the 5 known Kuwait Hijri holidays for a supported year, all EXPECTED_ALOJAIRI', () => {
    const service = new HijriHolidayService();
    const result = service.generateExpectedHijriHolidays(2027);

    expect(result.warnings).toEqual([]);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.origin === 'HIJRI')).toBe(true);
    expect(result.candidates.every((c) => c.status === 'EXPECTED_ALOJAIRI')).toBe(true);
    expect(result.candidates.every((c) => c.date.getUTCFullYear() === 2027)).toBe(true);

    const names = new Set(result.candidates.map((c) => c.name));
    expect(names).toEqual(new Set(['رأس السنة الهجرية', 'المولد النبوي الشريف', 'عيد الفطر', 'يوم عرفة', 'عيد الأضحى']));
  });

  it('never returns status OFFICIAL — generated Hijri holidays are never auto-promoted (Part 3)', () => {
    const service = new HijriHolidayService();
    for (const year of [2022, 2027, 2035, 2048]) {
      const result = service.generateExpectedHijriHolidays(year);
      expect(result.candidates.some((c) => c.status === 'OFFICIAL')).toBe(false);
    }
  });

  it('returns no candidates and a clear UNSUPPORTED_YEAR warning for a year outside the supported range — never fabricates dates', () => {
    const service = new HijriHolidayService();
    const tooFar = SUPPORTED_HIJRI_GENERATION_YEARS.max + 5;
    const result = service.generateExpectedHijriHolidays(tooFar);

    expect(result.candidates).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('UNSUPPORTED_YEAR');
    expect(result.warnings[0].sourceName).toBe('HIJRI_ALOJAIRI');
    expect(result.warnings[0].message).toContain(String(tooFar));
  });

  it('exposes the known Kuwait Hijri holiday names as a read-only reference list', () => {
    const service = new HijriHolidayService();
    const names = service.getKnownHolidayNames();
    expect(names).toContain('عيد الفطر');
    expect(names).toContain('عيد الأضحى');
  });
});

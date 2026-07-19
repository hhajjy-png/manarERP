import { describe, it, expect } from 'vitest';
import { FixedHolidayProvider } from '../holidays/providers/FixedHolidayProvider';
import { HijriHolidayProvider } from '../holidays/providers/HijriHolidayProvider';
import { DEFAULT_HOLIDAY_PROVIDERS } from '../holidays/providers';

describe('FixedHolidayProvider', () => {
  it('implements HolidaySourceProvider and generates the 3 fixed candidates for a year, no warnings', () => {
    const provider = new FixedHolidayProvider();
    expect(provider.sourceName).toBe('FIXED_GREGORIAN');
    const result = provider.generateForYear(2028);
    expect(result.candidates).toHaveLength(3);
    expect(result.candidates.every((c) => c.origin === 'FIXED_GREGORIAN')).toBe(true);
    expect(result.warnings).toEqual([]);
  });
});

describe('HijriHolidayProvider', () => {
  it('implements HolidaySourceProvider and delegates to HijriHolidayService for real generation', () => {
    const provider = new HijriHolidayProvider();
    expect(provider.sourceName).toBe('HIJRI_ALOJAIRI');
    const result = provider.generateForYear(2028);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.candidates.every((c) => c.status === 'EXPECTED_ALOJAIRI')).toBe(true);
  });

  it('accepts an injected HijriHolidayService (isolation behind the interface)', () => {
    const fakeService = {
      generateExpectedHijriHolidays: () => ({
        candidates: [{ date: new Date('2028-04-01T00:00:00Z'), name: 'عيد الفطر', origin: 'HIJRI' as const, status: 'EXPECTED_ALOJAIRI' as const }],
        warnings: [],
      }),
    };
    const provider = new HijriHolidayProvider(fakeService as never);
    expect(provider.generateForYear(2028).candidates).toHaveLength(1);
  });
});

describe('DEFAULT_HOLIDAY_PROVIDERS', () => {
  it('includes exactly the fixed + Hijri providers', () => {
    expect(DEFAULT_HOLIDAY_PROVIDERS).toHaveLength(2);
    expect(DEFAULT_HOLIDAY_PROVIDERS.map((p) => p.sourceName).sort()).toEqual(['FIXED_GREGORIAN', 'HIJRI_ALOJAIRI']);
  });
});

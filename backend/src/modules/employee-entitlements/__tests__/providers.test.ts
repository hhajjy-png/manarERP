import { describe, it, expect } from 'vitest';
import { FixedHolidayProvider } from '../holidays/providers/FixedHolidayProvider';
import { HijriHolidayProvider } from '../holidays/providers/HijriHolidayProvider';
import { DEFAULT_HOLIDAY_PROVIDERS } from '../holidays/providers';

describe('FixedHolidayProvider', () => {
  it('implements HolidaySourceProvider and generates the 3 fixed candidates for a year', () => {
    const provider = new FixedHolidayProvider();
    expect(provider.sourceName).toBe('FIXED_GREGORIAN');
    const candidates = provider.generateForYear(2028);
    expect(candidates).toHaveLength(3);
    expect(candidates.every((c) => c.origin === 'FIXED_GREGORIAN')).toBe(true);
  });
});

describe('HijriHolidayProvider', () => {
  it('implements HolidaySourceProvider and delegates to HijriHolidayService (empty until real data source exists)', () => {
    const provider = new HijriHolidayProvider();
    expect(provider.sourceName).toBe('HIJRI_ALOJAIRI');
    expect(provider.generateForYear(2028)).toEqual([]);
  });

  it('accepts an injected HijriHolidayService (isolation behind the interface)', () => {
    const fakeService = { getExpectedHijriHolidays: () => [{ date: new Date('2028-04-01T00:00:00Z'), name: 'عيد الفطر', origin: 'HIJRI' as const, status: 'EXPECTED_ALOJAIRI' as const }] };
    const provider = new HijriHolidayProvider(fakeService as never);
    expect(provider.generateForYear(2028)).toHaveLength(1);
  });
});

describe('DEFAULT_HOLIDAY_PROVIDERS', () => {
  it('includes exactly the fixed + Hijri providers', () => {
    expect(DEFAULT_HOLIDAY_PROVIDERS).toHaveLength(2);
    expect(DEFAULT_HOLIDAY_PROVIDERS.map((p) => p.sourceName).sort()).toEqual(['FIXED_GREGORIAN', 'HIJRI_ALOJAIRI']);
  });
});

import { describe, it, expect } from 'vitest';
import { HijriHolidayService } from '../services/HijriHolidayService';

describe('HijriHolidayService — architecture-only stub', () => {
  it('returns an empty array for any year — no future Hijri dates are hardcoded or guessed', () => {
    const service = new HijriHolidayService();
    expect(service.getExpectedHijriHolidays(2026)).toEqual([]);
    expect(service.getExpectedHijriHolidays(2035)).toEqual([]);
  });

  it('exposes the known Kuwait Hijri holiday names as a read-only reference list', () => {
    const service = new HijriHolidayService();
    const names = service.getKnownHolidayNames();
    expect(names).toContain('عيد الفطر');
    expect(names).toContain('عيد الأضحى');
  });
});

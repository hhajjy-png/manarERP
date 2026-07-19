import { describe, it, expect } from 'vitest';
import { HolidayValidationService } from '../services/HolidayValidationService';
import type { HolidayCandidate } from '../holidays/holidayCandidate';

const valid: HolidayCandidate = { date: new Date('2027-01-01T00:00:00Z'), name: 'رأس السنة', origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' };

describe('HolidayValidationService', () => {
  const service = new HolidayValidationService();

  it('passes a well-formed candidate with zero errors', () => {
    expect(service.validateCandidate(valid)).toEqual([]);
  });

  it('flags a candidate with an empty name', () => {
    const errors = service.validateCandidate({ ...valid, name: '   ' });
    expect(errors).toContain('اسم العطلة مطلوب');
  });

  it('flags a candidate with an invalid date', () => {
    const errors = service.validateCandidate({ ...valid, date: new Date('not-a-date') });
    expect(errors).toContain('تاريخ العطلة غير صالح');
  });

  it('validateAll splits candidates into valid/invalid buckets', () => {
    const bad: HolidayCandidate = { ...valid, name: '' };
    const result = service.validateAll([valid, bad]);
    expect(result.valid).toEqual([valid]);
    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].candidate).toBe(bad);
  });
});

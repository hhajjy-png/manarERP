import { describe, it, expect } from 'vitest';
import { composeDescription, parseDescription, DEFAULT_WORK_TYPE, WORK_TYPES } from '../utils/invoiceDescription';

describe('composeDescription', () => {
  it('composes workType and location with em-dash separator', () => {
    expect(composeDescription('نقل اسفلت', 'السالمية')).toBe('نقل اسفلت — السالمية');
  });

  it('returns only workType when location is empty', () => {
    expect(composeDescription('نقل اسفلت', '')).toBe('نقل اسفلت');
  });

  it('returns only location when workType is empty', () => {
    expect(composeDescription('', 'السالمية')).toBe('السالمية');
  });

  it('returns empty string when both are empty', () => {
    expect(composeDescription('', '')).toBe('');
  });

  it('trims whitespace from both parts', () => {
    expect(composeDescription('  نقل اسفلت  ', '  السالمية  ')).toBe('نقل اسفلت — السالمية');
  });
});

describe('parseDescription', () => {
  it('splits composed description back into parts', () => {
    const result = parseDescription('نقل اسفلت — السالمية');
    expect(result.workType).toBe('نقل اسفلت');
    expect(result.location).toBe('السالمية');
  });

  it('handles legacy plain description (no separator) as location', () => {
    const result = parseDescription('مشروع الطريق الساحلي');
    expect(result.workType).toBe(DEFAULT_WORK_TYPE);
    expect(result.location).toBe('مشروع الطريق الساحلي');
  });

  it('handles empty description', () => {
    const result = parseDescription('');
    expect(result.workType).toBe(DEFAULT_WORK_TYPE);
    expect(result.location).toBe('');
  });

  it('falls back to DEFAULT_WORK_TYPE when workType part is empty', () => {
    const result = parseDescription(' — السالمية');
    expect(result.workType).toBe(DEFAULT_WORK_TYPE);
    expect(result.location).toBe('السالمية');
  });

  it('is the inverse of composeDescription for known work types', () => {
    for (const wt of WORK_TYPES) {
      const location = 'الجابرية';
      const composed = composeDescription(wt, location);
      const parsed = parseDescription(composed);
      expect(parsed.workType).toBe(wt);
      expect(parsed.location).toBe(location);
    }
  });

  it('DEFAULT_WORK_TYPE is first entry in WORK_TYPES', () => {
    expect(WORK_TYPES[0]).toBe(DEFAULT_WORK_TYPE);
  });
});

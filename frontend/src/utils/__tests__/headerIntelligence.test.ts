import { describe, it, expect } from 'vitest';
import {
  normalizeHeader,
  suggestField,
  analyzeHeaders,
  needsMapping,
  applyMapping,
  IGNORE_FIELD,
} from '../headerIntelligence';

describe('normalizeHeader', () => {
  it('strips format hints and normalizes Arabic letters (hamza removed, hints dropped)', () => {
    // hint "(YYYY-MM-DD)" dropped; hamza ء stripped as part of normalization
    expect(normalizeHeader('تاريخ انتهاء الجواز (YYYY-MM-DD)')).toBe('تاريخ انتها الجواز');
    expect(normalizeHeader('المدنى')).toBe(normalizeHeader('المدني')); // ى → ي
  });
  it('lowercases English and collapses separators', () => {
    expect(normalizeHeader('Full_Name')).toBe('full name');
  });
});

describe('suggestField (employees)', () => {
  it('exact match for a known Arabic label', () => {
    const r = suggestField('الرقم المدني', 'employees');
    expect(r.field).toBe('civilId');
    expect(r.status).toBe('exact');
  });
  it('near-miss suggestion: "رقم المدنى" → civilId', () => {
    const r = suggestField('رقم المدنى', 'employees');
    expect(r.field).toBe('civilId');
    expect(['exact', 'suggested']).toContain(r.status);
    expect(r.confidence).toBeGreaterThan(0.7);
  });
  it('alias: "موبايل" → phone', () => {
    expect(suggestField('موبايل', 'employees').field).toBe('phone');
  });
  it('alias: "تاريخ انتهاء الجواز" → passportExpiry', () => {
    expect(suggestField('تاريخ انتهاء الجواز', 'employees').field).toBe('passportExpiry');
  });
  it('unknown header → status unknown, no field', () => {
    const r = suggestField('عمود مجهول تماما زابليكس', 'employees');
    expect(r.status).toBe('unknown');
    expect(r.field).toBeNull();
  });
});

describe('analyzeHeaders / needsMapping', () => {
  it('all-exact file needs no mapping', () => {
    const a = analyzeHeaders(['الرقم الوظيفي', 'اسم الموظف'], 'employees');
    expect(needsMapping(a)).toBe(false);
  });
  it('file with a near-miss needs mapping', () => {
    const a = analyzeHeaders(['الرقم الوظيفي', 'رقم المدنى', 'عمود غريب'], 'employees');
    expect(needsMapping(a)).toBe(true);
  });
});

describe('applyMapping', () => {
  it('renames keys to system fields and drops ignored/unmapped columns', () => {
    const rows = [{ 'رقم المدنى': '123', 'عمود غريب': 'x', 'اسم الموظف': 'أحمد' }];
    const out = applyMapping(rows, {
      'رقم المدنى': 'civilId',
      'عمود غريب': IGNORE_FIELD,
      'اسم الموظف': 'fullName',
    });
    expect(out).toEqual([{ civilId: '123', fullName: 'أحمد' }]);
  });
});

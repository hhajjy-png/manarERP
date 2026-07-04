import { describe, it, expect } from 'vitest';
import { buildWarningsForBatch, type WarnInput } from '../index';
import { computeQualityScore, buildAnalytics } from '../quality';
import type { EntityType, RowResult } from '../../import.types';

const NOW = new Date('2026-07-04T00:00:00.000Z');
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const run = (e: EntityType, inp: WarnInput[]) => buildWarningsForBatch(e, inp, NOW);
const codes = (m: ReturnType<typeof buildWarningsForBatch>, i: number) =>
  (m.get(i) ?? []).map((w) => w.code).sort();

// ── Phase 2A cross-field ──────────────────────────────────────────────────────
describe('employee cross-field (Phase 2A)', () => {
  it('FUTURE_DATE for birthDate in the future', () => {
    expect(codes(run('employees', [{ rowIndex: 0, raw: {}, normalized: { birthDate: d('2030-01-01'), civilId: 'x', nationality: 'y' } }]), 0)).toContain('FUTURE_DATE');
  });
  it('AGE_TOO_LOW for age under 16', () => {
    expect(codes(run('employees', [{ rowIndex: 0, raw: {}, normalized: { birthDate: d('2015-01-01'), civilId: 'x', nationality: 'y' } }]), 0)).toContain('AGE_TOO_LOW');
  });
  it('DATE_ORDER_SUSPICIOUS when residency expiry precedes passport expiry', () => {
    expect(codes(run('employees', [{ rowIndex: 0, raw: {}, normalized: { passportExpiry: d('2030-01-01'), residencyExpiry: d('2028-01-01'), civilId: 'x', nationality: 'y' } }]), 0)).toContain('DATE_ORDER_SUSPICIOUS');
  });
  it('AMOUNT_ZERO_SUSPICIOUS for salary == 0', () => {
    expect(codes(run('employees', [{ rowIndex: 0, raw: {}, normalized: { salary: 0, civilId: 'x', nationality: 'y' } }]), 0)).toContain('AMOUNT_ZERO_SUSPICIOUS');
  });
});

describe('equipment cross-field (Phase 2A)', () => {
  it('YEAR_INVALID for manufactureYear in the future', () => {
    expect(codes(run('equipment', [{ rowIndex: 0, raw: { c: 1 }, normalized: { manufactureYear: 2030 } }]), 0)).toContain('YEAR_INVALID');
  });
  it('DATE_ORDER_SUSPICIOUS when purchaseDate precedes manufactureYear', () => {
    expect(codes(run('equipment', [{ rowIndex: 0, raw: { c: 1 }, normalized: { manufactureYear: 2024, purchaseDate: d('2020-01-01') } }]), 0)).toContain('DATE_ORDER_SUSPICIOUS');
  });
});

describe('invoice / contract / expense cross-field (Phase 2A)', () => {
  it('invoice DATE_FAR_OFF for issueDate far in the future', () => {
    expect(codes(run('invoices', [{ rowIndex: 0, raw: { i: 1 }, normalized: { issueDate: d('2030-01-01'), total: 5 } }]), 0)).toContain('DATE_FAR_OFF');
  });
  it('contract DATE_EXPIRED for a past endDate', () => {
    expect(codes(run('contracts', [{ rowIndex: 0, raw: { c: 1 }, normalized: { endDate: d('2025-01-01'), price: 5 } }]), 0)).toContain('DATE_EXPIRED');
  });
  it('contract MISSING_IMPORTANT_OPTIONAL when price missing', () => {
    expect(codes(run('contracts', [{ rowIndex: 0, raw: { c: 1 }, normalized: {} }]), 0)).toContain('MISSING_IMPORTANT_OPTIONAL');
  });
  it('expense VALUE_OUT_OF_RANGE for an unusually high amount', () => {
    expect(codes(run('expenses', [{ rowIndex: 0, raw: { e: 1 }, normalized: { amount: 999999 } }]), 0)).toContain('VALUE_OUT_OF_RANGE');
  });
  it('expense DATE_FAR_OFF for a very old date', () => {
    expect(codes(run('expenses', [{ rowIndex: 0, raw: { e: 1 }, normalized: { amount: 10, date: d('2010-01-01') } }]), 0)).toContain('DATE_FAR_OFF');
  });
});

// ── Phase 2B in-file smart duplicates ─────────────────────────────────────────
describe('smart duplicates in-file (Phase 2B)', () => {
  it('employees: duplicate civilId flagged for both rows, unique row clean', () => {
    const m = run('employees', [
      { rowIndex: 0, raw: { a: 1 }, normalized: { civilId: '123', nationality: 'x' } },
      { rowIndex: 1, raw: { a: 2 }, normalized: { civilId: '123', nationality: 'x' } },
      { rowIndex: 2, raw: { a: 3 }, normalized: { civilId: '999', nationality: 'x' } },
    ]);
    expect(codes(m, 0)).toContain('DUP_SECONDARY_KEY');
    expect(codes(m, 1)).toContain('DUP_SECONDARY_KEY');
    expect((m.get(2) ?? []).map((w) => w.code)).not.toContain('DUP_SECONDARY_KEY');
  });
  it('employees: duplicate email is case-insensitive', () => {
    const m = run('employees', [
      { rowIndex: 0, raw: { a: 1 }, normalized: { email: 'A@x.com', nationality: 'x', civilId: '1' } },
      { rowIndex: 1, raw: { a: 2 }, normalized: { email: 'a@x.com', nationality: 'x', civilId: '2' } },
    ]);
    expect(codes(m, 0)).toContain('DUP_SECONDARY_KEY');
  });
  it('customers: duplicate phone flagged', () => {
    const m = run('customers', [
      { rowIndex: 0, raw: { a: 1 }, normalized: { phone: '5000' } },
      { rowIndex: 1, raw: { a: 2 }, normalized: { phone: '5000' } },
    ]);
    expect(codes(m, 0)).toContain('DUP_SECONDARY_KEY');
  });
  it('contracts: composite customer+date+price possible duplicate', () => {
    const m = run('contracts', [
      { rowIndex: 0, raw: { a: 1 }, normalized: { customerId: 7, startDate: d('2026-01-01'), price: 100 } },
      { rowIndex: 1, raw: { a: 2 }, normalized: { customerId: 7, startDate: d('2026-01-01'), price: 100 } },
    ]);
    expect(codes(m, 0)).toContain('DUP_SECONDARY_KEY');
  });
  it('invoices: composite customer+date+total possible duplicate', () => {
    const m = run('invoices', [
      { rowIndex: 0, raw: { a: 1 }, normalized: { customerId: 3, issueDate: d('2026-02-02'), total: 50 } },
      { rowIndex: 1, raw: { a: 2 }, normalized: { customerId: 3, issueDate: d('2026-02-02'), total: 50 } },
    ]);
    expect(codes(m, 0)).toContain('DUP_SECONDARY_KEY');
  });
});

// ── Quality score + analytics (Phase 2) ───────────────────────────────────────
describe('computeQualityScore', () => {
  it('is 100 for an empty file', () => expect(computeQualityScore(0, 0, 0, 0)).toBe(100));
  it('is 100 when everything is clean', () => expect(computeQualityScore(10, 0, 0, 0)).toBe(100));
  it('deducts for invalid rows most heavily', () => {
    expect(computeQualityScore(10, 10, 0, 0)).toBe(40); // 100 - 60
  });
  it('deducts for duplicates and warnings, clamped to [0,100]', () => {
    expect(computeQualityScore(10, 0, 10, 0)).toBe(75); // 100 - 25
    expect(computeQualityScore(10, 0, 0, 10)).toBe(85); // 100 - 15
    expect(computeQualityScore(1, 1, 1, 1)).toBe(0);    // clamped
  });
});

describe('buildAnalytics', () => {
  it('aggregates warning codes, error reasons, and affected fields', () => {
    const rows: RowResult[] = [
      { rowIndex: 0, status: 'valid', data: {}, warnings: [{ code: 'AMOUNT_ZERO_SUSPICIOUS', severity: 'warning', field: 'total', messageAr: '', messageEn: '' }] },
      { rowIndex: 1, status: 'valid', data: {}, warnings: [{ code: 'AMOUNT_ZERO_SUSPICIOUS', severity: 'warning', field: 'total', messageAr: '', messageEn: '' }] },
      { rowIndex: 2, status: 'invalid', data: {}, errors: ['الرقم الوظيفي (code) مطلوب'] },
    ];
    const a = buildAnalytics(rows);
    expect(a.topWarningCodes[0]).toEqual({ key: 'AMOUNT_ZERO_SUSPICIOUS', count: 2 });
    expect(a.topAffectedFields[0]).toEqual({ key: 'total', count: 2 });
    expect(a.topErrorReasons[0]).toEqual({ key: 'الرقم الوظيفي (code) مطلوب', count: 1 });
  });
});

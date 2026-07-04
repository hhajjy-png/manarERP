import { describe, it, expect } from 'vitest';
import { buildWarningsForBatch, type WarnInput } from '../index';
import { buildPreviewRows } from '../../import.service';
import type { EntityType } from '../../import.types';

const NOW = new Date('2026-07-04T00:00:00.000Z');
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

function run(entity: EntityType, inputs: WarnInput[]) {
  return buildWarningsForBatch(entity, inputs, NOW);
}
const codesOf = (map: ReturnType<typeof buildWarningsForBatch>, i: number) =>
  (map.get(i) ?? []).map((w) => w.code).sort();

// ── Employees ────────────────────────────────────────────────────────────────
describe('employee warnings', () => {
  it('IDENTICAL_DATES when passport == residency (both present)', () => {
    const map = run('employees', [{ rowIndex: 0, raw: {}, normalized: {
      passportExpiry: d('2027-01-01'), residencyExpiry: d('2027-01-01'), civilId: 'x', nationality: 'y',
    } }]);
    expect(codesOf(map, 0)).toContain('IDENTICAL_DATES');
  });

  it('no IDENTICAL_DATES when the two dates differ', () => {
    const map = run('employees', [{ rowIndex: 0, raw: {}, normalized: {
      passportExpiry: d('2033-01-02'), residencyExpiry: d('2026-10-06'), civilId: 'x', nationality: 'y',
    } }]);
    expect(codesOf(map, 0)).not.toContain('IDENTICAL_DATES');
  });

  it('DATE_EXPIRED for a past expiry, DATE_EXPIRING_SOON within 90 days', () => {
    const expired = run('employees', [{ rowIndex: 0, raw: {}, normalized: { passportExpiry: d('2026-01-01'), civilId: 'x', nationality: 'y' } }]);
    expect(codesOf(expired, 0)).toContain('DATE_EXPIRED');
    const soon = run('employees', [{ rowIndex: 0, raw: {}, normalized: { passportExpiry: d('2026-08-01'), civilId: 'x', nationality: 'y' } }]);
    expect(codesOf(soon, 0)).toContain('DATE_EXPIRING_SOON');
    const far = run('employees', [{ rowIndex: 0, raw: {}, normalized: { passportExpiry: d('2030-01-01'), civilId: 'x', nationality: 'y' } }]);
    expect(far.get(0)).toBeUndefined();
  });

  it('ENUM_DEFAULTED when raw status is unknown', () => {
    const map = run('employees', [{ rowIndex: 0, raw: { status: 'FOO' }, normalized: { civilId: 'x', nationality: 'y' } }]);
    expect(codesOf(map, 0)).toContain('ENUM_DEFAULTED');
    const ok = run('employees', [{ rowIndex: 0, raw: { status: 'ACTIVE' }, normalized: { civilId: 'x', nationality: 'y' } }]);
    expect(codesOf(ok, 0)).not.toContain('ENUM_DEFAULTED');
  });

  it('MISSING_IMPORTANT_OPTIONAL when civilId/nationality missing', () => {
    const map = run('employees', [{ rowIndex: 0, raw: {}, normalized: {} }]);
    expect(codesOf(map, 0)).toContain('MISSING_IMPORTANT_OPTIONAL');
  });
});

// ── Equipment ────────────────────────────────────────────────────────────────
describe('equipment warnings', () => {
  it('DATE_EXPIRED / DATE_EXPIRING_SOON on registrationExpiry', () => {
    expect(codesOf(run('equipment', [{ rowIndex: 0, raw: {}, normalized: { registrationExpiry: d('2026-01-01') } }]), 0)).toContain('DATE_EXPIRED');
    expect(codesOf(run('equipment', [{ rowIndex: 0, raw: {}, normalized: { registrationExpiry: d('2026-08-01') } }]), 0)).toContain('DATE_EXPIRING_SOON');
  });

  it('DUP_SECONDARY_KEY for repeated plateNumber within the file', () => {
    // Distinct raw content per row so ROW_IDENTICAL does not fire — isolating DUP_SECONDARY_KEY.
    const map = run('equipment', [
      { rowIndex: 0, raw: { code: 'Q0' }, normalized: { plateNumber: 'ABC-1' } },
      { rowIndex: 1, raw: { code: 'Q1' }, normalized: { plateNumber: 'ABC-1' } },
      { rowIndex: 2, raw: { code: 'Q2' }, normalized: { plateNumber: 'XYZ-9' } },
    ]);
    expect(codesOf(map, 0)).toContain('DUP_SECONDARY_KEY');
    expect(codesOf(map, 1)).toContain('DUP_SECONDARY_KEY');
    expect(map.get(2)).toBeUndefined();
  });
});

// ── Invoices ─────────────────────────────────────────────────────────────────
describe('invoice warnings', () => {
  it('DATE_RANGE_INVALID when dueDate < issueDate', () => {
    const map = run('invoices', [{ rowIndex: 0, raw: {}, normalized: { issueDate: d('2026-06-01'), dueDate: d('2026-05-01'), total: 100 } }]);
    expect(codesOf(map, 0)).toContain('DATE_RANGE_INVALID');
  });
  it('AMOUNT_ZERO_SUSPICIOUS when total == 0', () => {
    const map = run('invoices', [{ rowIndex: 0, raw: {}, normalized: { issueDate: d('2026-06-01'), total: 0 } }]);
    expect(codesOf(map, 0)).toContain('AMOUNT_ZERO_SUSPICIOUS');
  });
});

// ── Contracts ────────────────────────────────────────────────────────────────
describe('contract warnings', () => {
  it('AMOUNT_ZERO_SUSPICIOUS when price == 0', () => {
    expect(codesOf(run('contracts', [{ rowIndex: 0, raw: {}, normalized: { price: 0 } }]), 0)).toContain('AMOUNT_ZERO_SUSPICIOUS');
  });
  it('DATE_EXPIRING_SOON when endDate within 90 days', () => {
    expect(codesOf(run('contracts', [{ rowIndex: 0, raw: {}, normalized: { endDate: d('2026-08-01') } }]), 0)).toContain('DATE_EXPIRING_SOON');
  });
});

// ── Payroll ──────────────────────────────────────────────────────────────────
describe('payroll warnings', () => {
  it('NET_NEGATIVE when netSalary < 0', () => {
    expect(codesOf(run('payroll', [{ rowIndex: 0, raw: {}, normalized: { netSalary: -5, baseSalary: 300 } }]), 0)).toContain('NET_NEGATIVE');
  });
  it('VALUE_OUT_OF_RANGE for out-of-band baseSalary', () => {
    expect(codesOf(run('payroll', [{ rowIndex: 0, raw: {}, normalized: { netSalary: 100, baseSalary: 99999 } }]), 0)).toContain('VALUE_OUT_OF_RANGE');
    expect(run('payroll', [{ rowIndex: 0, raw: {}, normalized: { netSalary: 100, baseSalary: 300 } }]).get(0)).toBeUndefined();
  });
});

// ── ROW_IDENTICAL (all entities) ─────────────────────────────────────────────
describe('ROW_IDENTICAL', () => {
  it('flags full-row duplicates within the file', () => {
    const raw = { code: 'C1', name: 'Acme' };
    const map = run('customers', [
      { rowIndex: 0, raw: { ...raw }, normalized: {} },
      { rowIndex: 1, raw: { ...raw }, normalized: {} },
      { rowIndex: 2, raw: { code: 'C2', name: 'Other' }, normalized: {} },
    ]);
    expect(codesOf(map, 0)).toContain('ROW_IDENTICAL');
    expect(codesOf(map, 1)).toContain('ROW_IDENTICAL');
    expect(map.get(2)).toBeUndefined();
  });
});

// ── NO-REGRESSION: warnings never change valid/invalid/duplicate counts ───────
describe('no-regression: status counts unaffected by warnings', () => {
  const rows = [
    { code: 'E1', fullName: 'A', passportExpiry: '2027-01-01', residencyExpiry: '2027-01-01' }, // valid + warning
    { code: 'E2', fullName: 'B' },  // valid + warning (missing optionals)
    { fullName: 'C' },              // invalid (no code)
    { code: 'E1', fullName: 'D' },  // duplicate
  ];
  const count = (rs: ReturnType<typeof buildPreviewRows>, s: string) => rs.filter((r) => r.status === s).length;

  it('valid/invalid/duplicate counts identical with and without warnings', () => {
    const base = buildPreviewRows('employees', rows, new Set(), {}, false);
    const withW = buildPreviewRows('employees', rows, new Set(), {}, true, NOW);
    for (const s of ['valid', 'invalid', 'duplicate']) {
      expect(count(withW, s)).toBe(count(base, s));
    }
    expect(count(base, 'valid')).toBe(2);
    expect(count(base, 'invalid')).toBe(1);
    expect(count(base, 'duplicate')).toBe(1);
  });

  it('baseline has no warnings; warned rows stay status=valid; invalid/duplicate never carry warnings', () => {
    const base = buildPreviewRows('employees', rows, new Set(), {}, false);
    expect(base.every((r) => r.warnings === undefined)).toBe(true);

    const withW = buildPreviewRows('employees', rows, new Set(), {}, true, NOW);
    const row0 = withW.find((r) => r.rowIndex === 0)!;
    expect(row0.status).toBe('valid');
    expect(row0.warnings?.some((w) => w.code === 'IDENTICAL_DATES')).toBe(true);
    expect(withW.filter((r) => r.status !== 'valid').every((r) => !r.warnings)).toBe(true);
  });
});

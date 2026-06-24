import { describe, it, expect } from 'vitest';
import { buildDrillDownRef } from './drilldown.utils';

describe('buildDrillDownRef', () => {
  it('returns correct route for INVOICE', () => {
    const ref = buildDrillDownRef('INVOICE', 42, 'فاتورة MN-INV-2025-001');
    expect(ref.entityType).toBe('INVOICE');
    expect(ref.entityId).toBe(42);
    expect(ref.route).toBe('/invoices');
    expect(ref.label).toBe('فاتورة MN-INV-2025-001');
  });

  it('returns correct route for JOURNAL_ENTRY', () => {
    const ref = buildDrillDownRef('JOURNAL_ENTRY', 10);
    expect(ref.route).toBe('/accounting');
  });

  it('returns /financial for GL_ACCOUNT (internal navigation)', () => {
    const ref = buildDrillDownRef('GL_ACCOUNT', 5, 'حساب النقدية');
    expect(ref.route).toBe('/financial');
  });

  it('returns /invoices route for PAYMENT (payment context is within invoice page)', () => {
    const ref = buildDrillDownRef('PAYMENT', 1);
    expect(ref.route).toBe('/invoices');
  });

  it('generates default label when none provided', () => {
    const ref = buildDrillDownRef('EXPENSE', 99);
    expect(ref.label).toBe('EXPENSE-99');
  });
});

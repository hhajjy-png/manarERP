import { describe, it, expect } from 'vitest';
import { canEditInvoice, collectionDateAction } from '../utils/invoiceGovernance';

describe('canEditInvoice — normal edit-path eligibility', () => {
  it('does NOT allow editing a fully-paid (PAID) invoice', () => {
    expect(canEditInvoice('PAID', 500)).toBe(false);
    expect(canEditInvoice('PAID', 0)).toBe(false);
  });

  it('allows editing an UNPAID invoice', () => {
    expect(canEditInvoice('UNPAID', 0)).toBe(true);
  });

  it('does NOT allow editing a PARTIAL invoice (has collected amount)', () => {
    expect(canEditInvoice('PARTIAL', 100)).toBe(false);
  });

  it('allows editing an OVERDUE invoice only when nothing was collected', () => {
    expect(canEditInvoice('OVERDUE', 0)).toBe(true);
    expect(canEditInvoice('OVERDUE', 50)).toBe(false);
  });

  it('does NOT allow editing a CANCELLED invoice', () => {
    expect(canEditInvoice('CANCELLED', 0)).toBe(false);
  });

  it('is safe for missing/undefined status or paidAmount', () => {
    expect(canEditInvoice(undefined, undefined)).toBe(false);
    expect(canEditInvoice(null, null)).toBe(false);
    expect(canEditInvoice('OVERDUE', undefined)).toBe(true);
  });
});

describe('collectionDateAction — paid-invoice collection-date correction gating', () => {
  it('is DISABLED for a non-SYSTEM_ADMIN user even with payments', () => {
    const a = collectionDateAction(false, [{ id: 1 }, { id: 2 }]);
    expect(a.enabled).toBe(false);
    expect(a.singlePaymentId).toBeNull();
    expect(a.multiple).toBe(false);
  });

  it('is DISABLED when there are no payments', () => {
    expect(collectionDateAction(true, []).enabled).toBe(false);
    expect(collectionDateAction(true, null).enabled).toBe(false);
    expect(collectionDateAction(true, undefined).enabled).toBe(false);
  });

  it('enables a DIRECT action for a single payment (admin)', () => {
    const a = collectionDateAction(true, [{ id: 42 }]);
    expect(a.enabled).toBe(true);
    expect(a.singlePaymentId).toBe(42);
    expect(a.multiple).toBe(false);
  });

  it('is enabled but MULTIPLE (no direct id → caller must let user pick) for several payments', () => {
    const a = collectionDateAction(true, [{ id: 7 }, { id: 8 }, { id: 9 }]);
    expect(a.enabled).toBe(true);
    expect(a.singlePaymentId).toBeNull(); // never guesses which payment
    expect(a.multiple).toBe(true);
  });

  it('ignores payments with no id and resolves the single valid one', () => {
    const a = collectionDateAction(true, [{ id: null }, { id: 5 }]);
    expect(a.enabled).toBe(true);
    expect(a.singlePaymentId).toBe(5);
    expect(a.multiple).toBe(false);
  });
});

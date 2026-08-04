import { describe, it, expect } from 'vitest';
import { AppError } from '../../../core/errors/AppError';
import { assertDateWithinBillingPeriod, DOCUMENT_DATE_OUT_OF_PERIOD_MESSAGE } from '../accountingPeriod.validation';

describe('assertDateWithinBillingPeriod', () => {
  it('does not throw when billingMonth is not provided', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 6, 15), undefined, 2026)).not.toThrow();
  });

  it('does not throw when billingYear is not provided', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 6, 15), 7, undefined)).not.toThrow();
  });

  it('does not throw when both billingMonth and billingYear are null', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 6, 15), null, null)).not.toThrow();
  });

  it('allows the first day of the billing month', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 6, 1), 7, 2026)).not.toThrow();
  });

  it('allows the last day of a 31-day billing month (July)', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 6, 31), 7, 2026)).not.toThrow();
  });

  it('allows the last day of a 30-day billing month (June)', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 5, 30), 6, 2026)).not.toThrow();
  });

  it('rejects the 31st for a 30-day billing month (June has no 31st)', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 6, 1), 6, 2026)).toThrow(AppError);
  });

  it('allows the last day of a non-leap-year 28-day February', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 1, 28), 2, 2026)).not.toThrow();
  });

  it('rejects the 29th of February in a non-leap year', () => {
    // JS Date rolls 2026-02-29 forward to 2026-03-01 (2026 is not a leap year) — still outside the Feb 2026 period.
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 1, 29), 2, 2026)).toThrow(AppError);
  });

  it('allows the 29th of February in a leap year (2028)', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2028, 1, 29), 2, 2028)).not.toThrow();
  });

  it('rejects a date before the start of the billing period', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 5, 30), 7, 2026))
      .toThrow(DOCUMENT_DATE_OUT_OF_PERIOD_MESSAGE);
  });

  it('rejects a date after the end of the billing period', () => {
    expect(() => assertDateWithinBillingPeriod(new Date(2026, 7, 1), 7, 2026))
      .toThrow(DOCUMENT_DATE_OUT_OF_PERIOD_MESSAGE);
  });

  it('throws AppError.badRequest (400) on violation', () => {
    try {
      assertDateWithinBillingPeriod(new Date(2026, 0, 1), 7, 2026);
      expect.unreachable('expected assertDateWithinBillingPeriod to throw');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).statusCode).toBe(400);
    }
  });
});

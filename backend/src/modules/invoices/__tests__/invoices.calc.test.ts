import { describe, it, expect } from 'vitest';
import { round3, computeTotals, nextStatus, overpaymentExceeds } from '../invoices.calc';

// ── round3 ───────────────────────────────────────────────────────────────────

describe('round3', () => {
  it('rounds up at the third decimal place', () => {
    expect(round3(1.2345)).toBe(1.235);
  });

  it('rounds down at the third decimal place', () => {
    expect(round3(1.2344)).toBe(1.234);
  });

  it('returns 0 for 0', () => {
    expect(round3(0)).toBe(0);
  });

  it('returns integer values unchanged', () => {
    expect(round3(100)).toBe(100);
  });

  it('preserves exact KWD 3dp value without false rounding', () => {
    expect(round3(0.005)).toBe(0.005);
  });

  it('handles floating-point drift without false positives', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in JS — round3 must return 0.3
    expect(round3(0.1 + 0.2)).toBe(0.3);
  });
});

// ── computeTotals — zero / empty items ──────────────────────────────────────

describe('computeTotals — zero / empty items', () => {
  it('returns all zeroes for zero items', () => {
    const { subtotal, taxAmount, total } = computeTotals([], 5, 0);
    expect(subtotal).toBe(0);
    expect(taxAmount).toBe(0);
    expect(total).toBe(0);
  });

  it('returns empty lines array for zero items', () => {
    const { lines } = computeTotals([], 5, 0);
    expect(lines).toHaveLength(0);
  });
});

// ── computeTotals — discount > subtotal ─────────────────────────────────────

describe('computeTotals — discount clamp', () => {
  it('clamps taxable to 0 when discount exceeds subtotal', () => {
    // subtotal = 50, discount = 100 → taxable = max(0, -50) = 0
    const { subtotal, taxAmount, total } = computeTotals(
      [{ description: 'x', quantity: 5, unit: 'pc', unitPrice: 10 }],
      10,
      100,
    );
    expect(subtotal).toBe(50);
    expect(taxAmount).toBe(0);
    expect(total).toBe(0);
  });

  it('clamps taxable to 0 when discount equals subtotal', () => {
    const { taxAmount, total } = computeTotals(
      [{ description: 'x', quantity: 1, unit: 'pc', unitPrice: 200 }],
      15,
      200,
    );
    expect(taxAmount).toBe(0);
    expect(total).toBe(0);
  });
});

// ── computeTotals — taxRate = 0 ─────────────────────────────────────────────

describe('computeTotals — zero tax rate', () => {
  it('produces zero taxAmount when taxRate is 0', () => {
    const { subtotal, taxAmount, total } = computeTotals(
      [{ description: 'x', quantity: 2, unit: 'pc', unitPrice: 75 }],
      0,
      0,
    );
    expect(subtotal).toBe(150);
    expect(taxAmount).toBe(0);
    expect(total).toBe(150);
  });

  it('total equals subtotal minus discount when taxRate is 0', () => {
    const { total } = computeTotals(
      [{ description: 'x', quantity: 1, unit: 'pc', unitPrice: 100 }],
      0,
      25,
    );
    expect(total).toBe(75);
  });
});

// ── computeTotals — normal calculation ──────────────────────────────────────

describe('computeTotals — normal calculation', () => {
  it('computes subtotal, taxAmount, total for a simple 2-item invoice', () => {
    // item1: 3 × 100 = 300, item2: 2 × 50 = 100 → subtotal 400
    // discount 50 → taxable 350, taxRate 10% → tax 35, total 385
    const { subtotal, taxAmount, total } = computeTotals(
      [
        { description: 'A', quantity: 3, unit: 'pc', unitPrice: 100 },
        { description: 'B', quantity: 2, unit: 'pc', unitPrice: 50 },
      ],
      10,
      50,
    );
    expect(subtotal).toBe(400);
    expect(taxAmount).toBe(35);
    expect(total).toBe(385);
  });

  it('each line total is rounded to 3dp before summing', () => {
    // unitPrice 33.3335 × qty 1 → round3(33.3335) = 33.334 per line (4th dp rounds up)
    // 3 lines × 33.334 = 100.002; without per-line rounding: round3(3×33.3335) = round3(100.0005) = 100.001
    const { subtotal, lines } = computeTotals(
      [
        { description: 'A', quantity: 1, unit: 'pc', unitPrice: 33.3335 },
        { description: 'B', quantity: 1, unit: 'pc', unitPrice: 33.3335 },
        { description: 'C', quantity: 1, unit: 'pc', unitPrice: 33.3335 },
      ],
      0,
      0,
    );
    expect(lines[0].total).toBe(33.334);
    expect(lines[1].total).toBe(33.334);
    expect(lines[2].total).toBe(33.334);
    expect(subtotal).toBe(100.002);
  });
});

// ── computeTotals — KWD 3dp precision ───────────────────────────────────────

describe('computeTotals — KWD 3dp precision', () => {
  it('preserves exact KWD 3dp unit prices without rounding away the fils', () => {
    // 1 × 5.750 KD → line total must be 5.750, not 5.75
    const { lines, subtotal } = computeTotals(
      [{ description: 'x', quantity: 1, unit: 'pc', unitPrice: 5.750 }],
      0,
      0,
    );
    expect(lines[0].total).toBe(5.75);
    expect(subtotal).toBe(5.75);
  });

  it('rounds taxAmount to 3 decimal places', () => {
    // subtotal 100, taxRate 5% → taxable 100, tax = round3(5) = 5.000
    // Check with non-round rate: taxRate 7.5% → tax = round3(7.5) = 7.5
    const { taxAmount } = computeTotals(
      [{ description: 'x', quantity: 1, unit: 'pc', unitPrice: 100 }],
      7.5,
      0,
    );
    expect(taxAmount).toBe(7.5);
  });

  it('rounds taxAmount to 3dp for a fractional tax result', () => {
    // subtotal 10, taxRate 15% → taxable 10, tax = round3(1.5) = 1.5
    // subtotal 7, taxRate 15% → taxable 7, tax = round3(1.05) = 1.05
    const { taxAmount } = computeTotals(
      [{ description: 'x', quantity: 7, unit: 'pc', unitPrice: 1 }],
      15,
      0,
    );
    expect(taxAmount).toBe(1.05);
    expect(Number.isFinite(taxAmount)).toBe(true);
  });

  it('rounds total to 3 decimal places', () => {
    // subtotal 5.750, taxRate 5% → taxable 5.750, tax = round3(0.2875) = 0.288, total = round3(6.038) = 6.038
    const { total, taxAmount } = computeTotals(
      [{ description: 'x', quantity: 1, unit: 'pc', unitPrice: 5.750 }],
      5,
      0,
    );
    expect(taxAmount).toBe(0.288);
    expect(total).toBe(6.038);
  });

  it('total equals round3(taxAmount + subtotal)', () => {
    const { subtotal, taxAmount, total } = computeTotals(
      [{ description: 'A', quantity: 3, unit: 'pc', unitPrice: 66.667 }],
      5,
      0,
    );
    expect(Number.isFinite(subtotal)).toBe(true);
    expect(Number.isFinite(taxAmount)).toBe(true);
    expect(Number.isFinite(total)).toBe(true);
    expect(total).toBe(round3(taxAmount + subtotal));
  });

  it('does not produce NaN for fractional unitPrice × quantity combinations', () => {
    const { total } = computeTotals(
      [{ description: 'x', quantity: 7, unit: 'ton', unitPrice: 14.285 }],
      5,
      0,
    );
    expect(total).not.toBeNaN();
  });
});

// ── nextStatus ───────────────────────────────────────────────────────────────

describe('nextStatus', () => {
  it('returns UNPAID when paid is 0', () => {
    expect(nextStatus(100, 0)).toBe('UNPAID');
  });

  it('returns UNPAID when paid is negative (guard against bad input)', () => {
    expect(nextStatus(100, -1)).toBe('UNPAID');
  });

  it('returns PARTIAL when paid is between 0 and total', () => {
    expect(nextStatus(100, 50)).toBe('PARTIAL');
  });

  it('returns PARTIAL just below total', () => {
    expect(nextStatus(100, 99.999)).toBe('PARTIAL');
  });

  it('returns PAID when paid equals total exactly', () => {
    expect(nextStatus(100, 100)).toBe('PAID');
  });

  it('returns PAID when paid exceeds total (tolerance overpayment)', () => {
    // paid > total is guarded upstream by overpaymentExceeds;
    // nextStatus itself should still return PAID if somehow called with paid > total
    expect(nextStatus(100, 100.001)).toBe('PAID');
  });

  it('returns PAID for KWD 3dp amounts at exact boundary', () => {
    expect(nextStatus(125.750, 125.750)).toBe('PAID');
  });
});

// ── overpaymentExceeds ───────────────────────────────────────────────────────

describe('overpaymentExceeds', () => {
  it('returns true when newPaid exceeds total + 0.001', () => {
    // 100 + 0.002 > 100.001 → true
    expect(overpaymentExceeds(100, 100.002)).toBe(true);
  });

  it('returns false when newPaid is within the 0.001 tolerance', () => {
    // 100 + 0.0005 = 100.0005, NOT > 100.001 → false
    expect(overpaymentExceeds(100, 100.0005)).toBe(false);
  });

  it('returns false when newPaid equals total exactly', () => {
    expect(overpaymentExceeds(100, 100)).toBe(false);
  });

  it('returns false when newPaid equals total + 0.001 exactly (boundary is exclusive)', () => {
    // NOT strictly greater, so false
    expect(overpaymentExceeds(100, 100.001)).toBe(false);
  });

  it('returns false when newPaid is less than total', () => {
    expect(overpaymentExceeds(100, 50)).toBe(false);
  });

  it('returns true for a KWD 3dp invoice total exceeded by one fils above tolerance', () => {
    expect(overpaymentExceeds(125.750, 125.752)).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { roundCost, calcWAC, sufficientStock } from '../inventory.calc';

// ── roundCost ────────────────────────────────────────────────────────────────

describe('roundCost', () => {
  it('rounds to 6 decimal places (round up)', () => {
    expect(roundCost(1.1234567)).toBe(1.123457);
  });

  it('rounds to 6 decimal places (round down)', () => {
    expect(roundCost(1.1234561)).toBe(1.123456);
  });

  it('returns 0 for 0', () => {
    expect(roundCost(0)).toBe(0);
  });

  it('returns integer values unchanged', () => {
    expect(roundCost(5)).toBe(5);
  });

  it('preserves 6dp without floating-point false positives', () => {
    // 1/3 = 0.333333... — should round at 6dp
    expect(roundCost(1 / 3)).toBe(0.333333);
  });
});

// ── calcWAC — fresh material (zero existing stock) ───────────────────────────

describe('calcWAC — fresh material', () => {
  it('returns incomingUnitCost when currentStock is 0 (fresh material)', () => {
    // (0×0 + 10×5.000) / 10 = 5.000
    expect(calcWAC(0, 0, 10, 5)).toBe(5);
  });

  it('returns incomingUnitCost when currentStock is 0 regardless of currentUnitCost', () => {
    // If stock is 0, currentUnitCost has no weight
    expect(calcWAC(0, 99.999, 5, 10)).toBe(10);
  });
});

// ── calcWAC — adding to existing stock ──────────────────────────────────────

describe('calcWAC — same unit cost', () => {
  it('returns the same unit cost when incoming cost equals current cost', () => {
    // (10×5 + 10×5) / 20 = 5
    expect(calcWAC(10, 5, 10, 5)).toBe(5);
  });
});

describe('calcWAC — weighted average', () => {
  it('computes correct weighted average when costs differ', () => {
    // (10×5 + 10×7) / 20 = 120/20 = 6
    expect(calcWAC(10, 5, 10, 7)).toBe(6);
  });

  it('weights correctly when existing stock is larger than incoming', () => {
    // (100×10 + 10×20) / 110 = 1200/110 = 10.909090... → roundCost = 10.909091
    expect(calcWAC(100, 10, 10, 20)).toBe(roundCost(1200 / 110));
  });

  it('weights correctly when incoming qty is larger than existing stock', () => {
    // (5×10 + 100×2) / 105 = 250/105 = 2.380952... → roundCost = 2.380952
    expect(calcWAC(5, 10, 100, 2)).toBe(roundCost(250 / 105));
  });
});

// ── calcWAC — negative stock guard ───────────────────────────────────────────

describe('calcWAC — negative stock guard', () => {
  it('treats negative currentStock as 0 (matches production safeCurrentStock)', () => {
    // currentStock = -5 → safeCurrentStock = 0 → same as fresh material
    expect(calcWAC(-5, 99.999, 5, 10)).toBe(10);
  });

  it('treats -1 currentStock as 0', () => {
    // (0×any + 10×7) / 10 = 7
    expect(calcWAC(-1, 50, 10, 7)).toBe(7);
  });
});

// ── calcWAC — precision chain ────────────────────────────────────────────────

describe('calcWAC — precision chain', () => {
  it('rounds result to 6dp without NaN', () => {
    // 3×6.333333 + 7×8.000 = 18.999999 + 56 = 74.999999, / 10 = 7.499999... → 6dp
    const result = calcWAC(3, 6.333333, 7, 8);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBe(roundCost((3 * 6.333333 + 7 * 8) / 10));
  });

  it('never returns NaN for normal positive inputs', () => {
    const inputs: [number, number, number, number][] = [
      [0, 0, 1, 1],
      [1, 1, 1, 1],
      [100, 5.555, 50, 7.777],
      [999, 0.001, 1, 999.999],
    ];
    for (const [cs, cu, iq, iu] of inputs) {
      expect(calcWAC(cs, cu, iq, iu)).not.toBeNaN();
    }
  });
});

// ── calcWAC — incomingQty = 0 edge case ──────────────────────────────────────

describe('calcWAC — incomingQty = 0 (edge case)', () => {
  it('returns currentUnitCost when incomingQty is 0 and stock exists (no-op receipt)', () => {
    // (10×5 + 0×any) / 10 = 5 — cost unchanged
    expect(calcWAC(10, 5, 0, 99)).toBe(5);
  });

  it('returns incomingUnitCost (not NaN) when both incomingQty and currentStock are 0', () => {
    // newQty = 0 → division-by-zero guard → return incomingUnitCost
    const result = calcWAC(0, 0, 0, 7.500);
    expect(result).not.toBeNaN();
    expect(result).toBe(7.5);
  });

  it('returns incomingUnitCost (not NaN) when incomingQty is 0 and stock is also 0 with non-zero currentUnitCost', () => {
    const result = calcWAC(0, 99.999, 0, 5);
    expect(result).not.toBeNaN();
    expect(result).toBe(5);
  });
});

// ── sufficientStock ───────────────────────────────────────────────────────────

describe('sufficientStock', () => {
  it('returns true when currentStock exceeds requestedQty', () => {
    expect(sufficientStock(10, 5)).toBe(true);
  });

  it('returns true when currentStock equals requestedQty (exact boundary)', () => {
    expect(sufficientStock(5, 5)).toBe(true);
  });

  it('returns false when currentStock is less than requestedQty', () => {
    expect(sufficientStock(4, 5)).toBe(false);
  });

  it('returns false when currentStock is 0 and qty > 0', () => {
    expect(sufficientStock(0, 1)).toBe(false);
  });

  it('returns true when currentStock is 0 and requestedQty is 0', () => {
    expect(sufficientStock(0, 0)).toBe(true);
  });

  it('returns false for negative stock against any positive qty', () => {
    expect(sufficientStock(-3, 1)).toBe(false);
  });
});

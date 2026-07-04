import { describe, it, expect } from 'vitest';
import { computeCashFlow, buildRevenueDistribution } from '../commandData';

describe('computeCashFlow (real derivation: collections − expenses)', () => {
  it('returns collections minus expenses for the month', () => {
    expect(computeCashFlow({ revenue: 100, expenses: 30, collections: 56, profit: 70 })).toBe(26);
  });
  it('can be negative when expenses exceed collections', () => {
    expect(computeCashFlow({ revenue: 0, expenses: 40, collections: 10, profit: -40 })).toBe(-30);
  });
  it('treats missing numbers as 0', () => {
    expect(computeCashFlow({})).toBe(0);
  });
  it('rounds to 3 decimals (KWD precision)', () => {
    expect(computeCashFlow({ collections: 10.0005, expenses: 0.0002 })).toBe(10.0);
  });
});

describe('buildRevenueDistribution (real revenue by customer + أخرى)', () => {
  const rows = [
    { name: 'A', revenue: 50 }, { name: 'B', revenue: 30 },
    { name: 'C', revenue: 10 }, { name: 'D', revenue: 6 }, { name: 'E', revenue: 4 },
  ];
  it('keeps top N slices and aggregates the rest into أخرى', () => {
    const out = buildRevenueDistribution(rows, 3);
    expect(out).toEqual([
      { name: 'A', value: 50 }, { name: 'B', value: 30 },
      { name: 'C', value: 10 }, { name: 'أخرى', value: 10 },
    ]);
  });
  it('adds no أخرى slice when rows fit within maxSlices', () => {
    const out = buildRevenueDistribution([{ name: 'A', revenue: 5 }], 3);
    expect(out).toEqual([{ name: 'A', value: 5 }]);
  });
  it('drops zero/negative revenue rows', () => {
    const out = buildRevenueDistribution([{ name: 'A', revenue: 5 }, { name: 'B', revenue: 0 }], 3);
    expect(out).toEqual([{ name: 'A', value: 5 }]);
  });
  it('returns [] for empty input', () => {
    expect(buildRevenueDistribution([], 3)).toEqual([]);
  });
});

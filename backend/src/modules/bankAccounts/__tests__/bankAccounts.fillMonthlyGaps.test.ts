/**
 * fillMonthlyGaps — runaway-range / NaN guards (Phase C analytics stabilization).
 *
 * These guards are the root-cause fix for the Analytics tab white-screen: a
 * malformed statementDate could previously make the gap-fill loop generate tens
 * of thousands of month buckets, freezing/crashing Recharts on the frontend.
 */

import { describe, it, expect, vi } from 'vitest';

// The service module imports prisma at load time; mock it so this pure-function
// test needs no database.
vi.mock('@config/database.js', () => ({ prisma: {} }));

import { fillMonthlyGaps } from '../bankAccounts.service.js';
import type { MonthlyEntry } from '../bankAccounts.types.js';

function entry(month: string, over: Partial<MonthlyEntry> = {}): MonthlyEntry {
  return {
    month,
    totalDeposits:     0,
    totalWithdrawals:  0,
    netFlow:           0,
    txCount:           0,
    largestDeposit:    0,
    largestWithdrawal: 0,
    ...over,
  };
}

describe('fillMonthlyGaps', () => {
  it('returns entries unchanged when fewer than 2', () => {
    expect(fillMonthlyGaps([])).toEqual([]);
    const one = [entry('2026-06', { txCount: 3 })];
    expect(fillMonthlyGaps(one)).toEqual(one);
  });

  it('fills zero-entry placeholders for missing months between first and last', () => {
    const result = fillMonthlyGaps([entry('2026-01', { txCount: 5 }), entry('2026-04', { txCount: 2 })]);
    expect(result.map((e) => e.month)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
    expect(result[1].txCount).toBe(0); // gap month
    expect(result[3].txCount).toBe(2); // real data preserved
  });

  it('crosses a year boundary correctly', () => {
    const result = fillMonthlyGaps([entry('2025-11'), entry('2026-02')]);
    expect(result.map((e) => e.month)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('caps a runaway range from a malformed (out-of-range) month at 600 buckets', () => {
    // Year 0020 → 2026 would be ~24,000 months without the cap.
    const result = fillMonthlyGaps([entry('0020-01'), entry('2026-06')]);
    expect(result.length).toBe(600);
    expect(result.length).toBeLessThanOrEqual(600);
  });

  it('skips gap-filling entirely when a bound is unparseable (no infinite loop)', () => {
    const entries = [entry('20XX-01'), entry('2026-06')];
    const result = fillMonthlyGaps(entries);
    expect(result).toBe(entries); // returned as-is, never throws or hangs
  });
});

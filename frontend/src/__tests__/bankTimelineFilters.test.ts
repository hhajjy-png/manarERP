import { describe, it, expect } from 'vitest';
import {
  quickRangeToDates, toIsoDate, safeNum, safeAmount,
  timelineTotalLabel, TIMELINE_TOTAL_LABELS,
} from '../pages/bankTimelineFilters';

// Fixed reference date: Wednesday 2026-06-17.
const NOW = new Date(2026, 5, 17); // month is 0-based → June

describe('timelineTotalLabel — filtered-total label per active type filter', () => {
  it('gives the right Arabic total label for every filter type', () => {
    expect(timelineTotalLabel('all')).toBe('الإجمالي');
    expect(timelineTotalLabel('deposits')).toBe('إجمالي الإيداعات');
    expect(timelineTotalLabel('withdrawals')).toBe('إجمالي السحوبات');
    expect(timelineTotalLabel('fees')).toBe('إجمالي الرسوم');
    expect(timelineTotalLabel('cheques')).toBe('إجمالي الشيكات');
    expect(timelineTotalLabel('transfers')).toBe('إجمالي التحويلات');
  });

  it('defaults to «الإجمالي» when no type is set', () => {
    expect(timelineTotalLabel(undefined)).toBe('الإجمالي');
  });

  it('covers all six filter types', () => {
    expect(Object.keys(TIMELINE_TOTAL_LABELS).sort()).toEqual(
      ['all', 'cheques', 'deposits', 'fees', 'transfers', 'withdrawals'],
    );
  });
});

describe('quickRangeToDates', () => {
  it('today → [today, today]', () => {
    expect(quickRangeToDates('today', NOW)).toEqual({ fromDate: '2026-06-17', toDate: '2026-06-17' });
  });

  it('month → first of current month to today', () => {
    expect(quickRangeToDates('month', NOW)).toEqual({ fromDate: '2026-06-01', toDate: '2026-06-17' });
  });

  it('last30 → 29 days back, inclusive', () => {
    expect(quickRangeToDates('last30', NOW)).toEqual({ fromDate: '2026-05-19', toDate: '2026-06-17' });
  });

  it('last90 → 89 days back, inclusive', () => {
    expect(quickRangeToDates('last90', NOW).toDate).toBe('2026-06-17');
    expect(quickRangeToDates('last90', NOW).fromDate).toBe('2026-03-20');
  });

  it('week → back to the most recent Saturday', () => {
    // 2026-06-17 is a Wednesday; the Saturday on/before is 2026-06-13.
    expect(quickRangeToDates('week', NOW)).toEqual({ fromDate: '2026-06-13', toDate: '2026-06-17' });
  });

  it('all → unbounded', () => {
    expect(quickRangeToDates('all', NOW)).toEqual({ fromDate: '', toDate: '' });
  });
});

describe('toIsoDate', () => {
  it('formats local date without timezone shift', () => {
    expect(toIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('safeNum / safeAmount', () => {
  it('passes finite numbers through', () => {
    expect(safeNum(12.5)).toBe(12.5);
    expect(safeNum('7')).toBe(7);
  });

  it('defaults NaN / undefined / null / Infinity to 0', () => {
    expect(safeNum(undefined)).toBe(0);
    expect(safeNum(null)).toBe(0);
    expect(safeNum(NaN)).toBe(0);
    expect(safeNum(Infinity)).toBe(0);
    expect(safeNum('abc')).toBe(0);
  });

  it('safeAmount rounds to 3 decimals and never returns NaN', () => {
    expect(safeAmount(1.23456)).toBe(1.235);
    expect(safeAmount(undefined)).toBe(0);
    expect(Number.isNaN(safeAmount('x'))).toBe(false);
  });
});

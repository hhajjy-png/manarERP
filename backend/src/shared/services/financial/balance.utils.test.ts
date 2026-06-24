import { describe, it, expect } from 'vitest';
import {
  normalizeMoney,
  calculateRunningBalances,
  calculateClosingBalance,
  sumDebitCredit,
} from './balance.utils';

describe('normalizeMoney', () => {
  it('rounds to 3 decimal places (KWD)', () => {
    expect(normalizeMoney(1.0005)).toBe(1.001);
    expect(normalizeMoney(1.0004)).toBe(1);
    expect(normalizeMoney(1234.5678)).toBe(1234.568);
  });
  it('handles floating point precision', () => {
    expect(normalizeMoney(0.1 + 0.2)).toBe(0.3);
  });
  it('handles negative values', () => {
    expect(normalizeMoney(-1.5005)).toBe(-1.501);
  });
});

describe('calculateRunningBalances', () => {
  it('returns correct progressive balance starting from zero', () => {
    const entries = [
      { debit: 100, credit: 0, description: 'inv-1' },
      { debit: 0, credit: 50, description: 'pay-1' },
      { debit: 25, credit: 0, description: 'inv-2' },
    ];
    const result = calculateRunningBalances(0, entries);
    expect(result[0].runningBalance).toBe(100);
    expect(result[1].runningBalance).toBe(50);
    expect(result[2].runningBalance).toBe(75);
  });

  it('applies non-zero opening balance', () => {
    const entries = [{ debit: 100, credit: 0 }];
    expect(calculateRunningBalances(500, entries)[0].runningBalance).toBe(600);
  });

  it('returns empty array for empty input', () => {
    expect(calculateRunningBalances(100, [])).toEqual([]);
  });

  it('preserves all original entry properties', () => {
    const entries = [{ debit: 10, credit: 5, myField: 'hello' }];
    const result = calculateRunningBalances(0, entries);
    expect(result[0].myField).toBe('hello');
    expect(result[0].runningBalance).toBe(5);
  });
});

describe('calculateClosingBalance', () => {
  it('adds debit and subtracts credit from opening', () => {
    expect(calculateClosingBalance(1000, 500, 200)).toBe(1300);
    expect(calculateClosingBalance(0, 0, 0)).toBe(0);
    expect(calculateClosingBalance(100, 0, 150)).toBe(-50);
  });
});

describe('sumDebitCredit', () => {
  it('returns correct sums', () => {
    const entries = [
      { debit: 100, credit: 50 },
      { debit: 200, credit: 75 },
    ];
    expect(sumDebitCredit(entries)).toEqual({ totalDebit: 300, totalCredit: 125 });
  });
  it('returns zeros for empty array', () => {
    expect(sumDebitCredit([])).toEqual({ totalDebit: 0, totalCredit: 0 });
  });
});

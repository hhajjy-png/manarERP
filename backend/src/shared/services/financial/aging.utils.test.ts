import { describe, it, expect } from 'vitest';
import { calculateAgingBuckets, DEFAULT_AGING_BUCKETS } from './aging.utils';
import { normalizeMoney } from './balance.utils';

describe('calculateAgingBuckets', () => {
  const asOfDate = new Date('2025-06-01');

  it('skips entries where outstanding is 0', () => {
    const invoices = [{ dueDate: new Date('2025-05-01'), outstandingAmount: 0 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.total).toBe(0);
  });

  it('skips entries where outstanding is negative', () => {
    const invoices = [{ dueDate: new Date('2025-05-01'), outstandingAmount: -100 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.total).toBe(0);
  });

  it('assigns not-yet-due invoice to current bucket (negative days overdue)', () => {
    // Due June 15 → -14 days overdue on June 1 → 'current'
    const invoices = [{ dueDate: new Date('2025-06-15'), outstandingAmount: 500 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.current).toBe(500);
    expect(result['0_30']).toBe(0);
    expect(result.total).toBe(500);
  });

  it('assigns 17 days overdue to 0_30 bucket', () => {
    // Due May 15 → 17 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-05-15'), outstandingAmount: 300 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result['0_30']).toBe(300);
    expect(result.total).toBe(300);
  });

  it('assigns exactly 30 days overdue to 0_30 bucket (inclusive)', () => {
    // Due May 2 → 30 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-05-02'), outstandingAmount: 100 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result['0_30']).toBe(100);
  });

  it('assigns 31 days overdue to 31_60 bucket (inclusive)', () => {
    // Due May 1 → 31 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-05-01'), outstandingAmount: 100 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result['31_60']).toBe(100);
  });

  it('assigns over-120-day invoice to over_120 bucket', () => {
    // Due Jan 1 → 151 days overdue on June 1
    const invoices = [{ dueDate: new Date('2025-01-01'), outstandingAmount: 1000 }];
    const result = calculateAgingBuckets(invoices, asOfDate);
    expect(result.over_120).toBe(1000);
  });

  it('total equals sum of all bucket amounts', () => {
    const invoices = [
      { dueDate: new Date('2025-06-15'), outstandingAmount: 100 }, // current
      { dueDate: new Date('2025-05-15'), outstandingAmount: 200 }, // 0_30
      { dueDate: new Date('2025-01-01'), outstandingAmount: 400 }, // over_120
    ];
    const result = calculateAgingBuckets(invoices, asOfDate);
    const bucketSum = DEFAULT_AGING_BUCKETS.reduce((s, b) => s + (result[b.key] ?? 0), 0);
    expect(normalizeMoney(bucketSum)).toBe(result.total);
    expect(result.total).toBe(700);
  });

  it('accepts custom bucket configuration', () => {
    const customBuckets = [
      { key: 'current', min: -Infinity, max: -1, label: 'Current' },
      { key: 'all_due', min: 0, max: Infinity, label: 'All Due' },
    ];
    const invoices = [
      { dueDate: new Date('2025-05-01'), outstandingAmount: 300 }, // 31 days overdue → all_due
    ];
    const result = calculateAgingBuckets(invoices, asOfDate, customBuckets);
    expect(result.all_due).toBe(300);
    expect(result.current).toBe(0);
  });
});

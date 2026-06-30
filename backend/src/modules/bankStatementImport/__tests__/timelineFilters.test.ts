/**
 * buildTimelineWhere — Phase C server-side timeline filters
 * (date range + transaction type + amount range + text search composition).
 */

import { describe, it, expect, vi } from 'vitest';

// service.ts imports prisma at load time; stub it (the function under test is pure).
vi.mock('@config/database.js', () => ({ prisma: {} }));

import { buildTimelineWhere } from '../service.js';

describe('buildTimelineWhere', () => {
  it('filters by accountKey only when no options given', () => {
    expect(buildTimelineWhere('IBAN:KW1')).toEqual({ accountKey: 'IBAN:KW1' });
  });

  it('adds a statementDate range for from/to', () => {
    const w = buildTimelineWhere('A', { fromDate: '2026-01-01', toDate: '2026-06-30' });
    expect(w.statementDate).toEqual({ gte: new Date('2026-01-01'), lte: new Date('2026-06-30') });
  });

  it('maps each transaction type to the right column constraint', () => {
    expect(buildTimelineWhere('A', { type: 'deposits' }).credit).toEqual({ gt: 0 });
    expect(buildTimelineWhere('A', { type: 'withdrawals' }).debit).toEqual({ gt: 0 });
    expect(buildTimelineWhere('A', { type: 'fees' }).isBankFee).toBe(true);
    expect(buildTimelineWhere('A', { type: 'cheques' }).chequeNumber).toEqual({ not: null });
    expect(buildTimelineWhere('A', { type: 'transfers' }).bankFeeType).toBe('BANK_TRANSFER');
  });

  it('treats type "all" as no constraint', () => {
    expect(buildTimelineWhere('A', { type: 'all' })).toEqual({ accountKey: 'A' });
  });

  it('builds amount range against either side (debit OR credit)', () => {
    const w = buildTimelineWhere('A', { minAmount: 100, maxAmount: 500 });
    expect(w.AND).toEqual([
      { OR: [{ debit: { gte: 100 } }, { credit: { gte: 100 } }] },
      { OR: [{ debit: { gt: 0, lte: 500 } }, { credit: { gt: 0, lte: 500 } }] },
    ]);
  });

  it('composes search + amount range into the AND array together', () => {
    const w = buildTimelineWhere('A', { search: 'salary', minAmount: 50 });
    expect(w.AND).toHaveLength(2);
    expect(w.AND).toContainEqual({ OR: [{ debit: { gte: 50 } }, { credit: { gte: 50 } }] });
    expect(w.AND).toContainEqual({
      OR: [{ description: { contains: 'salary' } }, { reference: { contains: 'salary' } }],
    });
  });

  it('combines date + type + amount + search at once', () => {
    const w = buildTimelineWhere('A', {
      fromDate: '2026-01-01', type: 'deposits', maxAmount: 1000, search: 'x',
    });
    expect(w.accountKey).toBe('A');
    expect(w.statementDate).toEqual({ gte: new Date('2026-01-01') });
    expect(w.credit).toEqual({ gt: 0 });
    expect(w.AND).toHaveLength(2); // maxAmount + search
  });
});

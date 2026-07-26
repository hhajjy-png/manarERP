/**
 * buildTimelineWhere — Phase C server-side timeline filters
 * (date range + transaction type + amount range + text search composition).
 * TIMELINE_ORDER_BY — default Bank Account/Transaction Explorer sort order.
 */

import { describe, it, expect, vi } from 'vitest';

// service.ts imports prisma at load time; stub it (the values under test are pure).
vi.mock('@config/database.js', () => ({ prisma: {} }));

import { buildTimelineWhere, TIMELINE_ORDER_BY } from '../service.js';

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
    expect(buildTimelineWhere('A', { type: 'transfers' }).bankFeeType).toBe('BANK_TRANSFER');
  });

  it('matches cheques by cheque number OR cheque-payment category (mirrors the display badge)', () => {
    // Fix: a cheque-payment row without a parsed cheque number (shown as «شيك») must be included.
    const w = buildTimelineWhere('A', { type: 'cheques' });
    expect(w.chequeNumber).toBeUndefined(); // no longer a bare chequeNumber constraint
    expect(w.AND).toContainEqual({
      OR: [{ chequeNumber: { not: null } }, { bankFeeType: 'CHEQUE_PAYMENT' }],
    });
  });

  it('composes the cheque filter together with date + amount + search', () => {
    const w = buildTimelineWhere('A', {
      type: 'cheques', fromDate: '2026-01-01', minAmount: 100, search: 'x',
    });
    expect(w.statementDate).toEqual({ gte: new Date('2026-01-01') });
    expect(w.AND).toContainEqual({ OR: [{ chequeNumber: { not: null } }, { bankFeeType: 'CHEQUE_PAYMENT' }] });
    expect(w.AND).toContainEqual({ OR: [{ debit: { gte: 100 } }, { credit: { gte: 100 } }] });
    expect(w.AND).toContainEqual({ OR: [{ description: { contains: 'x' } }, { reference: { contains: 'x' } }] });
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

describe('TIMELINE_ORDER_BY (default transaction explorer ordering)', () => {
  it('shows the latest imported batch first, then original file row order, then id as a legacy tiebreaker', () => {
    expect(TIMELINE_ORDER_BY).toEqual([
      { importId:          'desc' },
      { statementSequence: 'asc' },
      { id:                'asc' },
    ]);
  });

  it('uses importId descending as the primary sort key (latest statement file first)', () => {
    expect(TIMELINE_ORDER_BY[0]).toEqual({ importId: 'desc' });
  });

  it('uses statementSequence ascending to reproduce the original file order within a batch', () => {
    expect(TIMELINE_ORDER_BY[1]).toEqual({ statementSequence: 'asc' });
  });
});

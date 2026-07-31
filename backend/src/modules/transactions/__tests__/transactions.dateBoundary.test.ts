import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Backend Date-Boundary Unification Pack v1 — دفتر اليومية والأستاذ العام.
 *
 * العيب قبل هذه الحزمة: `list()` و`ledger()` كانا يبنيان `lte` بـ
 * `new Date(to)` **بلا `endOfDay` إطلاقًا** — لا كما في بقية الوحدات التي كانت
 * على الأقل تمدّ الطرف. النتيجة: كل حركات اليوم الأخير من أي مدى تختفي من
 * الأستاذ العام، فلا يتوازن الرصيد التراكمي مع بقية الشاشات.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    transaction: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { transactionsService } from '../transactions.service';
import { expectLocalRange, expectLocalStartOfDay, expectLocalEndOfDay } from '../../../core/utils/__tests__/localDayMatchers';

const mp = prisma as unknown as {
  transaction: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

beforeEach(() => {
  vi.clearAllMocks();
  mp.transaction.findMany.mockResolvedValue([]);
  mp.transaction.count.mockResolvedValue(0);
});

describe('transactions.ledger — date boundary', () => {
  it('includes the whole last day (the missing endOfDay regression)', async () => {
    await transactionsService.ledger('1100', '2026-08-01', '2026-08-31');

    const where = mp.transaction.findMany.mock.calls[0][0].where;
    expectLocalRange(where.date, '2026-08-01', '2026-08-31');
  });

  it('a transaction at 23:59:59.999 on the last day falls inside the range', async () => {
    await transactionsService.ledger('1100', '2026-08-01', '2026-08-31');

    const { gte, lte } = mp.transaction.findMany.mock.calls[0][0].where.date;
    const lastMoment = new Date(2026, 7, 31, 23, 59, 59, 999);
    expect(lastMoment >= gte && lastMoment <= lte).toBe(true);
  });

  it('a transaction at 00:30 on the first day falls inside the range', async () => {
    await transactionsService.ledger('1100', '2026-08-01', '2026-08-31');

    const { gte, lte } = mp.transaction.findMany.mock.calls[0][0].where.date;
    const earlyFirstDay = new Date(2026, 7, 1, 0, 30, 0, 0);
    expect(earlyFirstDay >= gte && earlyFirstDay <= lte).toBe(true);
  });

  it('single-day ledger covers that whole day', async () => {
    await transactionsService.ledger('1100', '2026-08-02', '2026-08-02');
    expectLocalRange(mp.transaction.findMany.mock.calls[0][0].where.date, '2026-08-02', '2026-08-02');
  });

  it('keeps the account filter and applies no date filter when unbounded', async () => {
    await transactionsService.ledger('1100');
    const where = mp.transaction.findMany.mock.calls[0][0].where;
    expect(where.account).toBe('1100');
    expect(where.date).toBeUndefined();
  });
});

describe('transactions.list — date boundary', () => {
  it('applies the inclusive local range', async () => {
    await transactionsService.list({ from: '2026-08-01', to: '2026-08-31' } as never);
    expectLocalRange(mp.transaction.findMany.mock.calls[0][0].where.date, '2026-08-01', '2026-08-31');
  });

  it('list and ledger agree on the boundary instants for the same range', async () => {
    await transactionsService.list({ from: '2026-08-01', to: '2026-08-31' } as never);
    const listDate = mp.transaction.findMany.mock.calls[0][0].where.date;

    vi.clearAllMocks();
    mp.transaction.findMany.mockResolvedValue([]);

    await transactionsService.ledger('1100', '2026-08-01', '2026-08-31');
    const ledgerDate = mp.transaction.findMany.mock.calls[0][0].where.date;

    expect(ledgerDate.gte.getTime()).toBe(listDate.gte.getTime());
    expect(ledgerDate.lte.getTime()).toBe(listDate.lte.getTime());
  });

  it('partial bounds remain supported', async () => {
    await transactionsService.list({ from: '2026-08-01' } as never);
    const fromOnly = mp.transaction.findMany.mock.calls[0][0].where.date;
    expectLocalStartOfDay(fromOnly.gte, '2026-08-01');
    expect(fromOnly.lte).toBeUndefined();

    vi.clearAllMocks();
    mp.transaction.findMany.mockResolvedValue([]);
    mp.transaction.count.mockResolvedValue(0);

    await transactionsService.list({ to: '2026-08-31' } as never);
    const toOnly = mp.transaction.findMany.mock.calls[0][0].where.date;
    expectLocalEndOfDay(toOnly.lte, '2026-08-31');
    expect(toOnly.gte).toBeUndefined();
  });
});

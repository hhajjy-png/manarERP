import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Financial Period Awareness — إحصاء الشيكات يتبع نفس نطاق chequeDate الذي تتبعه
 * القائمة، فلا يعرض الجدول فترة والإحصاء فترة أخرى. الفلترة داخل استعلام Prisma.
 */

vi.mock('../../../config/database', () => ({
  prisma: { cheque: { count: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() } },
}));

import { prisma } from '../../../config/database';
import { chequesService } from '../cheques.service';

const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.cheque.count.mockResolvedValue(0);
  mp.cheque.findMany.mockResolvedValue([]);
  mp.cheque.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
});

describe('cheques.stats — period range', () => {
  it('applies from/to to chequeDate in every count (with end-of-day on to)', async () => {
    await chequesService.stats({ from: '2024-01-01', to: '2024-12-31' });
    // 4 عدّات: الإجمالي + 3 حالات — كلها تحمل نفس شرط التاريخ.
    for (const call of mp.cheque.count.mock.calls) {
      const w = call[0].where;
      expect(w.chequeDate.gte).toBeInstanceOf(Date);
      expect(w.chequeDate.lte.getFullYear()).toBe(2024);
      expect(w.chequeDate.lte.getHours()).toBe(23);
    }
  });

  it('no range → no chequeDate filter (all periods)', async () => {
    await chequesService.stats({});
    for (const call of mp.cheque.count.mock.calls) {
      expect(call[0].where.chequeDate).toBeUndefined();
    }
  });

  it('printedTotal sums PRINTED cheques only, in the DB, across the same date range as the counts', async () => {
    mp.cheque.aggregate.mockResolvedValue({ _sum: { amount: 12345.678 } });
    const result = await chequesService.stats({ from: '2024-01-01', to: '2024-12-31' });
    expect(mp.cheque.aggregate).toHaveBeenCalledTimes(1);
    const aggCall = mp.cheque.aggregate.mock.calls[0][0];
    expect(aggCall.where.status).toBe('PRINTED');
    expect(aggCall.where.chequeDate.gte).toBeInstanceOf(Date);
    expect(aggCall.where.chequeDate.lte.getFullYear()).toBe(2024);
    expect(aggCall._sum).toEqual({ amount: true });
    expect(result.printedTotal).toBe(12345.678);
  });

  it('printedTotal falls back to 0 when there are no PRINTED cheques (null SUM)', async () => {
    mp.cheque.aggregate.mockResolvedValue({ _sum: { amount: null } });
    const result = await chequesService.stats({});
    expect(result.printedTotal).toBe(0);
  });
});

describe('cheques.list — period range (shares chequeDate window with stats)', () => {
  it('applies the same chequeDate range as stats', async () => {
    await chequesService.list({ from: '2024-03-01', to: '2024-03-31' } as any);
    const where = mp.cheque.findMany.mock.calls[0][0].where;
    expect(where.chequeDate.gte.getMonth()).toBe(2); // مارس (0-based)
    expect(where.chequeDate.lte.getHours()).toBe(23);
  });
});

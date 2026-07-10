import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Financial Period Awareness — إحصاء الشيكات يتبع نفس نطاق chequeDate الذي تتبعه
 * القائمة، فلا يعرض الجدول فترة والإحصاء فترة أخرى. الفلترة داخل استعلام Prisma.
 */

vi.mock('../../../config/database', () => ({
  prisma: { cheque: { count: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from '../../../config/database';
import { chequesService } from '../cheques.service';

const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.cheque.count.mockResolvedValue(0);
  mp.cheque.findMany.mockResolvedValue([]);
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
});

describe('cheques.list — period range (shares chequeDate window with stats)', () => {
  it('applies the same chequeDate range as stats', async () => {
    await chequesService.list({ from: '2024-03-01', to: '2024-03-31' } as any);
    const where = mp.cheque.findMany.mock.calls[0][0].where;
    expect(where.chequeDate.gte.getMonth()).toBe(2); // مارس (0-based)
    expect(where.chequeDate.lte.getHours()).toBe(23);
  });
});

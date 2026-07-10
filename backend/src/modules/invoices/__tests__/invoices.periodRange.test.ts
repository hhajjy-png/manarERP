import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Financial Period Awareness — قائمة الفواتير وإحصاؤها يقبلان نطاق from/to على
 * تاريخ الإصدار، ويطبّقانه داخل شرط Prisma (لا في الواجهة). القائمة والإحصاء
 * يستخدمان نفس الشرط فلا يعرض الجدول فترة والإحصائيات فترة أخرى.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { invoicesService } from '../invoices.service';

const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.invoice.findMany.mockResolvedValue([]);
  mp.invoice.count.mockResolvedValue(0);
  mp.invoice.aggregate.mockResolvedValue({ _sum: { total: null, paidAmount: null } });
});

describe('invoices.list — period range', () => {
  it('applies from/to to issueDate in the Prisma where (with end-of-day on to)', async () => {
    await invoicesService.list({ from: '2024-01-01', to: '2024-12-31' } as any);
    const where = mp.invoice.findMany.mock.calls[0][0].where;
    expect(where.issueDate.gte).toBeInstanceOf(Date);
    expect(where.issueDate.lte.getFullYear()).toBe(2024);
    expect(where.issueDate.lte.getHours()).toBe(23); // نهاية اليوم
  });

  it('uses a deterministic secondary sort key (id) alongside issueDate', async () => {
    await invoicesService.list({} as any);
    expect(mp.invoice.findMany.mock.calls[0][0].orderBy).toEqual([{ issueDate: 'desc' }, { id: 'desc' }]);
  });

  it('no range → no issueDate filter (all periods)', async () => {
    await invoicesService.list({} as any);
    expect(mp.invoice.findMany.mock.calls[0][0].where.issueDate).toBeUndefined();
  });
});

describe('invoices.stats — period range', () => {
  it('applies the same issueDate range as the list (table and stats agree)', async () => {
    await invoicesService.stats({ from: '2024-03-01', to: '2024-03-31' } as any);
    const where = mp.invoice.aggregate.mock.calls[0][0].where;
    expect(where.issueDate.gte).toBeInstanceOf(Date);
    expect(where.issueDate.gte.getMonth()).toBe(2); // مارس (0-based)
    // count يستخدم نفس الشرط
    expect(mp.invoice.count.mock.calls[0][0].where.issueDate).toBeDefined();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    expense:  { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));

import { expensesService } from '../expenses.service';
import { prisma } from '../../../config/database';

const db = prisma as unknown as {
  expense:  { aggregate: ReturnType<typeof vi.fn>; groupBy: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  supplier: { findMany: ReturnType<typeof vi.fn> };
};

/**
 * Filters, Dates & Loading Integrity Pack v3 — البند 1.
 *
 * الواجهة كانت ترسل `search` إلى `/expenses/stats` والخدمة لا تعلنه ولا تطبّقه، فيضيّق
 * البحثُ الجدولَ وتبقى البطاقات على مجموعتها الأوسع: رقم صحيح لمجموعة أخرى.
 */

const SEARCH_BRANCHES = ['description', 'code', 'supplierName'];

beforeEach(() => {
  vi.clearAllMocks();
  db.expense.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
  db.expense.groupBy.mockResolvedValue([]);
  db.expense.findMany.mockResolvedValue([]);
  db.expense.count.mockResolvedValue(0);
  db.supplier.findMany.mockResolvedValue([]);
});

describe('expensesService.stats — البحث يصل إلى البطاقات', () => {
  it('يطبّق فروع البحث نفسها التي يطبّقها الجدول', async () => {
    await expensesService.stats({ search: 'ديزل' });

    const where = db.expense.aggregate.mock.calls[0]![0].where;
    expect(where.OR).toBeDefined();
    expect(where.OR.map((b: Record<string, unknown>) => Object.keys(b)[0])).toEqual(SEARCH_BRANCHES);
    expect(where.OR.every((b: Record<string, { contains: string }>) => Object.values(b)[0].contains === 'ديزل')).toBe(true);
  });

  it('تطابق بطاقة ↔ جدول: نفس شرط البحث في الإحصاء والقائمة', async () => {
    await expensesService.stats({ search: 'ديزل' });
    const statsWhere = db.expense.aggregate.mock.calls[0]![0].where;

    vi.clearAllMocks();
    db.expense.findMany.mockResolvedValue([]);
    db.expense.count.mockResolvedValue(0);
    await expensesService.list({ search: 'ديزل' });
    const listWhere = db.expense.findMany.mock.calls[0]![0].where;

    expect(statsWhere.OR).toEqual(listWhere.OR);
  });

  it('البحث يتقاطع مع بقية الفلاتر لا يستبدلها', async () => {
    await expensesService.stats({ search: 'ديزل', status: 'APPROVED', category: 'FUEL', from: '2026-08-01', to: '2026-08-31' });

    const where = db.expense.aggregate.mock.calls[0]![0].where;
    expect(where.status).toBe('APPROVED');
    expect(where.category).toBe('FUEL');
    expect(where.date).toBeDefined();
    expect(where.OR).toHaveLength(SEARCH_BRANCHES.length);
  });

  it('بلا بحث: لا فرع OR إطلاقًا (لا تغيير على السلوك القائم)', async () => {
    await expensesService.stats({ status: 'APPROVED' });
    expect(db.expense.aggregate.mock.calls[0]![0].where.OR).toBeUndefined();
  });
});

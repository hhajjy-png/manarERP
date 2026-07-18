import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation v1 — المصروفات: الوحدة الوحيدة ذات ترتيب
 * افتراضي تاريخي مخصّص (date desc). الافتراضي محفوظ + كاسر تعادل id حتمي،
 * والفرز المطلوب يستبدل الأساسي ويُبقي كاسر التعادل.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    expense: { findMany: vi.fn(), count: vi.fn() },
    journalEntry: { findMany: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { ExpensesService } from '../expenses.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;
const service = new ExpensesService();

beforeEach(() => {
  vi.resetAllMocks();
  mp.expense.findMany.mockResolvedValue([]);
  mp.expense.count.mockResolvedValue(0);
  mp.journalEntry.findMany.mockResolvedValue([]);
});

function findManyArgs() {
  return mp.expense.findMany.mock.calls[0][0];
}

describe('expenses.list — server-side sorting', () => {
  it('no sort params → historical default date desc + deterministic id tiebreaker', async () => {
    await service.list({});
    expect(findManyArgs().orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('amount ascending replaces primary key and keeps the id tiebreaker only', async () => {
    await service.list({ sortBy: 'amount', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ amount: 'asc' }, { id: 'desc' }]);
  });

  it('category sorts on the raw enum value (display translation is frontend-only)', async () => {
    await service.list({ sortBy: 'category', sortDir: 'desc' });
    expect(findManyArgs().orderBy).toEqual([{ category: 'desc' }, { id: 'desc' }]);
  });

  it('non-whitelisted key (supplierName) rejected → default', async () => {
    await service.list({ sortBy: 'supplierName', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('date-range + status filters + sort compose without interference', async () => {
    await service.list({ status: 'APPROVED', from: '2026-01-01', to: '2026-06-30', sortBy: 'amount', sortDir: 'desc' });
    const args = findManyArgs();
    expect(args.where.status).toBe('APPROVED');
    expect(args.where.date.gte).toBeInstanceOf(Date);
    expect(args.orderBy).toEqual([{ amount: 'desc' }, { id: 'desc' }]);
    expect(args.include).toBeDefined(); // FULL_INCLUDE كما هو
  });
});

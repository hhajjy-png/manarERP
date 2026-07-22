import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation v1 — فرز خادمي عبر القائمة البيضاء.
 * العملاء = النموذج المرجعي لمسار BaseRepository (القائمة البيضاء في الخدمة،
 * والترتيب يمرّ عبر findMany الموروثة).
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    customer: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { customersService } from '../customers.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.customer.findMany.mockResolvedValue([]);
  mp.customer.count.mockResolvedValue(0);
});

function findManyArgs() {
  return mp.customer.findMany.mock.calls[0][0];
}

describe('customers.list — server-side sorting', () => {
  it('no sort params → historical default ordering (id desc) unchanged', async () => {
    await customersService.list({});
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('ascending sort on a whitelisted column + stable id tiebreaker', async () => {
    await customersService.list({ sortBy: 'name', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });

  it('descending sort', async () => {
    await customersService.list({ sortBy: 'code', sortDir: 'desc' });
    expect(findManyArgs().orderBy).toEqual([{ code: 'desc' }, { id: 'desc' }]);
  });

  it('nullable column sorts with nulls last', async () => {
    await customersService.list({ sortBy: 'contactName', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([
      { contactName: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('non-whitelisted sortBy is rejected → default ordering (security boundary)', async () => {
    await customersService.list({ sortBy: 'isArchived', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('sort composes with search + type filter + pagination without touching them', async () => {
    await customersService.list({ search: 'منار', type: 'GOVERNMENT', page: 2, pageSize: 15, sortBy: 'name', sortDir: 'asc' });
    const args = findManyArgs();
    expect(args.where.type).toBe('GOVERNMENT');
    expect(args.where.OR).toHaveLength(5); // + nameEn (Business Dictionary Expansion Pack v1)
    expect(args.where.isArchived).toBe(false); // فلتر الأرشفة الافتراضي محفوظ
    expect(args.skip).toBe(15);
    expect(args.take).toBe(15);
    expect(args.orderBy).toEqual([{ name: 'asc' }, { id: 'desc' }]);
    // count يستخدم نفس الشرط — الإجمالي يطابق الصفوف المعروضة
    expect(mp.customer.count.mock.calls[0][0].where).toEqual(args.where);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation v1 — الموظفون: أكبر قائمة بيضاء، وحالتها
 * المميّزة أعمدة تواريخ الوثائق الاختيارية كلها → nulls آخرًا كي لا تتصدّر
 * الخلايا الفارغة العرض التصاعدي.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { EmployeesService } from '../employees.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;
const service = new EmployeesService();

beforeEach(() => {
  vi.resetAllMocks();
  mp.employee.findMany.mockResolvedValue([]);
  mp.employee.count.mockResolvedValue(0);
});

function findManyArgs() {
  return mp.employee.findMany.mock.calls[0][0];
}

describe('employees.list — server-side sorting', () => {
  it('no sort params → historical default (id desc)', async () => {
    await service.list({});
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('nullable document-expiry date sorts nulls-last', async () => {
    await service.list({ sortBy: 'residencyExpiry', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([
      { residencyExpiry: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('non-null scalar (salary) sorts plainly', async () => {
    await service.list({ sortBy: 'salary', sortDir: 'desc' });
    expect(findManyArgs().orderBy).toEqual([{ salary: 'desc' }, { id: 'desc' }]);
  });

  it('columns outside the approved matrix (passportNumber) are rejected → default', async () => {
    await service.list({ sortBy: 'passportNumber', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('employee code (الرقم الوظيفي) sorts NUMERICALLY, not lexically', async () => {
    // Lexical DB order would give 1,10,11,2. The full set is sorted in memory
    // with the numeric collator, then the page is sliced.
    mp.employee.findMany.mockResolvedValue([
      { id: 1, code: '10' }, { id: 2, code: '2' }, { id: 3, code: '1' }, { id: 4, code: '11' },
    ]);
    mp.employee.count.mockResolvedValue(4);

    const asc = await service.list({ sortBy: 'code', sortDir: 'asc' });
    expect((asc.data as unknown as Array<{ code: string }>).map((r) => r.code)).toEqual(['1', '2', '10', '11']);
  });

  it('employee code descending is the exact reverse (12,11,10,…,2,1)', async () => {
    mp.employee.findMany.mockResolvedValue([
      { id: 1, code: '2' }, { id: 2, code: '11' }, { id: 3, code: '1' }, { id: 4, code: '10' },
    ]);
    mp.employee.count.mockResolvedValue(4);

    const desc = await service.list({ sortBy: 'code', sortDir: 'desc' });
    expect((desc.data as unknown as Array<{ code: string }>).map((r) => r.code)).toEqual(['11', '10', '2', '1']);
  });

  it('code sort fetches the FULL filtered set (no DB skip/take) before paging', async () => {
    mp.employee.findMany.mockResolvedValue([{ id: 1, code: '1' }]);
    mp.employee.count.mockResolvedValue(1);

    await service.list({ sortBy: 'code', sortDir: 'asc' });
    const args = findManyArgs();
    expect(args.skip).toBeUndefined(); // full set — the in-memory numeric sort owns the order
    expect(args.take).toBeUndefined();
  });

  it('search + status filter + sort compose', async () => {
    await service.list({ search: 'أحمد', status: 'ACTIVE', sortBy: 'hireDate', sortDir: 'desc' });
    const args = findManyArgs();
    expect(args.where.status).toBe('ACTIVE');
    expect(args.where.OR).toHaveLength(6); // بنية البحث كما كانت
    expect(args.orderBy).toEqual([{ hireDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]);
  });
});

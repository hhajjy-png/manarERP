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

  it('search + status filter + sort compose', async () => {
    await service.list({ search: 'أحمد', status: 'ACTIVE', sortBy: 'hireDate', sortDir: 'desc' });
    const args = findManyArgs();
    expect(args.where.status).toBe('ACTIVE');
    expect(args.where.OR).toHaveLength(6); // بنية البحث كما كانت
    expect(args.orderBy).toEqual([{ hireDate: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]);
  });
});

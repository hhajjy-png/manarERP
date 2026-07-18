import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Enterprise Data Grid Foundation v1 — الموردون (بنية مطابقة للعملاء). */

vi.mock('../../../config/database', () => ({
  prisma: {
    supplier: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { SuppliersService } from '../suppliers.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;
const service = new SuppliersService();

beforeEach(() => {
  vi.resetAllMocks();
  mp.supplier.findMany.mockResolvedValue([]);
  mp.supplier.count.mockResolvedValue(0);
});

describe('suppliers.list — server-side sorting', () => {
  it('no sort params → historical default (id desc)', async () => {
    await service.list({});
    expect(mp.supplier.findMany.mock.calls[0][0].orderBy).toEqual([{ id: 'desc' }]);
  });

  it('name ascending + archive filter untouched', async () => {
    await service.list({ sortBy: 'name', sortDir: 'asc' });
    const args = mp.supplier.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ name: 'asc' }, { id: 'desc' }]);
    expect(args.where.isArchived).toBe(false);
  });

  it('non-whitelisted key rejected → default', async () => {
    await service.list({ sortBy: 'email', sortDir: 'asc' });
    expect(mp.supplier.findMany.mock.calls[0][0].orderBy).toEqual([{ id: 'desc' }]);
  });
});

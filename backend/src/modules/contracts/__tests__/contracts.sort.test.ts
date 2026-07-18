import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation v1 — العقود: الحالة المرجعية لفرز عمود علاقة
 * (customerName → customer.name) عبر القائمة البيضاء.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    contract: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { contractsService } from '../contracts.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.contract.findMany.mockResolvedValue([]);
  mp.contract.count.mockResolvedValue(0);
});

function findManyArgs() {
  return mp.contract.findMany.mock.calls[0][0];
}

describe('contracts.list — server-side sorting', () => {
  it('no sort params → historical default (id desc) with relations include intact', async () => {
    await contractsService.list({});
    const args = findManyArgs();
    expect(args.orderBy).toEqual([{ id: 'desc' }]);
    expect(args.include.customer).toBeDefined(); // include لم يتأثر
  });

  it('relation column customerName → orderBy on customer.name', async () => {
    await contractsService.list({ sortBy: 'customerName', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ customer: { name: 'asc' } }, { id: 'desc' }]);
  });

  it('nullable scalar (price) → nulls last', async () => {
    await contractsService.list({ sortBy: 'price', sortDir: 'desc' });
    expect(findManyArgs().orderBy).toEqual([
      { price: { sort: 'desc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('non-whitelisted key (managerId) rejected → default', async () => {
    await contractsService.list({ sortBy: 'managerId', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('status filter + sort compose', async () => {
    await contractsService.list({ status: 'ACTIVE', sortBy: 'monthlyTransportValue', sortDir: 'desc' });
    const args = findManyArgs();
    expect(args.where.status).toBe('ACTIVE');
    expect(args.orderBy).toEqual([{ monthlyTransportValue: 'desc' }, { id: 'desc' }]);
  });
});

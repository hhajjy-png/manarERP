import { describe, it, expect, vi, beforeEach } from 'vitest';

// Bug C4 regression: a goods receipt is an ASSET acquisition, not an operating expense.
// It must NOT post a legacy transaction of type 'EXPENSE' (which the dashboard sums),
// otherwise buying inventory is counted as an expense — and again when it is issued
// (double-count). A material issue (consumption) is the only inventory event that is
// a genuine operating expense.

const { postEntry, clearByReference } = vi.hoisted(() => ({
  postEntry: vi.fn(),
  clearByReference: vi.fn(),
}));

vi.mock('@config/database', () => {
  const tx = {
    material: { findUnique: vi.fn(), update: vi.fn() },
    materialIssueItem: { update: vi.fn() },
    purchaseOrder: { updateMany: vi.fn() },
    goodsReceipt: { update: vi.fn() },
    materialIssue: { update: vi.fn() },
  };
  return {
    prisma: {
      goodsReceipt: { findUnique: vi.fn() },
      materialIssue: { findUnique: vi.fn() },
      $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)),
      __tx: tx,
    },
  };
});
vi.mock('@core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('@modules/transactions/transactions.service', () => ({
  transactionsService: { postEntry, clearByReference },
}));

import { prisma } from '@config/database';
import { goodsReceiptsService, materialIssuesService } from '../inventory.service';

const tx = (prisma as unknown as { __tx: any }).__tx;
const fakeReq = {} as import('express').Request;

beforeEach(() => {
  vi.clearAllMocks();
  postEntry.mockResolvedValue({ id: 999 });
  tx.material.findUnique.mockResolvedValue({ id: 1, name: 'اسمنت', currentStock: 100, unitCost: 5 });
  tx.material.update.mockResolvedValue({});
  tx.materialIssueItem.update.mockResolvedValue({});
  tx.purchaseOrder.updateMany.mockResolvedValue({});
  tx.goodsReceipt.update.mockResolvedValue({ id: 1, status: 'POSTED' });
  tx.materialIssue.update.mockResolvedValue({ id: 1, status: 'POSTED' });
});

describe('GoodsReceiptsService.post — accounting type (bug C4)', () => {
  beforeEach(() => {
    vi.mocked(prisma.goodsReceipt.findUnique).mockResolvedValue({
      id: 1, number: 'GR-2026-0001', date: new Date('2026-06-10'),
      status: 'DRAFT', accountingTransactionId: null, purchaseOrderId: null,
      totalCost: 50,
      items: [{ materialId: 1, quantity: 10, unitCost: 5 }],
    } as any);
  });

  it('posts the goods receipt as TRANSFER — never EXPENSE', async () => {
    await goodsReceiptsService.post(1, fakeReq);

    expect(postEntry).toHaveBeenCalledOnce();
    const entryArg = postEntry.mock.calls[0][0];
    expect(entryArg.type).toBe('TRANSFER');
    expect(entryArg.type).not.toBe('EXPENSE');
    expect(entryArg.referenceType).toBe('GOODS_RECEIPT');
    expect(entryArg.debit).toBe(50);
  });

  it('the receipt entry is therefore excluded from the dashboard EXPENSE aggregate (which sums type:EXPENSE only)', async () => {
    await goodsReceiptsService.post(1, fakeReq);
    const entryArg = postEntry.mock.calls[0][0];
    // dashboard.service aggregates prisma.transaction where type === 'EXPENSE'
    expect(entryArg.type === 'EXPENSE').toBe(false);
  });
});

describe('MaterialIssuesService.post — accounting type (bug C4)', () => {
  beforeEach(() => {
    vi.mocked(prisma.materialIssue.findUnique).mockResolvedValue({
      id: 1, number: 'MI-2026-0001', date: new Date('2026-06-15'),
      status: 'DRAFT', accountingTransactionId: null, contract: null,
      items: [{ id: 11, materialId: 1, quantity: 10 }],
    } as any);
  });

  it('posts the material issue (consumption) as EXPENSE — this is the only inventory event that is an operating expense', async () => {
    await materialIssuesService.post(1, fakeReq);

    expect(postEntry).toHaveBeenCalledOnce();
    const entryArg = postEntry.mock.calls[0][0];
    expect(entryArg.type).toBe('EXPENSE');
    expect(entryArg.referenceType).toBe('MATERIAL_ISSUE');
  });
});

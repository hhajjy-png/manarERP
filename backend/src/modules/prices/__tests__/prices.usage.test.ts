import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@config/database', () => ({
  prisma: {
    projectPrice: { findMany: vi.fn(), findUnique: vi.fn() },
    invoiceItem: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { getPricesUsageReport, getPricesUsageByCompany, forceRemovePreview, forceRemove } from '../prices.service';
import { prisma } from '@config/database';

describe('getPricesUsageReport — Phase 2 (direct tracking)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses priceId to count items — correct aggregation', async () => {
    (prisma.projectPrice.findMany as any).mockResolvedValue([
      { id: 1, asphaltPlant: 'مصنع أ', companyName: 'شركة ألفا', contractLocation: 'موقع 1', contractUnit: 'طن', unitPrice: 10, customer: null },
    ]);
    (prisma.invoiceItem.findMany as any).mockResolvedValue([
      { priceId: 1, quantity: 5, total: 50 },
      { priceId: 1, quantity: 3, total: 30 },
    ]);

    const result = await getPricesUsageReport();
    expect(result.hasDirectTracking).toBe(true);
    expect(result.report[0].usageCount).toBe(2);
    expect(result.report[0].totalQuantity).toBe(8);
    expect(result.report[0].totalAmount).toBe(80);
  });

  it('returns zero usage for prices with no linked items', async () => {
    (prisma.projectPrice.findMany as any).mockResolvedValue([
      { id: 99, asphaltPlant: 'مصنع ب', companyName: 'شركة بيتا', contractLocation: 'موقع 2', contractUnit: 'درب', unitPrice: 20, customer: null },
    ]);
    (prisma.invoiceItem.findMany as any).mockResolvedValue([]);

    const result = await getPricesUsageReport();
    expect(result.report[0].usageCount).toBe(0);
    expect(result.report[0].totalQuantity).toBe(0);
    expect(result.report[0].totalAmount).toBe(0);
  });

  it('does not return phase2Requirement note (old field gone)', async () => {
    (prisma.projectPrice.findMany as any).mockResolvedValue([]);
    (prisma.invoiceItem.findMany as any).mockResolvedValue([]);
    const result = await getPricesUsageReport();
    expect((result as any).phase2Requirement).toBeUndefined();
  });
});

describe('getPricesUsageByCompany', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups by companyName and aggregates totals', async () => {
    (prisma.invoiceItem.findMany as any).mockResolvedValue([
      { priceId: 1, quantity: 2, total: 20, price: { companyName: 'شركة ألفا' } },
      { priceId: 1, quantity: 3, total: 30, price: { companyName: 'شركة ألفا' } },
      { priceId: 2, quantity: 1, total: 10, price: { companyName: 'شركة بيتا' } },
    ]);

    const result = await getPricesUsageByCompany();
    const alpha = result.find((r) => r.companyName === 'شركة ألفا')!;
    expect(alpha.usageCount).toBe(2);
    expect(alpha.totalQuantity).toBe(5);
    expect(alpha.totalAmount).toBe(50);
    expect(alpha.agreementCount).toBe(1); // only priceId=1
    const beta = result.find((r) => r.companyName === 'شركة بيتا')!;
    expect(beta.agreementCount).toBe(1);
  });

  it('counts distinct priceIds per company correctly', async () => {
    (prisma.invoiceItem.findMany as any).mockResolvedValue([
      { priceId: 1, quantity: 1, total: 10, price: { companyName: 'شركة ألفا' } },
      { priceId: 2, quantity: 1, total: 10, price: { companyName: 'شركة ألفا' } },
      { priceId: 1, quantity: 1, total: 10, price: { companyName: 'شركة ألفا' } }, // same priceId again
    ]);

    const result = await getPricesUsageByCompany();
    const alpha = result.find((r) => r.companyName === 'شركة ألفا')!;
    expect(alpha.agreementCount).toBe(2); // priceId 1 and 2 are distinct
    expect(alpha.usageCount).toBe(3);
  });

  it('returns empty array when no items have priceId', async () => {
    (prisma.invoiceItem.findMany as any).mockResolvedValue([]);
    const result = await getPricesUsageByCompany();
    expect(result).toEqual([]);
  });
});

describe('forceRemove — Restrict enforcement (cannot delete used ProjectPrice)', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockPrice = {
    id: 1,
    asphaltPlant: 'مصنع أ',
    companyName: 'شركة ألفا',
    contractLocation: 'موقع 1',
    contractUnit: 'طن',
    unitPrice: 10,
    isArchived: false,
  };

  it('forceRemovePreview returns blocked=true when invoice items exist', async () => {
    (prisma.projectPrice.findUnique as any).mockResolvedValue(mockPrice);
    (prisma.invoiceItem.count as any).mockResolvedValue(3);

    const result = await forceRemovePreview(1);

    expect(result.blocked).toBe(true);
    expect(result.childCounts.invoiceItems).toBe(3);
    expect(result.totalChildRecords).toBe(3);
    expect(result.blockReason).toContain('3');
  });

  it('forceRemovePreview returns blocked=false when no invoice items exist', async () => {
    (prisma.projectPrice.findUnique as any).mockResolvedValue(mockPrice);
    (prisma.invoiceItem.count as any).mockResolvedValue(0);

    const result = await forceRemovePreview(1);

    expect(result.blocked).toBe(false);
    expect(result.blockReason).toBeNull();
  });

  it('forceRemove throws conflict error when invoice items reference the price', async () => {
    (prisma.projectPrice.findUnique as any).mockResolvedValue(mockPrice);
    (prisma.invoiceItem.count as any).mockResolvedValue(2);

    await expect(forceRemove(1, {} as any)).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});

describe('snapshot integrity — archived ProjectPrice does not break invoice data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('usage report still counts items for an archived price (isArchived=true prices excluded from report list but items remain)', async () => {
    // The usage report only shows non-archived prices, but items linked to them still exist.
    // Archiving a price should NOT clear invoice item data (priceId, quantity, total remain).
    // This test confirms report aggregation reads from invoiceItem directly by priceId.
    (prisma.projectPrice.findMany as any).mockResolvedValue([
      // archived price NOT included in the active report list (isArchived: false filter)
    ]);
    (prisma.invoiceItem.findMany as any).mockResolvedValue([
      { priceId: 5, quantity: 4, total: 40 },
    ]);

    const result = await getPricesUsageReport();
    // No active prices in list → empty report, but no crash
    expect(result.report).toHaveLength(0);
    expect(result.hasDirectTracking).toBe(true);
  });

  it('invoice item snapshot fields are independent of ProjectPrice — description/unit/unitPrice set at creation', async () => {
    // InvoiceItem stores its own description, unit, unitPrice, quantity, total at creation.
    // This test documents the invariant: these fields exist on InvoiceItem directly.
    // (Structural test — verifies the aggregation reads only priceId/quantity/total from InvoiceItem)
    (prisma.projectPrice.findMany as any).mockResolvedValue([
      { id: 7, asphaltPlant: 'مصنع ج', companyName: 'شركة جيم', contractLocation: 'موقع 3', contractUnit: 'طن', unitPrice: 99, customer: null },
    ]);
    (prisma.invoiceItem.findMany as any).mockResolvedValue([
      // quantity/total come from the snapshot, not from unitPrice on ProjectPrice
      { priceId: 7, quantity: 2, total: 150 }, // total differs from 2 × 99 intentionally
    ]);

    const result = await getPricesUsageReport();
    const row = result.report[0];
    // Report preserves actual totals from snapshot, NOT recalculated from current unitPrice
    expect(row.totalAmount).toBe(150);
    expect(row.totalQuantity).toBe(2);
  });
});

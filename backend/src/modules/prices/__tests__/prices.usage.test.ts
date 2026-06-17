import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@config/database', () => ({
  prisma: {
    projectPrice: { findMany: vi.fn() },
    invoiceItem: { findMany: vi.fn() },
  },
}));

import { getPricesUsageReport, getPricesUsageByCompany } from '../prices.service';
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

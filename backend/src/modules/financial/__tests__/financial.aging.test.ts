import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing service
vi.mock('../../../config/database', () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));

import { FinancialService } from '../financial.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  customer: { findMany: ReturnType<typeof vi.fn> };
  supplier: { findMany: ReturnType<typeof vi.fn> };
};

const TODAY = new Date('2025-06-01T00:00:00.000Z');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCustomer(id: number, invoices: { dueDate?: Date; issueDate?: Date; total: number; paidAmount: number }[]) {
  return {
    id, code: `C00${id}`, name: `Customer ${id}`,
    invoices: invoices.map((inv, i) => ({
      id: i + 1,
      dueDate:   inv.dueDate ?? null,
      issueDate: inv.issueDate ?? new Date('2025-01-01'),
      total:     inv.total,
      paidAmount: inv.paidAmount,
    })),
  };
}

function makeSupplier(id: number, invoices: { dueDate?: Date; issueDate?: Date; total: number; paidAmount: number }[]) {
  return {
    id, code: `S00${id}`, name: `Supplier ${id}`,
    invoices: invoices.map((inv, i) => ({
      id: i + 1,
      dueDate:   inv.dueDate ?? null,
      issueDate: inv.issueDate ?? new Date('2025-01-01'),
      total:     inv.total,
      paidAmount: inv.paidAmount,
    })),
  };
}

describe('FinancialService.getArAging', () => {
  let service: FinancialService;

  beforeEach(() => {
    service = new FinancialService();
    vi.clearAllMocks();
  });

  it('returns reportType ar-aging', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.reportType).toBe('ar-aging');
  });

  it('assigns 0-30 day overdue invoice to 0_30 bucket', async () => {
    // Due May 20 → 12 days overdue on June 1 → 0_30
    const customer = makeCustomer(1, [{ dueDate: new Date('2025-05-20'), total: 300, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['0_30']).toBe(300);
    expect(result.rows[0].total).toBe(300);
  });

  it('assigns over-120-day invoice to over_120 bucket', async () => {
    // Due Jan 1 → 151 days overdue on June 1 → over_120
    const customer = makeCustomer(1, [{ dueDate: new Date('2025-01-01'), total: 1000, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].over_120).toBe(1000);
  });

  it('uses issueDate as fallback when dueDate is null', async () => {
    // issueDate April 1 → 61 days overdue on June 1 → 61_90
    const customer = makeCustomer(1, [{ dueDate: undefined, issueDate: new Date('2025-04-01'), total: 200, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['61_90']).toBe(200);
  });

  it('excludes fully paid invoices from buckets', async () => {
    const customer = makeCustomer(1, [
      { dueDate: new Date('2025-05-01'), total: 500, paidAmount: 500 }, // fully paid
      { dueDate: new Date('2025-05-01'), total: 300, paidAmount: 0 },   // unpaid
    ]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].total).toBe(300); // only unpaid
  });

  it('excludes partially paid amount from outstanding', async () => {
    const customer = makeCustomer(1, [{ dueDate: new Date('2025-05-20'), total: 500, paidAmount: 200 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['0_30']).toBe(300); // 500 - 200
  });

  it('hides customers with zero outstanding when hideZero is true', async () => {
    const c1 = makeCustomer(1, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 100 }]); // paid
    const c2 = makeCustomer(2, [{ dueDate: new Date('2025-05-01'), total: 200, paidAmount: 0 }]);   // unpaid
    mockPrisma.customer.findMany.mockResolvedValue([c1, c2]);
    const result = await service.getArAging({ asOfDate: '2025-06-01', hideZero: true });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customerId).toBe(2);
  });

  it('keeps zero-total customers when hideZero is false', async () => {
    const c1 = makeCustomer(1, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 100 }]);
    mockPrisma.customer.findMany.mockResolvedValue([c1]);
    const result = await service.getArAging({ asOfDate: '2025-06-01', hideZero: false });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].total).toBe(0);
  });

  it('computes criticalOver90 as sum of 91_120 + over_120', async () => {
    const customer = makeCustomer(1, [
      { dueDate: new Date('2024-12-01'), total: 500, paidAmount: 0 }, // over 120
      { dueDate: new Date('2025-01-20'), total: 200, paidAmount: 0 }, // 91-120
    ]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.summary.criticalOver90).toBe(result.rows[0].over_120 + result.rows[0]['91_120']);
  });

  it('builds correct row id and entity fields', async () => {
    const customer = makeCustomer(5, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].id).toBe('AR-5');
    expect(result.rows[0].customerCode).toBe('C005');
    expect(result.rows[0].customerId).toBe(5);
  });
});

describe('FinancialService.getApAging', () => {
  let service: FinancialService;

  beforeEach(() => {
    service = new FinancialService();
    vi.clearAllMocks();
  });

  it('returns reportType ap-aging', async () => {
    mockPrisma.supplier.findMany.mockResolvedValue([]);
    const result = await service.getApAging({ asOfDate: '2025-06-01' });
    expect(result.reportType).toBe('ap-aging');
  });

  it('assigns overdue AP invoice to correct bucket', async () => {
    // Due March 1 → 92 days overdue on June 1 → 91_120
    const supplier = makeSupplier(1, [{ dueDate: new Date('2025-03-01'), total: 400, paidAmount: 0 }]);
    mockPrisma.supplier.findMany.mockResolvedValue([supplier]);
    const result = await service.getApAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['91_120']).toBe(400);
  });

  it('excludes fully paid purchase invoices', async () => {
    const supplier = makeSupplier(1, [
      { dueDate: new Date('2025-05-01'), total: 800, paidAmount: 800 },
    ]);
    mockPrisma.supplier.findMany.mockResolvedValue([supplier]);
    const result = await service.getApAging({ asOfDate: '2025-06-01', hideZero: true });
    expect(result.rows).toHaveLength(0);
  });

  it('builds correct row id and supplier fields', async () => {
    const supplier = makeSupplier(3, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 0 }]);
    mockPrisma.supplier.findMany.mockResolvedValue([supplier]);
    const result = await service.getApAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].id).toBe('AP-3');
    expect(result.rows[0].supplierCode).toBe('S003');
    expect(result.rows[0].supplierId).toBe(3);
  });

  it('passes search filter through to Prisma query', async () => {
    mockPrisma.supplier.findMany.mockResolvedValue([]);
    await service.getApAging({ search: 'طرق' });
    const callArg = mockPrisma.supplier.findMany.mock.calls[0][0];
    expect(callArg.where.OR).toBeDefined();
    expect(callArg.where.OR[0].name.contains).toBe('طرق');
  });
});

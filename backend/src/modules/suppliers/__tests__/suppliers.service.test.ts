import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

vi.mock('../../../config/database', () => ({
  prisma: {
    supplier: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    invoice: { findFirst: vi.fn() },
    expense: { findFirst: vi.fn() },
    purchaseOrder: { count: vi.fn(), deleteMany: vi.fn() },
    goodsReceipt: { count: vi.fn(), deleteMany: vi.fn() },
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { SuppliersService } from '../suppliers.service';
import { prisma } from '../../../config/database';

type MockPrisma = {
  supplier: { findUnique: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
  invoice: { findFirst: ReturnType<typeof vi.fn> };
  expense: { findFirst: ReturnType<typeof vi.fn> };
  purchaseOrder: { count: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
  goodsReceipt: { count: ReturnType<typeof vi.fn>; deleteMany: ReturnType<typeof vi.fn> };
};

const mock = prisma as unknown as MockPrisma;
const fakeReq = {} as import('express').Request;

// Helper: build a supplier findUnique result that satisfies findWithCounts
function supplierWith(invoices: number, expenses: number) {
  return {
    id: 1,
    name: 'مورد الاختبار',
    code: 'S-001',
    _count: { invoices, expenses },
  };
}

describe('SuppliersService.remove — rich conflict messages', () => {
  let service: SuppliersService;

  beforeEach(() => {
    service = new SuppliersService();
    vi.clearAllMocks();
    // Default: no purchase orders or goods receipts (used by getChildCounts / forceRemove)
    mock.purchaseOrder.count.mockResolvedValue(0);
    mock.goodsReceipt.count.mockResolvedValue(0);
  });

  it('throws notFound when supplier does not exist', async () => {
    mock.supplier.findUnique.mockResolvedValue(null);
    await expect(service.remove(999, fakeReq)).rejects.toThrow('المورّد غير موجود');
  });

  it('mentions invoice number when supplier has one invoice', async () => {
    mock.supplier.findUnique.mockResolvedValue(supplierWith(1, 0));
    mock.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'PINV-2025-00001' });
    mock.expense.findFirst.mockResolvedValue(null);

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('PINV-2025-00001');
    expect((err as Error).message).not.toContain('فاتورة أخرى');
  });

  it('mentions first invoice number + remaining count when multiple invoices', async () => {
    mock.supplier.findUnique.mockResolvedValue(supplierWith(3, 0));
    mock.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'PINV-2025-00001' });
    mock.expense.findFirst.mockResolvedValue(null);

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('PINV-2025-00001');
    expect((err as Error).message).toContain('2 فاتورة أخرى');
  });

  it('mentions expense code when supplier has expenses but no invoices', async () => {
    mock.supplier.findUnique.mockResolvedValue(supplierWith(0, 1));
    mock.invoice.findFirst.mockResolvedValue(null);
    mock.expense.findFirst.mockResolvedValue({ code: 'EXP-2025-00001' });

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('EXP-2025-00001');
    expect((err as Error).message).not.toContain('مصروف آخر');
  });

  it('mentions both invoice and expense references when both exist', async () => {
    mock.supplier.findUnique.mockResolvedValue(supplierWith(2, 3));
    mock.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'PINV-2025-00001' });
    mock.expense.findFirst.mockResolvedValue({ code: 'EXP-2025-00001' });

    const err = await service.remove(1, fakeReq).catch((e: unknown) => e);
    expect((err as Error).message).toContain('PINV-2025-00001');
    expect((err as Error).message).toContain('EXP-2025-00001');
  });

  it('returns { deleted: true } when supplier has no linked records', async () => {
    mock.supplier.findUnique.mockResolvedValue(supplierWith(0, 0));
    mock.supplier.delete.mockResolvedValue({ id: 1 });

    const result = await service.remove(1, fakeReq);
    expect(result).toEqual({ deleted: true });
  });

  it('conflict error has statusCode 409', async () => {
    mock.supplier.findUnique.mockResolvedValue(supplierWith(1, 0));
    mock.invoice.findFirst.mockResolvedValue({ invoiceNumber: 'PINV-2025-00001' });
    mock.expense.findFirst.mockResolvedValue(null);

    let err: AppError | undefined;
    try { await service.remove(1, fakeReq); } catch (e) { err = e as AppError; }
    expect(err?.statusCode).toBe(409);
  });
});

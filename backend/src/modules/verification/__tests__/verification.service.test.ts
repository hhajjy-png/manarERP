import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: {
      findFirst: vi.fn(),
    },
  },
}));

import { verifyByUuid } from '../verification.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  invoice: { findFirst: ReturnType<typeof vi.fn> };
};

const baseInvoice = {
  invoiceNumber: 'INV-2026-00001',
  status: 'PAID',
  issueDate: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-15T00:00:00.000Z'),
};

describe('verifyByUuid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns { found: false } when no invoice matches the uuid', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    const result = await verifyByUuid('nonexistent-uuid');
    expect(result).toEqual({ found: false });
  });

  it('returns found: true with all required fields when invoice exists', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice);
    const result = await verifyByUuid('valid-uuid');
    expect(result.found).toBe(true);
    expect(result).toHaveProperty('documentType');
    expect(result).toHaveProperty('documentNumber');
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('statusAr');
    expect(result).toHaveProperty('issueDate');
    expect(result).toHaveProperty('updatedAt');
    expect(result).toHaveProperty('isCancelled');
    expect(result).toHaveProperty('isApproved');
  });

  it('documentType is always invoice', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice);
    const result = await verifyByUuid('valid-uuid');
    expect(result.documentType).toBe('invoice');
  });

  it('documentNumber matches invoice.invoiceNumber', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice);
    const result = await verifyByUuid('valid-uuid');
    expect(result.documentNumber).toBe('INV-2026-00001');
  });

  it('statusAr maps PAID to مسددة', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseInvoice, status: 'PAID' });
    const result = await verifyByUuid('valid-uuid');
    expect(result.statusAr).toBe('مسددة');
  });

  it('statusAr maps UNPAID to غير مسددة', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseInvoice, status: 'UNPAID' });
    const result = await verifyByUuid('valid-uuid');
    expect(result.statusAr).toBe('غير مسددة');
  });

  it('statusAr maps CANCELLED to ملغاة', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseInvoice, status: 'CANCELLED' });
    const result = await verifyByUuid('valid-uuid');
    expect(result.statusAr).toBe('ملغاة');
  });

  it('isCancelled is true when status is CANCELLED', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseInvoice, status: 'CANCELLED' });
    const result = await verifyByUuid('valid-uuid');
    expect(result.isCancelled).toBe(true);
  });

  it('isCancelled is false when status is PAID', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseInvoice, status: 'PAID' });
    const result = await verifyByUuid('valid-uuid');
    expect(result.isCancelled).toBe(false);
  });

  it('isApproved is false when status is DRAFT', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseInvoice, status: 'DRAFT' });
    const result = await verifyByUuid('valid-uuid');
    expect(result.isApproved).toBe(false);
  });

  it('response does not include financial or personal fields', async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice);
    const result = await verifyByUuid('valid-uuid');
    expect(result).not.toHaveProperty('total');
    expect(result).not.toHaveProperty('paidAmount');
    expect(result).not.toHaveProperty('customerId');
    expect(result).not.toHaveProperty('supplierId');
    expect(result).not.toHaveProperty('customerName');
    expect(result).not.toHaveProperty('supplierName');
  });
});

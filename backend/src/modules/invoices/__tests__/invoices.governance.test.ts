import { describe, it, expect, vi, beforeEach } from 'vitest';

// Paid Invoice Edit Governance — a fully-paid (PAID) invoice is read-only via the
// normal edit path. This is a REAL server guard (not UI-only): invoices.service.update()
// must reject a PAID invoice before touching items/journals. Collection-date correction
// has its own dedicated SYSTEM_ADMIN endpoint and is NOT affected by this guard.

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
    // Sentinel: proves an *editable* invoice passes the guards and reaches the write path.
    $transaction: vi.fn(async () => {
      throw new Error('__REACHED_TRANSACTION__');
    }),
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { invoicesService } from '../invoices.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const findUnique = prisma.invoice.findUnique as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const $transaction = prisma.$transaction as any;
const fakeReq = { user: { userId: 1 } } as unknown as import('express').Request;

// One line item (500) so computeTotals yields total = 500 (≥ any paidAmount used below).
const baseInvoice = {
  id: 1,
  number: 1,
  invoiceNumber: 'MN-INV-2026-00050',
  direction: 'SALES',
  customerId: 5,
  supplierId: null,
  contractId: null,
  invoiceType: 'CLAIM',
  issueDate: new Date('2026-06-01'),
  dueDate: null,
  deliveryDate: null,
  billingMonth: null,
  billingYear: null,
  taxRate: 0,
  discount: 0,
  paidAmount: 0,
  status: 'UNPAID',
  items: [{ description: 'بند', quantity: 1, unit: 'درب', unitPrice: 500, priceId: null }],
};

describe('invoicesService.update — paid invoice edit governance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws notFound when the invoice does not exist', async () => {
    findUnique.mockResolvedValue(null);
    await expect(invoicesService.update(999, {}, fakeReq)).rejects.toThrow('الفاتورة غير موجودة');
  });

  it('BLOCKS editing a fully-paid (PAID) invoice — read-only via the normal path', async () => {
    findUnique.mockResolvedValue({ ...baseInvoice, status: 'PAID', paidAmount: 500 });
    await expect(invoicesService.update(1, { notes: 'x' }, fakeReq))
      .rejects.toThrow('لا يمكن تعديل فاتورة مسددة بالكامل');
    // The guard fires before any write — the transaction is never entered.
    expect($transaction).not.toHaveBeenCalled();
  });

  it('BLOCKS editing a CANCELLED invoice (regression — existing guard preserved)', async () => {
    findUnique.mockResolvedValue({ ...baseInvoice, status: 'CANCELLED' });
    await expect(invoicesService.update(1, { notes: 'x' }, fakeReq))
      .rejects.toThrow('لا يمكن تعديل فاتورة ملغاة');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('ALLOWS editing an UNPAID invoice — reaches the write path (not blocked by the paid guard)', async () => {
    findUnique.mockResolvedValue({ ...baseInvoice, status: 'UNPAID', paidAmount: 0 });
    // Proceeds past all guards into the transaction (sentinel), i.e. edit is permitted.
    await expect(invoicesService.update(1, { notes: 'x' }, fakeReq)).rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('ALLOWS editing a PARTIALLY-paid invoice — not blocked by the paid guard', async () => {
    findUnique.mockResolvedValue({ ...baseInvoice, status: 'PARTIAL', paidAmount: 100 });
    await expect(invoicesService.update(1, { notes: 'x' }, fakeReq)).rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });
});

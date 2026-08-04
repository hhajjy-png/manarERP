import { describe, it, expect, vi, beforeEach } from 'vitest';

// Accounting Period Validation Pack — Invoice.issueDate must fall within
// billingMonth/billingYear on both create and update. The shared validator
// (assertDateWithinBillingPeriod) must fire BEFORE prisma.$transaction is
// entered, so an invalid save never touches the database.

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findUnique: vi.fn() },
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

const baseItems = [{ description: 'بند', quantity: 1, unit: 'قطعة', unitPrice: 100, priceId: null }];

const baseCreateInput = {
  invoiceNumber: 'MN-INV-2026-00099',
  direction: 'SALES',
  invoiceType: 'CLAIM',
  customerId: 5,
  items: baseItems,
  taxRate: 0,
  discount: 0,
} as unknown as import('../invoices.schema').CreateInvoiceInput;

const baseInvoice = {
  id: 1,
  invoiceNumber: 'MN-INV-2026-00050',
  direction: 'SALES',
  customerId: 5,
  supplierId: null,
  contractId: null,
  invoiceType: 'CLAIM',
  issueDate: new Date(2026, 6, 15),
  dueDate: null,
  deliveryDate: null,
  billingMonth: 7,
  billingYear: 2026,
  taxRate: 0,
  discount: 0,
  paidAmount: 0,
  status: 'UNPAID',
  items: baseItems,
};

describe('invoicesService.create — accounting period validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks creating an invoice whose issueDate falls outside billingMonth/billingYear', async () => {
    const input = { ...baseCreateInput, issueDate: new Date(2026, 5, 30), billingMonth: 7, billingYear: 2026 };
    await expect(invoicesService.create(input, fakeReq)).rejects.toThrow('لا يمكن حفظ المستند');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('allows creating an invoice whose issueDate falls inside billingMonth/billingYear (reaches the write path)', async () => {
    const input = { ...baseCreateInput, issueDate: new Date(2026, 6, 15), billingMonth: 7, billingYear: 2026 };
    await expect(invoicesService.create(input, fakeReq)).rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('allows creating an invoice with no billingMonth/billingYear set at all', async () => {
    const input = { ...baseCreateInput, issueDate: new Date(2026, 6, 15) };
    await expect(invoicesService.create(input, fakeReq)).rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });
});

describe('invoicesService.update — accounting period validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('blocks moving the issueDate outside the existing billingMonth/billingYear', async () => {
    findUnique.mockResolvedValue(baseInvoice);
    await expect(invoicesService.update(1, { issueDate: new Date(2026, 7, 1) }, fakeReq))
      .rejects.toThrow('لا يمكن حفظ المستند');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('blocks moving billingMonth away from the existing (unchanged) issueDate', async () => {
    findUnique.mockResolvedValue(baseInvoice);
    await expect(invoicesService.update(1, { billingMonth: 6 }, fakeReq))
      .rejects.toThrow('لا يمكن حفظ المستند');
    expect($transaction).not.toHaveBeenCalled();
  });

  it('allows a same-period issueDate change (reaches the write path)', async () => {
    findUnique.mockResolvedValue(baseInvoice);
    await expect(invoicesService.update(1, { issueDate: new Date(2026, 6, 20) }, fakeReq))
      .rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });

  it('allows an unrelated field update when no billingMonth/billingYear is set on the record', async () => {
    findUnique.mockResolvedValue({ ...baseInvoice, billingMonth: null, billingYear: null });
    await expect(invoicesService.update(1, { notes: 'x' }, fakeReq))
      .rejects.toThrow('__REACHED_TRANSACTION__');
    expect($transaction).toHaveBeenCalledOnce();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChequesService } from '../cheques.service';

vi.mock('../../../config/database', () => ({
  prisma: {
    cheque: { findUnique: vi.fn(), delete: vi.fn() },
    bankStatementTransaction: { count: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';

function makeCheque(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    chequeNumber: 'CHQ-001',
    chequeDate: new Date('2026-06-27'),
    beneficiaryName: 'شركة الاختبار',
    amount: 500.750,
    currency: 'KWD',
    description: 'دفعة مستحقة',
    bankName: 'NBK',
    templateName: null,
    status: 'DRAFT',
    printedAt: null,
    cancelledAt: null,
    notes: null,
    paymentVoucherNumber: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as any;
}

// A transaction client mock: forwards delete + updateMany used inside forceRemove.
function makeTx() {
  return {
    cheque: { delete: vi.fn().mockResolvedValue({}) },
    bankStatementTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  } as any;
}

const fakeReq = {} as any;

describe('ChequesService — forceRemovePreview', () => {
  const service = new ChequesService();
  beforeEach(() => vi.clearAllMocks());

  it('throws when cheque does not exist', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(null);
    await expect(service.forceRemovePreview(999)).rejects.toMatchObject({ message: 'الشيك غير موجود' });
  });

  it('returns core cheque fields with no warnings for a clean DRAFT cheque', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(0);

    const preview = await service.forceRemovePreview(1);

    expect(preview).toMatchObject({
      id: 1,
      chequeNumber: 'CHQ-001',
      beneficiaryName: 'شركة الاختبار',
      amount: 500.750,
      currency: 'KWD',
      bankName: 'NBK',
      status: 'DRAFT',
      hasPaymentVoucher: false,
      bankMatchesCount: 0,
    });
    expect(preview.warnings).toHaveLength(0);
  });

  it('warns when a payment voucher number exists', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(
      makeCheque({ status: 'PRINTED', printedAt: new Date(), paymentVoucherNumber: 'PV-000005' }),
    );
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(0);

    const preview = await service.forceRemovePreview(1);

    expect(preview.hasPaymentVoucher).toBe(true);
    expect(preview.warnings.some((w) => w.includes('PV-000005'))).toBe(true);
    expect(preview.warnings.some((w) => w.includes('مطبوع'))).toBe(true);
  });

  it('warns and counts matched bank statement transactions', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(3);

    const preview = await service.forceRemovePreview(1);

    expect(preview.bankMatchesCount).toBe(3);
    expect(preview.warnings.some((w) => w.includes('3'))).toBe(true);
    expect(prisma.bankStatementTransaction.count).toHaveBeenCalledWith({
      where: { matchedType: 'cheque', matchedId: 1 },
    });
  });

  it('warns that force delete is exceptional for an already-cancelled cheque', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'CANCELLED', cancelledAt: new Date() }));
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(0);

    const preview = await service.forceRemovePreview(1);

    expect(preview.warnings.some((w) => w.includes('ملغى'))).toBe(true);
  });
});

describe('ChequesService — forceRemove', () => {
  const service = new ChequesService();
  beforeEach(() => vi.clearAllMocks());

  it('throws when cheque does not exist', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(null);
    await expect(service.forceRemove(999, 'CHQ-001', fakeReq)).rejects.toMatchObject({ message: 'الشيك غير موجود' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a non-matching confirmation without entering the transaction', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());

    await expect(service.forceRemove(1, 'WRONG-NUMBER', fakeReq)).rejects.toMatchObject({
      message: 'يجب كتابة رقم الشيك بشكل مطابق للتأكيد',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('deletes the cheque and writes a force-delete audit on exact confirmation', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(0);
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.forceRemove(1, 'CHQ-001', fakeReq);

    expect(result).toEqual({ deleted: true });
    expect(tx.cheque.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    // No bank matches → no unmatch write
    expect(tx.bankStatementTransaction.updateMany).not.toHaveBeenCalled();
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        module: 'cheques',
        entityId: 1,
        newValue: expect.objectContaining({ forceDelete: true, chequeNumber: 'CHQ-001' }),
      }),
    );
  });

  it('unmatches referenced bank statement transactions instead of deleting them', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(2);
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.forceRemove(1, 'CHQ-001', fakeReq);

    expect(tx.bankStatementTransaction.updateMany).toHaveBeenCalledWith({
      where: { matchedType: 'cheque', matchedId: 1 },
      data: { reconcileStatus: 'UNMATCHED', matchedType: null, matchedId: null, matchedRef: null, matchConfidence: null },
    });
    expect(tx.cheque.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ newValue: expect.objectContaining({ bankMatchesCleared: 2 }) }),
    );
  });

  it('allows force-deleting a PRINTED cheque that carries a payment voucher number', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(
      makeCheque({ status: 'PRINTED', printedAt: new Date(), paymentVoucherNumber: 'PV-000009' }),
    );
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(0);
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.forceRemove(1, 'CHQ-001', fakeReq);

    expect(result).toEqual({ deleted: true });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        newValue: expect.objectContaining({ hadPaymentVoucher: true, paymentVoucherNumber: 'PV-000009', status: 'PRINTED' }),
      }),
    );
  });

  it('allows force-deleting an already-CANCELLED cheque', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'CANCELLED', cancelledAt: new Date() }));
    vi.mocked(prisma.bankStatementTransaction.count).mockResolvedValue(0);
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.forceRemove(1, 'CHQ-001', fakeReq);

    expect(result).toEqual({ deleted: true });
    expect(tx.cheque.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});

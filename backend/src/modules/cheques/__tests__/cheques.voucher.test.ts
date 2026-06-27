import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChequesService } from '../cheques.service';

vi.mock('../../../config/database', () => ({
  prisma: {
    cheque: { findUnique: vi.fn(), update: vi.fn() },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';

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

// makeTx sets up a full transaction client mock.
// existingSeq: the Setting counter value (null = no row yet).
// innerChequeOverrides: fields to override on the cheque returned by tx.cheque.findUnique
// (the inner re-read guard added by Fix 2). Default: no PV number, so generation proceeds.
function makeTx(existingSeq: string | null, innerChequeOverrides: Record<string, unknown> = {}) {
  return {
    setting: {
      findUnique: vi.fn().mockResolvedValue(existingSeq ? { value: existingSeq } : null),
      upsert: vi.fn().mockResolvedValue({}),
    },
    cheque: {
      findUnique: vi.fn().mockResolvedValue(makeCheque(innerChequeOverrides)),
      update: vi.fn().mockResolvedValue({}),
    },
  } as any;
}

describe('ChequesService — getOrCreatePaymentVoucherNumber', () => {
  const service = new ChequesService();

  beforeEach(() => vi.clearAllMocks());

  // ── Outer guard ──────────────────────────────────────────────────────────────

  it('throws when cheque does not exist (outer check)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(null);

    await expect(service.getOrCreatePaymentVoucherNumber(999)).rejects.toMatchObject({
      message: 'الشيك غير موجود',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('throws when cheque is CANCELLED (outer check)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'CANCELLED' }));

    await expect(service.getOrCreatePaymentVoucherNumber(1)).rejects.toMatchObject({
      message: 'لا يمكن إصدار سند صرف لشيك ملغي',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('returns existing PV number without entering $transaction (outer idempotency fast-path)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(
      makeCheque({ paymentVoucherNumber: 'PV-000003' }),
    );

    const result = await service.getOrCreatePaymentVoucherNumber(1);

    expect(result).toBe('PV-000003');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── Generation ───────────────────────────────────────────────────────────────

  it('generates PV-000001 when no counter exists', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    const tx = makeTx(null);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.getOrCreatePaymentVoucherNumber(1);

    expect(result).toBe('PV-000001');
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: '1' }, create: expect.objectContaining({ value: '1' }) }),
    );
    expect(tx.cheque.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { paymentVoucherNumber: 'PV-000001' } }),
    );
  });

  it('increments counter correctly (3 → PV-000004)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    const tx = makeTx('3');
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.getOrCreatePaymentVoucherNumber(1);

    expect(result).toBe('PV-000004');
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: '4' } }),
    );
  });

  it('uses $transaction — no direct prisma.setting access during generation', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    const tx = makeTx('0');
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.getOrCreatePaymentVoucherNumber(1);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.setting.findUnique).not.toHaveBeenCalled();
    expect(prisma.setting.upsert).not.toHaveBeenCalled();
  });

  it('double-click: second outer call returns same PV number without entering $transaction', async () => {
    // First call: outer read sees no PV → enters $transaction → generates PV-000001
    vi.mocked(prisma.cheque.findUnique).mockResolvedValueOnce(makeCheque());
    const tx = makeTx('0');
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const first = await service.getOrCreatePaymentVoucherNumber(1);

    // Second call: DB now reflects the written PV number → outer fast-path returns it
    vi.mocked(prisma.cheque.findUnique).mockResolvedValueOnce(
      makeCheque({ paymentVoucherNumber: first }),
    );

    const second = await service.getOrCreatePaymentVoucherNumber(1);

    expect(first).toBe('PV-000001');
    expect(second).toBe('PV-000001');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('cancelled cheque cannot consume a PV sequence number', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(
      makeCheque({ status: 'CANCELLED', paymentVoucherNumber: null }),
    );

    await expect(service.getOrCreatePaymentVoucherNumber(1)).rejects.toThrow();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('treats corrupted counter (NaN) as 0 and generates PV-000001', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    const tx = makeTx('not-a-number');
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.getOrCreatePaymentVoucherNumber(1);

    expect(result).toBe('PV-000001');
  });

  // ── Inner transaction concurrency guard (Fix 2) ───────────────────────────────

  it('inner guard: concurrent request that wins the lock finds existing PV and returns it without overwriting', async () => {
    // Outer check sees null (both concurrent requests pass the fast-path).
    // By the time this request acquires the SQLite write lock, the winner has
    // already written PV-000001. The inner re-read sees it and returns early.
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque()); // outer: no PV
    const txWithExistingPV = {
      cheque: {
        findUnique: vi.fn().mockResolvedValue(makeCheque({ paymentVoucherNumber: 'PV-000001' })),
        update: vi.fn(),
      },
      setting: { findUnique: vi.fn(), upsert: vi.fn() },
    } as any;
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(txWithExistingPV));

    const result = await service.getOrCreatePaymentVoucherNumber(1);

    expect(result).toBe('PV-000001');
    // Sequence counter must NOT be touched — returned early from inner guard
    expect(txWithExistingPV.setting.findUnique).not.toHaveBeenCalled();
    expect(txWithExistingPV.setting.upsert).not.toHaveBeenCalled();
    expect(txWithExistingPV.cheque.update).not.toHaveBeenCalled();
  });

  it('inner guard: tx re-read finding null proceeds to generate normally', async () => {
    // Both outer and inner reads see no PV — normal generation path.
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque());
    const tx = makeTx('5'); // inner cheque.findUnique defaults to no PV (makeCheque())
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    const result = await service.getOrCreatePaymentVoucherNumber(1);

    expect(result).toBe('PV-000006');
    expect(tx.cheque.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { paymentVoucherNumber: 'PV-000006' } }),
    );
  });

  it('inner guard: tx findUnique returning null throws not-found (cheque deleted between outer and inner read)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque()); // outer: found
    const txWithMissing = {
      cheque: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      setting: { findUnique: vi.fn(), upsert: vi.fn() },
    } as any;
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(txWithMissing));

    await expect(service.getOrCreatePaymentVoucherNumber(1)).rejects.toMatchObject({
      message: 'الشيك غير موجود',
    });
    expect(txWithMissing.cheque.update).not.toHaveBeenCalled();
    expect(txWithMissing.setting.upsert).not.toHaveBeenCalled();
  });
});

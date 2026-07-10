import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChequesService } from '../cheques.service';
import { reprintChequeSchema, saveTemplateVersionSchema, calibrationGeometrySchema } from '../cheques.schema';

vi.mock('../../../config/database', () => ({
  prisma: {
    cheque: { findUnique: vi.fn(), update: vi.fn() },
    setting: { findUnique: vi.fn(), upsert: vi.fn() },
    chequePrintLog: { create: vi.fn(), findMany: vi.fn() },
    chequeTemplateVersion: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { prisma } from '../../../config/database';

const req = { user: { userId: 7, username: 'accountant' } } as any;

function makeCheque(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    chequeNumber: 'CHQ-001',
    chequeDate: new Date('2026-07-01'),
    beneficiaryName: 'شركة الاختبار',
    amount: 500.75,
    currency: 'KWD',
    bankName: 'NBK',
    status: 'DRAFT',
    printedAt: null,
    cancelledAt: null,
    printCount: 0,
    paymentVoucherNumber: null,
    ...overrides,
  } as any;
}

// A transaction client whose model methods are pre-stubbed. Overrides let each
// test control return values (e.g. the last version number, the re-read cheque).
function makeTx(over: Record<string, any> = {}) {
  return {
    cheque: {
      findUnique: vi.fn().mockResolvedValue(over.cheque ?? makeCheque({ status: 'PRINTED', printCount: 1 })),
      update: vi.fn().mockImplementation(async ({ data }: any) => ({ ...makeCheque(), ...data })),
    },
    chequePrintLog: { create: vi.fn().mockResolvedValue({}) },
    chequeTemplateVersion: {
      findFirst: vi.fn().mockResolvedValue(over.lastVersion ?? null),
      create: vi.fn().mockImplementation(async ({ data }: any) => ({ id: 99, ...data })),
    },
    setting: { upsert: vi.fn().mockResolvedValue({}) },
  } as any;
}

describe('ChequesService — reprint tracking', () => {
  const service = new ChequesService();
  beforeEach(() => vi.clearAllMocks());

  // ── markPrinted logs sequence 1 ──────────────────────────────────────────────

  it('markPrinted flips to PRINTED, sets printCount=1 and opens print log seq 1 (no reason)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'DRAFT' }));
    const tx = makeTx();
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.markPrinted(1, req);

    expect(tx.cheque.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: expect.objectContaining({ status: 'PRINTED', printCount: 1 }) }),
    );
    expect(tx.chequePrintLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ chequeId: 1, sequence: 1, reason: null, printedById: 7 }) }),
    );
  });

  it('markPrinted still rejects a CANCELLED cheque (lifecycle unchanged)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'CANCELLED' }));
    await expect(service.markPrinted(1, req)).rejects.toMatchObject({ message: 'لا يمكن طباعة شيك ملغي' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('markPrinted still rejects an already-PRINTED cheque (double-print guard unchanged)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'PRINTED' }));
    await expect(service.markPrinted(1, req)).rejects.toMatchObject({ message: 'الشيك مطبوع بالفعل' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── reprint ──────────────────────────────────────────────────────────────────

  it('reprint records a new log at sequence 2 with the reason and bumps printCount', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'PRINTED', printCount: 1 }));
    const tx = makeTx({ cheque: makeCheque({ status: 'PRINTED', printCount: 1 }) });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.reprint(1, { reason: 'PAPER_JAM', note: null }, req);

    expect(tx.cheque.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { printCount: 2 } }),
    );
    expect(tx.chequePrintLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ chequeId: 1, sequence: 2, reason: 'PAPER_JAM' }) }),
    );
  });

  it('legacy PRINTED cheque (printCount 0, no logs): bootstraps a truthful seq-1 original, then records the reprint as seq 2', async () => {
    const printedAt = new Date('2026-05-01T09:00:00.000Z');
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'PRINTED', printCount: 0, printedAt }));
    const tx = makeTx({ cheque: makeCheque({ status: 'PRINTED', printCount: 0, printedAt }) });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.reprint(1, { reason: 'MISALIGNMENT' }, req);

    // Two log rows: the untracked original (seq 1) and this reprint (seq 2).
    expect(tx.chequePrintLog.create).toHaveBeenCalledTimes(2);
    // seq 1 = original print, reconstructed truthfully (real printedAt, no reason,
    // unknown user — nothing fabricated). Never stored as a reprint.
    expect(tx.chequePrintLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequence: 1, reason: null, printedById: null, printedByName: null, printedAt }) }),
    );
    // seq 2 = the actual reprint, with the required reason and the acting user.
    expect(tx.chequePrintLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequence: 2, reason: 'MISALIGNMENT', printedById: 7 }) }),
    );
    // printCount reflects 1 original + 1 reprint = 2.
    expect(tx.cheque.update).toHaveBeenCalledWith(expect.objectContaining({ data: { printCount: 2 } }));
  });

  it('modern reprint (printCount ≥ 1) does NOT bootstrap a seq-1 log — only the reprint is written', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'PRINTED', printCount: 1 }));
    const tx = makeTx({ cheque: makeCheque({ status: 'PRINTED', printCount: 1 }) });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.reprint(1, { reason: 'USER_REQUEST' }, req);

    expect(tx.chequePrintLog.create).toHaveBeenCalledTimes(1);
    expect(tx.chequePrintLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequence: 2 }) }),
    );
  });

  it('reprint sequence derives from the in-transaction re-read — atomic under concurrent reprints', async () => {
    // Outer read is stale (printCount 1); by the time this request holds the write
    // lock a concurrent reprint has already bumped it to 2. The inner re-read must
    // win so this reprint becomes seq 3 — no duplicate sequence, no lost update.
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'PRINTED', printCount: 1 }));
    const tx = makeTx({ cheque: makeCheque({ status: 'PRINTED', printCount: 2 }) });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.reprint(1, { reason: 'PRINTER_ISSUE' }, req);

    expect(tx.cheque.update).toHaveBeenCalledWith(expect.objectContaining({ data: { printCount: 3 } }));
    expect(tx.chequePrintLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ sequence: 3 }) }),
    );
    expect(tx.chequePrintLog.create).toHaveBeenCalledTimes(1); // inner printCount ≠ 0 → no legacy bootstrap
  });

  it('reprint is rejected for a DRAFT cheque (only printed cheques can be reprinted)', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'DRAFT' }));
    await expect(service.reprint(1, { reason: 'USER_REQUEST' }, req)).rejects.toMatchObject({
      message: 'إعادة الطباعة متاحة فقط لشيك مطبوع مسبقاً',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reprint is rejected for a CANCELLED cheque', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'CANCELLED' }));
    await expect(service.reprint(1, { reason: 'USER_REQUEST' }, req)).rejects.toMatchObject({
      message: 'لا يمكن إعادة طباعة شيك ملغي',
    });
  });

  it('reprint schema requires a valid reason (empty/invalid rejected)', () => {
    expect(reprintChequeSchema.safeParse({ body: {} }).success).toBe(false);
    expect(reprintChequeSchema.safeParse({ body: { reason: 'NOPE' } }).success).toBe(false);
    expect(reprintChequeSchema.safeParse({ body: { reason: 'PAPER_JAM' } }).success).toBe(true);
  });

  it('listPrintLogs returns logs ordered by sequence asc', async () => {
    vi.mocked(prisma.cheque.findUnique).mockResolvedValue(makeCheque({ status: 'PRINTED' }));
    vi.mocked(prisma.chequePrintLog.findMany).mockResolvedValue([{ sequence: 1 }, { sequence: 2 }] as any);
    await service.listPrintLogs(1);
    expect(prisma.chequePrintLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chequeId: 1 }, orderBy: { sequence: 'asc' } }),
    );
  });
});

describe('ChequesService — template versioning', () => {
  const service = new ChequesService();
  beforeEach(() => vi.clearAllMocks());

  const sampleTemplate = {
    beneficiary: { top: 29.8, left: 34.5, width: 38, fontSize: 11, fontFamily: 'Cairo', fontWeight: '600', fontStyle: 'normal', textAlign: 'left', color: '#000000' },
    date: { top: 24.3, left: 79.1, width: 23, fontSize: 10, fontFamily: 'Cairo', fontWeight: '600', fontStyle: 'normal', textAlign: 'center', color: '#000000' },
    tafqeet: { top: 39.1, left: 5.7, width: 72, fontSize: 10, fontFamily: 'Cairo', fontWeight: '600', fontStyle: 'normal', textAlign: 'right', color: '#000000' },
    numeric: { top: 45.8, left: 82.4, width: 18, fontSize: 11, fontFamily: 'monospace', fontWeight: '700', fontStyle: 'normal', textAlign: 'center', color: '#000000' },
  } as any;

  it('first save creates version 1 and upserts the active template setting', async () => {
    const tx = makeTx({ lastVersion: null });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.saveTemplateVersion({ bankName: 'NBK', template: sampleTemplate, note: null }, req);

    expect(tx.chequeTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bankName: 'NBK', version: 1, createdById: 7 }) }),
    );
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'cheque.template.NBK' } }),
    );
  });

  it('second save increments to version 2', async () => {
    const tx = makeTx({ lastVersion: { version: 1 } });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.saveTemplateVersion({ bankName: 'NBK', template: sampleTemplate }, req);

    expect(tx.chequeTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ version: 2 }) }),
    );
  });

  it('restore throws when the source version does not exist', async () => {
    vi.mocked(prisma.chequeTemplateVersion.findUnique).mockResolvedValue(null);
    await expect(service.restoreTemplateVersion(123, req)).rejects.toMatchObject({ message: 'النسخة غير موجودة' });
  });

  it('restore appends a new version with the restored snapshot and re-activates it', async () => {
    vi.mocked(prisma.chequeTemplateVersion.findUnique).mockResolvedValue({
      id: 3, bankName: 'NBK', version: 2, template: JSON.stringify(sampleTemplate),
    } as any);
    const tx = makeTx({ lastVersion: { version: 5 } });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.restoreTemplateVersion(3, req);

    expect(tx.chequeTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bankName: 'NBK', version: 6, note: 'استعادة النسخة 2' }) }),
    );
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'cheque.template.NBK' } }),
    );
  });

  it('restore-default appends a new version (prior preserved) and activates the default template', async () => {
    // The main-page "restore default" action routes through this same service with
    // the default template + a fixed note. It must append, never delete/overwrite
    // history, and set the active template to the default snapshot.
    const DEFAULT = sampleTemplate; // stands in for DEFAULT_TEMPLATE (valid shape)
    const tx = makeTx({ lastVersion: { version: 4 } });
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(tx));

    await service.saveTemplateVersion({ bankName: 'NBK', template: DEFAULT, note: 'استعادة القالب الافتراضي' }, req);

    // New immutable version appended after the existing 4 — prior versions untouched.
    expect(tx.chequeTemplateVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ bankName: 'NBK', version: 5, note: 'استعادة القالب الافتراضي' }) }),
    );
    // No destructive op on the version history (the tx mock exposes only findFirst/create).
    expect(tx.chequeTemplateVersion.create).toHaveBeenCalledTimes(1);
    // Active template becomes the default snapshot.
    expect(tx.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'cheque.template.NBK' }, update: { value: JSON.stringify(DEFAULT) } }),
    );
  });

  it('save-version schema rejects a template with a bad coordinate/color', () => {
    const bad = JSON.parse(JSON.stringify(sampleTemplate));
    bad.beneficiary.color = 'red';
    expect(saveTemplateVersionSchema.safeParse({ body: { bankName: 'NBK', template: bad } }).success).toBe(false);
    expect(saveTemplateVersionSchema.safeParse({ body: { bankName: 'NBK', template: sampleTemplate } }).success).toBe(true);
  });
});

describe('ChequesService — calibration geometry', () => {
  const service = new ChequesService();
  beforeEach(() => vi.clearAllMocks());

  const GOOD = { pageWidthMm: 297, pageHeightMm: 210, chequeWidthMm: 175, chequeHeightMm: 80, offsetXMm: 0, offsetYMm: 40 };

  it('returns defaults when no geometry setting exists', async () => {
    vi.mocked(prisma.setting.findUnique).mockResolvedValue(null);
    const g = await service.getCalibrationGeometry();
    expect(g).toMatchObject({ pageWidthMm: 297, offsetYMm: 40 });
  });

  it('merges a stored partial geometry over defaults', async () => {
    vi.mocked(prisma.setting.findUnique).mockResolvedValue({ value: JSON.stringify({ pageWidthMm: 277 }) } as any);
    const g = await service.getCalibrationGeometry();
    expect(g.pageWidthMm).toBe(277); // stored
    expect(g.offsetYMm).toBe(40); // default
  });

  it('falls back to defaults on corrupt JSON', async () => {
    vi.mocked(prisma.setting.findUnique).mockResolvedValue({ value: '{not json' } as any);
    const g = await service.getCalibrationGeometry();
    expect(g.pageWidthMm).toBe(297);
  });

  it('saveCalibrationGeometry upserts the single geometry key and returns the input', async () => {
    vi.mocked(prisma.setting.upsert).mockResolvedValue({} as any);
    const out = await service.saveCalibrationGeometry(GOOD, req);
    expect(prisma.setting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'cheque.calibration.geometry' } }),
    );
    expect(out).toEqual(GOOD);
  });

  it('geometry schema rejects out-of-range dimensions', () => {
    expect(calibrationGeometrySchema.safeParse(GOOD).success).toBe(true);
    expect(calibrationGeometrySchema.safeParse({ ...GOOD, pageWidthMm: 5 }).success).toBe(false);
    expect(calibrationGeometrySchema.safeParse({ ...GOOD, chequeHeightMm: 9999 }).success).toBe(false);
  });
});

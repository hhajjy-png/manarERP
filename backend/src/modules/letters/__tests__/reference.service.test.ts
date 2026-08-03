/**
 * Letter Engine — the reference allocator, register and reconciliation.
 *
 * Prisma is mocked here so the CONTROL FLOW can be tested precisely: what is retried,
 * what is not, what reconciliation corrects and what it refuses to touch. The
 * database-level uniqueness guarantee is proven separately, against a real SQLite
 * file, in `referenceIntegrity.integration.test.ts` — a mock cannot demonstrate a
 * constraint.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

// `vi.hoisted` because `vi.mock` factories are lifted above every other statement in
// the file; a plain `const` referenced inside one is still in its temporal dead zone
// when the factory runs.
const { letterSequenceRow, letterReferenceRow, loggerMock } = vi.hoisted(() => ({
  letterSequenceRow: { upsert: vi.fn(), findUnique: vi.fn() },
  letterReferenceRow: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
  },
  loggerMock: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@config/database', () => ({
  prisma: {
    letterSequence: letterSequenceRow,
    letterReference: letterReferenceRow,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({ letterSequence: letterSequenceRow, letterReference: letterReferenceRow }),
    ),
  },
}));

vi.mock('@core/utils/logger', () => ({ logger: loggerMock }));

import {
  allocateReference,
  cancelReference,
  listGaps,
  reconcileSequences,
  reconcileSequencesOnStartup,
} from '../reference.service';

/** A genuine Prisma unique-constraint violation. */
function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  letterSequenceRow.upsert.mockResolvedValue({ templateKey: 'officialLetter', year: 2026, lastValue: 1 });
  letterReferenceRow.create.mockResolvedValue({});
});

describe('allocateReference', () => {
  it('advances the counter and writes the register row together', async () => {
    const result = await allocateReference('officialLetter', 2026, 42, { id: 7, name: 'admin' });

    expect(result).toEqual({
      reference: 'OL-2026-000001',
      templateKey: 'officialLetter',
      year: 2026,
      sequence: 1,
    });
    expect(letterSequenceRow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { templateKey_year: { templateKey: 'officialLetter', year: 2026 } },
        update: { lastValue: { increment: 1 } },
        create: { templateKey: 'officialLetter', year: 2026, lastValue: 1 },
      }),
    );
    expect(letterReferenceRow.create.mock.calls[0][0].data).toMatchObject({
      reference: 'OL-2026-000001',
      sequence: 1,
      letterId: 42,
      status: 'ALLOCATED',
      allocatedById: 7,
      allocatedByName: 'admin',
    });
  });

  it('never computes the next value itself — it increments in the database', async () => {
    // A `SELECT MAX(sequence) + 1` in application code has a window between the read
    // and the write in which a second caller reads the same maximum. The counter is
    // therefore advanced by the database, atomically.
    await allocateReference('officialLetter', 2026, 1);
    expect(letterSequenceRow.upsert.mock.calls[0][0].update).toEqual({ lastValue: { increment: 1 } });
  });

  it('issues strictly increasing numbers as the counter advances', async () => {
    const issued: string[] = [];
    for (let n = 1; n <= 5; n += 1) {
      letterSequenceRow.upsert.mockResolvedValueOnce({ lastValue: n });
      issued.push((await allocateReference('officialLetter', 2026, n)).reference);
    }
    expect(issued).toEqual([
      'OL-2026-000001',
      'OL-2026-000002',
      'OL-2026-000003',
      'OL-2026-000004',
      'OL-2026-000005',
    ]);
    expect(new Set(issued).size).toBe(5);
  });

  it('retries a LOST RACE and takes the next slot', async () => {
    letterReferenceRow.create.mockRejectedValueOnce(uniqueViolation());
    letterSequenceRow.upsert.mockResolvedValueOnce({ lastValue: 5 }).mockResolvedValueOnce({ lastValue: 6 });

    const result = await allocateReference('officialLetter', 2026, 1);
    expect(result.sequence).toBe(6);
    expect(letterReferenceRow.create).toHaveBeenCalledTimes(2);
  });

  it('gives up after exhausting retries rather than spinning', async () => {
    letterReferenceRow.create.mockRejectedValue(uniqueViolation());
    await expect(allocateReference('officialLetter', 2026, 1)).rejects.toThrow(/تعارض متزامن/);
    expect(letterReferenceRow.create).toHaveBeenCalledTimes(3);
  });

  it('does NOT retry a non-uniqueness error — it surfaces it', async () => {
    letterReferenceRow.create.mockRejectedValue(new Error('disk full'));
    await expect(allocateReference('officialLetter', 2026, 1)).rejects.toThrow(/disk full/);
    expect(letterReferenceRow.create).toHaveBeenCalledTimes(1);
  });

  it('refuses an unknown template before touching the counter', async () => {
    // The prefix is burned permanently into the issued number, so there is no safe
    // default — and no number may be consumed while finding that out.
    await expect(allocateReference('circular', 2026, 1)).rejects.toThrow(/Unknown template key/);
    expect(letterSequenceRow.upsert).not.toHaveBeenCalled();
  });

  it('keeps separate counters per year', async () => {
    await allocateReference('officialLetter', 2026, 1);
    await allocateReference('officialLetter', 2027, 2);
    expect(letterSequenceRow.upsert.mock.calls[0][0].where.templateKey_year.year).toBe(2026);
    expect(letterSequenceRow.upsert.mock.calls[1][0].where.templateKey_year.year).toBe(2027);
  });
});

describe('cancelReference — the number is never returned to the pool', () => {
  it('marks an allocated reference cancelled, with its reason and timestamp', async () => {
    letterReferenceRow.findUnique.mockResolvedValue({ reference: 'OL-2026-000001', status: 'ALLOCATED' });
    const when = new Date('2026-08-04T10:00:00.000Z');
    await cancelReference('OL-2026-000001', 'صدر بالخطأ', when);

    expect(letterReferenceRow.update).toHaveBeenCalledWith({
      where: { reference: 'OL-2026-000001' },
      data: { status: 'CANCELLED', cancelReason: 'صدر بالخطأ', cancelledAt: when },
    });
  });

  it('never deletes the register row — cancellation is a status, not a removal', async () => {
    letterReferenceRow.findUnique.mockResolvedValue({ reference: 'OL-2026-000001', status: 'ALLOCATED' });
    await cancelReference('OL-2026-000001', 'سبب');
    expect(letterReferenceRow).not.toHaveProperty('delete');
    expect(letterReferenceRow.update).toHaveBeenCalledTimes(1);
  });

  it('refuses to overwrite an existing cancellation', async () => {
    // The original reason and timestamp are audit evidence.
    letterReferenceRow.findUnique.mockResolvedValue({ reference: 'OL-2026-000001', status: 'CANCELLED' });
    await expect(cancelReference('OL-2026-000001', 'سبب آخر')).rejects.toThrow(/ملغى مسبقًا/);
    expect(letterReferenceRow.update).not.toHaveBeenCalled();
  });

  it('404s for a reference that was never issued', async () => {
    letterReferenceRow.findUnique.mockResolvedValue(null);
    await expect(cancelReference('OL-2026-999999', 'سبب')).rejects.toThrow(/غير موجود/);
  });
});

describe('reconcileSequences — the backup-restore guard', () => {
  it('RAISES a counter that has fallen behind the register', async () => {
    // The scenario: a backup taken before letters 120–125 were issued is restored, so
    // the counter says 119 while the register knows about 125. Without this, the next
    // five letters would reuse numbers already on delivered paper.
    letterReferenceRow.groupBy.mockResolvedValue([
      { templateKey: 'officialLetter', year: 2026, _max: { sequence: 125 } },
    ]);
    letterSequenceRow.findUnique.mockResolvedValue({ lastValue: 119 });

    const corrections = await reconcileSequences();

    expect(corrections).toEqual([{ templateKey: 'officialLetter', year: 2026, from: 119, to: 125 }]);
    expect(letterSequenceRow.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { lastValue: 125 } }),
    );
    expect(loggerMock.warn).toHaveBeenCalled();
  });

  it('NEVER lowers a counter that is ahead', async () => {
    // Lowering is the one direction that can cause a collision, so a counter ahead of
    // the register is left exactly where it is.
    letterReferenceRow.groupBy.mockResolvedValue([
      { templateKey: 'officialLetter', year: 2026, _max: { sequence: 10 } },
    ]);
    letterSequenceRow.findUnique.mockResolvedValue({ lastValue: 42 });

    expect(await reconcileSequences()).toEqual([]);
    expect(letterSequenceRow.upsert).not.toHaveBeenCalled();
  });

  it('leaves an already-correct counter untouched', async () => {
    letterReferenceRow.groupBy.mockResolvedValue([
      { templateKey: 'officialLetter', year: 2026, _max: { sequence: 7 } },
    ]);
    letterSequenceRow.findUnique.mockResolvedValue({ lastValue: 7 });
    expect(await reconcileSequences()).toEqual([]);
    expect(letterSequenceRow.upsert).not.toHaveBeenCalled();
  });

  it('creates a missing counter from the register', async () => {
    letterReferenceRow.groupBy.mockResolvedValue([
      { templateKey: 'officialLetter', year: 2026, _max: { sequence: 3 } },
    ]);
    letterSequenceRow.findUnique.mockResolvedValue(null);

    expect(await reconcileSequences()).toEqual([
      { templateKey: 'officialLetter', year: 2026, from: 0, to: 3 },
    ]);
  });

  it('reconciles each template-year independently', async () => {
    letterReferenceRow.groupBy.mockResolvedValue([
      { templateKey: 'officialLetter', year: 2026, _max: { sequence: 50 } },
      { templateKey: 'officialLetter', year: 2027, _max: { sequence: 4 } },
    ]);
    letterSequenceRow.findUnique
      .mockResolvedValueOnce({ lastValue: 10 })
      .mockResolvedValueOnce({ lastValue: 4 });

    expect(await reconcileSequences()).toEqual([
      { templateKey: 'officialLetter', year: 2026, from: 10, to: 50 },
    ]);
  });

  it('does nothing when the register is empty', async () => {
    letterReferenceRow.groupBy.mockResolvedValue([]);
    expect(await reconcileSequences()).toEqual([]);
  });

  it('the startup wrapper NEVER throws — a safety net must not block startup', async () => {
    letterReferenceRow.groupBy.mockRejectedValue(new Error('table missing'));
    await expect(reconcileSequencesOnStartup()).resolves.toBeUndefined();
    expect(loggerMock.error).toHaveBeenCalled();
  });
});

describe('listGaps — gaps are normal, but must be explicable', () => {
  it('reports a cancelled slot with its reason', async () => {
    letterReferenceRow.findMany.mockResolvedValue([
      { sequence: 1, reference: 'OL-2026-000001', status: 'ALLOCATED', cancelReason: null },
      { sequence: 2, reference: 'OL-2026-000002', status: 'CANCELLED', cancelReason: 'صدر بالخطأ' },
      { sequence: 3, reference: 'OL-2026-000003', status: 'ALLOCATED', cancelReason: null },
    ]);

    expect(await listGaps('officialLetter', 2026)).toEqual([
      { sequence: 2, reference: 'OL-2026-000002', kind: 'CANCELLED', reason: 'صدر بالخطأ' },
    ]);
  });

  it('reports a slot with no register row at all as MISSING', async () => {
    // Should not occur in normal operation; its presence is worth investigating, so it
    // is surfaced rather than smoothed over.
    letterReferenceRow.findMany.mockResolvedValue([
      { sequence: 1, reference: 'OL-2026-000001', status: 'ALLOCATED', cancelReason: null },
      { sequence: 3, reference: 'OL-2026-000003', status: 'ALLOCATED', cancelReason: null },
    ]);

    expect(await listGaps('officialLetter', 2026)).toEqual([
      { sequence: 2, reference: 'OL-2026-000002', kind: 'MISSING', reason: null },
    ]);
  });

  it('returns nothing for an unbroken sequence, or an empty register', async () => {
    letterReferenceRow.findMany.mockResolvedValue([
      { sequence: 1, reference: 'OL-2026-000001', status: 'ALLOCATED', cancelReason: null },
      { sequence: 2, reference: 'OL-2026-000002', status: 'ALLOCATED', cancelReason: null },
    ]);
    expect(await listGaps('officialLetter', 2026)).toEqual([]);

    letterReferenceRow.findMany.mockResolvedValue([]);
    expect(await listGaps('officialLetter', 2026)).toEqual([]);
  });
});

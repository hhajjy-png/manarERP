/**
 * Letter Engine — service behaviour (CRUD + lifecycle enforcement).
 *
 * Prisma is mocked, so these tests are about DECISIONS, not storage: what the service
 * refuses, what it allows, and what it writes when it allows it. The database-level
 * guarantees are proven separately, against a real SQLite file, in
 * `referenceIntegrity.integration.test.ts`.
 *
 * The registration transaction is exercised by making `$transaction` run its callback
 * against the same mock — which lets the "an allocation failure must not leave a
 * registered letter" case be tested without a database.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// `vi.hoisted` because `vi.mock` factories are lifted above every other statement in
// the file; a plain `const` referenced inside one is still in its temporal dead zone
// when the factory runs.
const { letterRow, letterSequenceRow, letterReferenceRow, timelineRow, letterVersionRow } =
  vi.hoisted(() => ({
    letterRow: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    letterSequenceRow: { upsert: vi.fn(), findUnique: vi.fn() },
    letterReferenceRow: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
      groupBy: vi.fn(),
    },
    timelineRow: { create: vi.fn(), findMany: vi.fn() },
    // Registration takes its PRE_REGISTER snapshot inside its own transaction, so the
    // version table is part of the registration path whether or not a test asserts on it.
    letterVersionRow: {
      aggregate: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  }));

vi.mock('@config/database', () => ({
  prisma: {
    letter: letterRow,
    letterSequence: letterSequenceRow,
    letterReference: letterReferenceRow,
    letterTimelineEvent: timelineRow,
    letterVersion: letterVersionRow,
    // Runs the callback against the same mocked client, so a rejection inside the
    // callback propagates exactly as a real aborted transaction would.
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        letter: letterRow,
        letterSequence: letterSequenceRow,
        letterReference: letterReferenceRow,
        letterTimelineEvent: timelineRow,
        letterVersion: letterVersionRow,
      }),
    ),
  },
}));

/** The timeline events written during a test, in order. */
function events() {
  return timelineRow.create.mock.calls.map((c) => c[0].data);
}

vi.mock('@core/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import * as service from '../letters.service';
import type { RegistrationSnapshot } from '../snapshot';

const SNAPSHOT: RegistrationSnapshot = {
  blockTypography: { b1: { fontId: 'traditionalArabic', sizePt: 16, weight: 400, lineHeight: 1.35 } },
  issueDate: '2026-08-03',
  subject: 'طلب تمديد مدة العقد',
  barcodePayload: 'خطاب رسمي\nرقم المرجع: OL-2026-000001',
  geometryMm: { reservedTopMm: 40 },
  pageCount: 1,
  signature: null,
  stamp: null,
};

function letter(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    templateKey: 'officialLetter',
    templateVersion: 1,
    layoutVersion: 1,
    barcodeVersion: 1,
    printProfileId: 'companyLetterhead',
    status: 'DRAFT',
    isArchived: false,
    reference: null,
    issueDate: new Date('2026-08-03T00:00:00.000Z'),
    recipientName: null,
    recipientTitle: null,
    recipientOrganisation: null,
    subject: '',
    contentJson: '',
    contentModelVersion: 1,
    registrationSnapshotJson: null,
    createdById: 7,
    createdByName: 'admin',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  letterRow.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) =>
    letter(data),
  );
  letterRow.create.mockResolvedValue(letter());
  letterSequenceRow.upsert.mockResolvedValue({ templateKey: 'officialLetter', year: 2026, lastValue: 1 });
  letterReferenceRow.create.mockResolvedValue({});
  timelineRow.create.mockResolvedValue({});
  letterVersionRow.aggregate.mockResolvedValue({ _max: { sequence: null } });
  letterVersionRow.create.mockResolvedValue({ id: 1 });
  letterVersionRow.findMany.mockResolvedValue([]);
});

/* ── Create ─────────────────────────────────────────────────────────────── */

describe('createDraft', () => {
  it('creates a DRAFT with NO reference number', async () => {
    letterRow.create.mockResolvedValue(letter());
    await service.createDraft({}, { id: 7, name: 'admin' });

    const data = letterRow.create.mock.calls[0][0].data;
    expect(data.status).toBe('DRAFT');
    expect(data.reference).toBeNull();
  });

  it('stamps the version triple and print profile from the SERVER, not the request', async () => {
    letterRow.create.mockResolvedValue(letter());
    // A client-chosen version stamp would let a document mislabel which rules it was
    // issued under — and that label is what a faithful reprint depends on.
    await service.createDraft({ templateVersion: 99, printProfileId: 'evil' } as never);

    const data = letterRow.create.mock.calls[0][0].data;
    expect(data.templateVersion).toBe(1);
    expect(data.layoutVersion).toBe(1);
    expect(data.barcodeVersion).toBe(1);
    expect(data.printProfileId).toBe('companyLetterhead');
  });

  it('records the creating user as a text snapshot', async () => {
    letterRow.create.mockResolvedValue(letter());
    await service.createDraft({}, { id: 7, name: 'admin' });
    const data = letterRow.create.mock.calls[0][0].data;
    expect(data.createdById).toBe(7);
    expect(data.createdByName).toBe('admin');
  });

  it('defaults to the official letter template and refuses any other', async () => {
    letterRow.create.mockResolvedValue(letter());
    await service.createDraft({});
    expect(letterRow.create.mock.calls[0][0].data.templateKey).toBe('officialLetter');

    await expect(service.createDraft({ templateKey: 'circular' })).rejects.toThrow(/غير متاح/);
  });

  it('allows an almost-empty draft — content rules are not lifecycle rules', async () => {
    letterRow.create.mockResolvedValue(letter());
    await expect(service.createDraft({})).resolves.toBeDefined();
    const data = letterRow.create.mock.calls[0][0].data;
    expect(data.subject).toBe('');
    expect(data.contentJson).toBe('');
  });
});

/* ── Read ───────────────────────────────────────────────────────────────── */

describe('getLetter', () => {
  it('returns the row', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    expect((await service.getLetter(1)).id).toBe(1);
  });

  it('404s for an unknown id', async () => {
    letterRow.findUnique.mockResolvedValue(null);
    await expect(service.getLetter(999)).rejects.toThrow(/غير موجود/);
  });
});

/* ── Update ─────────────────────────────────────────────────────────────── */

describe('updateDraft', () => {
  it('saves changes to a DRAFT', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    await service.updateDraft(1, { subject: 'موضوع جديد' });
    expect(letterRow.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, data: { subject: 'موضوع جديد' } }),
    );
  });

  it.each(['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'])('REFUSES to edit a %s letter', async (status) => {
    letterRow.findUnique.mockResolvedValue(letter({ status, reference: 'OL-2026-000001' }));
    await expect(service.updateDraft(1, { subject: 'x' })).rejects.toThrow(/لا يمكن تعديل/);
    expect(letterRow.update).not.toHaveBeenCalled();
  });

  it('writes only the fields supplied', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    await service.updateDraft(1, { subject: 'س' });
    expect(letterRow.update.mock.calls[0][0].data).toEqual({ subject: 'س' });
  });
});

/* ── Register ───────────────────────────────────────────────────────────── */

describe('registerLetter', () => {
  it('allocates a reference, freezes the snapshot and moves to REGISTERED — in ONE transaction', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    await service.registerLetter(1, SNAPSHOT, { id: 7, name: 'admin' });

    // The counter advanced and the register row was written…
    expect(letterSequenceRow.upsert).toHaveBeenCalledTimes(1);
    expect(letterReferenceRow.create).toHaveBeenCalledTimes(1);
    expect(letterReferenceRow.create.mock.calls[0][0].data).toMatchObject({
      reference: 'OL-2026-000001',
      templateKey: 'officialLetter',
      year: 2026,
      sequence: 1,
      letterId: 1,
      status: 'ALLOCATED',
    });

    // …and the letter was bound to it with its snapshot.
    const data = letterRow.update.mock.calls[0][0].data;
    expect(data.status).toBe('REGISTERED');
    expect(data.reference).toBe('OL-2026-000001');
    expect(JSON.parse(data.registrationSnapshotJson).pageCount).toBe(1);
    expect(data.registeredById).toBe(7);
  });

  it('records a PRE_REGISTER snapshot — a kind the version ROUTE cannot produce', async () => {
    // The public route accepts only AUTO and NAMED, deliberately: a client able to mint
    // a lifecycle kind could plant an undeletable version. So the one snapshot that
    // matters most has to be taken here, by the code that knows a number is being
    // issued. AUTO would not do — AUTO is the pruned kind, and this snapshot would be
    // the first thing discarded once the author saved thirty more times.
    letterRow.findUnique.mockResolvedValue(letter());
    await service.registerLetter(1, SNAPSHOT, { id: 7, name: 'admin' });

    expect(letterVersionRow.create).toHaveBeenCalledTimes(1);
    const version = letterVersionRow.create.mock.calls[0][0].data;
    expect(version.kind).toBe('PRE_REGISTER');
    expect(version.letterId).toBe(1);
    expect(version.createdById).toBe(7);
    // Nothing was pruned: pruning only ever targets AUTO.
    expect(letterVersionRow.deleteMany).not.toHaveBeenCalled();
  });

  it('takes the snapshot BEFORE the number is bound to the letter', async () => {
    // The snapshot is meant to show the document as it stood going in. Written after
    // the update it would show the document as it came out, which is the same thing
    // `registrationSnapshotJson` already records.
    letterRow.findUnique.mockResolvedValue(letter());
    await service.registerLetter(1, SNAPSHOT);

    expect(letterVersionRow.create.mock.invocationCallOrder[0])
      .toBeLessThan(letterRow.update.mock.invocationCallOrder[0]);
  });

  it('writes NO snapshot when the registration is refused', async () => {
    // A version row describing a registration that never happened would document a
    // number that was never issued.
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', reference: 'OL-2026-000001' }));
    await expect(service.registerLetter(1, SNAPSHOT)).rejects.toThrow();
    expect(letterVersionRow.create).not.toHaveBeenCalled();
  });

  it('derives the sequence year from the ISSUE date, not from today', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ issueDate: new Date('2027-01-15T00:00:00.000Z') }));
    await service.registerLetter(1, SNAPSHOT);
    expect(letterSequenceRow.upsert.mock.calls[0][0].where.templateKey_year.year).toBe(2027);
  });

  it('REFUSES to register twice', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', reference: 'OL-2026-000001' }));
    await expect(service.registerLetter(1, SNAPSHOT)).rejects.toThrow(/مُسجَّل مسبقًا/);
    expect(letterSequenceRow.upsert).not.toHaveBeenCalled();
  });

  it('REFUSES to register a DRAFT that already carries a reference', async () => {
    // A half-succeeded earlier allocation. Issuing a second number on the strength of
    // a status column alone is not something to do.
    letterRow.findUnique.mockResolvedValue(letter({ status: 'DRAFT', reference: 'OL-2026-000009' }));
    await expect(service.registerLetter(1, SNAPSHOT)).rejects.toThrow(/رقمًا مرجعيًا مسبقًا/);
    expect(letterSequenceRow.upsert).not.toHaveBeenCalled();
  });

  it.each(['PRINTED', 'SUPERSEDED', 'CANCELLED'])('REFUSES to register a %s letter', async (status) => {
    letterRow.findUnique.mockResolvedValue(letter({ status, reference: 'OL-2026-000001' }));
    await expect(service.registerLetter(1, SNAPSHOT)).rejects.toThrow();
    expect(letterSequenceRow.upsert).not.toHaveBeenCalled();
  });

  it('REFUSES an invalid snapshot, and burns no number doing so', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    await expect(service.registerLetter(1, { pageCount: 1 })).rejects.toThrow(/لقطة التسجيل غير صالحة/);
    // The critical part: validation happens BEFORE allocation, so a bad request never
    // consumes a permanent number.
    expect(letterSequenceRow.upsert).not.toHaveBeenCalled();
    expect(letterReferenceRow.create).not.toHaveBeenCalled();
  });

  it('does not mark the letter registered when the allocation fails', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    letterReferenceRow.create.mockRejectedValue(new Error('constraint'));
    await expect(service.registerLetter(1, SNAPSHOT)).rejects.toThrow();
    expect(letterRow.update).not.toHaveBeenCalled();
  });

  it('stores the snapshot with stable serialisation', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    await service.registerLetter(1, SNAPSHOT);
    const stored = letterRow.update.mock.calls[0][0].data.registrationSnapshotJson;
    expect(typeof stored).toBe('string');
    expect(JSON.parse(stored)).toEqual(SNAPSHOT);
  });
});

/* ── Archive / Unarchive — a flag, never a status change ────────────────── */

describe('archiveLetter', () => {
  it('raises the flag and does NOT touch status', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', reference: 'OL-2026-000001' }));
    await service.archiveLetter(1, { id: 7, name: 'admin' });

    const data = letterRow.update.mock.calls[0][0].data;
    expect(data.isArchived).toBe(true);
    expect(data).not.toHaveProperty('status');
    expect(data.archivedById).toBe(7);
    expect(data.archivedByName).toBe('admin');
    expect(data.archivedAt).toBeInstanceOf(Date);
  });

  it.each(['DRAFT', 'REGISTERED', 'PRINTED', 'SUPERSEDED'])(
    'archives a %s letter — filing is independent of issuance',
    async (status) => {
      letterRow.findUnique.mockResolvedValue(letter({ status, isArchived: false }));
      await expect(service.archiveLetter(1)).resolves.toBeDefined();
    },
  );

  it('REFUSES to archive a CANCELLED letter — withdrawn, not filed', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'CANCELLED', reference: 'OL-2026-000001' }));
    await expect(service.archiveLetter(1)).rejects.toThrow(/ملغى/);
    expect(letterRow.update).not.toHaveBeenCalled();
  });

  it('REFUSES to archive twice', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', isArchived: true }));
    await expect(service.archiveLetter(1)).rejects.toThrow(/مؤرشف مسبقًا/);
  });

  it('writes an ARCHIVED timeline event carrying no status change', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', reference: 'OL-2026-000001' }));
    await service.archiveLetter(1, { id: 7, name: 'admin' });

    expect(events()).toHaveLength(1);
    expect(events()[0]).toMatchObject({
      letterId: 1,
      eventType: 'ARCHIVED',
      fromStatus: null,
      toStatus: null,
      actorId: 7,
    });
  });
});

describe('unarchiveLetter', () => {
  it('lowers the flag and CLEARS the archive audit columns', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', isArchived: true }));
    await service.unarchiveLetter(1, { id: 7, name: 'admin' });

    const data = letterRow.update.mock.calls[0][0].data;
    expect(data).toEqual({
      isArchived: false,
      archivedAt: null,
      archivedById: null,
      archivedByName: null,
    });
    expect(data).not.toHaveProperty('status');
  });

  it('REFUSES to unarchive a CANCELLED letter', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'CANCELLED', isArchived: true }));
    await expect(service.unarchiveLetter(1)).rejects.toThrow(/ملغى/);
  });

  it('REFUSES to unarchive something that is not archived', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', isArchived: false }));
    await expect(service.unarchiveLetter(1)).rejects.toThrow(/غير مؤرشف/);
  });

  it('writes an UNARCHIVED event — the ONLY surviving record of the archiving', async () => {
    // The columns were just cleared. Without this event, the fact that the document was
    // ever archived would vanish without trace. This is the timeline's justification.
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', isArchived: true }));
    await service.unarchiveLetter(1, { id: 7, name: 'admin' });

    expect(events()[0]).toMatchObject({ eventType: 'UNARCHIVED', fromStatus: null, toStatus: null });
  });
});

/* ── Cancel ─────────────────────────────────────────────────────────────── */

describe('cancelLetter', () => {
  beforeEach(() => {
    letterReferenceRow.findUnique.mockResolvedValue({ reference: 'OL-2026-000001', status: 'ALLOCATED' });
    letterReferenceRow.update.mockResolvedValue({});
  });

  it('withdraws a REGISTERED letter and marks its number cancelled — never freeing it', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', reference: 'OL-2026-000001' }));
    await service.cancelLetter(1, 'صدر بالخطأ', { id: 7, name: 'admin' });

    expect(letterReferenceRow.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { reference: 'OL-2026-000001' },
        data: expect.objectContaining({ status: 'CANCELLED', cancelReason: 'صدر بالخطأ' }),
      }),
    );
    expect(letterRow.update.mock.calls[0][0].data.status).toBe('CANCELLED');
  });

  it.each(['PRINTED', 'SUPERSEDED'])('can withdraw a %s letter', async (status) => {
    letterRow.findUnique.mockResolvedValue(letter({ status, reference: 'OL-2026-000001' }));
    await expect(service.cancelLetter(1, 'سبب')).resolves.toBeDefined();
  });

  it('can withdraw an ARCHIVED letter — the flag does not protect it', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', isArchived: true, reference: 'OL-2026-000001' }));
    await expect(service.cancelLetter(1, 'سبب')).resolves.toBeDefined();
  });

  it('DEMANDS a reason — an unexplained gap in an official register is an audit finding', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', reference: 'OL-2026-000001' }));
    for (const reason of ['', '   ', '\n']) {
      await expect(service.cancelLetter(1, reason)).rejects.toThrow(/سبب الإلغاء إلزامي/);
    }
    expect(letterRow.update).not.toHaveBeenCalled();
  });

  it('REFUSES to cancel a DRAFT — it holds no number; it is deleted instead', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    await expect(service.cancelLetter(1, 'سبب')).rejects.toThrow(/احذفها/);
  });

  it('REFUSES to cancel twice', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'CANCELLED', reference: 'OL-2026-000001' }));
    await expect(service.cancelLetter(1, 'سبب')).rejects.toThrow(/ملغى مسبقًا/);
  });

  it('trims the reason before storing it', async () => {
    letterRow.findUnique.mockResolvedValue(letter({ status: 'REGISTERED', reference: 'OL-2026-000001' }));
    await service.cancelLetter(1, '  صدر بالخطأ  ');
    expect(letterRow.update.mock.calls[0][0].data.cancelReason).toBe('صدر بالخطأ');
  });
});

/* ── Delete ─────────────────────────────────────────────────────────────── */

describe('deleteDraft', () => {
  it('deletes a DRAFT', async () => {
    letterRow.findUnique.mockResolvedValue(letter());
    await service.deleteDraft(1);
    expect(letterRow.delete).toHaveBeenCalledWith({ where: { id: 1 } });
  });

  it.each(['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'])(
    'REFUSES to delete a %s letter — its number must stay accounted for',
    async (status) => {
      letterRow.findUnique.mockResolvedValue(letter({ status, reference: 'OL-2026-000001' }));
      await expect(service.deleteDraft(1)).rejects.toThrow(/لا يمكن حذف/);
      expect(letterRow.delete).not.toHaveBeenCalled();
    },
  );

  it('refuses even a DRAFT that somehow holds a reference', async () => {
    // Unreachable in normal operation, and kept as a second lock precisely because
    // deletion is the one operation with no undo.
    letterRow.findUnique.mockResolvedValue(letter({ status: 'DRAFT', reference: 'OL-2026-000009' }));
    await expect(service.deleteDraft(1)).rejects.toThrow(/رقمًا مرجعيًا/);
    expect(letterRow.delete).not.toHaveBeenCalled();
  });
});

/* ── Corrupt data ───────────────────────────────────────────────────────── */

describe('A row carrying an unknown status', () => {
  it('is refused rather than guessed at', async () => {
    // 'ARCHIVED' is exactly the right probe now: it USED to be a status and is no
    // longer one, so a row left behind by an older build must be refused rather than
    // silently reinterpreted.
    letterRow.findUnique.mockResolvedValue(letter({ status: 'ARCHIVED' }));
    await expect(service.updateDraft(1, { subject: 'x' })).rejects.toThrow(/حالة غير معروفة/);
    await expect(service.archiveLetter(1)).rejects.toThrow(/حالة غير معروفة/);
    await expect(service.deleteDraft(1)).rejects.toThrow(/حالة غير معروفة/);
  });
});

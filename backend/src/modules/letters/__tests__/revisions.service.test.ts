/**
 * Letter Engine — version history and comments (Professional Document Automation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE SERVICE'S JOB IS NOT STORAGE. IT IS THE FOUR RULES STORAGE CANNOT ENFORCE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   1. A version snapshots what the LETTER holds, read inside the transaction — never
 *      what a request said it holds.
 *   2. Restoring is refused on anything but a DRAFT, and takes a PRE_RESTORE snapshot
 *      first so that restoring is itself undoable.
 *   3. Pruning never touches a NAMED version or a lifecycle snapshot.
 *   4. A thread is one level deep, and only its opening comment can be resolved.
 *
 * Each is asserted below. The Prisma client is mocked because none of these rules is
 * about SQL — they are about which call is made and with what.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ── The mock client ────────────────────────────────────────────────────────
   Declared before the module under test is imported, because `revisions.service`
   captures `prisma` at module scope. */

// `vi.hoisted` because `vi.mock` is hoisted above every ordinary declaration — a
// plain `const` here is still in its temporal dead zone when the factory runs.
const { letter, letterVersion, letterComment } = vi.hoisted(() => ({
  letter: { findUnique: vi.fn(), update: vi.fn() },
  letterVersion: {
    aggregate: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    findFirst: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
  letterComment: { create: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../../config/database', () => ({
  prisma: {
    letter,
    letterVersion,
    letterComment,
    // The transaction runs its callback against the same mock, which is what lets the
    // "read the letter inside the transaction" rule be asserted at all.
    $transaction: (fn: (tx: unknown) => unknown) => fn({ letter, letterVersion, letterComment }),
  },
}));

import {
  AUTO_VERSION_LIMIT,
  createComment,
  createVersion,
  deleteVersion,
  listComments,
  restoreVersion,
  setCommentResolved,
} from '../revisions.service';

const DRAFT = {
  id: 1,
  status: 'DRAFT',
  contentJson: '{"contentModelVersion":4,"blocks":[]}',
  contentModelVersion: 4,
  subject: 'موضوع',
  issueDate: new Date('2026-01-01'),
  recipientName: 'جهة',
  recipientTitle: null,
  recipientOrganisation: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  letter.findUnique.mockResolvedValue(DRAFT);
  letterVersion.aggregate.mockResolvedValue({ _max: { sequence: 3 } });
  letterVersion.create.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 9, ...(data as object) }));
  letterVersion.findMany.mockResolvedValue([]);
  letterVersion.deleteMany.mockResolvedValue({ count: 0 });
});

/* ══ Versions ══════════════════════════════════════════════════════════════ */

describe('createVersion', () => {
  it('snapshots the LETTER, not anything the caller supplied', () => {
    // A client-supplied snapshot could disagree with what is stored, and a history that
    // records something the letter never contained is worse than no history.
    return createVersion({ letterId: 1, kind: 'NAMED', name: 'قبل المراجعة' }).then(() => {
      const data = letterVersion.create.mock.calls[0][0].data;
      expect(data.contentJson).toBe(DRAFT.contentJson);
      expect(data.subject).toBe(DRAFT.subject);
      expect(data.contentModelVersion).toBe(DRAFT.contentModelVersion);
    });
  });

  it('allocates the next sequence from the highest already stored', async () => {
    await createVersion({ letterId: 1, kind: 'AUTO' });
    expect(letterVersion.create.mock.calls[0][0].data.sequence).toBe(4);
  });

  it('starts at 1 for a letter with no versions', async () => {
    letterVersion.aggregate.mockResolvedValue({ _max: { sequence: null } });
    await createVersion({ letterId: 1, kind: 'AUTO' });
    expect(letterVersion.create.mock.calls[0][0].data.sequence).toBe(1);
  });

  it('refuses a letter that does not exist', async () => {
    letter.findUnique.mockResolvedValue(null);
    await expect(createVersion({ letterId: 99, kind: 'AUTO' })).rejects.toThrow();
    expect(letterVersion.create).not.toHaveBeenCalled();
  });

  it('prunes only AUTO snapshots, and only past the cap', async () => {
    letterVersion.findMany.mockResolvedValue([{ id: 11 }, { id: 12 }]);
    await createVersion({ letterId: 1, kind: 'AUTO' });

    const query = letterVersion.findMany.mock.calls[0][0];
    expect(query.where.kind, 'a NAMED version must never be pruned').toBe('AUTO');
    expect(query.skip).toBe(AUTO_VERSION_LIMIT);
    expect(letterVersion.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [11, 12] } } });
  });

  it('does not prune when a NAMED version is taken', async () => {
    await createVersion({ letterId: 1, kind: 'NAMED', name: 'مهمة' });
    expect(letterVersion.findMany).not.toHaveBeenCalled();
    expect(letterVersion.deleteMany).not.toHaveBeenCalled();
  });

  it('records the statistics the backend cannot compute itself', async () => {
    // The server never parses the block model, so word and page counts arrive from the
    // renderer or not at all.
    await createVersion({ letterId: 1, kind: 'AUTO', wordCount: 120, pageCount: 2 });
    const data = letterVersion.create.mock.calls[0][0].data;
    expect(data.wordCount).toBe(120);
    expect(data.pageCount).toBe(2);
  });
});

describe('restoreVersion', () => {
  beforeEach(() => {
    letterVersion.findFirst.mockResolvedValue({
      id: 5,
      letterId: 1,
      kind: 'NAMED',
      contentJson: '{"contentModelVersion":4,"blocks":[{"id":"old"}]}',
      contentModelVersion: 4,
      subject: 'موضوع قديم',
      issueDate: new Date('2025-12-01'),
      recipientName: 'جهة قديمة',
      recipientTitle: null,
      recipientOrganisation: null,
    });
    letter.update.mockResolvedValue({ id: 1 });
  });

  it('takes a PRE_RESTORE snapshot BEFORE overwriting, so restoring is undoable', async () => {
    await restoreVersion({ letterId: 1, versionId: 5 });

    expect(letterVersion.create).toHaveBeenCalled();
    expect(letterVersion.create.mock.calls[0][0].data.kind).toBe('PRE_RESTORE');
    // Order matters: the snapshot must precede the write, or it records the result
    // rather than the thing being replaced.
    expect(letterVersion.create.mock.invocationCallOrder[0])
      .toBeLessThan(letter.update.mock.invocationCallOrder[0]);
  });

  it('writes the version’s content and its section fields onto the letter', async () => {
    await restoreVersion({ letterId: 1, versionId: 5 });
    const data = letter.update.mock.calls[0][0].data;
    expect(data.contentJson).toContain('"old"');
    expect(data.subject).toBe('موضوع قديم');
    expect(data.recipientName).toBe('جهة قديمة');
  });

  it('REFUSES a registered letter, and writes nothing', async () => {
    // A registered letter's content is bound to a frozen snapshot and a permanent
    // number. Rewriting it would make the stored letter disagree with the issued one —
    // the single thing this module exists to prevent.
    letter.findUnique.mockResolvedValue({ ...DRAFT, status: 'REGISTERED' });
    await expect(restoreVersion({ letterId: 1, versionId: 5 })).rejects.toThrow();
    expect(letter.update).not.toHaveBeenCalled();
    expect(letterVersion.create).not.toHaveBeenCalled();
  });
});

describe('deleteVersion', () => {
  it('refuses to delete a PRE_REGISTER snapshot', async () => {
    // It records the document at the moment an irreversible number was burned into it —
    // the one row a later audit is most likely to need.
    letterVersion.findFirst.mockResolvedValue({ id: 7, letterId: 1, kind: 'PRE_REGISTER' });
    await expect(deleteVersion(1, 7)).rejects.toThrow();
    expect(letterVersion.delete).not.toHaveBeenCalled();
  });

  it('deletes any other kind', async () => {
    letterVersion.findFirst.mockResolvedValue({ id: 7, letterId: 1, kind: 'AUTO' });
    await deleteVersion(1, 7);
    expect(letterVersion.delete).toHaveBeenCalledWith({ where: { id: 7 } });
  });
});

/* ══ Comments ══════════════════════════════════════════════════════════════ */

describe('createComment', () => {
  beforeEach(() => {
    letter.findUnique.mockResolvedValue({ id: 1 });
    letterComment.create.mockImplementation(({ data }: { data: unknown }) => Promise.resolve({ id: 4, ...(data as object) }));
  });

  it('stores an anchored comment with its mentions as a text snapshot', async () => {
    await createComment({
      letterId: 1,
      anchorKind: 'block',
      anchorId: 'b7',
      body: 'راجع هذه الفقرة @ahmad',
      mentions: ['ahmad'],
    });
    const data = letterComment.create.mock.calls[0][0].data;
    expect(data.anchorKind).toBe('block');
    expect(data.anchorId).toBe('b7');
    expect(data.mentions).toBe('ahmad');
  });

  it('REFUSES a reply to a reply — threads are one level deep', async () => {
    // A deeper tree is one the sidebar cannot draw and "resolve the thread" cannot
    // scope.
    letterComment.findFirst.mockResolvedValue({ id: 2, parentId: 1 });
    await expect(createComment({ letterId: 1, parentId: 2, body: 'ردّ على ردّ' })).rejects.toThrow();
    expect(letterComment.create).not.toHaveBeenCalled();
  });

  it('gives a reply no anchor of its own', async () => {
    // It belongs to a thread that already has one; storing a second would let the two
    // disagree.
    letterComment.findFirst.mockResolvedValue({ id: 1, parentId: null });
    await createComment({ letterId: 1, parentId: 1, anchorKind: 'block', anchorId: 'b1', body: 'ردّ' });
    const data = letterComment.create.mock.calls[0][0].data;
    expect(data.anchorKind).toBe('document');
    expect(data.anchorId).toBeNull();
  });

  it('refuses a parent that belongs to another letter', async () => {
    letterComment.findFirst.mockResolvedValue(null);
    await expect(createComment({ letterId: 1, parentId: 999, body: 'ردّ' })).rejects.toThrow();
  });
});

describe('listComments', () => {
  it('nests replies under their opening comment', async () => {
    letterComment.findMany.mockResolvedValue([
      { id: 1, parentId: null, body: 'أصل' },
      { id: 2, parentId: 1, body: 'ردّ أول' },
      { id: 3, parentId: null, body: 'أصل آخر' },
      { id: 4, parentId: 1, body: 'ردّ ثانٍ' },
    ]);

    const threads = await listComments(1);
    expect(threads).toHaveLength(2);
    expect(threads[0].replies.map((r) => r.id)).toEqual([2, 4]);
    expect(threads[1].replies).toEqual([]);
  });
});

describe('setCommentResolved', () => {
  it('resolves an opening comment and records who and when', async () => {
    letterComment.findFirst.mockResolvedValue({ id: 1, parentId: null });
    letterComment.update.mockResolvedValue({ id: 1 });

    await setCommentResolved(1, 1, true, { id: 3, name: 'مدير' });
    const data = letterComment.update.mock.calls[0][0].data;
    expect(data.resolved).toBe(true);
    expect(data.resolvedByName).toBe('مدير');
    expect(data.resolvedAt).toBeInstanceOf(Date);
  });

  it('clears the resolver when reopening', async () => {
    letterComment.findFirst.mockResolvedValue({ id: 1, parentId: null });
    letterComment.update.mockResolvedValue({ id: 1 });

    await setCommentResolved(1, 1, false, { id: 3, name: 'مدير' });
    const data = letterComment.update.mock.calls[0][0].data;
    expect(data.resolved).toBe(false);
    expect(data.resolvedAt).toBeNull();
    expect(data.resolvedByName).toBeNull();
  });

  it('REFUSES to resolve a reply', async () => {
    // "Resolved" is a property of a conversation, not of a sentence within it. A
    // half-settled thread is not a state anyone can act on.
    letterComment.findFirst.mockResolvedValue({ id: 2, parentId: 1 });
    await expect(setCommentResolved(1, 2, true, {})).rejects.toThrow();
    expect(letterComment.update).not.toHaveBeenCalled();
  });
});

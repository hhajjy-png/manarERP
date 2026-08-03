/**
 * Letter Engine — list, filter, sort, paginate, and bulk archive.
 *
 * The `where` builder is asserted DIRECTLY rather than through mock call inspection,
 * because it is the piece that must be right: every filter has to reach the database,
 * and none of it may be applied in memory afterwards. A test that only checked "the
 * right rows came back" from a mock would pass even if the filter were being applied
 * client-side.
 *
 * The bulk suite's subject is partial success — the property that stops a forty-letter
 * selection failing because two members of it are cancelled.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { letterRow, letterSequenceRow, letterReferenceRow, timelineRow } = vi.hoisted(() => ({
  letterRow: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  letterSequenceRow: { upsert: vi.fn(), findUnique: vi.fn() },
  letterReferenceRow: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  timelineRow: { create: vi.fn(), findMany: vi.fn() },
}));

vi.mock('@config/database', () => ({
  prisma: {
    letter: letterRow,
    letterSequence: letterSequenceRow,
    letterReference: letterReferenceRow,
    letterTimelineEvent: timelineRow,
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        letter: letterRow,
        letterSequence: letterSequenceRow,
        letterReference: letterReferenceRow,
        letterTimelineEvent: timelineRow,
      }),
    ),
  },
}));

vi.mock('@core/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import * as service from '../letters.service';
import { buildLetterWhere } from '../letters.repository';
import { LETTER_SORT_FIELDS } from '../letters.schema';

/** Flatten the `AND` array the builder produces, for readable assertions. */
function clauses(where: Record<string, unknown>): Record<string, unknown>[] {
  return (where.AND as Record<string, unknown>[]) ?? [];
}

function letter(overrides: Record<string, unknown> = {}) {
  return { id: 1, status: 'REGISTERED', isArchived: false, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  letterRow.findMany.mockResolvedValue([]);
  letterRow.count.mockResolvedValue(0);
  letterRow.update.mockResolvedValue({});
  timelineRow.create.mockResolvedValue({});
});

/* ── The where builder ──────────────────────────────────────────────────── */

describe('buildLetterWhere — every filter reaches the database', () => {
  it('produces an unconstrained query when nothing is filtered', () => {
    expect(buildLetterWhere({ page: 1, pageSize: 20 })).toEqual({});
  });

  it('ORs multiple statuses rather than ANDing them', () => {
    const where = buildLetterWhere({ statuses: ['DRAFT', 'REGISTERED'], page: 1, pageSize: 20 });
    expect(clauses(where)).toContainEqual({ status: { in: ['DRAFT', 'REGISTERED'] } });
  });

  it('filters the archive flag independently of status', () => {
    // The flag is orthogonal, so it must be its own clause and must survive alongside a
    // status filter rather than replacing it.
    const where = buildLetterWhere({ statuses: ['PRINTED'], isArchived: true, page: 1, pageSize: 20 });
    expect(clauses(where)).toContainEqual({ status: { in: ['PRINTED'] } });
    expect(clauses(where)).toContainEqual({ isArchived: true });
  });

  it('expresses registration state as "holds a reference", not as a status', () => {
    // Stronger than any status comparison, and correct for cancelled letters too,
    // since a cancelled number stays bound.
    expect(clauses(buildLetterWhere({ hasReference: true, page: 1, pageSize: 20 })))
      .toContainEqual({ NOT: { reference: null } });
    expect(clauses(buildLetterWhere({ hasReference: false, page: 1, pageSize: 20 })))
      .toContainEqual({ reference: null });
  });

  it('searches across reference, subject and all three recipient fields', () => {
    const where = buildLetterWhere({ search: 'تمديد', page: 1, pageSize: 20 });
    const or = (clauses(where).find((c) => 'OR' in c)?.OR ?? []) as Record<string, unknown>[];
    expect(or).toHaveLength(5);
    expect(or).toContainEqual({ reference: { contains: 'تمديد' } });
    expect(or).toContainEqual({ subject: { contains: 'تمديد' } });
    expect(or).toContainEqual({ recipientName: { contains: 'تمديد' } });
    expect(or).toContainEqual({ recipientTitle: { contains: 'تمديد' } });
    expect(or).toContainEqual({ recipientOrganisation: { contains: 'تمديد' } });
  });

  it('tries an alternate digit spelling alongside the term', () => {
    const where = buildLetterWhere({ search: 'OL-٢٠٢٦', searchAlt: 'OL-2026', page: 1, pageSize: 20 });
    const outer = (clauses(where).find((c) => 'OR' in c)?.OR ?? []) as Record<string, unknown>[];
    expect(outer).toHaveLength(2);
  });

  it('does not duplicate the clause when the alternate equals the term', () => {
    const where = buildLetterWhere({ search: 'abc', searchAlt: 'abc', page: 1, pageSize: 20 });
    const or = (clauses(where).find((c) => 'OR' in c)?.OR ?? []) as Record<string, unknown>[];
    expect(or).toHaveLength(5);
  });

  it('applies both date ranges as inclusive bounds', () => {
    const from = new Date('2026-01-01');
    const to = new Date('2026-12-31');
    const where = buildLetterWhere({ issueDateFrom: from, issueDateTo: to, createdFrom: from, createdTo: to, page: 1, pageSize: 20 });
    expect(clauses(where)).toContainEqual({ issueDate: { gte: from } });
    expect(clauses(where)).toContainEqual({ issueDate: { lte: to } });
    expect(clauses(where)).toContainEqual({ createdAt: { gte: from } });
    expect(clauses(where)).toContainEqual({ createdAt: { lte: to } });
  });

  it('matches creator and registrant by contains', () => {
    const where = buildLetterWhere({ createdBy: 'أحمد', registeredBy: 'سارة', page: 1, pageSize: 20 });
    expect(clauses(where)).toContainEqual({ createdByName: { contains: 'أحمد' } });
    expect(clauses(where)).toContainEqual({ registeredByName: { contains: 'سارة' } });
  });

  it('combines every filter into one AND — filters narrow, never replace', () => {
    const where = buildLetterWhere({
      statuses: ['REGISTERED'],
      isArchived: false,
      hasReference: true,
      search: 'x',
      createdBy: 'a',
      registeredBy: 'b',
      issueDateFrom: new Date('2026-01-01'),
      page: 1,
      pageSize: 20,
    });
    expect(clauses(where).length).toBe(7);
  });
});

/* ── Sorting ────────────────────────────────────────────────────────────── */

describe('Sorting happens in the database, against a closed column list', () => {
  it('defaults to newest first with a stable tie-break', () => {
    // Without the id tie-break, two rows sharing a sort value can swap between page 1
    // and page 2 of the same query — one shown twice, another never.
    void service.listLetters({});
    // Assert through the query the repository issued.
    return Promise.resolve().then(() => {
      expect(letterRow.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
    });
  });

  it.each([...LETTER_SORT_FIELDS])('sorts by %s when asked', async (field) => {
    await service.listLetters({ sortBy: field, sortDir: 'asc' });
    expect(letterRow.findMany.mock.calls[0][0].orderBy).toEqual([{ [field]: 'asc' }, { id: 'asc' }]);
  });

  it('IGNORES an unknown sort column instead of passing it through', async () => {
    // A column name built from unvalidated input is how a list endpoint starts leaking
    // schema details.
    await service.listLetters({ sortBy: 'passwordHash; DROP TABLE letters', sortDir: 'asc' });
    expect(letterRow.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

/* ── Pagination ─────────────────────────────────────────────────────────── */

describe('Pagination is server-side', () => {
  it('translates page and size into skip/take', async () => {
    await service.listLetters({ page: 3, pageSize: 25 });
    const args = letterRow.findMany.mock.calls[0][0];
    expect(args.skip).toBe(50);
    expect(args.take).toBe(25);
  });

  it('clamps hostile or absent paging values', async () => {
    await service.listLetters({ page: -5, pageSize: 100_000 });
    const args = letterRow.findMany.mock.calls[0][0];
    expect(args.skip).toBe(0);
    expect(args.take).toBe(100);

    letterRow.findMany.mockClear();
    await service.listLetters({});
    expect(letterRow.findMany.mock.calls[0][0].take).toBe(20);
  });

  it('counts with EXACTLY the same where as the page — or the pager lies', async () => {
    await service.listLetters({ search: 'x', isArchived: true });
    expect(letterRow.count.mock.calls[0][0].where).toEqual(letterRow.findMany.mock.calls[0][0].where);
  });

  it('issues exactly two queries: the page and its count', async () => {
    await service.listLetters({ search: 'x' });
    expect(letterRow.findMany).toHaveBeenCalledTimes(1);
    expect(letterRow.count).toHaveBeenCalledTimes(1);
  });
});

/* ── Status parsing ─────────────────────────────────────────────────────── */

describe('Status list parsing', () => {
  it('accepts a comma-separated list', async () => {
    await service.listLetters({ status: 'DRAFT,REGISTERED' });
    expect(letterRow.findMany.mock.calls[0][0].where.AND).toContainEqual({
      status: { in: ['DRAFT', 'REGISTERED'] },
    });
  });

  it('drops unknown values rather than failing the page', async () => {
    // A stale bookmark naming a removed status should narrow the list, not break it.
    await service.listLetters({ status: 'DRAFT,ARCHIVED,nonsense' });
    expect(letterRow.findMany.mock.calls[0][0].where.AND).toContainEqual({ status: { in: ['DRAFT'] } });
  });

  it('applies no status clause when every value is unknown', async () => {
    await service.listLetters({ status: 'ARCHIVED' });
    expect(letterRow.findMany.mock.calls[0][0].where).toEqual({});
  });
});

/* ── Bulk archive / unarchive ───────────────────────────────────────────── */

describe('bulkArchive — partial success is the contract', () => {
  it('archives everything eligible and reports each refusal precisely', async () => {
    letterRow.findMany.mockResolvedValue([
      letter({ id: 1, status: 'REGISTERED', isArchived: false }),
      letter({ id: 2, status: 'CANCELLED', isArchived: false }),
      letter({ id: 3, status: 'DRAFT', isArchived: false }),
      letter({ id: 4, status: 'REGISTERED', isArchived: true }),
    ]);

    const result = await service.bulkArchive([1, 2, 3, 4], { id: 7, name: 'admin' });

    expect(result.succeeded).toEqual([1, 3]);
    expect(result.failed.map((f) => f.id)).toEqual([2, 4]);
    expect(result.failed[0].reason).toMatch(/ملغى/);
    expect(result.failed[1].reason).toMatch(/مؤرشف مسبقًا/);
  });

  it('loads the whole selection in ONE query, not one per letter', async () => {
    letterRow.findMany.mockResolvedValue([letter({ id: 1 }), letter({ id: 2 })]);
    await service.bulkArchive([1, 2]);
    expect(letterRow.findMany).toHaveBeenCalledTimes(1);
    expect(letterRow.findMany.mock.calls[0][0]).toEqual({ where: { id: { in: [1, 2] } } });
  });

  it('writes a timeline event for each letter it actually archived', async () => {
    letterRow.findMany.mockResolvedValue([
      letter({ id: 1, status: 'REGISTERED' }),
      letter({ id: 2, status: 'CANCELLED' }),
    ]);
    await service.bulkArchive([1, 2]);
    expect(timelineRow.create).toHaveBeenCalledTimes(1);
    expect(timelineRow.create.mock.calls[0][0].data).toMatchObject({ letterId: 1, eventType: 'ARCHIVED' });
  });

  it('reports a missing id rather than skipping it silently', async () => {
    letterRow.findMany.mockResolvedValue([]);
    const result = await service.bulkArchive([99]);
    expect(result.succeeded).toEqual([]);
    expect(result.failed[0]).toMatchObject({ id: 99, ok: false });
    expect(result.failed[0].reason).toMatch(/غير موجود/);
  });

  it('refuses a row carrying a status this build does not know', async () => {
    letterRow.findMany.mockResolvedValue([letter({ id: 1, status: 'ARCHIVED' })]);
    const result = await service.bulkArchive([1]);
    expect(result.failed[0].reason).toMatch(/حالة غير معروفة/);
  });

  it('never touches status', async () => {
    letterRow.findMany.mockResolvedValue([letter({ id: 1, status: 'REGISTERED' })]);
    await service.bulkArchive([1]);
    expect(letterRow.update.mock.calls[0][0].data).not.toHaveProperty('status');
    expect(letterRow.update.mock.calls[0][0].data.isArchived).toBe(true);
  });
});

describe('bulkUnarchive', () => {
  it('unarchives everything eligible and refuses the rest', async () => {
    letterRow.findMany.mockResolvedValue([
      letter({ id: 1, status: 'REGISTERED', isArchived: true }),
      letter({ id: 2, status: 'REGISTERED', isArchived: false }),
      letter({ id: 3, status: 'CANCELLED', isArchived: true }),
    ]);

    const result = await service.bulkUnarchive([1, 2, 3]);

    expect(result.succeeded).toEqual([1]);
    expect(result.failed[0].reason).toMatch(/غير مؤرشف/);
    expect(result.failed[1].reason).toMatch(/ملغى/);
  });

  it('clears the archive audit columns for each letter it restores', async () => {
    letterRow.findMany.mockResolvedValue([letter({ id: 1, status: 'REGISTERED', isArchived: true })]);
    await service.bulkUnarchive([1]);
    expect(letterRow.update.mock.calls[0][0].data).toEqual({
      isArchived: false,
      archivedAt: null,
      archivedById: null,
      archivedByName: null,
    });
  });
});

/**
 * Letter Engine — data access.
 *
 * The ONLY module that talks to Prisma about letters. Everything above it — the
 * service, the controller — deals in domain arguments and never in query shapes.
 *
 * NO BUSINESS RULES LIVE HERE. No lifecycle check, no permission check, no reference
 * allocation. That separation is what lets the service be read as a list of rules and
 * this file as a list of queries, and it is why `updateDraftContent` below is named
 * for what it is allowed to touch rather than being a general-purpose `update`: a
 * repository function that can write any column is one an accidental caller can use to
 * mutate a registered document.
 */

import { prisma } from '@config/database';
import type { Prisma } from '@prisma/client';
import type { LetterStatus } from './lifecycle';

/** Fields a draft may carry. Every one optional — a draft may be almost empty. */
export interface LetterContentFields {
  issueDate?: Date;
  recipientName?: string | null;
  recipientTitle?: string | null;
  recipientOrganisation?: string | null;
  subject?: string;
  contentJson?: string;
  /** Branding asset ids. `null` clears the selection; `undefined` leaves it alone. */
  signatureAssetId?: string | null;
  stampAssetId?: string | null;
}

export interface CreateLetterInput extends LetterContentFields {
  templateKey: string;
  templateVersion: number;
  layoutVersion: number;
  barcodeVersion: number;
  printProfileId: string;
  contentModelVersion: number;
  issueDate: Date;
  createdById?: number | null;
  createdByName?: string | null;
}

export interface ListLettersFilter {
  /** Empty ⇒ no status constraint. Multiple values are OR-ed. */
  statuses?: readonly LetterStatus[];
  templateKey?: string;
  /** Undefined ⇒ both. The flag is orthogonal to status, so it filters independently. */
  isArchived?: boolean;
  /** `true` ⇒ holds a reference · `false` ⇒ does not · undefined ⇒ either. */
  hasReference?: boolean;
  /** Free text matched across reference, subject and the recipient fields. */
  search?: string;
  /** Alternate spelling of the search term, tried alongside it (Arabic-Indic digits). */
  searchAlt?: string;
  issueDateFrom?: Date;
  issueDateTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  createdBy?: string;
  registeredBy?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

/**
 * Columns the list may be ordered by, mapped to the real column.
 *
 * A closed map rather than a pass-through: `orderBy` built from unvalidated input is
 * how a list endpoint starts leaking schema details, and there is no reason a caller
 * should be able to name a column the UI does not show.
 */
const SORTABLE: Readonly<Record<string, keyof Prisma.LetterOrderByWithRelationInput>> = {
  reference: 'reference',
  subject: 'subject',
  status: 'status',
  issueDate: 'issueDate',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  registeredAt: 'registeredAt',
  createdByName: 'createdByName',
  registeredByName: 'registeredByName',
};

/**
 * Build the ordering.
 *
 * `id` is always appended as a tie-break. Without it, two rows sharing a sort value
 * can swap places between page 1 and page 2 of the same query — the classic unstable
 * pagination bug, where a row is shown twice and another never at all.
 */
function buildOrderBy(
  sortBy?: string,
  sortDir: 'asc' | 'desc' = 'desc',
): Prisma.LetterOrderByWithRelationInput[] {
  const column = sortBy ? SORTABLE[sortBy] : undefined;
  if (!column) return [{ createdAt: 'desc' }, { id: 'desc' }];
  return [{ [column]: sortDir }, { id: sortDir }];
}

/** The free-text clause: one term, matched across five columns. */
function searchClause(term: string): Prisma.LetterWhereInput {
  return {
    OR: [
      { reference: { contains: term } },
      { subject: { contains: term } },
      { recipientName: { contains: term } },
      { recipientTitle: { contains: term } },
      { recipientOrganisation: { contains: term } },
    ],
  };
}

/** Translate the filter into a Prisma `where`. Exported so tests can assert it directly. */
export function buildLetterWhere(filter: ListLettersFilter): Prisma.LetterWhereInput {
  const and: Prisma.LetterWhereInput[] = [];

  if (filter.statuses && filter.statuses.length > 0) and.push({ status: { in: [...filter.statuses] } });
  if (filter.templateKey) and.push({ templateKey: filter.templateKey });
  if (filter.isArchived !== undefined) and.push({ isArchived: filter.isArchived });

  // "Registered" means "holds a permanent number", which is exactly `reference != null`
  // — a stronger statement than any status comparison, and true for cancelled letters
  // too, since a cancelled number stays bound.
  if (filter.hasReference === true) and.push({ NOT: { reference: null } });
  if (filter.hasReference === false) and.push({ reference: null });

  if (filter.search) {
    // The alternate spelling exists so a reference read off paper in Arabic-Indic
    // digits still finds the Latin-digit row it was printed from.
    and.push(
      filter.searchAlt && filter.searchAlt !== filter.search
        ? { OR: [searchClause(filter.search), searchClause(filter.searchAlt)] }
        : searchClause(filter.search),
    );
  }

  if (filter.issueDateFrom) and.push({ issueDate: { gte: filter.issueDateFrom } });
  if (filter.issueDateTo) and.push({ issueDate: { lte: filter.issueDateTo } });
  if (filter.createdFrom) and.push({ createdAt: { gte: filter.createdFrom } });
  if (filter.createdTo) and.push({ createdAt: { lte: filter.createdTo } });
  if (filter.createdBy) and.push({ createdByName: { contains: filter.createdBy } });
  if (filter.registeredBy) and.push({ registeredByName: { contains: filter.registeredBy } });

  return and.length > 0 ? { AND: and } : {};
}

/**
 * Insert a draft.
 *
 * `tx` is required so the row and its `CREATED` timeline event are written together —
 * a letter with no timeline origin, or an origin event for a rolled-back letter, would
 * both be wrong.
 */
export async function createLetter(tx: Prisma.TransactionClient, input: CreateLetterInput) {
  return tx.letter.create({
    data: {
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      layoutVersion: input.layoutVersion,
      barcodeVersion: input.barcodeVersion,
      printProfileId: input.printProfileId,
      contentModelVersion: input.contentModelVersion,
      status: 'DRAFT',
      // Explicitly null, not merely absent: a draft has no reference number, and
      // saying so in the insert makes that a stated fact rather than a default.
      reference: null,
      issueDate: input.issueDate,
      recipientName: input.recipientName ?? null,
      recipientTitle: input.recipientTitle ?? null,
      recipientOrganisation: input.recipientOrganisation ?? null,
      subject: input.subject ?? '',
      contentJson: input.contentJson ?? '',
      createdById: input.createdById ?? null,
      createdByName: input.createdByName ?? null,
    },
  });
}

export async function findLetterById(id: number) {
  return prisma.letter.findUnique({ where: { id } });
}

export async function findLetterByReference(reference: string) {
  return prisma.letter.findUnique({ where: { reference } });
}

/**
 * One page of letters, filtered and sorted **entirely in the database**.
 *
 * Exactly two queries — the page and its count — issued together. Nothing is fetched
 * to be discarded in memory, so a filter that matches three rows out of fifty thousand
 * reads three rows.
 */
export async function listLetters(filter: ListLettersFilter) {
  const where = buildLetterWhere(filter);

  const [items, total] = await Promise.all([
    prisma.letter.findMany({
      where,
      orderBy: buildOrderBy(filter.sortBy, filter.sortDir),
      skip: (filter.page - 1) * filter.pageSize,
      take: filter.pageSize,
    }),
    prisma.letter.count({ where }),
  ]);

  return { items, total, page: filter.page, pageSize: filter.pageSize };
}

/**
 * Load several letters by id, for a bulk operation.
 *
 * One query rather than N: the bulk handlers need each letter's status and flag to
 * apply the lifecycle rule per row, and fetching them individually would turn a
 * 200-item request into 200 round trips.
 */
export async function findLettersByIds(ids: readonly number[]) {
  return prisma.letter.findMany({ where: { id: { in: [...ids] } } });
}

/**
 * Update a draft's content fields.
 *
 * Deliberately narrow. It can write the content columns and nothing else — not
 * status, not reference, not the version stamp, not the snapshot. The service still
 * checks the lifecycle before calling, but a function that structurally CANNOT touch
 * an identity column removes a whole class of accident.
 */
export async function updateDraftContent(id: number, fields: LetterContentFields) {
  return prisma.letter.update({
    where: { id },
    data: {
      ...(fields.issueDate !== undefined ? { issueDate: fields.issueDate } : {}),
      ...(fields.recipientName !== undefined ? { recipientName: fields.recipientName } : {}),
      ...(fields.recipientTitle !== undefined ? { recipientTitle: fields.recipientTitle } : {}),
      ...(fields.recipientOrganisation !== undefined
        ? { recipientOrganisation: fields.recipientOrganisation }
        : {}),
      ...(fields.subject !== undefined ? { subject: fields.subject } : {}),
      ...(fields.contentJson !== undefined ? { contentJson: fields.contentJson } : {}),
      ...(fields.signatureAssetId !== undefined ? { signatureAssetId: fields.signatureAssetId } : {}),
      ...(fields.stampAssetId !== undefined ? { stampAssetId: fields.stampAssetId } : {}),
    },
  });
}

/**
 * Bind a reference and snapshot to a letter, moving it to REGISTERED.
 *
 * `tx` is required, not optional: registration must happen inside the same
 * transaction that allocated the number, so that a failure here cannot leave an
 * allocated reference bound to a letter still marked DRAFT.
 *
 * This is the ONLY function that ever writes `registrationSnapshotJson`, which is how
 * "written once, never updated" is enforced structurally rather than by convention.
 */
export async function markRegistered(
  tx: Prisma.TransactionClient,
  id: number,
  data: {
    reference: string;
    snapshotJson: string;
    registeredAt: Date;
    registeredById?: number | null;
    registeredByName?: string | null;
  },
) {
  return tx.letter.update({
    where: { id },
    data: {
      status: 'REGISTERED',
      reference: data.reference,
      registrationSnapshotJson: data.snapshotJson,
      registeredAt: data.registeredAt,
      registeredById: data.registeredById ?? null,
      registeredByName: data.registeredByName ?? null,
    },
  });
}

/**
 * Raise the archive flag. Does NOT touch `status` — archiving is a separate axis.
 *
 * `tx` is required so the flag change and its timeline event are written together: an
 * event that survived a rolled-back flag change would describe something that never
 * happened.
 */
export async function setArchived(
  tx: Prisma.TransactionClient,
  id: number,
  data: { archivedAt: Date; archivedById?: number | null; archivedByName?: string | null },
) {
  return tx.letter.update({
    where: { id },
    data: {
      isArchived: true,
      archivedAt: data.archivedAt,
      archivedById: data.archivedById ?? null,
      archivedByName: data.archivedByName ?? null,
    },
  });
}

/**
 * Lower the archive flag and CLEAR the archive audit columns.
 *
 * Clearing is correct because those columns describe the current archiving, and there
 * is none once the flag is down. The fact that it was ever archived is not lost — the
 * timeline keeps it, which is precisely why the timeline exists.
 */
export async function setUnarchived(tx: Prisma.TransactionClient, id: number) {
  return tx.letter.update({
    where: { id },
    data: { isArchived: false, archivedAt: null, archivedById: null, archivedByName: null },
  });
}

export async function markCancelled(
  tx: Prisma.TransactionClient,
  id: number,
  data: {
    reason: string;
    cancelledAt: Date;
    cancelledById?: number | null;
    cancelledByName?: string | null;
  },
) {
  return tx.letter.update({
    where: { id },
    data: {
      status: 'CANCELLED',
      cancelReason: data.reason,
      cancelledAt: data.cancelledAt,
      cancelledById: data.cancelledById ?? null,
      cancelledByName: data.cancelledByName ?? null,
    },
  });
}

/**
 * Hard-delete a letter row.
 *
 * The service permits this for DRAFT only. It is exposed without a status filter of
 * its own because the lifecycle rule belongs in one place — the service — rather than
 * being half-enforced in two.
 */
export async function deleteLetter(id: number) {
  return prisma.letter.delete({ where: { id } });
}

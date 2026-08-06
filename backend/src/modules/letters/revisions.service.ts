/**
 * Letter Engine — version history and comments (Professional Document Automation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BACKEND STORES SNAPSHOTS AND THREADS. IT UNDERSTANDS NEITHER.
 * ══════════════════════════════════════════════════════════════════════════
 * A version's `contentJson` is the frontend's block model, stored verbatim and never
 * parsed — the same contract `letters.contentJson` already has. A comment's anchor is
 * an opaque string. Comparing two versions, rendering a diff and deciding what a
 * change means are all the renderer's work, because the renderer is the only thing
 * that owns the model.
 *
 * That division is why this file is short. It allocates sequence numbers, enforces the
 * retention cap, and keeps threads consistent. It has no opinion about documents.
 *
 * ── RESTORING IS A WRITE, NOT A REWIND ───────────────────────────────────
 * `restoreVersion` takes a PRE_RESTORE snapshot first, then overwrites the letter. So
 * restoring is itself undoable, and the history is append-only: nothing is ever
 * removed by going backwards. An author who restores the wrong version has not lost
 * the one they were on.
 */

import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';

/* ── Versions ───────────────────────────────────────────────────────────── */

/**
 * How many AUTO snapshots a letter keeps.
 *
 * Named versions and the two lifecycle snapshots (`PRE_RESTORE`, `PRE_REGISTER`) are
 * NEVER pruned: a version someone deliberately named, or one taken at an irreversible
 * moment, is exactly the one worth keeping. Only the periodic ones age out, oldest
 * first, so history stays useful without growing without bound.
 */
export const AUTO_VERSION_LIMIT = 30;

export type VersionKind = 'AUTO' | 'NAMED' | 'PRE_RESTORE' | 'PRE_REGISTER';

export interface CreateVersionInput {
  readonly letterId: number;
  readonly kind: VersionKind;
  readonly name?: string | null;
  readonly note?: string | null;
  /** Statistics computed by the RENDERER — the backend cannot count words it will not parse. */
  readonly wordCount?: number;
  readonly pageCount?: number;
  readonly actorId?: number | null;
  readonly actorName?: string | null;
}

/**
 * Snapshot the letter as it stands.
 *
 * The content is read from the LETTER inside the same transaction rather than accepted
 * from the request. A client-supplied snapshot could disagree with what is stored, and
 * a version history that records something the letter never contained is worse than no
 * history at all.
 */
export async function createVersion(input: CreateVersionInput) {
  return prisma.$transaction((tx) => createVersionInTransaction(tx, input));
}

/** The subset of the client this writer touches — so a caller's `tx` satisfies it. */
type VersionTransaction = Pick<typeof prisma, 'letter' | 'letterVersion'>;

/**
 * The body of {@link createVersion}, against a caller-supplied transaction.
 *
 * `registerLetter` needs its PRE_REGISTER snapshot to live or die with the registration
 * itself: a snapshot describing a number that was never issued is worse than no snapshot.
 * It therefore joins that transaction rather than opening a second one.
 */
export async function createVersionInTransaction(
  tx: VersionTransaction,
  input: CreateVersionInput,
) {
  const letter = await tx.letter.findUnique({ where: { id: input.letterId } });
  if (!letter) throw new AppError('الخطاب غير موجود.', 404);

  const highest = await tx.letterVersion.aggregate({
    where: { letterId: input.letterId },
    _max: { sequence: true },
  });
  const sequence = (highest._max.sequence ?? 0) + 1;

  const created = await tx.letterVersion.create({
    data: {
      letterId: input.letterId,
      sequence,
      kind: input.kind,
      name: input.name ?? null,
      note: input.note ?? null,
      contentJson: letter.contentJson,
      contentModelVersion: letter.contentModelVersion,
      subject: letter.subject,
      issueDate: letter.issueDate,
      recipientName: letter.recipientName,
      recipientTitle: letter.recipientTitle,
      recipientOrganisation: letter.recipientOrganisation,
      wordCount: input.wordCount ?? 0,
      pageCount: input.pageCount ?? 0,
      createdById: input.actorId ?? null,
      createdByName: input.actorName ?? null,
    },
  });

  // Prune inside the SAME transaction, so a letter can never briefly hold more than the
  // cap and a concurrent read can never see the excess. Only AUTO is eligible: NAMED is
  // the author's deliberate marker, and the two lifecycle kinds are the record of an
  // irreversible act.
  if (input.kind === 'AUTO') {
    const autos = await tx.letterVersion.findMany({
      where: { letterId: input.letterId, kind: 'AUTO' },
      orderBy: { sequence: 'desc' },
      select: { id: true },
      skip: AUTO_VERSION_LIMIT,
    });
    if (autos.length > 0) {
      await tx.letterVersion.deleteMany({ where: { id: { in: autos.map((v) => v.id) } } });
    }
  }

  return created;
}

/**
 * The version list.
 *
 * `contentJson` is deliberately OMITTED: a letter with thirty versions would otherwise
 * send thirty copies of the document to render a sidebar. The content is fetched one
 * version at a time, when something actually needs it.
 */
export async function listVersions(letterId: number) {
  return prisma.letterVersion.findMany({
    where: { letterId },
    orderBy: { sequence: 'desc' },
    select: {
      id: true,
      sequence: true,
      kind: true,
      name: true,
      note: true,
      subject: true,
      wordCount: true,
      pageCount: true,
      createdById: true,
      createdByName: true,
      createdAt: true,
      contentModelVersion: true,
    },
  });
}

/** One version in full, content included — for restore and for compare. */
export async function getVersion(letterId: number, versionId: number) {
  const version = await prisma.letterVersion.findFirst({ where: { id: versionId, letterId } });
  if (!version) throw new AppError('النسخة غير موجودة.', 404);
  return version;
}

export interface RestoreInput {
  readonly letterId: number;
  readonly versionId: number;
  readonly actorId?: number | null;
  readonly actorName?: string | null;
}

/**
 * Restore a version onto the letter.
 *
 * Refused on anything but a DRAFT. A registered letter's content is bound to a frozen
 * snapshot and a permanent number; rewriting it would make the stored letter disagree
 * with the one that was issued — which is the single thing this module exists to
 * prevent.
 */
export async function restoreVersion(input: RestoreInput) {
  const letter = await prisma.letter.findUnique({ where: { id: input.letterId } });
  if (!letter) throw new AppError('الخطاب غير موجود.', 404);
  if (letter.status !== 'DRAFT') {
    throw new AppError('لا يمكن استعادة نسخة إلى خطاب مسجَّل — محتواه مُجمَّد.', 409);
  }

  // Taken BEFORE the overwrite, so restoring is itself undoable.
  await createVersion({
    letterId: input.letterId,
    kind: 'PRE_RESTORE',
    note: `قبل الاستعادة إلى النسخة رقم ${input.versionId}`,
    actorId: input.actorId,
    actorName: input.actorName,
  });

  const version = await getVersion(input.letterId, input.versionId);

  return prisma.letter.update({
    where: { id: input.letterId },
    data: {
      contentJson: version.contentJson,
      contentModelVersion: version.contentModelVersion,
      subject: version.subject,
      issueDate: version.issueDate,
      recipientName: version.recipientName,
      recipientTitle: version.recipientTitle,
      recipientOrganisation: version.recipientOrganisation,
    },
  });
}

/**
 * Delete a version.
 *
 * A `PRE_REGISTER` snapshot cannot be deleted: it records the document at the moment
 * an irreversible number was burned into it, and that is the one row a later audit is
 * most likely to need.
 */
export async function deleteVersion(letterId: number, versionId: number) {
  const version = await getVersion(letterId, versionId);
  if (version.kind === 'PRE_REGISTER') {
    throw new AppError('لا يمكن حذف لقطة ما قبل التسجيل — هي سجل لحظة إصدار الرقم المرجعي.', 409);
  }
  await prisma.letterVersion.delete({ where: { id: versionId } });
}

/* ── Comments ───────────────────────────────────────────────────────────── */

export type CommentAnchorKind = 'block' | 'object' | 'section' | 'document';

export interface CreateCommentInput {
  readonly letterId: number;
  readonly parentId?: number | null;
  readonly anchorKind?: CommentAnchorKind;
  readonly anchorId?: string | null;
  readonly body: string;
  readonly mentions?: readonly string[];
  readonly actorId?: number | null;
  readonly actorName?: string | null;
}

export async function createComment(input: CreateCommentInput) {
  const letter = await prisma.letter.findUnique({ where: { id: input.letterId }, select: { id: true } });
  if (!letter) throw new AppError('الخطاب غير موجود.', 404);

  if (input.parentId != null) {
    const parent = await prisma.letterComment.findFirst({
      where: { id: input.parentId, letterId: input.letterId },
      select: { id: true, parentId: true },
    });
    if (!parent) throw new AppError('التعليق الأصل غير موجود.', 404);
    // One level only. A reply to a reply would make the thread a tree the sidebar
    // cannot draw and the "resolve the thread" action cannot scope.
    if (parent.parentId != null) throw new AppError('لا يمكن الرد على ردّ — الردود بمستوى واحد.', 400);
  }

  return prisma.letterComment.create({
    data: {
      letterId: input.letterId,
      parentId: input.parentId ?? null,
      // A reply inherits its parent's anchor implicitly by belonging to the thread;
      // storing its own would let the two disagree.
      anchorKind: input.parentId != null ? 'document' : input.anchorKind ?? 'document',
      anchorId: input.parentId != null ? null : input.anchorId ?? null,
      body: input.body,
      mentions: (input.mentions ?? []).join(','),
      createdById: input.actorId ?? null,
      createdByName: input.actorName ?? null,
    },
  });
}

/** Every comment on a letter, opening comments first with their replies attached. */
export async function listComments(letterId: number) {
  const rows = await prisma.letterComment.findMany({
    where: { letterId },
    orderBy: { createdAt: 'asc' },
  });

  const replies = new Map<number, typeof rows>();
  for (const row of rows) {
    if (row.parentId == null) continue;
    const bucket = replies.get(row.parentId) ?? [];
    bucket.push(row);
    replies.set(row.parentId, bucket);
  }

  return rows
    .filter((row) => row.parentId == null)
    .map((row) => ({ ...row, replies: replies.get(row.id) ?? [] }));
}

/**
 * Resolve or reopen a thread.
 *
 * Applied to the OPENING comment and never to a reply: "resolved" is a property of a
 * conversation, not of a sentence within it. Resolving a reply would leave a thread
 * that is half-settled, which is not a state anyone can act on.
 */
export async function setCommentResolved(
  letterId: number,
  commentId: number,
  resolved: boolean,
  actor: { id?: number | null; name?: string | null },
) {
  const comment = await prisma.letterComment.findFirst({ where: { id: commentId, letterId } });
  if (!comment) throw new AppError('التعليق غير موجود.', 404);
  if (comment.parentId != null) throw new AppError('تُغلق المناقشة من تعليقها الأول لا من ردٍّ فيها.', 400);

  return prisma.letterComment.update({
    where: { id: commentId },
    data: {
      resolved,
      resolvedById: resolved ? actor.id ?? null : null,
      resolvedByName: resolved ? actor.name ?? null : null,
      resolvedAt: resolved ? new Date() : null,
    },
  });
}

/** Delete a comment. Deleting an opening comment removes its replies by cascade. */
export async function deleteComment(letterId: number, commentId: number) {
  const comment = await prisma.letterComment.findFirst({ where: { id: commentId, letterId }, select: { id: true } });
  if (!comment) throw new AppError('التعليق غير موجود.', 404);
  await prisma.letterComment.delete({ where: { id: commentId } });
}

/**
 * Letter Engine — HTTP handlers.
 *
 * Thin by design: read the request, call the service, shape the response. There is not
 * one lifecycle rule in this file. Every "can this happen?" question lives in
 * `letters.service.ts`, so that the answer is the same whether it is asked over HTTP,
 * from a test, or from a future internal caller.
 */

import { Request, Response } from 'express';
import { ok, created, noContent } from '@core/utils/response';
import { asyncHandler } from '@core/utils/asyncHandler';
import * as service from './letters.service';
import * as revisions from './revisions.service';
import { listGaps } from './reference.service';
import { OFFICIAL_LETTER_KEY } from './letterTemplates.constants';
import { parseStoredSnapshot } from './snapshot';

/** The acting user, as a text snapshot — never a foreign key. */
function actorFrom(req: Request): service.Actor {
  return { id: req.user?.userId, name: req.user?.username };
}

/**
 * Shape a stored row for the wire.
 *
 * The snapshot is returned PARSED rather than as the raw stored string, so a consumer
 * never has to know it is persisted as JSON text. `contentJson` is passed through
 * untouched — it is the frontend's block model and the backend does not interpret it.
 */
function present(letter: Awaited<ReturnType<typeof service.getLetter>>) {
  return {
    id: letter.id,
    templateKey: letter.templateKey,
    versions: {
      templateVersion: letter.templateVersion,
      layoutVersion: letter.layoutVersion,
      barcodeVersion: letter.barcodeVersion,
    },
    printProfileId: letter.printProfileId,
    status: letter.status,
    // Orthogonal to `status`, and presented that way so a consumer never reads it as
    // a sixth state.
    isArchived: letter.isArchived,
    reference: letter.reference,
    issueDate: letter.issueDate,
    recipient: {
      name: letter.recipientName,
      title: letter.recipientTitle,
      organisation: letter.recipientOrganisation,
    },
    subject: letter.subject,
    contentJson: letter.contentJson,
    contentModelVersion: letter.contentModelVersion,
    // Ids into the existing branding registry — the frontend resolves them to images.
    // `null` is a real answer ("no signature"), not a missing value.
    signatureAssetId: letter.signatureAssetId,
    stampAssetId: letter.stampAssetId,
    registrationSnapshot: parseStoredSnapshot(letter.registrationSnapshotJson),
    // Audit trio: who did it and when, for each of the three recorded actions.
    createdBy: { id: letter.createdById, name: letter.createdByName },
    registeredBy: { id: letter.registeredById, name: letter.registeredByName },
    registeredAt: letter.registeredAt,
    archivedBy: { id: letter.archivedById, name: letter.archivedByName },
    archivedAt: letter.archivedAt,
    cancelledBy: { id: letter.cancelledById, name: letter.cancelledByName },
    cancelledAt: letter.cancelledAt,
    cancelReason: letter.cancelReason,
    createdAt: letter.createdAt,
    updatedAt: letter.updatedAt,
  };
}

/** A validated query value → Date, or undefined. */
function asDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || value === '') return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const q = req.query;
  // Absent ⇒ both archived and unarchived. The flag filters independently of status.
  const archived = q.isArchived;

  const result = await service.listLetters({
    search: asString(q.search),
    status: asString(q.status),
    isArchived: archived === undefined ? undefined : archived === 'true',
    registrationState: asString(q.registrationState) as 'registered' | 'unregistered' | undefined,
    issueDateFrom: asDate(q.issueDateFrom),
    issueDateTo: asDate(q.issueDateTo),
    createdFrom: asDate(q.createdFrom),
    createdTo: asDate(q.createdTo),
    createdBy: asString(q.createdBy),
    registeredBy: asString(q.registeredBy),
    templateKey: asString(q.templateKey),
    sortBy: asString(q.sortBy),
    sortDir: asString(q.sortDir) as 'asc' | 'desc' | undefined,
    page: Number(q.page) || undefined,
    pageSize: Number(q.pageSize) || undefined,
  });

  ok(res, {
    items: result.items.map(present),
    // `totalPages` is computed here rather than by every consumer — the workspace
    // pager and any future consumer must agree on where the last page is.
    meta: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / result.pageSize)),
    },
  });
});

export const bulkArchive = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.bulkArchive(req.body.ids, actorFrom(req));
  ok(res, result, `تمت أرشفة ${result.succeeded.length} خطاب`);
});

export const bulkUnarchive = asyncHandler(async (req: Request, res: Response) => {
  const result = await service.bulkUnarchive(req.body.ids, actorFrom(req));
  ok(res, result, `تم إخراج ${result.succeeded.length} خطاب من الأرشيف`);
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  ok(res, present(await service.getLetter(Number(req.params.id))));
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const letter = await service.createDraft(req.body, actorFrom(req));
  created(res, present(letter), 'تم إنشاء المسودة');
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  // The actor is passed so a signature or stamp change lands on the timeline with a
  // name against it — the whole point of auditing a reversible action.
  ok(res, present(await service.updateDraft(Number(req.params.id), req.body, actorFrom(req))), 'تم حفظ المسودة');
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const letter = await service.registerLetter(Number(req.params.id), req.body.snapshot, actorFrom(req));
  ok(res, present(letter), `تم تسجيل الخطاب برقم ${letter.reference}`);
});

export const archive = asyncHandler(async (req: Request, res: Response) => {
  ok(res, present(await service.archiveLetter(Number(req.params.id), actorFrom(req))), 'تمت أرشفة الخطاب');
});

export const unarchive = asyncHandler(async (req: Request, res: Response) => {
  ok(res, present(await service.unarchiveLetter(Number(req.params.id), actorFrom(req))), 'تم إخراج الخطاب من الأرشيف');
});

export const cancel = asyncHandler(async (req: Request, res: Response) => {
  const letter = await service.cancelLetter(Number(req.params.id), req.body.reason, actorFrom(req));
  ok(res, present(letter), 'تم إلغاء الخطاب — ويبقى رقمه المرجعي محجوزًا');
});

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await service.deleteDraft(Number(req.params.id));
  noContent(res, 'تم حذف المسودة');
});

/**
 * The gap register.
 *
 * A read-only audit view: every missing or cancelled slot in a template-year's
 * sequence, with the reason where one exists. Exposed because gaps in an official
 * register are normal but must be EXPLICABLE — hiding them is what turns a routine
 * cancellation into an audit finding.
 */
export const gaps = asyncHandler(async (req: Request, res: Response) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const templateKey = (req.query.templateKey as string | undefined) ?? OFFICIAL_LETTER_KEY;
  ok(res, { templateKey, year, gaps: await listGaps(templateKey, year) });
});

/* ── Version history and comments (Professional Document Automation v1) ──── */

/**
 * The actor, as a text snapshot.
 *
 * Name and id are stored, never a foreign key — the same choice the timeline already
 * makes. A version must stay readable after the user who took it is deleted, because
 * it is a record of what happened rather than a pointer to who is still employed.
 */
function actorOf(req: Request) {
  const user = (req as Request & { user?: { id: number; fullName?: string; username?: string } }).user;
  return { id: user?.id ?? null, name: user?.fullName ?? user?.username ?? null };
}

export const listVersions = asyncHandler(async (req: Request, res: Response) => {
  const versions = await revisions.listVersions(Number(req.params.id));
  ok(res, versions);
});

export const getVersion = asyncHandler(async (req: Request, res: Response) => {
  const version = await revisions.getVersion(Number(req.params.id), Number(req.params.versionId));
  ok(res, version);
});

export const createVersion = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const version = await revisions.createVersion({
    letterId: Number(req.params.id),
    kind: req.body.kind ?? 'AUTO',
    name: req.body.name ?? null,
    note: req.body.note ?? null,
    wordCount: req.body.wordCount,
    pageCount: req.body.pageCount,
    actorId: actor.id,
    actorName: actor.name,
  });
  created(res, version, 'تم حفظ نسخة من الخطاب');
});

export const restoreVersion = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const letter = await revisions.restoreVersion({
    letterId: Number(req.params.id),
    versionId: Number(req.params.versionId),
    actorId: actor.id,
    actorName: actor.name,
  });
  ok(res, letter);
});

export const deleteVersion = asyncHandler(async (req: Request, res: Response) => {
  await revisions.deleteVersion(Number(req.params.id), Number(req.params.versionId));
  noContent(res);
});

export const listComments = asyncHandler(async (req: Request, res: Response) => {
  const comments = await revisions.listComments(Number(req.params.id));
  ok(res, comments);
});

export const createComment = asyncHandler(async (req: Request, res: Response) => {
  const actor = actorOf(req);
  const comment = await revisions.createComment({
    letterId: Number(req.params.id),
    parentId: req.body.parentId ?? null,
    anchorKind: req.body.anchorKind,
    anchorId: req.body.anchorId ?? null,
    body: req.body.body,
    mentions: req.body.mentions,
    actorId: actor.id,
    actorName: actor.name,
  });
  created(res, comment, 'تمت إضافة التعليق');
});

export const resolveComment = asyncHandler(async (req: Request, res: Response) => {
  const comment = await revisions.setCommentResolved(
    Number(req.params.id),
    Number(req.params.commentId),
    req.body.resolved,
    actorOf(req),
  );
  ok(res, comment);
});

export const deleteComment = asyncHandler(async (req: Request, res: Response) => {
  await revisions.deleteComment(Number(req.params.id), Number(req.params.commentId));
  noContent(res);
});

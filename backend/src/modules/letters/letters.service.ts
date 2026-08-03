/**
 * Letter Engine — business logic.
 *
 * Every lifecycle rule in the module is enforced HERE and nowhere else. The controller
 * translates HTTP; the repository runs queries; this file decides what is allowed.
 *
 * ── THE FOUR PROHIBITIONS THIS FILE EXISTS TO ENFORCE ────────────────────
 *   1. A document cannot be registered twice — a second permanent number would be
 *      issued for one document, and both would be on paper somewhere.
 *   2. A registered, archived or cancelled document cannot be edited — its content is
 *      bound to a frozen snapshot and a number that has already been communicated.
 *   3. A document that holds a reference cannot be deleted — deletion would leave an
 *      unexplained hole in an official register. Withdrawal is `cancel`.
 *   4. A cancelled document cannot be restored — reinstating a withdrawn official
 *      document by flipping a status would erase the fact that it was withdrawn.
 *
 * Each is checked against the pure state machine in `lifecycle.ts` rather than with an
 * ad-hoc `if`, so the rules can be read as one table and tested exhaustively without a
 * database.
 */

import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import {
  type LetterStatus,
  type LetterTransition,
  LETTER_STATUS_LABELS_AR,
  canArchive,
  canDelete,
  canEdit,
  canTransition,
  canUnarchive,
  explainArchiveRefusal,
  explainRefusal,
  isLetterStatus,
  nextStatus,
} from './lifecycle';
import { recordEvent, type TimelineEventType } from './timeline.service';
import {
  BARCODE_VERSION_LATEST,
  CONTENT_MODEL_VERSION,
  DEFAULT_PRINT_PROFILE_ID,
  LAYOUT_VERSION_LATEST,
  OFFICIAL_LETTER_KEY,
  TEMPLATE_VERSION_LATEST,
  isCreatableTemplateKey,
} from './letterTemplates.constants';
import * as repo from './letters.repository';
import { allocateReferenceInTransaction, cancelReference } from './reference.service';
import {
  type RegistrationSnapshot,
  registrationSnapshotSchema,
  serialiseSnapshot,
  withAllocatedReference,
} from './snapshot';

/** Who is acting. A text snapshot, never a foreign key. */
export interface Actor {
  readonly id?: number | null;
  readonly name?: string | null;
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

/** Load a letter or fail with 404. */
async function loadLetter(id: number) {
  const letter = await repo.findLetterById(id);
  if (!letter) throw AppError.notFound('الخطاب غير موجود.');
  return letter;
}

/**
 * Read a stored status, refusing anything the state machine does not declare.
 *
 * A row carrying an unknown status is corrupt data, and guessing what it meant is how
 * a corrupt row becomes a wrong decision about an official document.
 */
function readStatus(raw: string): LetterStatus {
  if (!isLetterStatus(raw)) {
    throw AppError.internal(`حالة غير معروفة مخزَّنة للخطاب: «${raw}».`);
  }
  return raw;
}

/** Assert a transition is legal, with a reason naming the actual state. */
function assertTransition(from: LetterStatus, transition: LetterTransition): LetterStatus {
  if (!canTransition(from, transition)) {
    throw AppError.conflict(explainRefusal(from, transition));
  }
  // `canTransition` has just confirmed this resolves.
  return nextStatus(from, transition) as LetterStatus;
}

/* ── Create ─────────────────────────────────────────────────────────────── */

export interface CreateDraftInput {
  templateKey?: string;
  issueDate?: Date;
  recipientName?: string | null;
  recipientTitle?: string | null;
  recipientOrganisation?: string | null;
  subject?: string;
  contentJson?: string;
}

/**
 * Create a draft.
 *
 * The version stamp and print profile are applied by the SERVER from its mirrored
 * constants, never taken from the request. A client-chosen version stamp would let a
 * document mislabel which rules it was issued under — and that label is exactly what a
 * faithful reprint depends on.
 *
 * No reference number is allocated. That happens at registration and nowhere else.
 */
export async function createDraft(input: CreateDraftInput, actor: Actor = {}) {
  const templateKey = input.templateKey ?? OFFICIAL_LETTER_KEY;
  if (!isCreatableTemplateKey(templateKey)) {
    throw AppError.badRequest(
      `القالب «${templateKey}» غير متاح. الإصدار الأول يدعم «خطاب رسمي» فقط.`,
    );
  }

  return prisma.$transaction(async (tx) => {
    const letter = await repo.createLetter(tx, {
      templateKey,
      templateVersion: TEMPLATE_VERSION_LATEST,
      layoutVersion: LAYOUT_VERSION_LATEST,
      barcodeVersion: BARCODE_VERSION_LATEST,
      printProfileId: DEFAULT_PRINT_PROFILE_ID,
      contentModelVersion: CONTENT_MODEL_VERSION,
      issueDate: input.issueDate ?? new Date(),
      recipientName: input.recipientName ?? null,
      recipientTitle: input.recipientTitle ?? null,
      recipientOrganisation: input.recipientOrganisation ?? null,
      subject: input.subject ?? '',
      contentJson: input.contentJson ?? '',
      createdById: actor.id ?? null,
      createdByName: actor.name ?? null,
    });

    // The timeline's anchor. Not a transition, but a timeline that begins at the first
    // transition cannot say when the document came into existence or who made it.
    await recordEvent(tx, {
      letterId: letter.id,
      eventType: 'CREATED',
      fromStatus: null,
      toStatus: 'DRAFT',
      actor,
    });

    return letter;
  });
}

/* ── Read ───────────────────────────────────────────────────────────────── */

export async function getLetter(id: number) {
  return loadLetter(id);
}

export interface ListLettersParams {
  search?: string;
  /** Comma-separated status list. Unknown values are dropped, not rejected. */
  status?: string;
  isArchived?: boolean;
  registrationState?: 'registered' | 'unregistered';
  issueDateFrom?: Date;
  issueDateTo?: Date;
  createdFrom?: Date;
  createdTo?: Date;
  createdBy?: string;
  registeredBy?: string;
  templateKey?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

/**
 * Arabic-Indic digits → Latin.
 *
 * A reference number is printed in whichever digit shape the document used, and a user
 * searching for it types what they see. Without this, `OL-٢٠٢٦-٠٠٠٠٠١` finds nothing.
 */
function toLatinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (d) => {
    const code = d.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

export async function listLetters(params: ListLettersParams) {
  // Unknown status values are dropped rather than rejected: a stale bookmark naming a
  // status this build no longer has should narrow the list, not fail the page.
  const statuses = (params.status ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is LetterStatus => isLetterStatus(s));

  const search = params.search?.trim() || undefined;

  return repo.listLetters({
    statuses,
    templateKey: params.templateKey,
    isArchived: params.isArchived,
    hasReference:
      params.registrationState === 'registered'
        ? true
        : params.registrationState === 'unregistered'
          ? false
          : undefined,
    search,
    searchAlt: search ? toLatinDigits(search) : undefined,
    issueDateFrom: params.issueDateFrom,
    issueDateTo: params.issueDateTo,
    createdFrom: params.createdFrom,
    createdTo: params.createdTo,
    createdBy: params.createdBy?.trim() || undefined,
    registeredBy: params.registeredBy?.trim() || undefined,
    sortBy: params.sortBy,
    sortDir: params.sortDir,
    page: Math.max(1, params.page ?? 1),
    pageSize: Math.min(100, Math.max(1, params.pageSize ?? 20)),
  });
}

/* ── Update ─────────────────────────────────────────────────────────────── */

/**
 * Save changes to a draft.
 *
 * Draft only. Once a document is registered its content is bound to a frozen snapshot
 * and to a number that has already been communicated; an edit afterwards would make
 * the system's copy disagree with the copy in the recipient's file.
 */
export async function updateDraft(
  id: number,
  fields: repo.LetterContentFields,
  actor: Actor = {},
  now: Date = new Date(),
) {
  const letter = await loadLetter(id);
  const status = readStatus(letter.status);

  if (!canEdit(status)) {
    // The label comes from the one status map rather than an inline ladder, so a new
    // status can never arrive here as an untranslated code.
    throw AppError.conflict(
      `لا يمكن تعديل خطاب في حالة «${LETTER_STATUS_LABELS_AR[status]}» — محتوى الخطاب يُجمَّد عند التسجيل.`,
    );
  }

  // Signature and stamp are recorded on the timeline because they are REVERSIBLE: the
  // row keeps only the current choice, so a selection that is later changed would
  // otherwise leave no trace that it was ever made. Computed BEFORE the write, against
  // the stored values, so the comparison is against what was actually there.
  const events = brandingTimelineEvents(letter, fields);

  const updated = await repo.updateDraftContent(id, fields);

  // After the write and outside any transaction on purpose: a timeline row is a record
  // of something that already happened, and failing to describe a successful edit must
  // not undo the edit itself. Content changes are not audited at this granularity —
  // only these two, because only these two are reversible selections the user makes
  // deliberately and may be asked to account for.
  for (const event of events) {
    await recordEvent(prisma, { letterId: id, reference: letter.reference, actor, occurredAt: now, ...event });
  }

  return updated;
}

/** Which signature/stamp events an update implies, if any. */
function brandingTimelineEvents(
  letter: { signatureAssetId: string | null; stampAssetId: string | null },
  fields: repo.LetterContentFields,
): { eventType: TimelineEventType; reason: string | null }[] {
  const events: { eventType: TimelineEventType; reason: string | null }[] = [];

  const pairs = [
    { next: fields.signatureAssetId, current: letter.signatureAssetId, added: 'SIGNATURE_ADDED', removed: 'SIGNATURE_REMOVED' },
    { next: fields.stampAssetId, current: letter.stampAssetId, added: 'STAMP_ADDED', removed: 'STAMP_REMOVED' },
  ] as const;

  for (const { next, current, added, removed } of pairs) {
    // `undefined` means the field was not part of this request at all — not a clear.
    if (next === undefined) continue;
    const normalised = next === '' ? null : next;
    if (normalised === current) continue;
    events.push(
      normalised === null
        ? { eventType: removed, reason: current }
        : { eventType: added, reason: normalised },
    );
  }

  return events;
}

/* ── Register — the only place a reference number is created ────────────── */

/**
 * Register a draft: allocate its permanent reference number and freeze its snapshot.
 *
 * ONE TRANSACTION covering the counter advance, the register insert, the reference
 * binding and the snapshot write. A partial failure would otherwise produce one of the
 * two worst outcomes available in this module: an allocated number bound to nothing
 * (a permanent unexplained gap), or a letter marked registered with no number.
 *
 * The snapshot is supplied by the caller and only VALIDATED here — the backend has no
 * renderer and must never compute a second opinion about what the page looks like.
 */
export async function registerLetter(
  id: number,
  rawSnapshot: unknown,
  actor: Actor = {},
  now: Date = new Date(),
) {
  const letter = await loadLetter(id);
  const status = readStatus(letter.status);

  assertTransition(status, 'register');

  // Belt and braces alongside the state machine: a DRAFT row carrying a reference
  // would mean an earlier allocation half-succeeded, and issuing a second number for
  // the same document is not something to do on the strength of a status column alone.
  if (letter.reference) {
    throw AppError.conflict(
      `الخطاب يحمل رقمًا مرجعيًا مسبقًا (${letter.reference}) — لا يمكن إصدار رقم ثانٍ.`,
    );
  }

  const parsed = registrationSnapshotSchema.safeParse(rawSnapshot);
  if (!parsed.success) {
    throw AppError.badRequest(
      'لقطة التسجيل غير صالحة — لا يمكن تسجيل خطاب بلقطة ناقصة.',
      parsed.error.flatten(),
    );
  }
  const snapshot: RegistrationSnapshot = parsed.data;

  const year = letter.issueDate.getFullYear();

  return prisma.$transaction(async (tx) => {
    const allocated = await allocateReferenceInTransaction(tx, letter.templateKey, year, id, actor);
    const registered = await repo.markRegistered(tx, id, {
      reference: allocated.reference,
      // The one field the client could not fill: the number did not exist until the
      // line above created it. Everything else in the snapshot is stored verbatim.
      snapshotJson: serialiseSnapshot(withAllocatedReference(snapshot, allocated.reference)),
      registeredAt: now,
      registeredById: actor.id ?? null,
      registeredByName: actor.name ?? null,
    });

    // The number's own event, inside the same transaction that allocated it. If
    // anything below fails the whole registration rolls back — counter, register row,
    // reference binding, snapshot and both events together — so a failed registration
    // can never consume a number.
    await recordEvent(tx, {
      letterId: id,
      eventType: 'REFERENCE_ASSIGNED',
      reference: allocated.reference,
      actor,
      occurredAt: now,
    });

    await recordEvent(tx, {
      letterId: id,
      eventType: 'REGISTERED',
      fromStatus: status,
      toStatus: 'REGISTERED',
      reference: allocated.reference,
      actor,
      occurredAt: now,
    });

    return registered;
  });
}

/* ── Archive / Unarchive — a flag, not a status transition ──────────────── */

/**
 * File the document.
 *
 * Changes `isArchived` and NOTHING else — `status` is untouched, because "is this
 * still active correspondence?" is a different question from "what happened to this
 * document?". Permitted for anything not cancelled: a withdrawn document is sealed,
 * not filed.
 */
export async function archiveLetter(id: number, actor: Actor = {}, now: Date = new Date()) {
  const letter = await loadLetter(id);
  const status = readStatus(letter.status);

  if (!canArchive(status, letter.isArchived)) {
    throw AppError.conflict(explainArchiveRefusal(status, letter.isArchived, 'archive'));
  }

  return prisma.$transaction(async (tx) => {
    const archived = await repo.setArchived(tx, id, {
      archivedAt: now,
      archivedById: actor.id ?? null,
      archivedByName: actor.name ?? null,
    });
    // `fromStatus`/`toStatus` are null: no status changed. The event exists precisely
    // because the flag is reversible and the columns will be cleared on unarchive.
    await recordEvent(tx, { letterId: id, eventType: 'ARCHIVED', actor, occurredAt: now });
    return archived;
  });
}

/**
 * Take the document back out of the archive.
 *
 * Clears the archive audit columns along with the flag — they describe the current
 * archiving, and there is none once it is lowered. The history survives in the
 * timeline, which is the reason the timeline exists.
 */
export async function unarchiveLetter(id: number, actor: Actor = {}, now: Date = new Date()) {
  const letter = await loadLetter(id);
  const status = readStatus(letter.status);

  if (!canUnarchive(status, letter.isArchived)) {
    throw AppError.conflict(explainArchiveRefusal(status, letter.isArchived, 'unarchive'));
  }

  return prisma.$transaction(async (tx) => {
    const restored = await repo.setUnarchived(tx, id);
    await recordEvent(tx, { letterId: id, eventType: 'UNARCHIVED', actor, occurredAt: now });
    return restored;
  });
}

/* ── Bulk archive / unarchive ───────────────────────────────────────────── */

/** What happened to one letter in a bulk request. */
export interface BulkOutcome {
  readonly id: number;
  readonly ok: boolean;
  /** Present only on failure — the same Arabic reason the single-letter path gives. */
  readonly reason?: string;
}

export interface BulkResult {
  readonly succeeded: readonly number[];
  readonly failed: readonly BulkOutcome[];
}

/**
 * Archive or unarchive many letters.
 *
 * PARTIAL SUCCESS IS THE CONTRACT, and deliberately so. A user selecting forty letters
 * and archiving them should not have the whole action fail because two of them are
 * cancelled — they should get thirty-eight archived and a precise account of the two
 * that were not. An all-or-nothing bulk here would push users into doing it one at a
 * time, which is worse in every way.
 *
 * Each letter is evaluated against the SAME lifecycle predicate the single-letter path
 * uses, and each change is written in its own transaction alongside its timeline event.
 */
async function bulkSetArchived(
  ids: readonly number[],
  intent: 'archive' | 'unarchive',
  actor: Actor,
  now: Date,
): Promise<BulkResult> {
  // One query for the whole selection rather than N — see the repository note.
  const letters = await repo.findLettersByIds(ids);
  const byId = new Map(letters.map((l) => [l.id, l]));

  const succeeded: number[] = [];
  const failed: BulkOutcome[] = [];

  for (const id of ids) {
    const letter = byId.get(id);
    if (!letter) {
      failed.push({ id, ok: false, reason: 'الخطاب غير موجود.' });
      continue;
    }
    if (!isLetterStatus(letter.status)) {
      failed.push({ id, ok: false, reason: `حالة غير معروفة مخزَّنة للخطاب: «${letter.status}».` });
      continue;
    }

    const status = letter.status;
    const allowed = intent === 'archive'
      ? canArchive(status, letter.isArchived)
      : canUnarchive(status, letter.isArchived);

    if (!allowed) {
      failed.push({ id, ok: false, reason: explainArchiveRefusal(status, letter.isArchived, intent) });
      continue;
    }

    await prisma.$transaction(async (tx) => {
      if (intent === 'archive') {
        await repo.setArchived(tx, id, {
          archivedAt: now,
          archivedById: actor.id ?? null,
          archivedByName: actor.name ?? null,
        });
      } else {
        await repo.setUnarchived(tx, id);
      }
      await recordEvent(tx, {
        letterId: id,
        eventType: intent === 'archive' ? 'ARCHIVED' : 'UNARCHIVED',
        actor,
        occurredAt: now,
      });
    });
    succeeded.push(id);
  }

  return { succeeded, failed };
}

export function bulkArchive(ids: readonly number[], actor: Actor = {}, now: Date = new Date()) {
  return bulkSetArchived(ids, 'archive', actor, now);
}

export function bulkUnarchive(ids: readonly number[], actor: Actor = {}, now: Date = new Date()) {
  return bulkSetArchived(ids, 'unarchive', actor, now);
}

/* ── Cancel ─────────────────────────────────────────────────────────────── */

/**
 * Withdraw an issued document.
 *
 * The reference number is marked cancelled in the register and stays PERMANENTLY
 * RESERVED — never returned to the pool. The reason is mandatory because a gap in an
 * official register without an explanation is an audit finding.
 */
export async function cancelLetter(
  id: number,
  reason: string,
  actor: Actor = {},
  now: Date = new Date(),
) {
  const trimmed = reason?.trim() ?? '';
  if (!trimmed) {
    throw AppError.badRequest('سبب الإلغاء إلزامي — الفجوة في سجل رسمي يجب أن تكون مُفسَّرة.');
  }

  const letter = await loadLetter(id);
  const status = readStatus(letter.status);
  assertTransition(status, 'cancel');

  if (letter.reference) {
    await cancelReference(letter.reference, trimmed, now);
  }

  return prisma.$transaction(async (tx) => {
    const cancelled = await repo.markCancelled(tx, id, {
      reason: trimmed,
      cancelledAt: now,
      cancelledById: actor.id ?? null,
      cancelledByName: actor.name ?? null,
    });

    await recordEvent(tx, {
      letterId: id,
      eventType: 'CANCELLED',
      fromStatus: status,
      toStatus: 'CANCELLED',
      reference: letter.reference,
      reason: trimmed,
      actor,
      occurredAt: now,
    });

    return cancelled;
  });
}

/* ── Delete ─────────────────────────────────────────────────────────────── */

/**
 * Hard-delete a draft.
 *
 * DRAFT ONLY, enforced here regardless of which permission the caller holds. A
 * document that has consumed a permanent reference number must never be removable —
 * that is the difference between a register with explicable gaps and one with holes.
 */
export async function deleteDraft(id: number) {
  const letter = await loadLetter(id);
  const status = readStatus(letter.status);

  if (!canDelete(status)) {
    throw AppError.conflict(
      'لا يمكن حذف خطاب صدر له رقم مرجعي — الحذف متاح للمسودات فقط. استخدم «إلغاء» بدلًا من ذلك.',
    );
  }
  // Unreachable while the status is DRAFT, and kept as a second lock precisely because
  // this is the one operation with no undo.
  if (letter.reference) {
    throw AppError.conflict('لا يمكن حذف خطاب يحمل رقمًا مرجعيًا.');
  }
  await repo.deleteLetter(id);
}

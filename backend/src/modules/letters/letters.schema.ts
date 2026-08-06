/**
 * Letter Engine — request validation (Zod).
 *
 * The system boundary. Everything past this point is trusted to have the declared
 * shape, so anything a request can influence is checked here.
 *
 * ── WHAT IS DELIBERATELY *NOT* VALIDATED HERE ────────────────────────────
 * Content rules. There is no minimum subject length, no "content must not be empty",
 * no page cap. Those are DOCUMENT validation rules — they belong to the validation
 * engine and run against rendered geometry, not against a JSON body. A draft is
 * allowed to be almost entirely empty; that is what a draft is.
 *
 * ── WHAT A REQUEST MAY NOT SET ───────────────────────────────────────────
 * `status`, `reference`, the three version numbers, `printProfileId`, and every
 * `*ById` / `*At` audit column are absent from every schema below. They are decided by
 * the server. A request that includes one is rejected rather than having it ignored:
 * a client trying to set its own reference number is not a request to sanitise, it is
 * a bug or an attack, and silently dropping the field would hide both.
 */

import { z } from 'zod';
import { registrationSnapshotSchema } from './snapshot';
import { OFFICIAL_LETTER_KEY } from './letterTemplates.constants';

/** ISO date (`yyyy-MM-dd`) or full ISO timestamp, coerced to a Date. */
const isoDate = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), { message: 'تاريخ غير صالح' })
  .transform((value) => new Date(value));

/**
 * The content fields a draft may carry, all optional.
 *
 * `contentJson` is a STRING holding the serialised block model. The backend stores it
 * verbatim and never parses, interprets or rewrites it: the block model is the
 * frontend's contract, and a backend that understood its internals would be a second
 * implementation of it. It is length-capped only as an abuse guard.
 */
const draftContentFields = {
  issueDate: isoDate.optional(),
  recipientName: z.string().max(200).nullable().optional(),
  recipientTitle: z.string().max(200).nullable().optional(),
  recipientOrganisation: z.string().max(300).nullable().optional(),
  subject: z.string().max(1000).optional(),
  contentJson: z.string().max(2_000_000).optional(),
  /**
   * Branding asset ids from the existing signature/stamp registry.
   *
   * An ID only — never an image. The backend does not validate that the id resolves,
   * deliberately: the branding registry lives in the `Setting` table as frontend-owned
   * JSON, and a backend that parsed it to check membership would become a second
   * reader of a format it does not own. An unresolvable id renders as "no signature"
   * and is reported by the validation engine, which is the layer that does own it.
   */
  signatureAssetId: z.string().max(120).nullable().optional(),
  stampAssetId: z.string().max(120).nullable().optional(),
};

/** POST /api/letters — create a draft. */
export const createLetterSchema = z.object({
  body: z
    .object({
      // Only the one enabled template may be created (INV-10). Absent ⇒ defaulted.
      templateKey: z.literal(OFFICIAL_LETTER_KEY).optional(),
      ...draftContentFields,
    })
    .strict(),
});

/** PATCH /api/letters/:id — save a draft. */
export const updateLetterSchema = z.object({
  body: z.object(draftContentFields).strict(),
});

/**
 * POST /api/letters/:id/register — issue the permanent reference number.
 *
 * The snapshot is REQUIRED. Registering without one would produce a numbered document
 * with no record of how it was rendered, which is a fidelity guarantee in name only.
 * The backend validates the snapshot's shape and stores it; it never computes one.
 */
export const registerLetterSchema = z.object({
  body: z
    .object({
      snapshot: registrationSnapshotSchema,
    })
    .strict(),
});

/** POST /api/letters/:id/cancel — withdraw an issued document. */
export const cancelLetterSchema = z.object({
  body: z
    .object({
      // Mandatory and non-blank: an unexplained gap in an official register is an
      // audit finding, so the explanation is collected at the moment it is created.
      reason: z.string().trim().min(1, 'سبب الإلغاء إلزامي').max(500),
    })
    .strict(),
});

/** POST /api/letters/:id/archive — no body. */
export const archiveLetterSchema = z.object({
  body: z.object({}).strict(),
});

/**
 * POST /api/letters/bulk-archive · /bulk-unarchive
 *
 * A bounded id list. The cap exists because the handler applies the lifecycle rule to
 * each letter individually — an unbounded list would be an unbounded transaction.
 */
export const bulkArchiveSchema = z.object({
  body: z
    .object({
      ids: z.array(z.number().int().positive()).min(1, 'حدّد خطابًا واحدًا على الأقل').max(200),
    })
    .strict(),
});

/* ── List query ────────────────────────────────────────────────────────────
   Query strings only, so every value arrives as text and is coerced here. The
   whole point of validating it is that NONE of it reaches Prisma unchecked —
   `sortBy` in particular is matched against a closed list, never passed through. */

/** Columns the list may be sorted by. A closed set: user input never names a column. */
export const LETTER_SORT_FIELDS = [
  'reference',
  'subject',
  'status',
  'issueDate',
  'createdAt',
  'updatedAt',
  'registeredAt',
  'createdByName',
  'registeredByName',
] as const;

export type LetterSortField = (typeof LETTER_SORT_FIELDS)[number];

/** `'true'`/`'false'` from a query string → boolean; anything else → undefined (both). */
const optionalBoolean = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

const optionalDate = z
  .string()
  .optional()
  .refine((v) => v === undefined || v === '' || !Number.isNaN(Date.parse(v)), { message: 'تاريخ غير صالح' })
  .transform((v) => (v === undefined || v === '' ? undefined : new Date(v)));

export const listLettersQuerySchema = z.object({
  query: z
    .object({
      /** Free text across reference, subject and the three recipient fields. */
      search: z.string().trim().max(200).optional(),
      /** Comma-separated; unknown values are dropped rather than rejected. */
      status: z.string().max(200).optional(),
      isArchived: optionalBoolean,
      /** `registered` ⇒ holds a reference · `unregistered` ⇒ does not. */
      registrationState: z.enum(['registered', 'unregistered']).optional(),
      issueDateFrom: optionalDate,
      issueDateTo: optionalDate,
      createdFrom: optionalDate,
      createdTo: optionalDate,
      createdBy: z.string().trim().max(120).optional(),
      registeredBy: z.string().trim().max(120).optional(),
      templateKey: z.string().trim().max(60).optional(),
      sortBy: z.enum(LETTER_SORT_FIELDS).optional(),
      sortDir: z.enum(['asc', 'desc']).optional(),
      page: z.coerce.number().int().positive().optional(),
      pageSize: z.coerce.number().int().positive().max(100).optional(),
    })
    .strip(),
});

/* ── Version history and comments (Professional Document Automation v1) ────
   The same boundary discipline as the rest of this file: `contentJson` is never
   accepted here — a version snapshots what the LETTER holds, read inside the
   transaction, because a client-supplied snapshot could record something the letter
   never contained. */

/** POST /api/letters/:id/versions — take a snapshot. */
export const createVersionSchema = z.object({
  body: z
    .object({
      kind: z.enum(['AUTO', 'NAMED']).optional(),
      name: z.string().max(120).nullable().optional(),
      note: z.string().max(1000).nullable().optional(),
      // Computed by the renderer — the backend cannot count words it will not parse.
      wordCount: z.number().int().nonnegative().max(1_000_000).optional(),
      pageCount: z.number().int().nonnegative().max(10_000).optional(),
    })
    .strict(),
});

/** POST /api/letters/:id/comments — open a thread or reply to one. */
export const createCommentSchema = z.object({
  body: z
    .object({
      parentId: z.number().int().positive().nullable().optional(),
      anchorKind: z.enum(['block', 'object', 'section', 'document']).optional(),
      anchorId: z.string().max(120).nullable().optional(),
      body: z.string().min(1).max(4000),
      mentions: z.array(z.string().max(120)).max(50).optional(),
    })
    .strict(),
});

/** PATCH /api/letters/:id/comments/:commentId — resolve or reopen. */
export const resolveCommentSchema = z.object({
  body: z.object({ resolved: z.boolean() }).strict(),
});

/**
 * Letter Engine — the document type (INV-8, INV-9).
 *
 * The in-memory shape of one letter. P0 declares it; nothing persists it. Storage,
 * the lifecycle state machine, the registration transaction and the snapshot are the
 * backend's (P1/P2), and this file deliberately contains no logic for any of them.
 *
 * TWO PROPERTIES OF THIS SHAPE CARRY THE ENGINE'S TWO HARDEST GUARANTEES
 * ──────────────────────────────────────────────────────────────────────
 *
 *  · `reference` IS NULLABLE, AND THAT IS THE POINT (INV-8). A draft has no reference
 *    number. Numbers are sequential, permanent and never reused, so one is burned at
 *    exactly one moment — explicit registration — and never at document creation,
 *    first save, or print. A non-nullable field would have forced a number to exist
 *    from creation and made every abandoned draft a permanent gap in an official
 *    register.
 *
 *  · THE VERSION STAMP AND THE PRINT PROFILE ARE STORED, NEVER RECOMPUTED (INV-9).
 *    They are read from the document and are the rules it renders under for the rest
 *    of its life. Any code path that derives a stored document's versions from
 *    LATEST silently re-renders history under today's rules — no error, no trace, and
 *    a reprint that no longer matches the copy in the recipient's file.
 */

import { type DocumentVersionStamp } from '../versioning/versions';
import { type PrintProfileId } from '../registry/geometryRegistry';
import { type SectionInstance } from './sectionTypes';

/**
 * Where a document stands.
 *
 * `DRAFT`      — no reference number; fully editable; may be deleted.
 * `REGISTERED` — a permanent reference is bound; date and subject are frozen because
 *                both sit inside the frozen barcode payload; printable.
 * `PRINTED`    — has reached paper at least once. Reprintable with a reason.
 * `SUPERSEDED` — replaced by an amending letter, which carries its own reference.
 *                Kept so the chain is visible from either end.
 * `CANCELLED`  — withdrawn. Its reference remains PERMANENTLY RESERVED and is never
 *                returned to the pool (INV-8).
 */
export type LetterStatus = 'DRAFT' | 'REGISTERED' | 'PRINTED' | 'SUPERSEDED' | 'CANCELLED';

export const LETTER_STATUSES: readonly LetterStatus[] = [
  'DRAFT',
  'REGISTERED',
  'PRINTED',
  'SUPERSEDED',
  'CANCELLED',
];

/** Arabic labels. The UI language is Arabic; the codebase is English. */
export const LETTER_STATUS_LABELS_AR: Readonly<Record<LetterStatus, string>> = {
  DRAFT: 'مسودة',
  REGISTERED: 'مُسجّل',
  PRINTED: 'مطبوع',
  SUPERSEDED: 'مُستبدَل',
  CANCELLED: 'ملغى',
};

/**
 * The values frozen at registration.
 *
 * COMPLEMENTARY TO THE VERSION STAMP, NOT REDUNDANT WITH IT. The stamp records WHICH
 * RULES produced the document; this records WHAT THOSE RULES RESOLVED TO. The stamp
 * makes history explainable and re-derivable; the snapshot makes a reprint
 * byte-identical even if the resolution logic itself later evolves.
 *
 * P0 declares the shape only. Capturing it is part of the registration transaction
 * (P2), and it is written exactly once — no update path may touch it afterwards.
 */
export interface RegistrationSnapshot {
  /** Resolved typography per block, keyed by block id. */
  readonly blockTypography: Readonly<Record<string, { readonly fontId: string; readonly sizePt: number; readonly weight: number; readonly lineHeight: number }>>;
  /** The issue date exactly as rendered. */
  readonly issueDate: string;
  /** The subject exactly as rendered. */
  readonly subject: string;
  /** The exact payload string encoded into the barcode. */
  readonly barcodePayload: string;
  /** The page geometry in force, as millimetres — not a reference to a registry that may change. */
  readonly geometryMm: Readonly<Record<string, number>>;
  /** Page count at registration. A reprint producing a different count is an integrity failure. */
  readonly pageCount: number;
}

/**
 * One letter.
 *
 * `id` is `null` for a document that has never been persisted — P0 has no persistence,
 * and a synthetic client-side id would be indistinguishable from a real one.
 */
export interface LetterDocument {
  readonly id: number | null;

  /** Which template this document is an instance of. */
  readonly templateKey: string;

  /** Frozen at registration. Read from storage, never recomputed (INV-9). */
  readonly versions: DocumentVersionStamp;

  /** The physical stationery this document is laid out for. Frozen at registration. */
  readonly printProfileId: PrintProfileId;

  readonly status: LetterStatus;

  /**
   * The permanent reference number, or `null` while the document is a draft.
   * Format is owned by the template's reference prefix and the register (P1).
   */
  readonly reference: string | null;

  /** The document's sections, in the template's declared order. */
  readonly sections: readonly SectionInstance[];

  /** Present once registered; absent before. Written once, never updated. */
  readonly registrationSnapshot: RegistrationSnapshot | null;

  /**
   * Filing flag, deliberately ORTHOGONAL to `status` rather than a sixth state.
   *
   * "Is this still active correspondence?" is a different question from "what
   * happened to this document?". As a state it would be unreachable for a cancelled
   * letter — which must also be archivable — and would force a false choice between
   * PRINTED and ARCHIVED when both are true.
   */
  readonly isArchived: boolean;
}

/* ── Queries ────────────────────────────────────────────────────────────── */

export function isLetterStatus(value: unknown): value is LetterStatus {
  return typeof value === 'string' && (LETTER_STATUSES as readonly string[]).includes(value);
}

/** Has a permanent reference number been burned for this document? */
export function hasReference(document: LetterDocument): boolean {
  return document.reference !== null && document.reference.length > 0;
}

/**
 * Are the date and subject frozen?
 *
 * True from registration onward, because both are inside the frozen barcode payload —
 * changing either would make the printed code disagree with the document.
 */
export function isContentIdentityFrozen(document: LetterDocument): boolean {
  return document.status !== 'DRAFT';
}

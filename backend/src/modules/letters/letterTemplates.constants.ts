/**
 * Letter Engine — template keys and reference prefixes, backend side.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS A MIRROR, NOT A SECOND SOURCE OF TRUTH.
 * ══════════════════════════════════════════════════════════════════════════
 * The template registry lives in the frontend (`frontend/src/letters/registry/
 * templateRegistry.ts`). Backend and frontend are separate packages and cannot import
 * each other, so the few facts the backend genuinely needs — which template keys
 * exist, and what reference prefix each one issues — are restated here and pinned
 * identical by `__tests__/templateMirror.test.ts`.
 *
 * ONLY THESE FACTS ARE MIRRORED. The backend does not know, and must not learn, a
 * template's sections, typography, toolbar, validation rules or geometry. Those are
 * rendering concerns; the backend's entire interest in a template is "which sequence
 * does this document draw its number from, and what does that number look like".
 *
 * INV-10: exactly one enabled template in v1. The five future types are reference
 * prefix RESERVATIONS — they cannot be created, and exist only so no future type can
 * take a prefix that documentation or an operator's memory already associates with
 * something else.
 */

import { getActiveReferenceFormatter, matchesAnyReferenceFormat } from './referenceFormat';

/** The only template that may be created in v1. */
export const OFFICIAL_LETTER_KEY = 'officialLetter';

export interface LetterTemplateDescriptor {
  readonly key: string;
  readonly referencePrefix: string;
  readonly displayNameAr: string;
  readonly enabled: boolean;
}

/** Templates the backend recognises. Exactly one, enabled (INV-10). */
export const LETTER_TEMPLATES: readonly LetterTemplateDescriptor[] = [
  {
    key: OFFICIAL_LETTER_KEY,
    referencePrefix: 'OL',
    displayNameAr: 'خطاب رسمي',
    enabled: true,
  },
];

/**
 * Reference prefixes held for future document types.
 *
 * A reservation is not a template: nothing can be created under it. It exists so that
 * a prefix collision is caught by a test at build time rather than discovered after
 * two document types have issued overlapping reference numbers — a defect that is
 * unfixable once the numbers are on paper.
 */
export const RESERVED_REFERENCE_PREFIXES: readonly string[] = ['CIR', 'AD', 'AUTH', 'NOT', 'GOV'];

/** Descriptor for a template key, or `undefined` for an unknown one. */
export function findLetterTemplate(key: string | null | undefined): LetterTemplateDescriptor | undefined {
  if (!key) return undefined;
  return LETTER_TEMPLATES.find((t) => t.key === key);
}

/** Is this a template key that may be created right now? */
export function isCreatableTemplateKey(key: string | null | undefined): boolean {
  return findLetterTemplate(key)?.enabled === true;
}

/** Templates that may be created. */
export function getEnabledTemplates(): readonly LetterTemplateDescriptor[] {
  return LETTER_TEMPLATES.filter((t) => t.enabled);
}

/**
 * Reference prefix for a template.
 *
 * Throws rather than defaulting: a wrong prefix would be burned permanently into an
 * issued reference number, and there is no safe fallback for "I do not know what this
 * document is called".
 */
export function referencePrefixFor(templateKey: string): string {
  const template = findLetterTemplate(templateKey);
  if (!template) {
    throw new Error(`[LetterEngine] Unknown template key "${templateKey}" — cannot determine a reference prefix.`);
  }
  return template.referencePrefix;
}

/* ── Reference number format ────────────────────────────────────────────────
   The SHAPE of a reference is no longer decided here. `referenceFormat.ts` owns it:
   a registry of formatters with one marked active, so a future pack can replace the
   numbering scheme by adding a formatter and moving one constant — without touching
   the allocator, the register, this file, or anything already issued.

   What stays here is the PREFIX, because a prefix is a fact about a template and
   templates are what this file mirrors. */

export { REFERENCE_SEQUENCE_PAD } from './referenceFormat';

/**
 * Build a reference string using the format currently in force.
 *
 * Pure — allocation is the reference service's job. The active formatter today emits
 * `OL-2026-000001`; that is a property of the formatter, not of this function.
 */
export function formatReference(templateKey: string, year: number, sequence: number): string {
  const prefix = referencePrefixFor(templateKey);
  return getActiveReferenceFormatter().format({ prefix, year, sequence });
}

/** Every prefix the engine may legitimately have issued — enabled and reserved alike. */
export function allKnownReferencePrefixes(): string[] {
  return [...LETTER_TEMPLATES.map((t) => t.referencePrefix), ...RESERVED_REFERENCE_PREFIXES];
}

/* ── Version stamp defaults (mirrored — INV-9) ──────────────────────────────
   A new document is stamped with these and then FREEZES them at registration; a
   stored document's versions are read from its row and never recomputed.

   Mirrored rather than client-supplied on purpose: letting the request choose its own
   version stamp would let a stale or hostile client mislabel which rules a document
   was issued under, and that label is the thing a faithful reprint depends on.
   `__tests__/templateMirror.test.ts` pins these against the frontend registry. */

export const TEMPLATE_VERSION_LATEST = 1;
export const LAYOUT_VERSION_LATEST = 1;
export const BARCODE_VERSION_LATEST = 1;

/** The one print profile enabled in v1. */
export const DEFAULT_PRINT_PROFILE_ID = 'companyLetterhead';

/**
 * Version of the block model's serialised shape, mirrored from the frontend.
 *
 * ── 1 → 2 → 3 → 4, EVERY STEP PURELY ADDITIVE ────────────────────────────
 *   2 — Document Studio Foundation v1: three inline marks, the `heading` block kind,
 *       seven optional block attributes.
 *   3 — Document Layout Designer v1: one optional field, `layout`, carrying the
 *       positioned-object layer.
 *   4 — Professional Document Automation v1: an optional `condition` on a block's
 *       attributes, and an optional `bindings` field naming the employee, contract and
 *       project the document's variables resolve against. Variable TOKENS need no
 *       model change at all — they are ordinary characters in ordinary block text.
 *
 * The backend still stores `contentJson` verbatim and parses none of it — this
 * constant is a LABEL the mirror test pins against the frontend, not a shape the
 * server understands. Keeping it accurate is what makes that test able to catch a
 * frontend model change that the backend's stored version stamp would otherwise
 * silently misdescribe.
 */
export const CONTENT_MODEL_VERSION = 4;

/**
 * Does this string have the shape of a reference this engine has EVER issued?
 *
 * Delegates to every registered formatter, not only the active one. A reference
 * printed under an older scheme stays valid for ever — the paper it is on does not
 * change when the scheme does.
 */
export function isWellFormedReference(reference: string): boolean {
  return matchesAnyReferenceFormat(reference, allKnownReferencePrefixes());
}

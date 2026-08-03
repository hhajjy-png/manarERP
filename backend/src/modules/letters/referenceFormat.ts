/**
 * Letter Engine — the reference number FORMAT abstraction.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ALLOCATOR DECIDES *WHICH NUMBER*. A FORMATTER DECIDES *HOW IT READS*.
 * ══════════════════════════════════════════════════════════════════════════
 * Those are genuinely separate concerns, and keeping them separate is what lets the
 * numbering scheme change later without touching the part that must never change.
 * `reference.service.ts` advances a counter inside a transaction and relies on two
 * UNIQUE constraints; none of that cares whether the printed string says
 * `OL-2026-000001` or `2026/OL/1`. This module owns the string, and nothing else does.
 *
 * ── WHY A REGISTRY RATHER THAN A FUNCTION ────────────────────────────────
 * A single `format()` function would still have to be EDITED to change the scheme, and
 * editing it would silently change how every previously issued number is recognised —
 * `isWellFormedReference` would start rejecting references that are already printed on
 * paper delivered to third parties. A registry of formatters, with one marked active,
 * makes the two operations independent:
 *
 *   · issuing   → uses the ACTIVE formatter only
 *   · verifying → accepts ANY registered formatter, for ever
 *
 * So a future pack adds a formatter and moves `ACTIVE_REFERENCE_FORMAT_ID`. It does not
 * modify an existing formatter, and it does not touch the allocator, the register, the
 * service, or the schema. That is the whole point of this file.
 *
 * ── HISTORICAL FORMATS ARE NEVER RE-RENDERED ─────────────────────────────
 * An issued reference is stored as a STRING in `letters.reference` and in
 * `letter_references.reference`. It is read back verbatim and never recomputed from its
 * parts, so changing the active format cannot retroactively alter a number that has
 * already been issued. The formatters below exist to CREATE new strings and to
 * RECOGNISE old ones — never to regenerate one.
 *
 * ── A FORMATTER IS FROZEN THE DAY IT ISSUES ITS FIRST NUMBER ─────────────
 * Editing `prefixYearSequenceV1` after it has issued anything would be the same defect
 * as editing a historical barcode payload version (INV-9): the engine and the paper
 * would disagree, and the paper wins. New scheme ⇒ new formatter ⇒ new id.
 */

/** The parts every formatter receives. Purely positional data — no I/O, no lookups. */
export interface ReferenceParts {
  /** Template prefix, e.g. `OL`. Resolved by the caller; formatters never look it up. */
  readonly prefix: string;
  /** Gregorian year the sequence is scoped to. */
  readonly year: number;
  /** 1-based position within `(template, year)`. */
  readonly sequence: number;
}

export interface ReferenceFormatter {
  readonly id: string;
  /** Arabic description, for the settings screen a later pack will add. */
  readonly describeAr: string;
  /** Build the string. Pure and total. */
  readonly format: (parts: ReferenceParts) => string;
  /**
   * Could this string have been produced by THIS formatter?
   *
   * Used for recognition, never for parsing back into parts — a reference is data, not
   * a derivation, and the register holds its parts in columns already.
   */
  readonly matches: (reference: string, knownPrefixes: readonly string[]) => boolean;
};

/** Digits the v1 sequence is padded to. 999,999 documents per template-year. */
export const REFERENCE_SEQUENCE_PAD = 6;

/**
 * v1 — `OL-2026-000001`.
 *
 * Prefix, Gregorian year, zero-padded sequence, hyphen separated. The sequence resets
 * each January because it is scoped per `(templateKey, year)` by the allocator; this
 * formatter simply renders whatever it is handed.
 *
 * FROZEN. This formatter has issued numbers; it is never edited again.
 */
const prefixYearSequenceV1: ReferenceFormatter = {
  id: 'prefixYearSequence-v1',
  describeAr: 'بادئة-سنة-تسلسل (مثال: OL-2026-000001)',
  format: ({ prefix, year, sequence }) =>
    `${prefix}-${year}-${String(sequence).padStart(REFERENCE_SEQUENCE_PAD, '0')}`,
  matches: (reference, knownPrefixes) => {
    if (knownPrefixes.length === 0) return false;
    const alternation = knownPrefixes.map(escapeForRegExp).join('|');
    return new RegExp(`^(${alternation})-\\d{4}-\\d{${REFERENCE_SEQUENCE_PAD}}$`).test(reference);
  },
};

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every formatter the engine has ever used. Entries are ADDED, never removed or
 * edited — removing one would make previously issued numbers unrecognisable.
 */
export const REFERENCE_FORMATTERS: readonly ReferenceFormatter[] = [prefixYearSequenceV1];

/**
 * The formatter new registrations use.
 *
 * This constant is the entire switch. A future pack appends a formatter above and
 * changes this line; the allocator, the register and the API are untouched.
 */
export const ACTIVE_REFERENCE_FORMAT_ID = prefixYearSequenceV1.id;

/**
 * Look a formatter up by id.
 *
 * Throws rather than defaulting: silently substituting a different scheme would burn a
 * wrong-looking number permanently into an issued document.
 */
export function getReferenceFormatter(id: string = ACTIVE_REFERENCE_FORMAT_ID): ReferenceFormatter {
  const formatter = REFERENCE_FORMATTERS.find((f) => f.id === id);
  if (!formatter) {
    throw new Error(
      `[LetterEngine] Unknown reference format "${id}". ` +
        `Refusing to substitute another format — an issued reference number is permanent.`,
    );
  }
  return formatter;
}

/** The formatter in force for new registrations. */
export function getActiveReferenceFormatter(): ReferenceFormatter {
  return getReferenceFormatter(ACTIVE_REFERENCE_FORMAT_ID);
}

/**
 * Does this string look like a reference this engine has EVER issued?
 *
 * Checks every registered formatter, not just the active one, so that changing the
 * active scheme never invalidates a number already on paper.
 */
export function matchesAnyReferenceFormat(
  reference: string,
  knownPrefixes: readonly string[],
): boolean {
  return REFERENCE_FORMATTERS.some((f) => f.matches(reference, knownPrefixes));
}

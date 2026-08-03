/**
 * Letter Engine — barcode payload specifications (INV-13, INV-9).
 *
 * INV-13: "Barcode must reuse the existing barcode engine. Only the payload builder
 * may vary by Barcode Version." This file declares WHAT a payload of each version
 * contains. It does not encode, render, size, or place anything — the existing
 * project barcode engine does all of that, unchanged, and the payload BUILDERS live
 * in P6.
 *
 * WHAT IS DELIBERATELY ABSENT
 * ───────────────────────────
 * · No encoder, no rendering, no data-URL generation — the existing engine's job.
 * · No dimensions. The barcode's physical size is a millimetre value and INV-4 puts
 *   millimetres in the Geometry Registry only; P6 adds it there when it needs it.
 * · No builder implementations. P0 registers nothing (see `versioning/resolver.ts`).
 *
 * THE THREE FIELDS ARE A HARD CONTRACT
 * ────────────────────────────────────
 * The approved rule is that the barcode contains ONLY the letter date, the subject,
 * and the reference number. `PAYLOAD_V1.fields` is exactly those three, in order, and
 * `barcodeSpecs.test`-adjacent template checks assert nothing else is ever added to a
 * shipped version. A fourth field is not an edit to this array — it is a new Barcode
 * Version, precisely so that previously issued letters keep decoding to what was
 * printed on them (INV-9).
 */

import { type BarcodeVersion, BARCODE_VERSION_LATEST } from '../versioning/versions';

/**
 * The data a payload may carry. Each maps to a field of the registered document, and
 * every value is taken from the REGISTRATION SNAPSHOT rather than live editor state —
 * a reprint years later must produce a byte-identical code.
 */
export type BarcodePayloadFieldId = 'issueDate' | 'subject' | 'reference';

export const BARCODE_PAYLOAD_FIELD_IDS: readonly BarcodePayloadFieldId[] = [
  'issueDate',
  'subject',
  'reference',
];

export interface BarcodePayloadSpec {
  readonly version: BarcodeVersion;
  /** The fields, in the exact order the builder must emit them. */
  readonly fields: readonly BarcodePayloadFieldId[];
  /**
   * Characters of the subject the payload may carry.
   *
   * The full subject always stays on the document; only the ENCODED copy is capped.
   * The cap exists because a long subject inflates the code version until the module
   * size at the printed dimension defeats a phone camera.
   */
  readonly subjectMaxChars: number;
  /**
   * Human-readable payload, never machine-readable JSON.
   *
   * Recorded as a flag rather than assumed because it was a deliberate correction:
   * scanning a form used to surface raw `{"formType":...}` on the phone screen. The
   * existing engine's Arabic line-based format is the fixed convention, and a version
   * that departed from it would need to say so here.
   */
  readonly humanReadable: true;
}

/** Every declared payload version. Historical versions are never edited or removed. */
export const BARCODE_PAYLOAD_SPECS: Readonly<Record<BarcodeVersion, BarcodePayloadSpec>> = {
  1: {
    version: 1,
    fields: ['issueDate', 'subject', 'reference'],
    subjectMaxChars: 80,
    humanReadable: true,
  },
};

/* ── Queries ────────────────────────────────────────────────────────────── */

/**
 * The spec for a barcode version. Throws rather than falling back: encoding a
 * historical letter's payload under a different version's rules would produce a code
 * that disagrees with the one on the paper (INV-9).
 */
export function getBarcodePayloadSpec(
  version: BarcodeVersion = BARCODE_VERSION_LATEST,
): BarcodePayloadSpec {
  const spec = BARCODE_PAYLOAD_SPECS[version];
  if (!spec) {
    throw new Error(
      `[LetterEngine] No barcode payload spec for version ${version}. ` +
        `Refusing to substitute another version's payload format (INV-9).`,
    );
  }
  return spec;
}

/** Non-throwing lookup, for validating an untrusted stored version. */
export function findBarcodePayloadSpec(version: number): BarcodePayloadSpec | undefined {
  return BARCODE_PAYLOAD_SPECS[version];
}

/** Is this a payload field the engine recognises? */
export function isBarcodePayloadFieldId(id: string | null | undefined): id is BarcodePayloadFieldId {
  if (!id) return false;
  return (BARCODE_PAYLOAD_FIELD_IDS as readonly string[]).includes(id);
}

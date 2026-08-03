/**
 * Letter Engine — the barcode payload builder (INV-13).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THREE FIELDS. EXACTLY THREE. NOTHING ELSE, EVER.
 * ══════════════════════════════════════════════════════════════════════════
 * The letter date, the subject, and the reference number. Not the body, not the
 * recipient, not the signature or stamp, not the author, not the user, not a document
 * id, not a version stamp, not a hidden field of any kind.
 *
 * That restraint is a privacy decision, not a technical one. A barcode on an official
 * letter travels wherever the paper travels — it is photographed, filed, forwarded and
 * scanned by people the sender never chose. Anything encoded into it is disclosed to
 * all of them. So the payload carries exactly what identifies the document and nothing
 * that describes its contents or the people involved.
 *
 * `barcodeSpecs.ts` declares WHICH fields; this module turns them into the string. A
 * fourth field is not an edit here — it is a new Barcode Version, so that letters
 * already issued keep decoding to what was printed on them (INV-9).
 *
 * ── NO DOCUMENT-TYPE LINE ────────────────────────────────────────────────
 * The ERP's form payloads open with a type label ("عرض سعر", "سند قبض"). This one does
 * NOT, deliberately: the approved rule is three fields, and a type label is a fourth.
 * The letterhead already says what the document is, to anyone holding it.
 *
 * ── HUMAN-READABLE, NEVER JSON ───────────────────────────────────────────
 * Scanning must surface Arabic a person can read, not `{"reference":...}`. This is the
 * existing convention in `forms/shared/FormQRCode.tsx` and the reason the spec records
 * `humanReadable: true` — it was a deliberate correction there, and repeating the
 * mistake here would be a regression the user sees on their phone.
 */

import {
  type BarcodePayloadFieldId,
  type BarcodePayloadSpec,
  getBarcodePayloadSpec,
} from '../registry/barcodeSpecs';
import { type BarcodeVersion } from '../versioning/versions';

/** The values a payload is built from — all three, all required. */
export interface BarcodePayloadInput {
  /** The issue date exactly as rendered on the page. */
  readonly issueDate: string;
  /** The subject exactly as rendered. Capped in the payload only, never on the page. */
  readonly subject: string;
  /** The permanent reference. A letter without one has nothing to encode. */
  readonly reference: string;
}

/** Arabic labels, one per field. The order comes from the spec, never from here. */
const FIELD_LABELS_AR: Readonly<Record<BarcodePayloadFieldId, string>> = {
  issueDate: 'التاريخ',
  subject: 'الموضوع',
  reference: 'رقم المرجع',
};

/**
 * Collapse whitespace and trim.
 *
 * A subject typed across two lines would otherwise inject a newline into a
 * line-delimited payload and silently split one field into two when decoded.
 */
function flatten(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Cap the subject at the spec's limit.
 *
 * An ellipsis marks the truncation so a reader knows the encoded subject is abridged
 * rather than thinking the letter's own subject was this short. The FULL subject always
 * remains on the document — only the encoded copy is capped, and only because a long
 * payload inflates the symbol until it stops scanning at the printed size.
 */
export function capSubject(subject: string, maxChars: number): string {
  const flat = flatten(subject);
  if (flat.length <= maxChars) return flat;
  return `${flat.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

/** One `label: value` line. */
function line(field: BarcodePayloadFieldId, value: string): string {
  return `${FIELD_LABELS_AR[field]}: ${value}`;
}

/**
 * Build the payload for a given barcode version.
 *
 * PURE: same input and version in, byte-identical string out — which is what lets a
 * reprint years later reproduce the exact code that was printed. The values must come
 * from the REGISTRATION SNAPSHOT rather than live editor state for the same reason.
 */
export function buildBarcodePayload(
  input: BarcodePayloadInput,
  version: BarcodeVersion = 1,
): string {
  const spec: BarcodePayloadSpec = getBarcodePayloadSpec(version);

  return spec.fields
    .map((field) => {
      switch (field) {
        case 'issueDate':
          return line(field, flatten(input.issueDate));
        case 'subject':
          return line(field, capSubject(input.subject, spec.subjectMaxChars));
        case 'reference':
          return line(field, flatten(input.reference));
        default: {
          // Exhaustiveness: a new field id must not silently vanish from the payload.
          const unreachable: never = field;
          throw new Error(`[LetterEngine] Unhandled barcode payload field: ${String(unreachable)}`);
        }
      }
    })
    .join('\n');
}

/**
 * The fields a payload string actually contains, for verification.
 *
 * Used by the validation engine and by tests to assert the payload carries the three
 * approved fields and nothing more — a check that reads the OUTPUT rather than trusting
 * the builder, which is the only version of it worth having.
 */
export function readPayloadLabels(payload: string): string[] {
  return payload
    .split('\n')
    .map((l) => l.split(':')[0]?.trim() ?? '')
    .filter((l) => l.length > 0);
}

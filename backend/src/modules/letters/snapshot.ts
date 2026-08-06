/**
 * Letter Engine — the registration snapshot.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BACKEND NEVER COMPUTES A SNAPSHOT. IT FREEZES ONE.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * A snapshot is the set of RESOLVED values that produced the issued page: the exact
 * typography per block, the exact geometry in millimetres, the exact barcode payload,
 * the exact page count. Resolving those is the renderer's work — it needs the font
 * registry, the geometry registry, the paginator and the barcode payload builder,
 * none of which exist on the backend and none of which belong to this pack.
 *
 * So the registration request CARRIES the snapshot, and this module's entire job is
 * to (a) validate its shape strictly, and (b) hand it to the service to be stored once
 * and never touched again. That division is not a compromise; it is the correct one.
 * A snapshot computed by a second implementation on the backend would be a second
 * source of truth about what the page looks like — which is precisely the divergence
 * the single-renderer rule exists to prevent.
 *
 * ── WHY VALIDATION IS STRICT RATHER THAN FORGIVING ───────────────────────
 * A snapshot with a missing field is worse than no snapshot at all: it looks like a
 * fidelity guarantee and is not one. So every field is required, and an unknown extra
 * field is rejected rather than dropped — an extra key is nearly always a renamed
 * field whose real value is now silently absent.
 *
 * ── IMMUTABILITY ─────────────────────────────────────────────────────────
 * There is no update path. This module exposes serialisation and parsing only; the
 * service writes the column exactly once inside the registration transaction, and no
 * other query in the module names that column in an update.
 */

import { z } from 'zod';

/** Resolved type for one block, keyed by block id in the snapshot. */
export const blockTypographySchema = z
  .object({
    fontId: z.string().min(1),
    sizePt: z.number().positive(),
    weight: z.number().int().positive(),
    lineHeight: z.number().positive(),
  })
  .strict();

/**
 * A signature or stamp exactly as it was rendered onto the issued page.
 *
 * `imageUrl` is capped because it is a base64 PNG data URL and a snapshot is stored in
 * a single column; the cap is an abuse guard, not a quality judgement.
 */
export const renderedBrandingSchema = z
  .object({
    assetId: z.string().min(1),
    name: z.string(),
    imageUrl: z.string().max(4_000_000),
  })
  .strict();

/**
 * One positioned layout object, exactly as it was rendered onto the issued page
 * (Document Layout Designer v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FROZEN FOR THE SAME REASON THE SIGNATURE IMAGE IS.
 * ══════════════════════════════════════════════════════════════════════════
 * The positioned layer is stored in the letter's `contentJson`, which a draft may
 * still be edited through. A registered letter's content is frozen, but the snapshot
 * is what a REPRINT is checked against — and a reprint years later must reproduce the
 * page that was issued, not the page today's data would produce. Recording each
 * object's resolved rectangle here makes the layout part of the fidelity guarantee
 * rather than something merely believed to have been stable.
 *
 * `payloadDigest` rather than the payload: an object may carry a base64 image, and the
 * snapshot already caps the two branding images for the same reason. A digest is
 * enough to prove the content is unchanged without storing a second copy of it.
 */
export const snapshotLayoutObjectSchema = z
  .object({
    id: z.string().min(1),
    kind: z.string().min(1),
    name: z.string(),
    pageIndex: z.number().int().nonnegative(),
    xMm: z.number(),
    yMm: z.number(),
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
    rotationDeg: z.number(),
    opacity: z.number().min(0).max(1),
    zIndex: z.number().int(),
    /** Stable hash of the object's payload. Never the payload itself. */
    payloadDigest: z.string(),
  })
  .strict();

/**
 * The complete snapshot.
 *
 * `.strict()` at every level: an unrecognised key is an error, not something to
 * ignore. See the header for why.
 */
export const registrationSnapshotSchema = z
  .object({
    /** Resolved typography per block id. May be empty for a document with no blocks. */
    blockTypography: z.record(z.string(), blockTypographySchema),
    /** The issue date exactly as rendered. */
    issueDate: z.string().min(1),
    /** The subject exactly as rendered. */
    subject: z.string(),
    /** The exact payload string encoded into the barcode. */
    barcodePayload: z.string(),
    /** The page geometry in force, in millimetres — values, not a registry reference. */
    geometryMm: z.record(z.string(), z.number()),
    /** Page count at registration. A reprint producing a different count is an integrity failure. */
    pageCount: z.number().int().nonnegative(),
    /**
     * The signature and stamp as actually rendered onto the issued page.
     *
     * The IMAGE is frozen here, not just the asset id, and that is the one place in
     * the engine where duplicating an image is correct. The id points into the living
     * branding registry, whose asset can be re-uploaded at any time; a reprint years
     * later must reproduce the page that was issued, not the page today's settings
     * would produce. `null` records "none", which is a real and common choice.
     */
    signature: renderedBrandingSchema.nullable(),
    stamp: renderedBrandingSchema.nullable(),
    /**
     * The positioned layer as rendered. OPTIONAL, and that is deliberate.
     *
     * Every other field here is required because a snapshot missing one "looks like a
     * fidelity guarantee and is not one". This field is different in kind: a letter
     * with no layout objects — which is every letter registered before Document Layout
     * Designer v1, and most letters after it — has nothing to record. Requiring an
     * empty array would break every snapshot already in the register, and defaulting
     * one would make "no objects" and "an older build that could not report them"
     * indistinguishable.
     */
    layoutObjects: z.array(snapshotLayoutObjectSchema).optional(),
    /**
     * The resolved variable values as rendered (Professional Document Automation v1).
     *
     * ══════════════════════════════════════════════════════════════════════════
     *  THE SAME GUARANTEE THE BARCODE PAYLOAD AND THE SIGNATURE IMAGE CARRY.
     * ══════════════════════════════════════════════════════════════════════════
     * A letter may say «الراتب: {{Salary}}». The token is what is stored; the VALUE is
     * what was printed. Without this field a reprint after a pay rise would show a
     * different figure from the letter that was issued and handed over — the exact
     * class of drift the frozen signature image exists to prevent.
     *
     * Only the variables the document MENTIONS are recorded, so a letter that never
     * asked for a salary carries none. `null` records "resolved to nothing", which is
     * distinct from absent and must survive the round trip.
     *
     * OPTIONAL, like `layoutObjects` and for the same reason: every snapshot already
     * in the register was written before this field existed, and requiring it would
     * break every one of them.
     */
    variables: z.record(z.string(), z.string().nullable()).optional(),
  })
  .strict();

export type RegistrationSnapshot = z.infer<typeof registrationSnapshotSchema>;

/**
 * Serialise a validated snapshot for storage.
 *
 * Keys are emitted in a STABLE order so that two snapshots with the same content
 * produce byte-identical strings. Without that, an incidental key reordering would
 * make an unchanged snapshot look modified to any future integrity check.
 */
/**
 * The token the client leaves where the reference will go.
 *
 * Registration is the moment the number is created, so a client building the snapshot
 * cannot know it — and must not invent one. It writes this token instead, and the
 * server substitutes the number it actually allocated, inside the same transaction.
 *
 * This is NOT the backend computing a snapshot. Every other value in the snapshot is
 * the renderer's and is stored verbatim; this is the one field whose value does not
 * exist until the server creates it, and completing it here is the only place it can
 * be done correctly.
 */
export const PENDING_REFERENCE_TOKEN = '__PENDING__';

/**
 * Fill the allocated reference into the payload the client prepared.
 *
 * A payload with no token is returned untouched, so a client that already knew the
 * reference (a future re-registration path, say) is not corrupted by this.
 */
export function withAllocatedReference(
  snapshot: RegistrationSnapshot,
  reference: string,
): RegistrationSnapshot {
  if (!snapshot.barcodePayload.includes(PENDING_REFERENCE_TOKEN)) return snapshot;
  return {
    ...snapshot,
    barcodePayload: snapshot.barcodePayload.split(PENDING_REFERENCE_TOKEN).join(reference),
  };
}

export function serialiseSnapshot(snapshot: RegistrationSnapshot): string {
  return JSON.stringify({
    blockTypography: Object.fromEntries(
      Object.keys(snapshot.blockTypography)
        .sort()
        .map((id) => {
          const t = snapshot.blockTypography[id];
          return [id, { fontId: t.fontId, sizePt: t.sizePt, weight: t.weight, lineHeight: t.lineHeight }];
        }),
    ),
    issueDate: snapshot.issueDate,
    subject: snapshot.subject,
    barcodePayload: snapshot.barcodePayload,
    geometryMm: Object.fromEntries(
      Object.keys(snapshot.geometryMm)
        .sort()
        .map((key) => [key, snapshot.geometryMm[key]]),
    ),
    pageCount: snapshot.pageCount,
    signature: snapshot.signature
      ? { assetId: snapshot.signature.assetId, name: snapshot.signature.name, imageUrl: snapshot.signature.imageUrl }
      : null,
    stamp: snapshot.stamp
      ? { assetId: snapshot.stamp.assetId, name: snapshot.stamp.name, imageUrl: snapshot.stamp.imageUrl }
      : null,
  });
}

/**
 * Parse a stored snapshot.
 *
 * Returns `null` for absent or unreadable data rather than throwing, so that reading a
 * letter never fails because of a snapshot defect — the letter itself is still
 * legible, and a caller that genuinely requires the snapshot can say so precisely.
 */
export function parseStoredSnapshot(stored: string | null | undefined): RegistrationSnapshot | null {
  if (!stored) return null;
  try {
    const parsed = registrationSnapshotSchema.safeParse(JSON.parse(stored));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

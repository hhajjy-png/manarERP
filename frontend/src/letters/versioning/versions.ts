/**
 * Letter Engine — the three independent version axes (INV-9).
 *
 * WHY THREE AXES AND NOT ONE
 * ──────────────────────────
 * Each axis answers a different question, and each evolves at its own rate:
 *
 *   · Template Version  — "what is this document supposed to contain?"
 *                         Bumped when sections, toolbar, validation thresholds,
 *                         or typography roles change.
 *   · Layout Version    — "how are those contents placed on paper?"
 *                         Bumped when band arithmetic, the pagination algorithm,
 *                         footer-strip geometry, or the measurement method change.
 *   · Barcode Version   — "how is the code encoded?"
 *                         Bumped when the payload field set, ordering, truncation,
 *                         or encoding change.
 *
 * Collapsing them into a single version means any change on any axis invalidates
 * historical fidelity on ALL axes: a typography tweak would force every template to
 * bump, adding a section would invalidate every previously issued barcode, and a
 * payload change would repaginate history. Independence is what lets each concern
 * move without freezing the others.
 *
 * VERSION 1 SHIPS EXACTLY ONE VERSION PER AXIS.
 * No historical resolver branches exist yet (see `resolver.ts`). The seam is built
 * because it cannot be retrofitted; the unused implementations are not.
 *
 * THE RETENTION OBLIGATION (documented, accepted — plan risk R17)
 * Once a second version of any axis ships, the first version's implementation
 * becomes code that must be kept working forever, because a document registered
 * under it must reproduce byte-identical output for the rest of its life. That
 * obligation begins with the second version, not this one.
 */

/**
 * A version number on any axis. A plain integer, monotonically increasing, never
 * reused and never renumbered — a stored document's version is a permanent
 * reference to a specific set of rules.
 */
export type EngineVersion = number;

export type TemplateVersion = EngineVersion;
export type LayoutVersion = EngineVersion;
export type BarcodeVersion = EngineVersion;

/** The three axes, named. Used by the resolver and by integrity tests. */
export type VersionAxis = 'template' | 'layout' | 'barcode';

export const VERSION_AXES: readonly VersionAxis[] = ['template', 'layout', 'barcode'];

/**
 * Lifecycle of a declared version.
 *
 * `active`     — new documents may be created under it.
 * `historical` — no new documents; existing documents still resolve to it and MUST
 *                keep rendering identically. There are none in v1.
 */
export type VersionStatus = 'active' | 'historical';

export interface VersionDescriptor {
  readonly version: EngineVersion;
  readonly status: VersionStatus;
  /** Short note on what this version establishes — read by auditors, not by code. */
  readonly note: string;
}

/* ── Template versions ──────────────────────────────────────────────────── */

export const TEMPLATE_VERSIONS: readonly VersionDescriptor[] = [
  {
    version: 1,
    status: 'active',
    note: 'Letter Engine v1 foundation: six-section Official Letter, controlled toolbar, Traditional Arabic body / Amiri Bold headings.',
  },
];

/* ── Layout versions ────────────────────────────────────────────────────── */

export const LAYOUT_VERSIONS: readonly VersionDescriptor[] = [
  {
    version: 1,
    status: 'active',
    // Deliberately free of numeric dimensions: this is a stored string, and every
    // millimetre in the engine lives in the Geometry Registry (INV-4).
    note: 'A4 portrait, profile-driven reserved zones, in-band page-footer strip, two-line widow/orphan minimum.',
  },
];

/* ── Barcode versions ───────────────────────────────────────────────────── */

export const BARCODE_VERSIONS: readonly VersionDescriptor[] = [
  {
    version: 1,
    status: 'active',
    note: 'Three data fields — issue date, subject (truncated), reference number.',
  },
];

/* ── LATEST ─────────────────────────────────────────────────────────────────
   What a NEW document is stamped with at creation. A document freezes its triple
   at registration and never re-reads these constants again (INV-9). Any code path
   that recomputes a stored document's version from LATEST is a defect. */

export const TEMPLATE_VERSION_LATEST: TemplateVersion = 1;
export const LAYOUT_VERSION_LATEST: LayoutVersion = 1;
export const BARCODE_VERSION_LATEST: BarcodeVersion = 1;

/**
 * The complete version stamp carried by every document. Stored, frozen at
 * registration, and never recomputed.
 */
export interface DocumentVersionStamp {
  readonly templateVersion: TemplateVersion;
  readonly layoutVersion: LayoutVersion;
  readonly barcodeVersion: BarcodeVersion;
}

/** The stamp a new document receives. Never applied to an existing document. */
export function latestVersionStamp(): DocumentVersionStamp {
  return {
    templateVersion: TEMPLATE_VERSION_LATEST,
    layoutVersion: LAYOUT_VERSION_LATEST,
    barcodeVersion: BARCODE_VERSION_LATEST,
  };
}

/* ── Queries ────────────────────────────────────────────────────────────── */

function descriptorsFor(axis: VersionAxis): readonly VersionDescriptor[] {
  switch (axis) {
    case 'template':
      return TEMPLATE_VERSIONS;
    case 'layout':
      return LAYOUT_VERSIONS;
    case 'barcode':
      return BARCODE_VERSIONS;
  }
}

/** All declared versions on an axis, ascending. */
export function getVersions(axis: VersionAxis): readonly VersionDescriptor[] {
  return descriptorsFor(axis);
}

/**
 * Is this version declared on this axis? The guard every load path uses before
 * trusting a stored version — an unknown version must fail loudly, never silently
 * fall back to LATEST (which would re-render history under today's rules).
 */
export function isKnownVersion(axis: VersionAxis, version: EngineVersion): boolean {
  return descriptorsFor(axis).some((d) => d.version === version);
}

/** Metadata for a declared version, or `undefined` for an unknown one. */
export function findVersion(axis: VersionAxis, version: EngineVersion): VersionDescriptor | undefined {
  return descriptorsFor(axis).find((d) => d.version === version);
}

/** The LATEST constant for an axis. */
export function latestVersion(axis: VersionAxis): EngineVersion {
  switch (axis) {
    case 'template':
      return TEMPLATE_VERSION_LATEST;
    case 'layout':
      return LAYOUT_VERSION_LATEST;
    case 'barcode':
      return BARCODE_VERSION_LATEST;
  }
}

/** Is every axis of this stamp a version this build knows how to render? */
export function isKnownVersionStamp(stamp: DocumentVersionStamp): boolean {
  return (
    isKnownVersion('template', stamp.templateVersion) &&
    isKnownVersion('layout', stamp.layoutVersion) &&
    isKnownVersion('barcode', stamp.barcodeVersion)
  );
}

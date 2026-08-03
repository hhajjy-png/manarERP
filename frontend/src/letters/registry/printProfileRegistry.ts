/**
 * Letter Engine — the Print Profile Registry.
 *
 * A print profile is the engine's model of a PHYSICAL SHEET OF PAPER: which
 * stationery is loaded, and therefore which bands are reserved. It is the reason
 * safe zones are configuration rather than constants — 40 mm is a fact about the
 * company's letterhead, not a fact about the software.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS FILE CONTAINS NO NUMERIC DIMENSION. NOT ONE.
 * ══════════════════════════════════════════════════════════════════════════
 * INV-4 permits geometry literals in the Geometry Registry only. A profile therefore
 * NAMES its geometry instead of restating it: `getProfileGeometry(id, layoutVersion)`
 * delegates straight to `geometryRegistry`. The profile still owns the physical page;
 * it owns it by reference.
 *
 * ── WHY ONLY ONE PROFILE HAS GEOMETRY IN v1 ──────────────────────────────
 * The plan's §5.4 anticipated four declared profiles, three disabled. Declaring a
 * disabled profile requires giving it reserved-zone millimetres, and nobody has
 * measured government letterhead or any customer's stationery. Inventing those
 * numbers would create a profile that, the day somebody enables it, silently
 * violates INV-2/INV-3 — content placed in a reserved band the engine believes is
 * clear, with the validator agreeing because it was fed fiction.
 *
 * So the ids are RESERVED (below) without geometry, exactly as future template keys
 * reserve their reference prefixes without being templates. The plurality is real in
 * the type system — the registry is a keyed map and every accessor is id-parameterised
 * — while no measurement is fabricated. Adding a profile later is: measure the paper,
 * add one entry to the Geometry Registry, add one entry here. No engine change.
 */

import {
  type PageGeometry,
  type PrintProfileId,
  type ContinuationStock,
  PRINT_PROFILE_IDS,
  getPageGeometry,
  isPrintProfileId,
} from './geometryRegistry';
import { type LayoutVersion, LAYOUT_VERSION_LATEST } from '../versioning/versions';

/** What kind of paper this profile describes. Documentation, not behaviour. */
export type StationeryKind = 'preprintedLetterhead' | 'plain';

export interface PrintProfile {
  readonly id: PrintProfileId;
  readonly displayNameAr: string;
  readonly displayNameEn: string;
  readonly stationeryKind: StationeryKind;
  /**
   * `false` hides the profile from any future picker without removing its geometry —
   * so documents already issued under it keep resolving. No disabled profile exists
   * in v1; the field exists so disabling one later is not a deletion.
   */
  readonly enabled: boolean;
  /**
   * Operator-facing note. Printed nowhere; read by whoever maintains the profile.
   */
  readonly note: string;
}

/**
 * The profiles. Exactly one in v1, per INV-10's spirit and the plan's "one active
 * profile" instruction.
 */
export const PRINT_PROFILES = {
  companyLetterhead: {
    id: 'companyLetterhead',
    displayNameAr: 'ورق الشركة الرسمي',
    displayNameEn: 'Company Letterhead',
    stationeryKind: 'preprintedLetterhead',
    enabled: true,
    note:
      'Pre-printed company stationery. The engine never prints the logo, header, or footer — ' +
      'they already exist on the paper. Reserved bands must be confirmed against the physical ' +
      'sheet at gate G1 before any letter is issued.',
  },
} as const satisfies Record<PrintProfileId, PrintProfile>;

/**
 * Profile ids reserved for future stationery, WITHOUT geometry.
 *
 * These are not usable profiles and are not part of `PrintProfileId`. They exist so
 * that a future profile cannot silently take an id that documentation, training
 * material, or an operator's memory already associates with something else — the
 * same discipline the template registry applies to reference prefixes.
 *
 * Promoting one to a real profile requires measuring the physical stationery first.
 */
export const RESERVED_PRINT_PROFILE_IDS: readonly { readonly id: string; readonly note: string }[] = [
  {
    id: 'governmentLetterhead',
    note: 'Government correspondence stationery. Reserved bands unmeasured — must be measured before this profile is created.',
  },
  {
    id: 'plainA4',
    note: 'Unprinted A4. Reserved for a future profile; the P9 test print is a diagnostic MODE of the active profile, not this.',
  },
  {
    id: 'customerStationery',
    note: 'Customer-specific stationery. Per-customer measurement required.',
  },
];

/* ── Queries ────────────────────────────────────────────────────────────── */

/** All declared profiles, in declaration order. */
export function getAllPrintProfiles(): PrintProfile[] {
  return PRINT_PROFILE_IDS.map((id) => PRINT_PROFILES[id]);
}

/** Profiles available for selection. This is what any future picker shows. */
export function getEnabledPrintProfiles(): PrintProfile[] {
  return getAllPrintProfiles().filter((p) => p.enabled);
}

/** A profile known at compile time. Never returns `undefined`. */
export function getPrintProfile(id: PrintProfileId): PrintProfile {
  return PRINT_PROFILES[id];
}

/**
 * Lookup by an UNTRUSTED id — a value from a stored document that may reference a
 * profile this build no longer declares. Returns `undefined` rather than throwing,
 * so the caller can surface a precise error instead of crashing.
 *
 * Own-property check rather than direct indexing: a stored `"constructor"` would
 * otherwise reach the prototype chain and return a function that passes an
 * `undefined` check before failing on first property access.
 */
export function findPrintProfile(id: string | null | undefined): PrintProfile | undefined {
  if (!isPrintProfileId(id ?? '')) return undefined;
  return PRINT_PROFILES[id as PrintProfileId];
}

/** Is this id reserved for future stationery (and therefore NOT usable)? */
export function isReservedPrintProfileId(id: string): boolean {
  return RESERVED_PRINT_PROFILE_IDS.some((r) => r.id === id);
}

/**
 * The profile's geometry under a layout version — the single sanctioned path from a
 * profile to a millimetre. Delegates to the Geometry Registry and adds nothing.
 */
export function getProfileGeometry(
  id: PrintProfileId,
  layoutVersion: LayoutVersion = LAYOUT_VERSION_LATEST,
): PageGeometry {
  return getPageGeometry(id, layoutVersion);
}

/** Continuation stock assumed by this profile under a layout version. */
export function getContinuationStock(
  id: PrintProfileId,
  layoutVersion: LayoutVersion = LAYOUT_VERSION_LATEST,
): ContinuationStock {
  return getProfileGeometry(id, layoutVersion).continuationStock;
}

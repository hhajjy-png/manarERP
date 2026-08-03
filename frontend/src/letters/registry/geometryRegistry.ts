/**
 * Letter Engine — the Geometry Registry (INV-1, INV-2, INV-3, INV-4).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS FILE IS THE ONLY PLACE IN THE ENGINE WHERE A PAGE DIMENSION MAY BE
 *  WRITTEN AS A LITERAL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * INV-4: "Safe Zones are configuration only. No hardcoded geometry values may exist
 * outside the Geometry Registry." Every component, paginator, validator, and print
 * path READS geometry from here; none DECLARES it. `noHardcodedGeometry.test.ts`
 * fails the build if a millimetre literal appears anywhere else under `src/letters/`.
 *
 * INV-1: millimetres are the only unit. Nothing in this file is a pixel, and nothing
 * that leaves this file is a pixel. Pixels exist only at the rendering boundary, and
 * a pixel value crossing back into the model is converted with a runtime-derived
 * factor (P4), never an assumed 96 dpi.
 *
 * WHY GEOMETRY IS KEYED BY (layoutVersion, printProfile)
 * ─────────────────────────────────────────────────────
 * Two independent reasons the same document can need different millimetres:
 *
 *   · The PRINT PROFILE is a fact about a physical sheet of paper. Company
 *     letterhead reserves 40 mm at the top because that is where the logo is
 *     printed. Different stationery reserves different bands. This is why safe
 *     zones are configuration and not constants — they describe paper, not code.
 *
 *   · The LAYOUT VERSION is a fact about the rendering rules in force when a
 *     document was issued. A document registered under layout version 1 must
 *     paginate under version 1's arithmetic for the rest of its life (INV-9),
 *     even after version 2 changes the footer strip or the band derivation.
 *
 * WHY THE PROFILE REGISTRY HOLDS NO NUMBERS
 * ─────────────────────────────────────────
 * The plan's §5.4 sketch showed a PrintProfile carrying its own millimetres. INV-4,
 * written later and therefore governing, permits geometry literals in the Geometry
 * Registry only. The two are reconciled by ownership-through-reference: the profile
 * still owns the physical page, but it names its geometry rather than restating it.
 * `printProfileRegistry.ts` contains no numeric dimension at all.
 *
 * DERIVED VALUES ARE FUNCTIONS, NEVER STORED
 * ──────────────────────────────────────────
 * Side margin, content-bottom limit, text-band bottom, and usable band height are all
 * COMPUTED from the stored primitives below. Storing a derived value invites the two
 * to disagree after an edit — and a disagreement here means content silently entering
 * a reserved zone, which INV-2/INV-3 make a blocking defect.
 */

import { type LayoutVersion, LAYOUT_VERSION_LATEST } from '../versioning/versions';

/* ── Page sizes ─────────────────────────────────────────────────────────── */

export type PageSizeId = 'A4';

export interface PageSize {
  readonly id: PageSizeId;
  readonly widthMm: number;
  readonly heightMm: number;
}

/** Physical paper sizes the engine knows. A4 portrait is the only one in v1. */
export const PAGE_SIZES: Readonly<Record<PageSizeId, PageSize>> = {
  A4: { id: 'A4', widthMm: 210, heightMm: 297 },
};

/* ── Continuation stock ─────────────────────────────────────────────────── */

/**
 * What is loaded in the printer for pages 2 and beyond.
 *
 * `letterhead` — the same pre-printed stock as page 1, so the top band stays
 *                reserved. This is the DEFAULT because it is the safe assumption:
 *                if it is wrong, ink lands in white space rather than over printed
 *                artwork.
 * `plain`      — unprinted paper; the reserved top band shrinks accordingly.
 */
export type ContinuationStock = 'letterhead' | 'plain';

/* ── The stored primitives ──────────────────────────────────────────────── */

/**
 * Every millimetre the engine needs for one (layout version, print profile) pair.
 * All values are distances from the sheet's true top-left corner, in millimetres.
 *
 * The coordinate origin is the physical corner of the paper — not an inset content
 * box. This matches the proven `BlankA4Print` geometry (`padding: 0`,
 * `@page { margin: 0 }`), which is the only arrangement in which a ruler reading and
 * a validator reading describe the same point.
 */
export interface PageGeometry {
  readonly pageSizeId: PageSizeId;

  /**
   * Reserved header band on the FIRST page, measured from the top edge. NO content may
   * enter it — ever, for any reason, with no override (INV-2). Overlap is always
   * blocking.
   */
  readonly reservedTopMm: number;

  /**
   * Reserved header band on pages 2 and beyond.
   *
   * A separate value because it is a separate physical fact: it describes whatever
   * stock is loaded for continuation sheets. On `letterhead` continuation it equals
   * the first page's, because the same pre-printed sheet is used throughout. On
   * `plain` continuation it is smaller — there is no artwork to clear, only a margin.
   *
   * Stored rather than derived from `continuationStock`, because "which stock" and
   * "how much of it is reserved" are two different questions and a future profile may
   * answer them independently.
   */
  readonly continuationReservedTopMm: number;

  /**
   * Reserved footer band, measured from the bottom edge. NO content may enter it
   * (INV-3). Note the page-footer strip (reference number, «صفحة X من Y») sits
   * INSIDE the content band, not here — see `footerStripMm`.
   */
  readonly reservedBottomMm: number;

  /**
   * Where content begins on the FIRST page. Deliberately greater than
   * `reservedTopMm`: the gap is a visual lead-in below the letterhead artwork, not
   * merely clearance from it.
   */
  readonly contentTopMm: number;

  /**
   * Where content begins on pages 2+. Smaller than `contentTopMm` because
   * continuation pages carry no date/subject block needing separation from the
   * artwork. Must never be less than `reservedTopMm` — asserted by the integrity
   * test.
   */
  readonly continuationContentTopMm: number;

  /** Measure of the text column. Centred, so side margins are derived from it. */
  readonly contentWidthMm: number;

  /**
   * Height reserved at the BOTTOM OF THE CONTENT BAND for the page-footer strip
   * (reference number, and «صفحة X من Y» when the document has more than one page).
   *
   * This lives inside the content band precisely BECAUSE the reserved footer is
   * inviolable: a detached sheet must still be traceable, and the only lawful place
   * to print that trace is within the band. It is the reason the first page's usable
   * text height is 214 mm and not 222 mm.
   */
  readonly footerStripMm: number;

  /**
   * Height of the signature image, and of the stamp image, as printed.
   *
   * Here rather than in the components because they are millimetres, and INV-4 puts
   * every millimetre in this registry. Heights rather than widths: both assets are
   * uploaded at arbitrary aspect ratios, so constraining the height and letting the
   * width follow keeps a wide signature and a square stamp both sitting correctly on
   * the same baseline.
   */
  readonly signatureHeightMm: number;
  readonly stampHeightMm: number;

  /**
   * Edge length of the barcode symbol.
   *
   * Sized so the symbol survives being printed, photocopied and photographed: too
   * small and the module size falls below what a phone camera resolves, too large and
   * it dominates a letter whose subject is the text.
   */
  readonly barcodeSizeMm: number;

  /** Stock assumed for pages 2+. */
  readonly continuationStock: ContinuationStock;
}

/* ── The registry ───────────────────────────────────────────────────────────
   Keyed layoutVersion → profileId → geometry.

   `PrintProfileId` is DERIVED from these keys (see below) rather than declared
   independently, which makes "every print profile has geometry" a compile-time
   guarantee instead of a test.

   v1 declares geometry for exactly one profile. Additional profile IDS are reserved
   in `printProfileRegistry.ts`, but WITHOUT geometry — see that file for why
   fabricating millimetres for unmeasured stationery is unsafe under INV-2/INV-3. */

const LAYOUT_V1_GEOMETRY = {
  /**
   * The company's own pre-printed letterhead — the only profile that ships enabled
   * in v1, and the one every approved dimension in the plan describes.
   *
   * These seven numbers are the entire physical contract of the engine. They were
   * approved in the design pack and must be confirmed against the real paper at
   * gate G1 (P3) before any letter is issued; if the printed logo does not clear
   * 40 mm, THIS is the value that changes — not the code that reads it.
   */
  companyLetterhead: {
    pageSizeId: 'A4',
    reservedTopMm: 40,
    // Equal to the first page's: the same pre-printed sheet is loaded for every page
    // of a letter, so the logo occupies the same band throughout. A profile whose
    // continuation stock is plain would declare a smaller value here.
    continuationReservedTopMm: 40,
    reservedBottomMm: 20,
    contentTopMm: 55,
    continuationContentTopMm: 45,
    contentWidthMm: 160,
    footerStripMm: 8,
    signatureHeightMm: 18,
    stampHeightMm: 22,
    barcodeSizeMm: 22,
    continuationStock: 'letterhead',
  },
} as const satisfies Record<string, PageGeometry>;

/**
 * Identifier of a print profile. Derived from the geometry keys, so a profile
 * cannot exist without geometry.
 */
export type PrintProfileId = keyof typeof LAYOUT_V1_GEOMETRY;

/** All profile ids that have geometry, in declaration order. */
export const PRINT_PROFILE_IDS = Object.keys(LAYOUT_V1_GEOMETRY) as PrintProfileId[];

/**
 * The registry proper. Every historical layout version keeps its own complete
 * geometry table — that is what makes INV-9 mechanically true rather than aspirational.
 */
const GEOMETRY_BY_LAYOUT_VERSION: Readonly<
  Record<LayoutVersion, Readonly<Record<PrintProfileId, PageGeometry>>>
> = {
  1: LAYOUT_V1_GEOMETRY,
};

/* ── Queries ────────────────────────────────────────────────────────────── */

/**
 * Geometry for a profile under a specific layout version.
 *
 * Throws rather than falling back. A missing (version, profile) pair means a stored
 * document references rules this build cannot reproduce, and rendering it under
 * different rules would silently break INV-9.
 */
export function getPageGeometry(
  profileId: PrintProfileId,
  layoutVersion: LayoutVersion = LAYOUT_VERSION_LATEST,
): PageGeometry {
  const table = GEOMETRY_BY_LAYOUT_VERSION[layoutVersion];
  if (!table) {
    throw new Error(
      `[LetterEngine] No geometry table for layout version ${layoutVersion}. ` +
        `Refusing to substitute another version's geometry (INV-9).`,
    );
  }
  const geometry = table[profileId];
  if (!geometry) {
    throw new Error(
      `[LetterEngine] No geometry for print profile "${profileId}" under layout version ${layoutVersion}.`,
    );
  }
  return geometry;
}

/** Non-throwing lookup, for callers validating untrusted stored values. */
export function findPageGeometry(
  profileId: string,
  layoutVersion: LayoutVersion,
): PageGeometry | undefined {
  const table = GEOMETRY_BY_LAYOUT_VERSION[layoutVersion];
  if (!table) return undefined;
  if (!Object.prototype.hasOwnProperty.call(table, profileId)) return undefined;
  return (table as Record<string, PageGeometry>)[profileId];
}

/** Is this a profile id the geometry registry knows? Guard for stored values. */
export function isPrintProfileId(id: string | null | undefined): id is PrintProfileId {
  if (!id) return false;
  return Object.prototype.hasOwnProperty.call(LAYOUT_V1_GEOMETRY, id);
}

/** The physical sheet for a geometry. */
export function pageSizeOf(geometry: PageGeometry): PageSize {
  return PAGE_SIZES[geometry.pageSizeId];
}

/* ── Derived measurements ───────────────────────────────────────────────────
   Computed, never stored. See the file header for why. */

/** Distance from each side edge to the text column. The column is centred. */
export function sideMarginMm(geometry: PageGeometry): number {
  return (pageSizeOf(geometry).widthMm - geometry.contentWidthMm) / 2;
}

/**
 * The lowest point any content may reach — the top edge of the reserved footer.
 * Crossing it is an INV-3 violation.
 */
export function contentBottomLimitMm(geometry: PageGeometry): number {
  return pageSizeOf(geometry).heightMm - geometry.reservedBottomMm;
}

/**
 * The lowest point FLOWING TEXT may reach: the content-bottom limit less the
 * page-footer strip, which occupies the band's final millimetres.
 */
export function textBandBottomMm(geometry: PageGeometry): number {
  return contentBottomLimitMm(geometry) - geometry.footerStripMm;
}

/**
 * Where text begins on a given page.
 *
 * @param pageIndex zero-based. Page 0 is the first sheet.
 */
export function contentTopForPageMm(geometry: PageGeometry, pageIndex: number): number {
  return pageIndex === 0 ? geometry.contentTopMm : geometry.continuationContentTopMm;
}

/**
 * Usable text height on a given page — the number every pagination decision is made
 * against. For `companyLetterhead` under layout v1: 214 mm on page 1, 224 mm after.
 */
export function usableBandMm(geometry: PageGeometry, pageIndex: number): number {
  return textBandBottomMm(geometry) - contentTopForPageMm(geometry, pageIndex);
}

/** Top edge of the page-footer strip. */
export function footerStripTopMm(geometry: PageGeometry): number {
  return textBandBottomMm(geometry);
}

/**
 * The reserved header band for a given page — the first page's value, or the
 * continuation value for every page after it.
 *
 * @param pageIndex zero-based. Page 0 is the first sheet.
 */
export function reservedTopForPageMm(geometry: PageGeometry, pageIndex: number): number {
  return pageIndex === 0 ? geometry.reservedTopMm : geometry.continuationReservedTopMm;
}

/**
 * The two inviolable bands of one page, as [startMm, endMm] pairs from the top edge.
 *
 * The single source both the on-screen overlay and any future validator read, so the
 * band that is drawn and the band that is enforced can never diverge. Page-aware,
 * because the header band may differ on continuation sheets.
 *
 * @param pageIndex zero-based; defaults to the first page.
 */
export function reservedZonesMm(
  geometry: PageGeometry,
  pageIndex = 0,
): readonly { readonly zone: 'header' | 'footer'; readonly startMm: number; readonly endMm: number }[] {
  return [
    { zone: 'header', startMm: 0, endMm: reservedTopForPageMm(geometry, pageIndex) },
    {
      zone: 'footer',
      startMm: contentBottomLimitMm(geometry),
      endMm: pageSizeOf(geometry).heightMm,
    },
  ];
}

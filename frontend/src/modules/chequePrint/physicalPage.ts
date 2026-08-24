/**
 * Cheque printing — the PHYSICAL PAGE contract (Deterministic Geometry &
 * Unified Pipeline Pack v1).
 *
 * One place decides, for every cheque print job on every provider, the exact
 * physical page handed to the printer: size, orientation, margins and scale.
 * Nothing downstream may re-derive or renegotiate it.
 *
 * WHY THIS EXISTS
 * ───────────────
 * Cheque printing previously passed Electron only `{ silent: false,
 * printBackground: true }` (plus an occasional `landscape`). With no `pageSize`,
 * no `margins` and no `scaleFactor`, the physical page came from whatever the OS
 * print dialog happened to be set to. Every cheque box is sized RELATIVE to that
 * page, so two prints of the same template could land at different scales and
 * different origins. That was root cause H1, and it is closed here by making the
 * page an explicit, computed property of the job.
 *
 * UNITS — verified against the Electron 31 typings actually installed in this
 * repository (`node_modules/electron/electron.d.ts`):
 *   - `WebContentsPrintOptions.pageSize` as a `Size` object is in **microns**
 *     ("Chromium attempts to validate platform specific minimum values for
 *     `width_microns` and `height_microns` … minimum 353 microns").
 *   - `Margins.marginType` is `'default' | 'none' | 'printableArea' | 'custom'`.
 *   - `scaleFactor` is the page scale factor (100 = actual size).
 * Conversion lives ONLY here — no magic numbers anywhere else.
 *
 * ORIENTATION POLICY
 * ──────────────────
 * The page is always expressed in its TRUE physical width × height, and
 * `landscape` is always `false`. A landscape page is simply one whose width
 * exceeds its height. Passing an already-landscape size together with
 * `landscape: true` asked Chromium to rotate a page that was never portrait —
 * root cause H4. Declaring the size once, unambiguously, removes the conflict.
 */

/** Millimetres per centimetre. */
export const MM_PER_CM = 10;
/** Microns per millimetre — the unit Electron's `pageSize` object expects. */
export const MICRONS_PER_MM = 1000;
/** CSS reference pixels per millimetre (96dpi ÷ 25.4mm per inch). */
export const CSS_PX_PER_MM = 96 / 25.4;

/** Electron rejects a custom page smaller than this on some platforms. */
export const MIN_PAGE_MICRONS = 353;

export function cmToMm(cm: number): number {
  return cm * MM_PER_CM;
}

export function mmToMicrons(mm: number): number {
  return Math.round(mm * MICRONS_PER_MM);
}

export function mmToCssPx(mm: number): number {
  return mm * CSS_PX_PER_MM;
}

/**
 * The resolved physical page for one cheque print job. Purely descriptive —
 * it holds no React state, reads no storage, and is a pure function of the
 * template surface plus the paper mode.
 */
export interface PhysicalPageSpec {
  /** True physical page width in millimetres (already oriented). */
  widthMm: number;
  /** True physical page height in millimetres (already oriented). */
  heightMm: number;
  /**
   * Always `false`. Orientation is baked into width/height above; see the
   * ORIENTATION POLICY note. Kept explicit so the print options never omit it.
   */
  landscape: false;
  /** Always 100 — the app prints at actual size, never "fit to page". */
  scalePercent: number;
  /** Always `'none'` — the app owns the margins, not the printer driver. */
  marginType: 'none';
}

/** A4 in its two orientations, stated once. */
export const A4_PORTRAIT_MM = { widthMm: 210, heightMm: 297 } as const;
export const A4_LANDSCAPE_MM = { widthMm: 297, heightMm: 210 } as const;

function page(widthMm: number, heightMm: number): PhysicalPageSpec {
  return { widthMm, heightMm, landscape: false, scalePercent: 100, marginType: 'none' };
}

/**
 * The A4-landscape page every cheque print job uses.
 *
 * Pinning the width — and zeroing the margins the driver used to choose — is what
 * makes cheque geometry deterministic: every field box is sized RELATIVE to this
 * page, so leaving it to the print dialog changed the coordinate system itself
 * between jobs.
 */
export const A4_LANDSCAPE_PAGE: PhysicalPageSpec = page(A4_LANDSCAPE_MM.widthMm, A4_LANDSCAPE_MM.heightMm);

/**
 * The physical page for a Designer template printed on REAL CHEQUE stock: the
 * page IS the template's own design surface, so a 17.8 × 8.9 cm surface prints
 * on a 178 × 89 mm page at 100% scale with zero margins.
 */
export function realChequePage(surface: { widthCm: number; heightCm: number }): PhysicalPageSpec {
  return page(cmToMm(surface.widthCm), cmToMm(surface.heightCm));
}

/**
 * Where a cheque area sits on a hosting A4 sheet, in TRUE millimetres.
 *
 * Stated in physical units, never in CSS direction terms: `xMm` is the distance
 * from the sheet's LEFT edge, so "flush with the right edge" is expressed as
 * `xMm = pageWidth − widthMm` and cannot be reinterpreted by an RTL context.
 * The A4 sheet component converts this to percentages of the page so the whole
 * sheet scales as one unit on screen and prints at true physical size.
 */
export interface ChequeA4Placement {
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
}

/** Paper surfaces a cheque can be printed on. Mirrors `ChequePaperMode`. */
export type ChequePaperKind = 'real-cheque' | 'a4';

/** Resolve the physical page from the template surface + paper mode. */
export function physicalPageFor(
  surface: { widthCm: number; heightCm: number },
  paperMode: ChequePaperKind,
): PhysicalPageSpec {
  return paperMode === 'a4' ? A4_LANDSCAPE_PAGE : realChequePage(surface);
}

/**
 * The CSS `@page` descriptor for a physical page.
 *
 * It must agree EXACTLY with the Electron options below — Chromium lays the
 * document out against `@page`, while the print job is sized by `pageSize`. Any
 * disagreement between the two reintroduces scaling.
 */
export function cssPageRule(spec: PhysicalPageSpec): string {
  return `@page { size: ${spec.widthMm}mm ${spec.heightMm}mm; margin: 0; }`;
}

/**
 * The exact options object handed to `window.manar.printPage` (→ `app:print` →
 * `webContents.print`). Every geometry-bearing option is stated explicitly; a
 * cheque production path may never rely on an omitted one.
 */
export interface ChequePrintOptions {
  landscape: boolean;
  pageSize: { width: number; height: number };
  marginType: 'none';
  scaleFactor: number;
}

export function printOptionsFor(spec: PhysicalPageSpec): ChequePrintOptions {
  return {
    landscape: spec.landscape,
    pageSize: {
      width: Math.max(MIN_PAGE_MICRONS, mmToMicrons(spec.widthMm)),
      height: Math.max(MIN_PAGE_MICRONS, mmToMicrons(spec.heightMm)),
    },
    marginType: spec.marginType,
    scaleFactor: spec.scalePercent,
  };
}

/**
 * Pure mapping from the renderer's `app:print` payload to the Electron
 * `webContents.print` geometry options (Cheque Printing Deterministic Geometry &
 * Unified Pipeline Pack v1).
 *
 * Kept free of any `electron` import — like `printResult.ts` next to it — so the
 * whole physical-page contract is unit-testable without an Electron runtime.
 *
 * Option shapes are taken from the Electron 31 typings installed in this repo
 * (`node_modules/electron/electron.d.ts`), not from memory:
 *
 *   WebContentsPrintOptions.pageSize?: 'A0'…'Tabloid' | Size
 *       — as an object, width/height are in MICRONS. Chromium validates a
 *         platform minimum of 353 microns per side.
 *   WebContentsPrintOptions.margins?: Margins
 *       — Margins.marginType?: 'default' | 'none' | 'printableArea' | 'custom'
 *   WebContentsPrintOptions.scaleFactor?: number   (100 = actual size)
 *   WebContentsPrintOptions.landscape?: boolean
 *
 * BACKWARD COMPATIBILITY IS LOAD-BEARING. Every field is optional and is emitted
 * ONLY when the caller supplied it, so the existing non-cheque callers (invoices,
 * reports, the calibration test sheet) that pass `undefined` or `{ landscape: true }`
 * produce byte-identical options to before this pack.
 */

/** Electron rejects a custom page smaller than this on some platforms. */
export const MIN_PAGE_MICRONS = 353;

export type PrintMarginType = 'default' | 'none' | 'printableArea' | 'custom';

/** Named page sizes Electron accepts for `webContents.print`. */
export type NamedPageSize = 'A0' | 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6' | 'Legal' | 'Letter' | 'Tabloid';

/** Custom page size — MICRONS, per the Electron typings quoted above. */
export interface PageSizeMicrons {
  width: number;
  height: number;
}

/** The payload the renderer may send with `app:print`. All fields optional. */
export interface PrintPageOptions {
  landscape?: boolean;
  pageSize?: NamedPageSize | PageSizeMicrons;
  marginType?: PrintMarginType;
  scaleFactor?: number;
}

/** The geometry subset merged into `webContents.print`'s options. */
export interface ResolvedPrintGeometryOptions {
  landscape?: boolean;
  pageSize?: NamedPageSize | PageSizeMicrons;
  margins?: { marginType: PrintMarginType };
  scaleFactor?: number;
}

const MARGIN_TYPES: readonly PrintMarginType[] = ['default', 'none', 'printableArea', 'custom'];

function isFinitePositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** A custom page size is valid only if BOTH sides are finite and meet Chromium's minimum. */
function normalizePageSize(value: unknown): NamedPageSize | PageSizeMicrons | undefined {
  if (typeof value === 'string') return value as NamedPageSize;
  if (!value || typeof value !== 'object') return undefined;
  const { width, height } = value as Partial<PageSizeMicrons>;
  if (!isFinitePositive(width) || !isFinitePositive(height)) return undefined;
  if (width < MIN_PAGE_MICRONS || height < MIN_PAGE_MICRONS) return undefined;
  return { width: Math.round(width), height: Math.round(height) };
}

/**
 * Build the geometry options to spread into `webContents.print`.
 *
 * An invalid/garbage field is DROPPED rather than passed through, so a malformed
 * payload degrades to Electron's previous behaviour instead of throwing at the
 * print boundary — but a caller that supplies a valid physical page always gets
 * it forwarded verbatim.
 */
export function buildPrintOptions(options?: PrintPageOptions): ResolvedPrintGeometryOptions {
  if (!options || typeof options !== 'object') return {};
  const resolved: ResolvedPrintGeometryOptions = {};

  if (typeof options.landscape === 'boolean') resolved.landscape = options.landscape;

  const pageSize = normalizePageSize(options.pageSize);
  if (pageSize !== undefined) resolved.pageSize = pageSize;

  if (options.marginType && MARGIN_TYPES.includes(options.marginType)) {
    resolved.margins = { marginType: options.marginType };
  }

  if (isFinitePositive(options.scaleFactor)) resolved.scaleFactor = options.scaleFactor;

  return resolved;
}

/**
 * Document Studio — zoom arithmetic.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ZOOM SCALES THE VIEWPORT. IT NEVER TOUCHES A DOCUMENT MEASUREMENT.
 * ══════════════════════════════════════════════════════════════════════════
 * Every value here is a number handed to a `transform: scale()`. Fit Width and Fit Page
 * are computed from the VIEWPORT's size against the page's millimetre size — the page
 * is the constant and the container is the variable, never the other way round.
 *
 * That is what lets the rulers stay physically correct at any zoom, and it is why the
 * measurement layer lives outside the transformed subtree: a measured height is taken
 * in layout pixels, which a transform cannot reach.
 *
 * Extracted from `PageNavigator` unchanged in behaviour so the status bar, the
 * navigator and the Ctrl+wheel handler all use one implementation rather than three
 * that would eventually disagree about what "150%" means.
 */

/**
 * The zoom ladder.
 *
 * Extended in Document Studio Foundation v1 from five rungs to seven: 25% and 200% were
 * added at the ends. 25% is what makes a ten-page letter legible as a SHAPE — which is
 * the view an author uses to check where the signature block landed — and 200% is what
 * makes a 14 pt footnote readable on a high-density display.
 */
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;

/** Smallest and largest zoom the studio will produce, fitted modes included. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;

/** Step taken by the status bar's +/− buttons and by Ctrl+= / Ctrl+−. */
export const ZOOM_STEP = 0.25;

export type ZoomMode = 'manual' | 'fitWidth' | 'fitPage';

/**
 * Keeps a zoom inside the range the presets span, and quantises to whole percent.
 *
 * Quantising matters for Ctrl+wheel: an unrounded factor would produce values like
 * 1.0700000000000003, which the status bar would then display as 107% while the select
 * showed nothing selected.
 */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(zoom * 100) / 100));
}

/**
 * Fit factors.
 *
 * Pure arithmetic over the viewport's pixel size, the page's millimetre size, and the
 * measured pixels-per-millimetre — so "fit" means the page really fills the box rather
 * than a guess based on an assumed screen density.
 *
 * `gutterPx` is the chrome around the sheet (rulers, margins) that must also fit.
 */
export function fitWidthZoom(
  viewportWidthPx: number,
  pageWidthMm: number,
  pxPerMm: number,
  gutterPx: number,
): number {
  const usable = Math.max(0, viewportWidthPx - gutterPx);
  const naturalPx = pageWidthMm * pxPerMm;
  if (naturalPx <= 0) return 1;
  return clampZoom(usable / naturalPx);
}

export function fitPageZoom(
  viewportWidthPx: number,
  viewportHeightPx: number,
  pageWidthMm: number,
  pageHeightMm: number,
  pxPerMm: number,
  gutterPx: number,
): number {
  const byWidth = fitWidthZoom(viewportWidthPx, pageWidthMm, pxPerMm, gutterPx);
  const usableHeight = Math.max(0, viewportHeightPx - gutterPx);
  const naturalHeightPx = pageHeightMm * pxPerMm;
  if (naturalHeightPx <= 0) return byWidth;
  return clampZoom(Math.min(byWidth, usableHeight / naturalHeightPx));
}

/**
 * The next rung above or below the current zoom.
 *
 * Stepping by ladder rather than by a fixed increment means Ctrl+= from a fitted zoom
 * of 0.63 lands on 0.75 rather than on 0.88 — the user gets a value the select can
 * display, which is what makes the two controls feel like one.
 */
export function stepZoom(current: number, direction: 'in' | 'out'): number {
  const rungs = [...ZOOM_PRESETS];
  if (direction === 'in') {
    const next = rungs.find((rung) => rung > current + 0.001);
    return clampZoom(next ?? ZOOM_MAX);
  }
  const previous = [...rungs].reverse().find((rung) => rung < current - 0.001);
  return clampZoom(previous ?? ZOOM_MIN);
}

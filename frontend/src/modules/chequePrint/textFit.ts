/**
 * Cheque printing — deterministic field typography & text-fit (Deterministic
 * Geometry & Unified Pipeline Pack v1).
 *
 * TWO PROBLEMS, ONE MODULE
 * ────────────────────────
 * 1. FONT SCALE. Template field sizes are authored in PIXELS against the
 *    template's nominal surface, but the rendered surface can be any size (a
 *    narrow designer panel on screen; the exact physical sheet in print). A px
 *    font in a percentage-sized box means type does NOT scale with the cheque,
 *    so shrinking the surface makes text overflow its box. Converting the
 *    authored px into `cqw` — percent of the surface's own inline size — makes
 *    typography a fixed fraction of the cheque, identical in preview and print.
 *    Container-relative, never viewport-relative.
 *
 * 2. TEXT FIT. `overflow: hidden` on the field box guarantees a long value can
 *    never paint over a neighbouring field, but silently clipping an amount or a
 *    payee on a financial instrument is not acceptable either. This module also
 *    provides a conservative fit estimate so an over-long value can be REPORTED
 *    and block printing instead of being quietly cropped.
 */

import { CSS_PX_PER_MM, MM_PER_CM } from './physicalPage';

/** Centimetres → CSS reference pixels. Axis-agnostic; the two helpers below name the axis. */
function cmToPx(cm: number): number {
  return cm * MM_PER_CM * CSS_PX_PER_MM;
}

/** CSS reference pixels across a surface of the given centimetre width. */
export function surfaceWidthPx(widthCm: number): number {
  return cmToPx(widthCm);
}

/**
 * Convert an authored pixel font size into container-width percent (`cqw`) for a
 * given surface, so it renders at exactly that px size when the surface is at its
 * declared physical width, and scales proportionally otherwise.
 */
export function fontSizeToCqw(fontSizePx: number, widthCm: number): number {
  const basis = surfaceWidthPx(widthCm);
  if (!Number.isFinite(basis) || basis <= 0 || !Number.isFinite(fontSizePx) || fontSizePx <= 0) return 0;
  return (fontSizePx / basis) * 100;
}

/**
 * Lower-bound average glyph advance, as a fraction of the font size.
 *
 * Deliberately conservative: real text is WIDER than this in every font the app
 * ships (Cairo, Arial, Tahoma, monospace), so the estimate under-reports width
 * and the overflow check below only fires when a value cannot fit even under the
 * most generous assumption. That keeps false positives — which would block a
 * legitimate cheque — effectively impossible, while still catching the gross
 * overflows that actually damage a printed cheque.
 *
 * The HARD guarantee against overlapping fields is the renderer's
 * `overflow: hidden`; this estimate exists so the user is TOLD rather than
 * silently given a clipped value.
 */
export const MIN_GLYPH_ADVANCE_EM = 0.42;

/** Estimated minimum rendered width, in px, of `text` at `fontSizePx`. */
export function estimateTextWidthPx(text: string, fontSizePx: number): number {
  if (!text) return 0;
  return text.length * fontSizePx * MIN_GLYPH_ADVANCE_EM;
}

/**
 * Does `text` definitely NOT fit its field box?
 *
 * `widthPercent` is the field's width as a percentage of the surface, matching
 * the template model. Returns true only when even the lower-bound width estimate
 * exceeds the box — i.e. when overflow is certain.
 *
 * `lines` is the number of text lines the box can hold. It is 1 for every
 * ordinary cheque field (they are single-line by nature, and the renderer pins
 * `white-space: nowrap` on them); a field explicitly marked as wrapping passes
 * the count its own HEIGHT allows, so the usable run length is `box width ×
 * lines`. Nothing else about the check changes, and a `lines` of 1 reproduces
 * the original behaviour exactly.
 */
export function textDefinitelyOverflows(
  text: string,
  fontSizePx: number,
  widthPercent: number,
  surfaceWidthCm: number,
  lines = 1,
): boolean {
  if (!text) return false;
  const usableLines = Number.isFinite(lines) && lines >= 1 ? Math.floor(lines) : 1;
  const boxPx = (widthPercent / 100) * surfaceWidthPx(surfaceWidthCm) * usableLines;
  if (!Number.isFinite(boxPx) || boxPx <= 0) return false;
  return estimateTextWidthPx(text, fontSizePx) > boxPx;
}

/**
 * Rendered line box height as a multiple of the font size — must match the
 * `line-height` the renderer applies to a wrapping field, or the line count
 * below would not describe what actually gets painted.
 */
export const WRAPPED_LINE_HEIGHT_FACTOR = 1.35;

/**
 * How many wrapped lines fit inside a field box of `heightPercent` on a surface
 * `surfaceHeightCm` tall. Always at least 1 — a box too short for even one line
 * still renders that line (clipped by `overflow: hidden`), and the width check
 * above is what reports it.
 */
export function maxLinesFor(
  heightPercent: number,
  surfaceHeightCm: number,
  fontSizePx: number,
): number {
  // `surfaceWidthPx` is a plain cm → CSS-px conversion, so it reads the vertical
  // axis just as correctly as the horizontal one.
  const boxPx = (heightPercent / 100) * cmToPx(surfaceHeightCm);
  const linePx = fontSizePx * WRAPPED_LINE_HEIGHT_FACTOR;
  if (!Number.isFinite(boxPx) || !Number.isFinite(linePx) || linePx <= 0) return 1;
  return Math.max(1, Math.floor(boxPx / linePx));
}

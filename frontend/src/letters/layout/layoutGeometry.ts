/**
 * Letter Engine — layout geometry (Document Layout Designer v1).
 *
 * PURE. No React, no DOM, no clock. Millimetres in, millimetres out.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ROTATION IS WHY THIS FILE EXISTS.
 * ══════════════════════════════════════════════════════════════════════════
 * An unrotated rectangle needs almost none of this: overlap is four comparisons and
 * hit-testing is two. A ROTATED rectangle needs neither of those to be wrong, and both
 * become wrong the moment anyone reaches for `frame.x <= point.x` on a box turned 30°.
 *
 * The two operations that must be exact:
 *
 *   · HIT TESTING — clicking a rotated object must select it, and clicking the gap
 *     beside it must not. Done by rotating the POINT backwards about the object's
 *     centre and testing it against the unrotated frame, which is exact and needs no
 *     polygon clipping.
 *
 *   · RESERVED-ZONE OVERLAP — the blocking rule this whole layer is permitted to exist
 *     under. Judged on the object's true rotated corners, never on its axis-aligned
 *     bounding box: the box of a rotated object is larger than the object, so testing
 *     it would refuse prints for overlaps that do not exist.
 *
 * Selection bounds, by contrast, DO use the axis-aligned box — a selection rectangle
 * that did not enclose a rotated object would be the wrong answer for the opposite
 * reason.
 */

import { type LayoutFrame, type LayoutObject, MIN_OBJECT_SIZE_MM } from '../model/layoutTypes';

/** A point in sheet millimetres, from the top-left corner. */
export interface PointMm {
  readonly xMm: number;
  readonly yMm: number;
}

/** An axis-aligned rectangle in sheet millimetres. */
export interface RectMm {
  readonly xMm: number;
  readonly yMm: number;
  readonly widthMm: number;
  readonly heightMm: number;
}

const DEG_TO_RAD = Math.PI / 180;

/* ── Basic rectangle arithmetic ─────────────────────────────────────────── */

export function rectRight(rect: RectMm): number {
  return rect.xMm + rect.widthMm;
}

export function rectBottom(rect: RectMm): number {
  return rect.yMm + rect.heightMm;
}

export function rectCentre(rect: RectMm): PointMm {
  return { xMm: rect.xMm + rect.widthMm / 2, yMm: rect.yMm + rect.heightMm / 2 };
}

/** Do two axis-aligned rectangles share any area? Touching edges do NOT count. */
export function rectsOverlap(a: RectMm, b: RectMm): boolean {
  return (
    a.xMm < rectRight(b) &&
    rectRight(a) > b.xMm &&
    a.yMm < rectBottom(b) &&
    rectBottom(a) > b.yMm
  );
}

/** Is `inner` entirely inside `outer`? Used by the marquee's "fully enclosed" mode. */
export function rectContains(outer: RectMm, inner: RectMm): boolean {
  return (
    inner.xMm >= outer.xMm &&
    inner.yMm >= outer.yMm &&
    rectRight(inner) <= rectRight(outer) &&
    rectBottom(inner) <= rectBottom(outer)
  );
}

/** The smallest rectangle containing all of them, or `null` for an empty list. */
export function unionRect(rects: readonly RectMm[]): RectMm | null {
  if (rects.length === 0) return null;
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (const rect of rects) {
    left = Math.min(left, rect.xMm);
    top = Math.min(top, rect.yMm);
    right = Math.max(right, rectRight(rect));
    bottom = Math.max(bottom, rectBottom(rect));
  }

  return { xMm: left, yMm: top, widthMm: right - left, heightMm: bottom - top };
}

/** A rectangle from two opposite corners, in any order. The marquee's shape. */
export function rectFromPoints(a: PointMm, b: PointMm): RectMm {
  return {
    xMm: Math.min(a.xMm, b.xMm),
    yMm: Math.min(a.yMm, b.yMm),
    widthMm: Math.abs(a.xMm - b.xMm),
    heightMm: Math.abs(a.yMm - b.yMm),
  };
}

/* ── Rotation ───────────────────────────────────────────────────────────── */

/** Rotate a point about a centre, clockwise, by degrees. */
export function rotatePoint(point: PointMm, centre: PointMm, degrees: number): PointMm {
  if (degrees === 0) return point;
  const radians = degrees * DEG_TO_RAD;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.xMm - centre.xMm;
  const dy = point.yMm - centre.yMm;
  return {
    xMm: centre.xMm + dx * cos - dy * sin,
    yMm: centre.yMm + dx * sin + dy * cos,
  };
}

/** Normalise any angle into [0, 360). */
export function normaliseRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** An object's frame as a plain rectangle, ignoring rotation. */
export function frameRect(frame: LayoutFrame): RectMm {
  return { xMm: frame.xMm, yMm: frame.yMm, widthMm: frame.widthMm, heightMm: frame.heightMm };
}

/**
 * The object's four corners after rotation, clockwise from top-left.
 *
 * This is the exact shape. Every containment and overlap question that must be right
 * — above all the reserved-zone rule — is answered from these, not from the bounding
 * box below.
 */
export function objectCorners(object: LayoutObject): PointMm[] {
  const rect = frameRect(object.frame);
  const centre = rectCentre(rect);
  const corners: PointMm[] = [
    { xMm: rect.xMm, yMm: rect.yMm },
    { xMm: rectRight(rect), yMm: rect.yMm },
    { xMm: rectRight(rect), yMm: rectBottom(rect) },
    { xMm: rect.xMm, yMm: rectBottom(rect) },
  ];
  if (object.rotationDeg === 0) return corners;
  return corners.map((corner) => rotatePoint(corner, centre, object.rotationDeg));
}

/**
 * The axis-aligned box that encloses the rotated object.
 *
 * Correct for SELECTION (a marquee must enclose what the eye sees) and for the
 * selection frame the canvas draws. NOT used for the reserved-zone rule — see the
 * header for why testing this box there would refuse prints for overlaps that are not
 * real.
 */
export function objectBounds(object: LayoutObject): RectMm {
  const corners = objectCorners(object);
  const xs = corners.map((c) => c.xMm);
  const ys = corners.map((c) => c.yMm);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  return { xMm: left, yMm: top, widthMm: Math.max(...xs) - left, heightMm: Math.max(...ys) - top };
}

/** The union of several objects' bounds — the multi-selection frame. */
export function selectionBounds(objects: readonly LayoutObject[]): RectMm | null {
  return unionRect(objects.map(objectBounds));
}

/* ── Hit testing ────────────────────────────────────────────────────────── */

/**
 * Is this point inside the object?
 *
 * Exact for a rotated object: the POINT is rotated backwards about the object's centre
 * and tested against the unrotated frame. That is one inverse rotation and four
 * comparisons — cheaper as well as more correct than clipping a polygon.
 */
export function objectContainsPoint(object: LayoutObject, point: PointMm): boolean {
  const rect = frameRect(object.frame);
  const local =
    object.rotationDeg === 0 ? point : rotatePoint(point, rectCentre(rect), -object.rotationDeg);

  return (
    local.xMm >= rect.xMm &&
    local.xMm <= rectRight(rect) &&
    local.yMm >= rect.yMm &&
    local.yMm <= rectBottom(rect)
  );
}

/**
 * The topmost object under a point, or `null`.
 *
 * Walks in PAINT ORDER reversed, so the object the user can see is the one they get.
 * Hidden and locked objects are skipped: a locked object is deliberately not a click
 * target, which is what "lock" means to anyone who has used a design tool.
 */
export function hitTest(
  objects: readonly LayoutObject[],
  point: PointMm,
  pageIndex: number,
  options: { readonly includeLocked?: boolean } = {},
): LayoutObject | null {
  const candidates = paintOrder(objects)
    .filter((object) => object.pageIndex === pageIndex && !object.hidden)
    .filter((object) => options.includeLocked === true || !object.locked);

  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    if (objectContainsPoint(candidates[i], point)) return candidates[i];
  }
  return null;
}

/**
 * Objects a marquee selects.
 *
 * `touch` selects anything the rectangle grazes; `enclose` selects only what it fully
 * contains. Both exist because both are right in different tools — `enclose` is the
 * safer default for a document, where a stray drag across a dense page would otherwise
 * select everything.
 */
export function marqueeSelect(
  objects: readonly LayoutObject[],
  marquee: RectMm,
  pageIndex: number,
  mode: 'touch' | 'enclose' = 'enclose',
): LayoutObject[] {
  return objects
    .filter((object) => object.pageIndex === pageIndex && !object.hidden && !object.locked)
    .filter((object) => {
      const bounds = objectBounds(object);
      return mode === 'touch' ? rectsOverlap(marquee, bounds) : rectContains(marquee, bounds);
    });
}

/* ── Ordering ───────────────────────────────────────────────────────────── */

/**
 * Objects in paint order: lowest `zIndex` first, ties broken by id.
 *
 * The tiebreak is what makes the order TOTAL and therefore stable. Without it two
 * objects sharing a z-index would paint in whatever order the array happened to hold,
 * and a save/load round trip could silently swap them.
 */
export function paintOrder(objects: readonly LayoutObject[]): LayoutObject[] {
  return [...objects].sort((a, b) => (a.zIndex === b.zIndex ? a.id.localeCompare(b.id) : a.zIndex - b.zIndex));
}

/* ── Constraints ────────────────────────────────────────────────────────── */

/**
 * Bring a frame into the legal range.
 *
 * Negative or sub-minimum sizes are CLAMPED rather than rejected: they arrive from a
 * drag that crossed its own origin, which is a gesture to interpret rather than an
 * error to report. A resize that inverts the box is a resize to the minimum.
 */
export function clampFrame(frame: LayoutFrame): LayoutFrame {
  return {
    xMm: roundMm(frame.xMm),
    yMm: roundMm(frame.yMm),
    widthMm: roundMm(Math.max(MIN_OBJECT_SIZE_MM, frame.widthMm)),
    heightMm: roundMm(Math.max(MIN_OBJECT_SIZE_MM, frame.heightMm)),
  };
}

/**
 * Round to hundredths of a millimetre.
 *
 * Two decimals is finer than any printer resolves and coarser than floating-point
 * noise, so a drag that returns to where it started produces the SAME numbers rather
 * than ones that differ in the twelfth decimal — which would mark the document dirty
 * for ever and make undo compare unequal.
 */
export function roundMm(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/** Is the whole object inside the sheet? Rotation-aware, via the true corners. */
export function objectWithinPage(object: LayoutObject, pageWidthMm: number, pageHeightMm: number): boolean {
  return objectCorners(object).every(
    (corner) =>
      corner.xMm >= 0 && corner.yMm >= 0 && corner.xMm <= pageWidthMm && corner.yMm <= pageHeightMm,
  );
}

/**
 * Does the object intrude into a band running the full width of the sheet?
 *
 * The reserved zones are exactly such bands, so this reduces to a vertical-span test
 * against the object's TRUE corners — no polygon intersection needed, and no bounding
 * box to over-report with.
 */
export function objectEntersBand(object: LayoutObject, bandTopMm: number, bandBottomMm: number): boolean {
  const ys = objectCorners(object).map((corner) => corner.yMm);
  return Math.min(...ys) < bandBottomMm && Math.max(...ys) > bandTopMm;
}

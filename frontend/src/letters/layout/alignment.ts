/**
 * Letter Engine — alignment and distribution (Document Layout Designer v1).
 *
 * PURE. A layout and a selection in, a new layout out.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE OBJECT ALIGNS TO THE PAGE. SEVERAL ALIGN TO EACH OTHER.
 * ══════════════════════════════════════════════════════════════════════════
 * That switch is the whole usability of an alignment toolbar, and getting it wrong is
 * the most common way these controls disappoint:
 *
 *   · With a SINGLE object selected, "align left" means "put it against the content
 *     band's left edge" — the only other thing in the conversation is the page.
 *   · With SEVERAL selected, it means "line them up with the leftmost of yourselves" —
 *     aligning them all to the page instead would stack them on top of each other.
 *
 * Both are implemented below, chosen by selection size rather than by a mode the user
 * has to find.
 *
 * ── ALIGNMENT MOVES BOUNDS, NOT FRAMES ──────────────────────────────────
 * A rotated object's frame and its visible box are different rectangles. Aligning the
 * frame would leave two rotated objects visibly misaligned while their stored `x`
 * values matched — correct arithmetic, wrong answer. So every operation computes the
 * delta from the object's BOUNDS and applies it to its position, which lines up what
 * the author can actually see.
 */

import { type DocumentLayout, type LayoutObject } from '../model/layoutTypes';
import {
  type RectMm,
  objectBounds,
  rectBottom,
  rectCentre,
  rectRight,
  roundMm,
  unionRect,
} from './layoutGeometry';
import { effectiveLocked, findObject, moveObjects, setObjectFrame } from './layoutCommands';
import { ORIGIN_MM } from '../registry/geometryRegistry';

/** The eleven quick actions the toolbar offers. */
export type AlignAction =
  | 'left'
  | 'right'
  | 'centreHorizontal'
  | 'top'
  | 'bottom'
  | 'centreVertical'
  | 'distributeHorizontal'
  | 'distributeVertical'
  | 'sameWidth'
  | 'sameHeight';

/** The page reference a single-object alignment uses. */
export interface AlignPageContext {
  readonly bandLeftMm: number;
  readonly bandRightMm: number;
  readonly bandTopMm: number;
  readonly bandBottomMm: number;
  readonly pageWidthMm: number;
  readonly pageHeightMm: number;
}

/** Selected, movable objects — locked ones take part in nothing. */
function movable(layout: DocumentLayout, ids: readonly string[]): LayoutObject[] {
  return ids
    .map((id) => findObject(layout, id))
    .filter((object): object is LayoutObject => object !== undefined && !effectiveLocked(layout, object));
}

/** The rectangle alignment is measured against. */
function referenceRect(objects: readonly LayoutObject[], page: AlignPageContext): RectMm {
  if (objects.length > 1) {
    // Several objects: they align to their own collective bounds.
    return unionRect(objects.map(objectBounds)) ?? pageRect(page);
  }
  // One object: the content band is the reference, because the page is the only other
  // participant in the conversation.
  return {
    xMm: page.bandLeftMm,
    yMm: page.bandTopMm,
    widthMm: page.bandRightMm - page.bandLeftMm,
    heightMm: page.bandBottomMm - page.bandTopMm,
  };
}

function pageRect(page: AlignPageContext): RectMm {
  return { xMm: ORIGIN_MM, yMm: ORIGIN_MM, widthMm: page.pageWidthMm, heightMm: page.pageHeightMm };
}

/**
 * Move one object so its BOUNDS land at a target coordinate on one axis.
 *
 * Expressed as a delta because a rotated object's bounds are offset from its frame by
 * an amount only the geometry knows — computing the target frame position directly
 * would have to re-derive that offset here and would get it wrong for any rotation.
 */
function deltaTo(bounds: RectMm, axis: 'x' | 'y', edge: 'start' | 'centre' | 'end', target: number): number {
  const current =
    axis === 'x'
      ? edge === 'start' ? bounds.xMm : edge === 'centre' ? rectCentre(bounds).xMm : rectRight(bounds)
      : edge === 'start' ? bounds.yMm : edge === 'centre' ? rectCentre(bounds).yMm : rectBottom(bounds);
  return target - current;
}

/**
 * Align or distribute.
 *
 * Returns the layout unchanged when the action cannot apply — one object cannot be
 * distributed, and nothing can be aligned when everything selected is locked.
 */
export function applyAlignment(
  layout: DocumentLayout,
  ids: readonly string[],
  action: AlignAction,
  page: AlignPageContext,
): DocumentLayout {
  const objects = movable(layout, ids);
  if (objects.length === 0) return layout;

  const reference = referenceRect(objects, page);

  switch (action) {
    case 'left':
      return shiftEach(layout, objects, (bounds) => ({
        dx: deltaTo(bounds, 'x', 'start', reference.xMm),
        dy: 0,
      }));
    case 'right':
      return shiftEach(layout, objects, (bounds) => ({
        dx: deltaTo(bounds, 'x', 'end', rectRight(reference)),
        dy: 0,
      }));
    case 'centreHorizontal':
      return shiftEach(layout, objects, (bounds) => ({
        dx: deltaTo(bounds, 'x', 'centre', rectCentre(reference).xMm),
        dy: 0,
      }));
    case 'top':
      return shiftEach(layout, objects, (bounds) => ({
        dx: 0,
        dy: deltaTo(bounds, 'y', 'start', reference.yMm),
      }));
    case 'bottom':
      return shiftEach(layout, objects, (bounds) => ({
        dx: 0,
        dy: deltaTo(bounds, 'y', 'end', rectBottom(reference)),
      }));
    case 'centreVertical':
      return shiftEach(layout, objects, (bounds) => ({
        dx: 0,
        dy: deltaTo(bounds, 'y', 'centre', rectCentre(reference).yMm),
      }));
    case 'distributeHorizontal':
      return distribute(layout, objects, 'horizontal');
    case 'distributeVertical':
      return distribute(layout, objects, 'vertical');
    case 'sameWidth':
      return matchSize(layout, objects, 'width');
    case 'sameHeight':
      return matchSize(layout, objects, 'height');
  }
}

/** Apply a per-object delta computed from that object's own bounds. */
function shiftEach(
  layout: DocumentLayout,
  objects: readonly LayoutObject[],
  delta: (bounds: RectMm) => { dx: number; dy: number },
): DocumentLayout {
  return objects.reduce((current, object) => {
    // Re-read from the CURRENT layout: an earlier object in this fold may already have
    // moved, and computing every delta up front would use stale bounds.
    const live = findObject(current, object.id);
    if (!live) return current;
    const { dx, dy } = delta(objectBounds(live));
    return dx === 0 && dy === 0 ? current : moveObjects(current, [object.id], roundMm(dx), roundMm(dy));
  }, layout);
}

/**
 * Space objects so the GAPS between them are equal.
 *
 * Equal gaps, not equal centres. Distributing centres is the easier arithmetic and the
 * wrong result whenever the objects are different sizes — which is most of the time,
 * and exactly when someone reaches for this button.
 *
 * The outermost two never move: they define the span being filled.
 */
function distribute(
  layout: DocumentLayout,
  objects: readonly LayoutObject[],
  axis: 'horizontal' | 'vertical',
): DocumentLayout {
  if (objects.length < 3) return layout;

  const withBounds = objects
    .map((object) => ({ object, bounds: objectBounds(object) }))
    .sort((a, b) => (axis === 'horizontal' ? a.bounds.xMm - b.bounds.xMm : a.bounds.yMm - b.bounds.yMm));

  const first = withBounds[0].bounds;
  const last = withBounds[withBounds.length - 1].bounds;

  const spanStart = axis === 'horizontal' ? rectRight(first) : rectBottom(first);
  const spanEnd = axis === 'horizontal' ? last.xMm : last.yMm;

  const innerSize = withBounds
    .slice(1, -1)
    .reduce((total, entry) => total + (axis === 'horizontal' ? entry.bounds.widthMm : entry.bounds.heightMm), 0);

  const gap = (spanEnd - spanStart - innerSize) / (withBounds.length - 1);

  let cursor = spanStart + gap;
  let next = layout;

  for (const entry of withBounds.slice(1, -1)) {
    const live = findObject(next, entry.object.id);
    if (!live) continue;
    const bounds = objectBounds(live);
    const delta =
      axis === 'horizontal' ? cursor - bounds.xMm : cursor - bounds.yMm;

    next = moveObjects(
      next,
      [entry.object.id],
      axis === 'horizontal' ? roundMm(delta) : 0,
      axis === 'vertical' ? roundMm(delta) : 0,
    );
    cursor += (axis === 'horizontal' ? bounds.widthMm : bounds.heightMm) + gap;
  }

  return next;
}

/**
 * Give every selected object the same width or height as the FIRST one selected.
 *
 * The first, not the largest: "same width" is a command to match a reference the
 * author has in mind, and the one they clicked first is the one they meant. Matching
 * the largest silently picks a different reference on every use.
 *
 * The FRAME is resized, not the bounds — resizing a rotated object's bounding box to a
 * target would change its real width by a factor of its rotation.
 */
function matchSize(
  layout: DocumentLayout,
  objects: readonly LayoutObject[],
  dimension: 'width' | 'height',
): DocumentLayout {
  if (objects.length < 2) return layout;

  const reference = objects[0].frame;
  return objects.slice(1).reduce(
    (current, object) =>
      setObjectFrame(
        current,
        object.id,
        dimension === 'width' ? { widthMm: reference.widthMm } : { heightMm: reference.heightMm },
      ),
    layout,
  );
}

/** Can this action do anything for a selection of this size? Drives button state. */
export function alignmentEnabled(action: AlignAction, selectionCount: number): boolean {
  switch (action) {
    case 'distributeHorizontal':
    case 'distributeVertical':
      return selectionCount >= 3;
    case 'sameWidth':
    case 'sameHeight':
      return selectionCount >= 2;
    default:
      return selectionCount >= 1;
  }
}

export const ALIGN_ACTION_LABELS_AR: Readonly<Record<AlignAction, string>> = {
  left: 'محاذاة لليسار',
  right: 'محاذاة لليمين',
  centreHorizontal: 'توسيط أفقي',
  top: 'محاذاة للأعلى',
  bottom: 'محاذاة للأسفل',
  centreVertical: 'توسيط رأسي',
  distributeHorizontal: 'توزيع أفقي',
  distributeVertical: 'توزيع رأسي',
  sameWidth: 'توحيد العرض',
  sameHeight: 'توحيد الارتفاع',
};

export const ALIGN_ACTION_ICONS: Readonly<Record<AlignAction, string>> = {
  left: 'align_horizontal_left',
  right: 'align_horizontal_right',
  centreHorizontal: 'align_horizontal_center',
  top: 'align_vertical_top',
  bottom: 'align_vertical_bottom',
  centreVertical: 'align_vertical_center',
  distributeHorizontal: 'horizontal_distribute',
  distributeVertical: 'vertical_distribute',
  sameWidth: 'width_normal',
  sameHeight: 'height',
};

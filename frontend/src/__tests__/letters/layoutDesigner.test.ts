/**
 * Document Layout Designer v1 — the pure layers.
 *
 * Geometry, commands, snapping, alignment, integrity, the version-3 migration and the
 * four validation rules. Everything with no React in it, which is everything that can
 * be wrong in a way a rendering test would not notice.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  E16 IS THE TEST THAT MATTERS MOST.
 * ══════════════════════════════════════════════════════════════════════════
 * Free positioning was permitted on the strength of one guarantee: an object that
 * reaches the pre-printed letterhead refuses the print, exactly as flow content does.
 * If that rule is wrong — in either direction — the whole positioned layer is a
 * regression against INV-2, which is the rule the letters module exists to protect.
 * Both directions are asserted below: it must fire on a real overlap, and it must NOT
 * fire on a rotated object whose bounding box overlaps but whose true shape does not.
 */

import { describe, it, expect } from 'vitest';

import {
  CONTENT_MODEL_VERSION,
  SUPPORTED_CONTENT_MODEL_VERSIONS,
  createBlock,
  createSpan,
  type BlockAttributes,
  type BlockDocument,
} from '../../letters/model/blockTypes';
import {
  type DocumentLayout,
  type LayoutObject,
  EMPTY_LAYOUT,
  MIN_OBJECT_SIZE_MM,
  defaultPayload,
} from '../../letters/model/layoutTypes';
import {
  documentLayout,
  parseDocument,
  serialiseDocument,
  setDocumentLayout,
} from '../../letters/editor/blockCommands';
import {
  hitTest,
  marqueeSelect,
  objectBounds,
  objectContainsPoint,
  objectCorners,
  objectEntersBand,
  objectWithinPage,
  paintOrder,
  rectsOverlap,
  rotatePoint,
  selectionBounds,
} from '../../letters/layout/layoutGeometry';
import {
  addObject,
  deleteObjects,
  duplicateObjects,
  effectiveHidden,
  effectiveLocked,
  expandSelectionToGroups,
  findObject,
  groupObjects,
  moveObjectBefore,
  moveObjects,
  renameObject,
  reorderObjects,
  rotateObjects,
  setObjectFrame,
  setObjectHidden,
  setObjectLocked,
  setObjectOpacity,
  ungroup,
} from '../../letters/layout/layoutCommands';
import { validateLayout } from '../../letters/layout/layoutIntegrity';
import {
  DEFAULT_SNAP_SETTINGS,
  GRID_PITCH_MM,
  snapDrag,
  snapResize,
  snapRotation,
} from '../../letters/layout/snapping';
import { applyAlignment, alignmentEnabled } from '../../letters/layout/alignment';
import { getPageGeometry, reservedZonesMm } from '../../letters/registry/geometryRegistry';
import { createLetterValidationRegistry } from '../../letters/validation/rules';
import { runValidation } from '../../letters/validation/framework';
import { getTemplate } from '../../letters/registry/templateRegistry';
import { paginate } from '../../letters/pagination/paginate';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const BODY: BlockAttributes = { fontId: 'traditionalArabic', sizePt: 16, alignment: 'justify', indentLevel: 0 };
const TYPO = { fontId: 'traditionalArabic' as const, sizePt: 16 };

function object(over: Partial<LayoutObject> & { id: string }): LayoutObject {
  return {
    kind: 'textBlock',
    name: over.id,
    pageIndex: 0,
    frame: { xMm: 0, yMm: 0, widthMm: 20, heightMm: 10 },
    rotationDeg: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    zIndex: 1,
    payload: defaultPayload('textBlock', TYPO),
    ...over,
  };
}

function layoutOfObjects(...objects: LayoutObject[]): DocumentLayout {
  return { ...EMPTY_LAYOUT, objects };
}

function docWith(layout: DocumentLayout): BlockDocument {
  return {
    contentModelVersion: CONTENT_MODEL_VERSION,
    blocks: [createBlock('b0', 'paragraph', [createSpan('نص')], BODY)],
    layout,
  };
}

/* ══ Geometry ══════════════════════════════════════════════════════════════ */

describe('Layout geometry — rotation is why this layer exists', () => {
  it('hit-tests a rotated object against its TRUE shape, not its CSS box', () => {
    // A 40×10 box turned 90° occupies a 10×40 footprint. A point 15 mm below its
    // centre is INSIDE the turned object and OUTSIDE the unrotated one.
    const turned = object({ id: 'a', frame: { xMm: 0, yMm: 0, widthMm: 40, heightMm: 10 }, rotationDeg: 90 });

    expect(objectContainsPoint(turned, { xMm: 20, yMm: 20 })).toBe(true);
    // …and a point 18 mm to the side, which WAS inside before the rotation, is not.
    expect(objectContainsPoint(turned, { xMm: 38, yMm: 5 })).toBe(false);
  });

  it('reports bounds that ENCLOSE the rotated shape', () => {
    const turned = object({ id: 'a', frame: { xMm: 0, yMm: 0, widthMm: 40, heightMm: 10 }, rotationDeg: 90 });
    const bounds = objectBounds(turned);
    // The box is 10 wide and 40 tall, centred where the original was.
    expect(Math.round(bounds.widthMm)).toBe(10);
    expect(Math.round(bounds.heightMm)).toBe(40);
  });

  it('rotates a point about a centre without drift', () => {
    const there = rotatePoint({ xMm: 10, yMm: 0 }, { xMm: 0, yMm: 0 }, 90);
    // `toBeCloseTo`, not `toBe`: a quarter turn of an exact 10 leaves floating-point
    // residue, and `Math.round` of a tiny negative is `-0`, which `Object.is` rejects
    // against `+0`. The tolerance is the honest assertion here.
    expect(there.xMm).toBeCloseTo(0, 10);
    expect(there.yMm).toBeCloseTo(10, 10);
    // Four quarter-turns must return exactly where it started.
    const round = [90, 90, 90, 90].reduce(
      (point, deg) => rotatePoint(point, { xMm: 0, yMm: 0 }, deg),
      { xMm: 10, yMm: 0 },
    );
    expect(round.xMm).toBeCloseTo(10, 10);
    expect(round.yMm).toBeCloseTo(0, 10);
  });

  it('picks the TOPMOST object under a point', () => {
    const under = object({ id: 'under', zIndex: 1 });
    const over = object({ id: 'over', zIndex: 5 });
    expect(hitTest([under, over], { xMm: 5, yMm: 5 }, 0)?.id).toBe('over');
  });

  it('skips locked and hidden objects when hit-testing', () => {
    // A locked object is deliberately not a click target — that is what lock means.
    expect(hitTest([object({ id: 'a', locked: true })], { xMm: 5, yMm: 5 }, 0)).toBeNull();
    expect(hitTest([object({ id: 'a', hidden: true })], { xMm: 5, yMm: 5 }, 0)).toBeNull();
    expect(hitTest([object({ id: 'a', locked: true })], { xMm: 5, yMm: 5 }, 0, { includeLocked: true })?.id).toBe('a');
  });

  it('only hit-tests objects on the page asked for', () => {
    expect(hitTest([object({ id: 'a', pageIndex: 1 })], { xMm: 5, yMm: 5 }, 0)).toBeNull();
  });

  it('marquee encloses by default and touches on request', () => {
    const target = object({ id: 'a', frame: { xMm: 10, yMm: 10, widthMm: 20, heightMm: 20 } });
    const grazing = { xMm: 0, yMm: 0, widthMm: 15, heightMm: 15 };

    expect(marqueeSelect([target], grazing, 0)).toHaveLength(0);
    expect(marqueeSelect([target], grazing, 0, 'touch')).toHaveLength(1);
    expect(marqueeSelect([target], { xMm: 0, yMm: 0, widthMm: 60, heightMm: 60 }, 0)).toHaveLength(1);
  });

  it('orders by z-index, breaking ties by id so the order is total', () => {
    // Without the tiebreak two objects sharing a z-index paint in array order, and a
    // save/load round trip could silently swap them.
    const ordered = paintOrder([object({ id: 'b', zIndex: 1 }), object({ id: 'a', zIndex: 1 })]);
    expect(ordered.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('detects a band intrusion from the true corners', () => {
    const inside = object({ id: 'a', frame: { xMm: 0, yMm: 50, widthMm: 20, heightMm: 10 } });
    expect(objectEntersBand(inside, 0, 40)).toBe(false);
    expect(objectEntersBand(inside, 0, 55)).toBe(true);
  });

  it('knows when an object hangs off the sheet', () => {
    expect(objectWithinPage(object({ id: 'a' }), 210, 297)).toBe(true);
    expect(objectWithinPage(object({ id: 'a', frame: { xMm: 200, yMm: 0, widthMm: 20, heightMm: 10 } }), 210, 297)).toBe(false);
  });

  it('unions a multi-selection into one frame', () => {
    const bounds = selectionBounds([
      object({ id: 'a', frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 } }),
      object({ id: 'b', frame: { xMm: 20, yMm: 30, widthMm: 10, heightMm: 10 } }),
    ]);
    expect(bounds).toEqual({ xMm: 0, yMm: 0, widthMm: 30, heightMm: 40 });
  });
});

/* ══ Commands ══════════════════════════════════════════════════════════════ */

describe('Layout commands — locking is enforced in the model', () => {
  it('refuses to move, resize, rotate or delete a locked object', () => {
    // Enforced HERE rather than in the canvas: the Inspector, the toolbar, the arrow
    // keys and the Layers panel would each otherwise have to remember.
    const locked = layoutOfObjects(object({ id: 'a', locked: true }));

    expect(moveObjects(locked, ['a'], 5, 5)).toBe(locked);
    expect(setObjectFrame(locked, 'a', { widthMm: 50 })).toBe(locked);
    expect(rotateObjects(locked, ['a'], 45)).toBe(locked);
    expect(deleteObjects(locked, ['a'])).toBe(locked);
  });

  it('still allows unlocking and unhiding a locked object', () => {
    // The one operation whose whole purpose is to act on something locked.
    const locked = layoutOfObjects(object({ id: 'a', locked: true, hidden: true }));
    expect(findObject(setObjectLocked(locked, ['a'], false), 'a')!.locked).toBe(false);
    expect(findObject(setObjectHidden(locked, ['a'], false), 'a')!.hidden).toBe(false);
  });

  it('inherits lock and visibility from a group WITHOUT rewriting members', () => {
    // If locking a group rewrote its members, unlocking it would have to guess which
    // were already locked — information it had just destroyed.
    const grouped = groupObjects(
      layoutOfObjects(object({ id: 'a' }), object({ id: 'b', locked: true })),
      ['a', 'b'],
      'g1',
    );
    const locked = { ...grouped, groups: grouped.groups.map((g) => ({ ...g, locked: true })) };

    expect(effectiveLocked(locked, findObject(locked, 'a')!)).toBe(true);
    expect(findObject(locked, 'a')!.locked, 'the member itself must be untouched').toBe(false);

    const released = ungroup(locked, 'g1');
    expect(findObject(released, 'a')!.locked).toBe(false);
    expect(findObject(released, 'b')!.locked, 'b was locked before grouping and still is').toBe(true);
  });

  it('propagates group visibility the same way', () => {
    const grouped = groupObjects(layoutOfObjects(object({ id: 'a' }), object({ id: 'b' })), ['a', 'b'], 'g1');
    const hidden = { ...grouped, groups: grouped.groups.map((g) => ({ ...g, hidden: true })) };
    expect(effectiveHidden(hidden, findObject(hidden, 'a')!)).toBe(true);
  });

  it('clamps a frame below the minimum instead of rejecting it', () => {
    // Sub-minimum sizes arrive from a drag that crossed its own origin — a gesture to
    // interpret, not an error to report.
    const shrunk = setObjectFrame(layoutOfObjects(object({ id: 'a' })), 'a', { widthMm: -5, heightMm: 0 });
    expect(findObject(shrunk, 'a')!.frame.widthMm).toBe(MIN_OBJECT_SIZE_MM);
    expect(findObject(shrunk, 'a')!.frame.heightMm).toBe(MIN_OBJECT_SIZE_MM);
  });

  it('normalises rotation into [0, 360) and clamps opacity into [0, 1]', () => {
    const layout = layoutOfObjects(object({ id: 'a' }));
    expect(findObject(rotateObjects(layout, ['a'], -90), 'a')!.rotationDeg).toBe(270);
    expect(findObject(rotateObjects(layout, ['a'], 450), 'a')!.rotationDeg).toBe(90);
    expect(findObject(setObjectOpacity(layout, ['a'], 5), 'a')!.opacity).toBe(1);
    expect(findObject(setObjectOpacity(layout, ['a'], -1), 'a')!.opacity).toBe(0);
  });

  it('duplicates offset, unlocked, visible and ungrouped', () => {
    const grouped = groupObjects(layoutOfObjects(object({ id: 'a' }), object({ id: 'b' })), ['a', 'b'], 'g1');
    const source = setObjectHidden(setObjectLocked(grouped, ['a'], true), ['a'], true);

    const { layout: next, newIds } = duplicateObjects(source, ['a'], ['copy']);
    const copy = findObject(next, newIds[0])!;

    expect(copy.frame.xMm).toBeGreaterThan(findObject(source, 'a')!.frame.xMm);
    expect(copy.locked, 'a copy the author cannot move looks like a failed copy').toBe(false);
    expect(copy.hidden).toBe(false);
    expect(copy.groupId, 'pasting into the source group is the author’s decision').toBeNull();
  });

  it('grouping needs two objects and inherits a shared parent', () => {
    const one = layoutOfObjects(object({ id: 'a' }));
    expect(groupObjects(one, ['a'], 'g1'), 'a group of one adds a row and changes nothing').toBe(one);

    const grouped = groupObjects(layoutOfObjects(object({ id: 'a' }), object({ id: 'b' })), ['a', 'b'], 'g1');
    expect(findObject(grouped, 'a')!.groupId).toBe('g1');
    expect(validateLayout(grouped)).toEqual([]);
  });

  it('renames, and falls back to the kind label rather than going blank', () => {
    const named = renameObject(layoutOfObjects(object({ id: 'a' })), 'a', '  ');
    expect(findObject(named, 'a')!.name.length).toBeGreaterThan(0);
  });

  it('reordering is idempotent at the ends', () => {
    // Rebuilding the sequence rather than incrementing is what makes this true —
    // incremental arithmetic drifts into ties, and ties then resolve by id.
    const layout = layoutOfObjects(
      object({ id: 'a', zIndex: 1 }),
      object({ id: 'b', zIndex: 2 }),
      object({ id: 'c', zIndex: 3 }),
    );
    const front = reorderObjects(layout, ['a'], 'front');
    expect(paintOrder(front.objects).map((o) => o.id)).toEqual(['b', 'c', 'a']);
    expect(paintOrder(reorderObjects(front, ['a'], 'front').objects).map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('steps one position forward without overtaking itself', () => {
    const layout = layoutOfObjects(
      object({ id: 'a', zIndex: 1 }),
      object({ id: 'b', zIndex: 2 }),
      object({ id: 'c', zIndex: 3 }),
    );
    expect(paintOrder(reorderObjects(layout, ['a'], 'forward').objects).map((o) => o.id)).toEqual(['b', 'a', 'c']);
    expect(paintOrder(reorderObjects(layout, ['c'], 'backward').objects).map((o) => o.id)).toEqual(['a', 'c', 'b']);
  });

  it('moves a row to an explicit position for the Layers panel drag', () => {
    const layout = layoutOfObjects(
      object({ id: 'a', zIndex: 1 }),
      object({ id: 'b', zIndex: 2 }),
      object({ id: 'c', zIndex: 3 }),
    );
    expect(paintOrder(moveObjectBefore(layout, 'c', 'a').objects).map((o) => o.id)).toEqual(['c', 'a', 'b']);
    expect(paintOrder(moveObjectBefore(layout, 'a', null).objects).map((o) => o.id)).toEqual(['b', 'c', 'a']);
  });

  it('selecting one member of a group selects the whole group', () => {
    const grouped = groupObjects(
      layoutOfObjects(object({ id: 'a' }), object({ id: 'b' }), object({ id: 'c' })),
      ['a', 'b'],
      'g1',
    );
    expect(expandSelectionToGroups(grouped, ['a']).sort()).toEqual(['a', 'b']);
    expect(expandSelectionToGroups(grouped, ['c'])).toEqual(['c']);
  });

  it('adds an object above everything already placed', () => {
    const layout = addObject(layoutOfObjects(object({ id: 'a', zIndex: 7 })), {
      id: 'new',
      kind: 'image',
      pageIndex: 0,
      payload: defaultPayload('image', TYPO),
    });
    expect(findObject(layout, 'new')!.zIndex).toBeGreaterThan(7);
    expect(validateLayout(layout)).toEqual([]);
  });
});

/* ══ Integrity ═════════════════════════════════════════════════════════════ */

describe('Layout integrity', () => {
  it('accepts an empty layout', () => {
    expect(validateLayout(EMPTY_LAYOUT)).toEqual([]);
  });

  it('detects a group cycle instead of hanging on it', () => {
    // A cycle cannot be produced by any command — it can only arrive from stored JSON,
    // which is exactly the class of problem an integrity check exists for.
    const cyclic: DocumentLayout = {
      objects: [],
      guides: [],
      groups: [
        { id: 'g1', name: 'a', parentGroupId: 'g2', collapsed: false, locked: false, hidden: false },
        { id: 'g2', name: 'b', parentGroupId: 'g1', collapsed: false, locked: false, hidden: false },
      ],
    };
    const defects = validateLayout(cyclic);
    expect(defects.length).toBeGreaterThan(0);
    expect(defects.every((d) => /cycle/.test(d.message))).toBe(true);
  });

  it('rejects a payload whose kind disagrees with the object', () => {
    const mismatched = layoutOfObjects(object({ id: 'a', kind: 'image' }));
    expect(validateLayout(mismatched)[0].message).toMatch(/payload kind/);
  });

  it('rejects a duplicate id, an out-of-range rotation and a missing group', () => {
    expect(validateLayout(layoutOfObjects(object({ id: 'a' }), object({ id: 'a' })))[0].message).toMatch(/duplicate/i);
    expect(validateLayout(layoutOfObjects(object({ id: 'a', rotationDeg: 400 })))[0].message).toMatch(/rotationDeg/);
    expect(validateLayout(layoutOfObjects(object({ id: 'a', groupId: 'nope' })))[0].message).toMatch(/does not exist/);
  });
});

/* ══ Snapping ══════════════════════════════════════════════════════════════ */

describe('Snapping', () => {
  const page = {
    pageWidthMm: 210,
    pageHeightMm: 297,
    bandLeftMm: 25,
    bandRightMm: 185,
    bandTopMm: 55,
    bandBottomMm: 277,
  };

  it('snaps a near-miss to the content margin', () => {
    const result = snapDrag({
      moving: { xMm: 20, yMm: 100, widthMm: 30, heightMm: 10 },
      dxMm: 4.2,
      dyMm: 0,
      others: [],
      guides: [],
      page,
      settings: DEFAULT_SNAP_SETTINGS,
      thresholdMm: 2,
    });
    // 20 + 4.2 = 24.2, which is 0.8 mm from the 25 mm margin — inside the threshold.
    expect(result.dxMm).toBeCloseTo(5, 5);
    expect(result.guides.some((g) => g.source === 'margin')).toBe(true);
  });

  it('prefers a neighbouring object over a grid line', () => {
    // The grid is the FALLBACK, never a competitor — an object beside a neighbour
    // should align to the neighbour, not to whichever grid line is marginally nearer.
    const result = snapDrag({
      moving: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
      dxMm: 51.4,
      dyMm: 0,
      others: [{ xMm: 52, yMm: 40, widthMm: 10, heightMm: 10 }],
      guides: [],
      page,
      settings: DEFAULT_SNAP_SETTINGS,
      thresholdMm: 2,
    });
    expect(result.dxMm).toBeCloseTo(52, 5);
    expect(result.guides[0]?.source).toBe('object');
  });

  it('falls back to the grid when nothing else is near', () => {
    const result = snapDrag({
      moving: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 },
      dxMm: 99.4,
      dyMm: 0,
      others: [],
      guides: [],
      page,
      settings: { ...DEFAULT_SNAP_SETTINGS, toMargins: false, toCentre: false },
      thresholdMm: 2,
    });
    expect(result.dxMm % GRID_PITCH_MM).toBeCloseTo(0, 5);
  });

  it('does nothing at all when snapping is off', () => {
    const result = snapDrag({
      moving: { xMm: 20, yMm: 100, widthMm: 30, heightMm: 10 },
      dxMm: 4.2,
      dyMm: 3.3,
      others: [],
      guides: [],
      page,
      settings: { ...DEFAULT_SNAP_SETTINGS, enabled: false },
      thresholdMm: 2,
    });
    expect(result.dxMm).toBeCloseTo(4.2, 5);
    expect(result.dyMm).toBeCloseTo(3.3, 5);
    expect(result.guides).toEqual([]);
  });

  it('resizing only snaps the edges the handle actually moves', () => {
    // Snapping a fixed edge would MOVE it, which is not a resize — and is the classic
    // way a resize handle ends up dragging the whole object.
    const result = snapResize({
      proposed: { xMm: 24.3, yMm: 100, widthMm: 40, heightMm: 20 },
      movesLeft: false,
      movesRight: true,
      movesTop: false,
      movesBottom: false,
      others: [],
      guides: [],
      page,
      settings: DEFAULT_SNAP_SETTINGS,
      thresholdMm: 2,
    });
    expect(result.rect.xMm, 'the fixed left edge must not move').toBeCloseTo(24.3, 5);
  });

  it('snaps rotation to 15° only when asked', () => {
    expect(snapRotation(47, true)).toBe(45);
    expect(snapRotation(47, false)).toBe(47);
    expect(snapRotation(88, true)).toBe(90);
  });
});

/* ══ Alignment ═════════════════════════════════════════════════════════════ */

describe('Alignment and distribution', () => {
  const page = {
    bandLeftMm: 25,
    bandRightMm: 185,
    bandTopMm: 55,
    bandBottomMm: 277,
    pageWidthMm: 210,
    pageHeightMm: 297,
  };

  it('aligns a SINGLE object to the page band', () => {
    const layout = layoutOfObjects(object({ id: 'a', frame: { xMm: 100, yMm: 100, widthMm: 20, heightMm: 10 } }));
    expect(findObject(applyAlignment(layout, ['a'], 'left', page), 'a')!.frame.xMm).toBe(25);
  });

  it('aligns SEVERAL objects to each other, not to the page', () => {
    // Aligning them all to the page instead would stack them on top of each other.
    const layout = layoutOfObjects(
      object({ id: 'a', frame: { xMm: 60, yMm: 10, widthMm: 20, heightMm: 10 } }),
      object({ id: 'b', frame: { xMm: 90, yMm: 40, widthMm: 20, heightMm: 10 } }),
    );
    const aligned = applyAlignment(layout, ['a', 'b'], 'left', page);
    expect(findObject(aligned, 'a')!.frame.xMm).toBe(60);
    expect(findObject(aligned, 'b')!.frame.xMm).toBe(60);
  });

  it('distributes EQUAL GAPS, not equal centres', () => {
    // Equal centres is the easier arithmetic and the wrong result whenever the objects
    // are different sizes — which is exactly when someone reaches for this button.
    const layout = layoutOfObjects(
      object({ id: 'a', frame: { xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 } }),
      object({ id: 'b', frame: { xMm: 20, yMm: 0, widthMm: 40, heightMm: 10 } }),
      object({ id: 'c', frame: { xMm: 100, yMm: 0, widthMm: 10, heightMm: 10 } }),
    );
    const spread = applyAlignment(layout, ['a', 'b', 'c'], 'distributeHorizontal', page);

    const b = findObject(spread, 'b')!.frame;
    const gapBefore = b.xMm - 10;
    const gapAfter = 100 - (b.xMm + b.widthMm);
    expect(gapBefore).toBeCloseTo(gapAfter, 1);
  });

  it('matches size to the FIRST selected object', () => {
    // The first, not the largest: "same width" matches a reference the author has in
    // mind, and the one they clicked first is the one they meant.
    const layout = layoutOfObjects(
      object({ id: 'a', frame: { xMm: 0, yMm: 0, widthMm: 30, heightMm: 10 } }),
      object({ id: 'b', frame: { xMm: 50, yMm: 0, widthMm: 80, heightMm: 10 } }),
    );
    const matched = applyAlignment(layout, ['a', 'b'], 'sameWidth', page);
    expect(findObject(matched, 'b')!.frame.widthMm).toBe(30);
  });

  it('leaves locked objects entirely alone', () => {
    const layout = layoutOfObjects(object({ id: 'a', locked: true, frame: { xMm: 100, yMm: 0, widthMm: 10, heightMm: 10 } }));
    expect(applyAlignment(layout, ['a'], 'left', page)).toBe(layout);
  });

  it('reports which actions a selection size can use', () => {
    expect(alignmentEnabled('distributeHorizontal', 2)).toBe(false);
    expect(alignmentEnabled('distributeHorizontal', 3)).toBe(true);
    expect(alignmentEnabled('sameWidth', 1)).toBe(false);
    expect(alignmentEnabled('left', 1)).toBe(true);
  });
});

/* ══ Persistence ═══════════════════════════════════════════════════════════ */

describe('Content model version 3 — the layout layer persists', () => {
  it('round-trips objects through serialise and parse', () => {
    const original = docWith(layoutOfObjects(object({ id: 'a', name: 'شعار' })));
    const parsed = parseDocument(serialiseDocument(original));
    expect(parsed).not.toBeNull();
    expect(documentLayout(parsed!).objects).toHaveLength(1);
    expect(documentLayout(parsed!).objects[0].name).toBe('شعار');
  });

  it('drops an EMPTY layout so a letter that used no objects is byte-identical', () => {
    // "The author placed nothing" and "this letter predates the designer" must be the
    // same value — that is what keeps the version-3 migration a re-stamp.
    const withEmpty = setDocumentLayout(docWith(EMPTY_LAYOUT), EMPTY_LAYOUT);
    expect(withEmpty.layout).toBeUndefined();
    expect(serialiseDocument(withEmpty)).not.toContain('layout');
  });

  it('migrates a version-1 draft straight through to version 3', () => {
    const storedV1 = JSON.stringify({
      contentModelVersion: 1,
      blocks: [{ id: 'b1', kind: 'paragraph', spans: [{ text: 'قديم', marks: [] }], attributes: BODY }],
    });
    const parsed = parseDocument(storedV1);
    expect(parsed).not.toBeNull();
    expect(parsed!.contentModelVersion).toBe(CONTENT_MODEL_VERSION);
    expect(parsed!.blocks).toHaveLength(1);
    expect(documentLayout(parsed!)).toEqual(EMPTY_LAYOUT);
  });

  it('migrates a version-2 draft and leaves it without a layout layer', () => {
    const storedV2 = JSON.stringify({
      contentModelVersion: 2,
      blocks: [{ id: 'b1', kind: 'paragraph', spans: [{ text: 'أحدث', marks: ['bold'] }], attributes: BODY }],
    });
    const parsed = parseDocument(storedV2)!;
    expect(parsed.contentModelVersion).toBe(CONTENT_MODEL_VERSION);
    expect(parsed.layout).toBeUndefined();
  });

  it('declares every readable version and refuses the rest', () => {
    // Version 4 joined with Professional Document Automation v1 — block conditions and
    // document bindings, both optional, so the migration stays a re-stamp.
    expect([...SUPPORTED_CONTENT_MODEL_VERSIONS]).toEqual([1, 2, 3, 4]);
    expect(parseDocument(JSON.stringify({ contentModelVersion: 99, blocks: [] }))).toBeNull();
  });
});

/* ══ Validation ════════════════════════════════════════════════════════════ */

describe('E16 — the rule the positioned layer exists under', () => {
  const geometry = getPageGeometry('companyLetterhead', 1);
  const template = getTemplate('officialLetter');
  const registry = createLetterValidationRegistry();

  function validate(layout: DocumentLayout) {
    const content = docWith(layout);
    const pagination = paginate(
      [{ id: 'b0', kind: 'content', heightMm: 10 }],
      geometry,
    );
    return runValidation(
      registry,
      template.validationRules,
      {
        template,
        geometry,
        status: 'DRAFT',
        reference: null,
        issueDate: '2026-01-01',
        subject: 'موضوع',
        recipient: { name: '', title: '', organisation: '' },
        content,
        pagination,
        itemHeightsMm: { b0: 10 },
        subjectLineCount: 1,
        signatureAssetId: null,
        stampAssetId: null,
        signatureResolved: false,
        stampResolved: false,
        barcodePayload: '',
        now: new Date('2026-01-01'),
      },
    );
  }

  it('is declared BLOCKING and cannot be downgraded by a template', () => {
    // The same guarantee E4 carries for flow content. INV-2 says "always blocking,
    // no override", and the way to make "always" true is to keep severity out of the
    // template's reach — which the catalogue does.
    const rule = template.validationRules.find((r) => r.ruleId === 'E16_objectInReservedZone');
    expect(rule, 'the template must select E16').toBeDefined();
    expect(Object.keys(rule!.params), 'a parameterless rule has no threshold to weaken').toEqual([]);
  });

  it('FIRES when an object enters the reserved header band', () => {
    const [header] = reservedZonesMm(geometry, 0);
    const intruding = layoutOfObjects(
      object({ id: 'a', name: 'شعار', frame: { xMm: 50, yMm: header.startMm + 1, widthMm: 30, heightMm: 10 } }),
    );
    const issues = validate(intruding).issues.filter((i) => i.ruleId === 'E16_objectInReservedZone');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
    expect(issues[0].location?.objectId).toBe('a');
  });

  it('does NOT fire for an object safely inside the writing band', () => {
    const safe = layoutOfObjects(object({ id: 'a', frame: { xMm: 50, yMm: 100, widthMm: 30, heightMm: 10 } }));
    expect(validate(safe).issues.filter((i) => i.ruleId === 'E16_objectInReservedZone')).toHaveLength(0);
  });

  it('does NOT fire for a HIDDEN object, which cannot print', () => {
    // Blocking a print over something invisible would be an error the author cannot
    // see to fix. Hiding is a legitimate way to park a draft element.
    const [header] = reservedZonesMm(geometry, 0);
    const parked = layoutOfObjects(
      object({ id: 'a', hidden: true, frame: { xMm: 50, yMm: header.startMm + 1, widthMm: 30, heightMm: 10 } }),
    );
    expect(validate(parked).issues.filter((i) => i.ruleId === 'E16_objectInReservedZone')).toHaveLength(0);
  });

  it('DOES fire for a locked object — a lock prevents editing, not printing', () => {
    const [header] = reservedZonesMm(geometry, 0);
    const pinned = layoutOfObjects(
      object({ id: 'a', locked: true, frame: { xMm: 50, yMm: header.startMm + 1, widthMm: 30, heightMm: 10 } }),
    );
    expect(validate(pinned).issues.filter((i) => i.ruleId === 'E16_objectInReservedZone')).toHaveLength(1);
  });

  it('accounts for ROTATION — a bar that clears the band flat can intrude once turned', () => {
    // The regression this guards. Testing the UNROTATED frame would miss it entirely,
    // and the object would print over the pre-printed letterhead with a clean bill.
    //
    // (For a full-width band the corner test and the bounding box give the same
    // vertical extent — see the rule's own note. What matters here is that rotation
    // is accounted for at all, not that corners beat boxes.)
    const [header] = reservedZonesMm(geometry, 0);
    const widthMm = 60;
    const frame = { xMm: 70, yMm: header.endMm + 4, widthMm, heightMm: 2 };

    const flat = object({ id: 'a', frame });
    expect(
      validate(layoutOfObjects(flat)).issues.filter((i) => i.ruleId === 'E16_objectInReservedZone'),
      'lying flat, 4 mm below the band, it is clear',
    ).toHaveLength(0);

    // Turned 30°, the same bar's topmost corner rises by (width/2)·sin(30°) = 15 mm.
    const turned = object({ id: 'a', frame, rotationDeg: 30 });
    const topOfShape = Math.min(...objectCorners(turned).map((c) => c.yMm));
    expect(topOfShape, 'turning it must lift a corner into the band').toBeLessThan(header.endMm);

    expect(
      validate(layoutOfObjects(turned)).issues.filter((i) => i.ruleId === 'E16_objectInReservedZone'),
    ).toHaveLength(1);
  });

  it('reports an object stranded past the last page as advisory, not blocking', () => {
    // The content shortened after the object was placed. Deleting it would destroy
    // work because a paragraph was trimmed; it returns when the document grows again.
    const stranded = layoutOfObjects(object({ id: 'a', pageIndex: 9 }));
    const issues = validate(stranded).issues.filter((i) => i.ruleId === 'W10_objectOffPage');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('reports an object hanging off the sheet as blocking', () => {
    const off = layoutOfObjects(object({ id: 'a', frame: { xMm: 200, yMm: 100, widthMm: 40, heightMm: 10 } }));
    const issues = validate(off).issues.filter((i) => i.ruleId === 'E17_objectOutsidePage');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
  });

  it('a letter with NO objects reports none of the four rules', () => {
    const clean = validate(EMPTY_LAYOUT).issues.filter((i) =>
      ['E16_objectInReservedZone', 'E17_objectOutsidePage', 'W9_objectOverlapsContent', 'W10_objectOffPage'].includes(i.ruleId),
    );
    expect(clean).toEqual([]);
  });
});

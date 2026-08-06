/**
 * Letter Engine — layout commands (Document Layout Designer v1).
 *
 * PURE. No React, no DOM, no ids minted here, no clock. Every function takes a layout
 * and returns a NEW one — the same discipline `blockCommands` follows, and for the
 * same payoff: the undo stack stays a plain array of values, and every operation below
 * is testable without rendering a pixel.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  LOCKED AND HIDDEN ARE ENFORCED HERE, NOT IN THE UI.
 * ══════════════════════════════════════════════════════════════════════════
 * A locked object cannot be moved, resized, rotated or deleted by any command in this
 * file, whichever caller asks. Enforcing it in the canvas alone would mean the Object
 * Inspector, the alignment toolbar, the arrow keys and the Layers panel each had to
 * remember — four places to forget, and the failure is silent movement of something
 * the author deliberately pinned.
 *
 * `unlock` is naturally the one command that ignores the lock.
 *
 * ── GROUP LOCKING IS INHERITED, NOT COPIED ───────────────────────────────
 * Locking a group does not rewrite its members' own `locked` flags. If it did,
 * unlocking the group would have to guess which members were already locked before —
 * information it just destroyed. Instead `effectiveLocked` walks the group tree, so
 * un-grouping restores exactly the state each object had.
 */

import {
  type DocumentLayout,
  type LayoutFrame,
  type LayoutGroup,
  type LayoutGuide,
  type LayoutObject,
  type LayoutObjectKind,
  type LayoutPayload,
  DEFAULT_OBJECT_SIZE_MM,
  EMPTY_LAYOUT,
  LAYOUT_OBJECT_LABELS_AR,
} from '../model/layoutTypes';
import {
  type RectMm,
  clampFrame,
  normaliseRotation,
  objectBounds,
  paintOrder,
  roundMm,
  selectionBounds,
} from './layoutGeometry';

/* ── Reading ────────────────────────────────────────────────────────────── */

/** The layout a document carries, or the empty one. Absent and empty are the same. */
export function layoutOf(layout: DocumentLayout | undefined): DocumentLayout {
  return layout ?? EMPTY_LAYOUT;
}

export function findObject(layout: DocumentLayout, id: string): LayoutObject | undefined {
  return layout.objects.find((object) => object.id === id);
}

export function findGroup(layout: DocumentLayout, id: string): LayoutGroup | undefined {
  return layout.groups.find((group) => group.id === id);
}

/** Objects on one sheet, in paint order. */
export function objectsOnPage(layout: DocumentLayout, pageIndex: number): LayoutObject[] {
  return paintOrder(layout.objects.filter((object) => object.pageIndex === pageIndex));
}

/**
 * The chain of groups above an object or a group, nearest first.
 *
 * Bounded by the group count so a cycle in stored data terminates rather than hanging
 * the renderer. `layoutIntegrity` reports the cycle; this refuses to spin on it.
 */
export function groupChain(layout: DocumentLayout, groupId: string | null): LayoutGroup[] {
  const chain: LayoutGroup[] = [];
  const seen = new Set<string>();
  let current = groupId;

  while (current && !seen.has(current)) {
    seen.add(current);
    const group = findGroup(layout, current);
    if (!group) break;
    chain.push(group);
    current = group.parentGroupId;
  }

  return chain;
}

/** Is this object locked, by its own flag or by any group above it? */
export function effectiveLocked(layout: DocumentLayout, object: LayoutObject): boolean {
  return object.locked || groupChain(layout, object.groupId).some((group) => group.locked);
}

/** Is this object hidden, by its own flag or by any group above it? */
export function effectiveHidden(layout: DocumentLayout, object: LayoutObject): boolean {
  return object.hidden || groupChain(layout, object.groupId).some((group) => group.hidden);
}

/** Every object inside a group, including those in nested groups. */
export function objectsInGroup(layout: DocumentLayout, groupId: string): LayoutObject[] {
  return layout.objects.filter((object) => groupChain(layout, object.groupId).some((g) => g.id === groupId));
}

/** Groups whose parent is this one — `null` for the top level. */
export function childGroups(layout: DocumentLayout, parentGroupId: string | null): LayoutGroup[] {
  return layout.groups.filter((group) => group.parentGroupId === parentGroupId);
}

/**
 * Selecting one member of a group selects the group.
 *
 * Expanding a selection to its outermost group is what makes a group feel like one
 * thing. The OUTERMOST rather than the immediate parent, because that is what
 * clicking a deeply-nested object should give you — the top-level thing you can see.
 */
export function expandSelectionToGroups(layout: DocumentLayout, ids: readonly string[]): string[] {
  const expanded = new Set<string>();

  for (const id of ids) {
    const object = findObject(layout, id);
    if (!object) continue;

    const chain = groupChain(layout, object.groupId);
    const outermost = chain[chain.length - 1];
    if (!outermost) {
      expanded.add(id);
      continue;
    }
    for (const member of objectsInGroup(layout, outermost.id)) expanded.add(member.id);
  }

  return [...expanded];
}

/* ── Writing helpers ────────────────────────────────────────────────────── */

function withObjects(layout: DocumentLayout, objects: readonly LayoutObject[]): DocumentLayout {
  return { ...layout, objects };
}

/**
 * Apply a change to selected objects, SKIPPING every locked one.
 *
 * The single choke point through which every mutation passes — see the file header for
 * why the lock is enforced here rather than at four separate call sites.
 */
function mapSelected(
  layout: DocumentLayout,
  ids: readonly string[],
  change: (object: LayoutObject) => LayoutObject,
): DocumentLayout {
  const selected = new Set(ids);
  let changed = false;

  const objects = layout.objects.map((object) => {
    if (!selected.has(object.id) || effectiveLocked(layout, object)) return object;
    const next = change(object);
    if (next !== object) changed = true;
    return next;
  });

  return changed ? withObjects(layout, objects) : layout;
}

/* ── Creation ───────────────────────────────────────────────────────────── */

/** The z-index a newly created object takes: above everything currently placed. */
export function nextZIndex(layout: DocumentLayout): number {
  return layout.objects.reduce((highest, object) => Math.max(highest, object.zIndex), 0) + 1;
}

/**
 * Place a new object.
 *
 * The caller supplies the id and the payload, exactly as `createBlock` requires its
 * caller to: minting ids is the editor's concern, and defaulting a payload here would
 * put a typography decision in the model.
 */
export function addObject(
  layout: DocumentLayout,
  spec: {
    readonly id: string;
    readonly kind: LayoutObjectKind;
    readonly pageIndex: number;
    readonly payload: LayoutPayload;
    readonly frame?: Partial<LayoutFrame>;
    readonly name?: string;
  },
): DocumentLayout {
  const size = DEFAULT_OBJECT_SIZE_MM[spec.kind];
  const ordinal = layout.objects.filter((object) => object.kind === spec.kind).length + 1;

  const object: LayoutObject = {
    id: spec.id,
    kind: spec.kind,
    name: spec.name ?? `${LAYOUT_OBJECT_LABELS_AR[spec.kind]} ${ordinal}`,
    pageIndex: spec.pageIndex,
    frame: clampFrame({
      xMm: spec.frame?.xMm ?? 0,
      yMm: spec.frame?.yMm ?? 0,
      widthMm: spec.frame?.widthMm ?? size.widthMm,
      heightMm: spec.frame?.heightMm ?? size.heightMm,
    }),
    rotationDeg: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    zIndex: nextZIndex(layout),
    payload: spec.payload,
  };

  return withObjects(layout, [...layout.objects, object]);
}

/**
 * Duplicate objects, offset so the copies are visibly distinct from their originals.
 *
 * `newIds` is supplied by the caller, one per source id in order — the same
 * id-minting discipline as everywhere. A duplicate is never locked or hidden even when
 * its source was: a copy the author cannot see or move is a copy they will think
 * failed to appear.
 */
export const DUPLICATE_OFFSET_MM = 4;

export function duplicateObjects(
  layout: DocumentLayout,
  ids: readonly string[],
  newIds: readonly string[],
): { layout: DocumentLayout; newIds: string[] } {
  const sources = ids
    .map((id) => findObject(layout, id))
    .filter((object): object is LayoutObject => object !== undefined);

  if (sources.length === 0 || newIds.length < sources.length) return { layout, newIds: [] };

  const created: LayoutObject[] = sources.map((source, index) => ({
    ...source,
    id: newIds[index],
    name: `${source.name} (نسخة)`,
    frame: clampFrame({
      ...source.frame,
      xMm: source.frame.xMm + DUPLICATE_OFFSET_MM,
      yMm: source.frame.yMm + DUPLICATE_OFFSET_MM,
    }),
    locked: false,
    hidden: false,
    zIndex: nextZIndex(layout) + index,
    // A duplicate leaves its source's group: pasting a copy INTO the group it came
    // from is a decision the author should make, not one a copy makes for them.
    groupId: null,
  }));

  return {
    layout: withObjects(layout, [...layout.objects, ...created]),
    newIds: created.map((object) => object.id),
  };
}

/**
 * Delete objects.
 *
 * A locked object survives. A group left with no members is removed too — an empty
 * group is a row in the Layers panel that does nothing and cannot be filled again.
 */
export function deleteObjects(layout: DocumentLayout, ids: readonly string[]): DocumentLayout {
  const removable = new Set(
    ids.filter((id) => {
      const object = findObject(layout, id);
      return object !== undefined && !effectiveLocked(layout, object);
    }),
  );
  if (removable.size === 0) return layout;

  const objects = layout.objects.filter((object) => !removable.has(object.id));
  const groups = layout.groups.filter(
    (group) =>
      objects.some((object) => groupChain({ ...layout, objects }, object.groupId).some((g) => g.id === group.id)) ||
      layout.groups.some((child) => child.parentGroupId === group.id),
  );

  return { ...layout, objects, groups };
}

/* ── Transforms ─────────────────────────────────────────────────────────── */

/** Move objects by a delta, in millimetres. */
export function moveObjects(layout: DocumentLayout, ids: readonly string[], dxMm: number, dyMm: number): DocumentLayout {
  if (dxMm === 0 && dyMm === 0) return layout;
  return mapSelected(layout, ids, (object) => ({
    ...object,
    frame: clampFrame({ ...object.frame, xMm: object.frame.xMm + dxMm, yMm: object.frame.yMm + dyMm }),
  }));
}

/** Set one object's frame outright — the Inspector's X/Y/W/H fields, and resize. */
export function setObjectFrame(layout: DocumentLayout, id: string, frame: Partial<LayoutFrame>): DocumentLayout {
  return mapSelected(layout, [id], (object) => ({
    ...object,
    frame: clampFrame({ ...object.frame, ...frame }),
  }));
}

/** Set rotation, normalised into [0, 360). */
export function rotateObjects(layout: DocumentLayout, ids: readonly string[], degrees: number): DocumentLayout {
  return mapSelected(layout, ids, (object) => ({ ...object, rotationDeg: normaliseRotation(degrees) }));
}

/** Turn objects by a delta — the rotate handle, and the keyboard's nudge. */
export function rotateObjectsBy(layout: DocumentLayout, ids: readonly string[], deltaDeg: number): DocumentLayout {
  if (deltaDeg === 0) return layout;
  return mapSelected(layout, ids, (object) => ({
    ...object,
    rotationDeg: normaliseRotation(object.rotationDeg + deltaDeg),
  }));
}

/** Set opacity, clamped to 0…1. */
export function setObjectOpacity(layout: DocumentLayout, ids: readonly string[], opacity: number): DocumentLayout {
  const clamped = Math.min(1, Math.max(0, opacity));
  return mapSelected(layout, ids, (object) => ({ ...object, opacity: clamped }));
}

/** Move objects to another sheet, keeping their position on it. */
export function setObjectPage(layout: DocumentLayout, ids: readonly string[], pageIndex: number): DocumentLayout {
  return mapSelected(layout, ids, (object) => ({ ...object, pageIndex: Math.max(0, Math.round(pageIndex)) }));
}

/** Replace an object's payload — the Inspector's text, image and table fields. */
export function setObjectPayload(layout: DocumentLayout, id: string, payload: LayoutPayload): DocumentLayout {
  return mapSelected(layout, [id], (object) => ({ ...object, payload }));
}

/* ── Flags ──────────────────────────────────────────────────────────────── */

/**
 * Lock or unlock.
 *
 * NOT routed through `mapSelected`: that helper refuses to touch a locked object,
 * which would make unlocking impossible. This is the one operation whose whole purpose
 * is to act on something locked.
 */
export function setObjectLocked(layout: DocumentLayout, ids: readonly string[], locked: boolean): DocumentLayout {
  const selected = new Set(ids);
  return withObjects(
    layout,
    layout.objects.map((object) => (selected.has(object.id) ? { ...object, locked } : object)),
  );
}

/** Show or hide. Also unrouted, so a hidden object can always be brought back. */
export function setObjectHidden(layout: DocumentLayout, ids: readonly string[], hidden: boolean): DocumentLayout {
  const selected = new Set(ids);
  return withObjects(
    layout,
    layout.objects.map((object) => (selected.has(object.id) ? { ...object, hidden } : object)),
  );
}

/** Rename. A blank name falls back to the kind's label rather than vanishing. */
export function renameObject(layout: DocumentLayout, id: string, name: string): DocumentLayout {
  const trimmed = name.trim();
  return withObjects(
    layout,
    layout.objects.map((object) =>
      object.id === id
        ? { ...object, name: trimmed.length > 0 ? trimmed : LAYOUT_OBJECT_LABELS_AR[object.kind] }
        : object,
    ),
  );
}

/* ── Stacking ───────────────────────────────────────────────────────────── */

/**
 * Move objects through the stack.
 *
 * Implemented by REBUILDING the whole z-index sequence rather than by adding or
 * subtracting one. Incremental arithmetic drifts: repeated "bring forward" on two
 * neighbours produces ties, and ties then resolve by id — so the two objects
 * eventually swap for reasons the author cannot see. Renumbering from paint order
 * makes every operation exact and idempotent at the ends.
 */
export function reorderObjects(
  layout: DocumentLayout,
  ids: readonly string[],
  direction: 'front' | 'forward' | 'backward' | 'back',
): DocumentLayout {
  const selected = new Set(ids);
  const ordered = paintOrder(layout.objects);
  const moving = ordered.filter((object) => selected.has(object.id));
  if (moving.length === 0) return layout;

  const rest = ordered.filter((object) => !selected.has(object.id));
  let arranged: LayoutObject[];

  if (direction === 'front') {
    arranged = [...rest, ...moving];
  } else if (direction === 'back') {
    arranged = [...moving, ...rest];
  } else {
    arranged = [...ordered];
    const step = direction === 'forward' ? 1 : -1;
    // Walk from the end the objects are moving TOWARDS, so a block of adjacent
    // selected objects keeps its internal order and does not overtake itself.
    const indices = arranged
      .map((object, index) => ({ object, index }))
      .filter((entry) => selected.has(entry.object.id))
      .map((entry) => entry.index);
    const walk = direction === 'forward' ? [...indices].reverse() : indices;

    for (const index of walk) {
      const target = index + step;
      if (target < 0 || target >= arranged.length) continue;
      if (selected.has(arranged[target].id)) continue;
      [arranged[index], arranged[target]] = [arranged[target], arranged[index]];
    }
  }

  const renumbered = new Map(arranged.map((object, index) => [object.id, index + 1]));
  return withObjects(
    layout,
    layout.objects.map((object) => ({ ...object, zIndex: renumbered.get(object.id) ?? object.zIndex })),
  );
}

/** Reorder from the Layers panel's drag: place `movingId` directly before `beforeId`. */
export function moveObjectBefore(layout: DocumentLayout, movingId: string, beforeId: string | null): DocumentLayout {
  const ordered = paintOrder(layout.objects);
  const moving = ordered.find((object) => object.id === movingId);
  if (!moving) return layout;

  const without = ordered.filter((object) => object.id !== movingId);
  const at = beforeId === null ? without.length : without.findIndex((object) => object.id === beforeId);
  const arranged = [...without];
  arranged.splice(at < 0 ? without.length : at, 0, moving);

  const renumbered = new Map(arranged.map((object, index) => [object.id, index + 1]));
  return withObjects(
    layout,
    layout.objects.map((object) => ({ ...object, zIndex: renumbered.get(object.id) ?? object.zIndex })),
  );
}

/* ── Groups ─────────────────────────────────────────────────────────────── */

/**
 * Group objects under a new group.
 *
 * Only objects that share a parent are grouped, and the new group inherits it — so
 * grouping never silently pulls an object out of the group it was already in.
 */
export function groupObjects(
  layout: DocumentLayout,
  ids: readonly string[],
  newGroupId: string,
  name?: string,
): DocumentLayout {
  // A LOCKED object may be grouped.
  //
  // Grouping does not move, resize or alter anything — it records that some objects
  // belong together. Excluding locked members would silently drop them from a group
  // the author selected, and the author would discover it later by moving the group
  // and watching one piece stay behind. The lock keeps doing its job through
  // `effectiveLocked`, which is checked by every command that actually transforms.
  const members = ids
    .map((id) => findObject(layout, id))
    .filter((object): object is LayoutObject => object !== undefined);

  // Grouping one object is a no-op rather than an error: it produces a group that
  // behaves identically to the object and adds a row to the panel for nothing.
  if (members.length < 2) return layout;

  const parents = new Set(members.map((object) => object.groupId));
  const parentGroupId = parents.size === 1 ? (members[0].groupId ?? null) : null;

  const group: LayoutGroup = {
    id: newGroupId,
    name: name ?? `مجموعة ${layout.groups.length + 1}`,
    parentGroupId,
    collapsed: false,
    locked: false,
    hidden: false,
  };

  const memberIds = new Set(members.map((object) => object.id));
  return {
    ...layout,
    groups: [...layout.groups, group],
    objects: layout.objects.map((object) =>
      memberIds.has(object.id) ? { ...object, groupId: newGroupId } : object,
    ),
  };
}

/**
 * Dissolve a group, lifting its members into its parent.
 *
 * Members keep their OWN lock and visibility flags, which were never rewritten by the
 * group — see the file header. So ungrouping restores exactly the state each object
 * had before it was grouped.
 */
export function ungroup(layout: DocumentLayout, groupId: string): DocumentLayout {
  const group = findGroup(layout, groupId);
  if (!group) return layout;

  return {
    ...layout,
    groups: layout.groups
      .filter((candidate) => candidate.id !== groupId)
      .map((candidate) =>
        candidate.parentGroupId === groupId ? { ...candidate, parentGroupId: group.parentGroupId } : candidate,
      ),
    objects: layout.objects.map((object) =>
      object.groupId === groupId ? { ...object, groupId: group.parentGroupId } : object,
    ),
  };
}

export function setGroupFlag(
  layout: DocumentLayout,
  groupId: string,
  patch: Partial<Pick<LayoutGroup, 'collapsed' | 'locked' | 'hidden' | 'name'>>,
): DocumentLayout {
  return {
    ...layout,
    groups: layout.groups.map((group) => (group.id === groupId ? { ...group, ...patch } : group)),
  };
}

/* ── Guides ─────────────────────────────────────────────────────────────── */

export function addGuide(layout: DocumentLayout, guide: LayoutGuide): DocumentLayout {
  return { ...layout, guides: [...layout.guides, { ...guide, positionMm: roundMm(guide.positionMm) }] };
}

export function moveGuide(layout: DocumentLayout, id: string, positionMm: number): DocumentLayout {
  return {
    ...layout,
    guides: layout.guides.map((guide) =>
      guide.id === id && !guide.locked ? { ...guide, positionMm: roundMm(positionMm) } : guide,
    ),
  };
}

export function removeGuide(layout: DocumentLayout, id: string): DocumentLayout {
  return { ...layout, guides: layout.guides.filter((guide) => guide.id !== id || guide.locked) };
}

export function setGuidesLocked(layout: DocumentLayout, locked: boolean): DocumentLayout {
  return { ...layout, guides: layout.guides.map((guide) => ({ ...guide, locked })) };
}

/* ── Bounds ─────────────────────────────────────────────────────────────── */

/** The selection frame the canvas draws, or `null` when nothing is selected. */
export function boundsOfSelection(layout: DocumentLayout, ids: readonly string[]): RectMm | null {
  const selected = ids
    .map((id) => findObject(layout, id))
    .filter((object): object is LayoutObject => object !== undefined);
  return selectionBounds(selected);
}

/** One object's axis-aligned bounds — re-exported so callers need one import. */
export { objectBounds };

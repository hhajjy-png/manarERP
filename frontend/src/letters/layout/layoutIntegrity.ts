/**
 * Letter Engine — layout-layer integrity (Document Layout Designer v1).
 *
 * The `blockModelIntegrity` of the positioned layer: a pure, DOM-free check that a
 * stored layout is STRUCTURALLY valid. It answers "is this a well-formed layout?" —
 * not "is this a publishable page". The latter is the validation engine's job and runs
 * against geometry; this runs against the data alone.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CHECK THAT MATTERS MOST IS THE GROUP CYCLE.
 * ══════════════════════════════════════════════════════════════════════════
 * A group whose ancestor chain loops back on itself makes `groupChain` walk for ever.
 * That function is bounded so it terminates, but a layout containing a cycle is
 * corrupt data and the load path must say so rather than rendering something that
 * merely looks right. A cycle cannot be produced by any command in `layoutCommands` —
 * it can only arrive from stored JSON, which is exactly the class of problem an
 * integrity check exists for.
 */

import { MIN_OBJECT_SIZE_MM, type DocumentLayout, isLayoutObjectKind } from '../model/layoutTypes';

/** One structural defect, with enough context to locate it. */
export interface LayoutDefect {
  /** `object`, `group` or `guide` id, or `null` for a layer-level defect. */
  readonly id: string | null;
  readonly message: string;
}

/**
 * Every structural defect in a layout, in document order.
 *
 * Total — it does not stop at the first defect, because a load path reporting one
 * problem at a time turns a single bad migration into a dozen round trips.
 */
export function validateLayout(layout: DocumentLayout): LayoutDefect[] {
  const defects: LayoutDefect[] = [];

  if (!Array.isArray(layout.objects) || !Array.isArray(layout.groups) || !Array.isArray(layout.guides)) {
    return [{ id: null, message: '`objects`, `groups` and `guides` must all be arrays.' }];
  }

  const groupIds = new Set<string>();
  for (const group of layout.groups) {
    if (typeof group?.id !== 'string' || group.id.length === 0) {
      defects.push({ id: null, message: 'Group id must be a non-empty string.' });
      continue;
    }
    if (groupIds.has(group.id)) {
      defects.push({ id: group.id, message: `Duplicate group id "${group.id}".` });
    }
    groupIds.add(group.id);
  }

  for (const group of layout.groups) {
    if (group.parentGroupId !== null && group.parentGroupId !== undefined && !groupIds.has(group.parentGroupId)) {
      defects.push({ id: group.id, message: `Parent group "${group.parentGroupId}" does not exist.` });
    }
  }

  defects.push(...cycleDefects(layout, groupIds));

  const objectIds = new Set<string>();
  layout.objects.forEach((object, index) => {
    const at = (message: string): LayoutDefect => ({ id: object?.id ?? null, message: `Object ${index}: ${message}` });

    if (!object || typeof object !== 'object') {
      defects.push({ id: null, message: `Object ${index} is not an object.` });
      return;
    }
    if (typeof object.id !== 'string' || object.id.length === 0) {
      defects.push(at('id must be a non-empty string.'));
    } else if (objectIds.has(object.id)) {
      defects.push(at(`duplicate object id "${object.id}".`));
    } else {
      objectIds.add(object.id);
    }

    if (!isLayoutObjectKind(object.kind)) {
      defects.push(at(`unknown kind "${String(object.kind)}".`));
    }
    // The payload's discriminant must agree with the object's own kind. They are
    // stored separately so the renderer can switch on one and narrow the other, and a
    // disagreement would make it render a table's payload as a text block.
    if (object.payload?.kind !== object.kind) {
      defects.push(at(`payload kind "${String(object.payload?.kind)}" does not match object kind "${String(object.kind)}".`));
    }

    if (typeof object.pageIndex !== 'number' || !Number.isInteger(object.pageIndex) || object.pageIndex < 0) {
      defects.push(at(`pageIndex ${String(object.pageIndex)} must be a non-negative integer.`));
    }

    const frame = object.frame;
    if (!frame || typeof frame !== 'object') {
      defects.push(at('frame is missing.'));
    } else {
      for (const key of ['xMm', 'yMm', 'widthMm', 'heightMm'] as const) {
        if (typeof frame[key] !== 'number' || !Number.isFinite(frame[key])) {
          defects.push(at(`frame.${key} must be a finite number.`));
        }
      }
      if (frame.widthMm < MIN_OBJECT_SIZE_MM || frame.heightMm < MIN_OBJECT_SIZE_MM) {
        defects.push(at(`frame is smaller than the ${MIN_OBJECT_SIZE_MM} mm minimum.`));
      }
    }

    if (typeof object.rotationDeg !== 'number' || object.rotationDeg < 0 || object.rotationDeg >= 360) {
      defects.push(at(`rotationDeg ${String(object.rotationDeg)} must be in [0, 360).`));
    }
    if (typeof object.opacity !== 'number' || object.opacity < 0 || object.opacity > 1) {
      defects.push(at(`opacity ${String(object.opacity)} must be in [0, 1].`));
    }
    if (object.groupId !== null && object.groupId !== undefined && !groupIds.has(object.groupId)) {
      defects.push(at(`group "${object.groupId}" does not exist.`));
    }
    if (typeof object.name !== 'string' || object.name.length === 0) {
      defects.push(at('name must be a non-empty string.'));
    }
  });

  const guideIds = new Set<string>();
  for (const guide of layout.guides) {
    if (typeof guide?.id !== 'string' || guide.id.length === 0) {
      defects.push({ id: null, message: 'Guide id must be a non-empty string.' });
      continue;
    }
    if (guideIds.has(guide.id)) defects.push({ id: guide.id, message: `Duplicate guide id "${guide.id}".` });
    guideIds.add(guide.id);

    if (guide.axis !== 'horizontal' && guide.axis !== 'vertical') {
      defects.push({ id: guide.id, message: `Unknown guide axis "${String(guide.axis)}".` });
    }
    if (typeof guide.positionMm !== 'number' || !Number.isFinite(guide.positionMm)) {
      defects.push({ id: guide.id, message: 'Guide position must be a finite number.' });
    }
  }

  return defects;
}

/**
 * Groups whose ancestor chain loops.
 *
 * Walks each group with a visited set rather than recursing, so a cycle is DETECTED
 * instead of overflowing the stack — the failure mode this check exists to replace.
 */
function cycleDefects(layout: DocumentLayout, groupIds: ReadonlySet<string>): LayoutDefect[] {
  const parents = new Map(layout.groups.map((group) => [group.id, group.parentGroupId ?? null]));
  const defects: LayoutDefect[] = [];

  for (const id of groupIds) {
    const seen = new Set<string>([id]);
    let current = parents.get(id) ?? null;

    while (current !== null) {
      if (seen.has(current)) {
        defects.push({ id, message: `Group "${id}" is part of a parent cycle.` });
        break;
      }
      seen.add(current);
      current = parents.get(current) ?? null;
    }
  }

  return defects;
}

export function isValidLayout(layout: DocumentLayout): boolean {
  return validateLayout(layout).length === 0;
}

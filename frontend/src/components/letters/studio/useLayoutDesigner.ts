/**
 * Document Layout Designer — the composer's designer state.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONE PLACE THAT TURNS AN INTENT INTO A PURE COMMAND ON THE DOCUMENT.
 * ══════════════════════════════════════════════════════════════════════════
 * Every designer action — from the canvas, the toolbar, the Layers panel, the Object
 * Inspector and the keyboard — funnels through this hook. Without it the composer
 * would carry forty near-identical callbacks, each remembering to record history, mark
 * the document dirty and route through the layout accessor, and each an opportunity to
 * forget one of the three.
 *
 * It holds NO layout state of its own. The layout lives inside the `BlockDocument`,
 * which is what makes an object move a normal document edit: it undoes with Ctrl+Z,
 * autosaves with everything else, and versions with the content model. A separate
 * layout store would have needed its own undo stack and its own save path, and the two
 * would eventually disagree about which version of the letter was current.
 */

import { useCallback, useMemo } from 'react';
import {
  type BlockDocument,
} from '../../../letters/model/blockTypes';
import {
  type DocumentLayout,
  type LayoutObjectKind,
  type LayoutPayload,
  defaultPayload,
} from '../../../letters/model/layoutTypes';
import { documentLayout, setDocumentLayout } from '../../../letters/editor/blockCommands';
import {
  type RectMm,
  objectBounds,
  selectionBounds,
} from '../../../letters/layout/layoutGeometry';
import {
  addGuide,
  addObject,
  deleteObjects,
  duplicateObjects,
  effectiveLocked,
  findObject,
  groupChain,
  groupObjects,
  moveGuide,
  moveObjectBefore,
  moveObjects,
  renameObject,
  reorderObjects,
  rotateObjects,
  setGroupFlag,
  setGuidesLocked,
  setObjectFrame,
  setObjectHidden,
  setObjectLocked,
  setObjectOpacity,
  setObjectPage,
  setObjectPayload,
  ungroup,
} from '../../../letters/layout/layoutCommands';
import { type AlignAction, type AlignPageContext, applyAlignment } from '../../../letters/layout/alignment';
import { type LayoutSelection } from './useLayoutSelection';
import { type FontId } from '../../../styles/fontRegistry';

/** How far one arrow-key press moves an object, in millimetres. */
export const NUDGE_MM = 1;

/** How far Shift+arrow moves it. Ten steps at once — the "coarse" nudge. */
export const NUDGE_COARSE_MM = 10;

/** How far Ctrl+arrow moves it. A tenth of a step — the "fine" nudge. */
export const NUDGE_FINE_MM = 0.1;

export interface LayoutDesigner {
  readonly layout: DocumentLayout;
  /** Selected objects, resolved. Excludes ids that no longer exist. */
  readonly selected: ReturnType<typeof resolveSelected>;
  readonly selectionBounds: RectMm | null;
  readonly canGroup: boolean;
  readonly canUngroup: boolean;

  readonly insert: (kind: LayoutObjectKind, pageIndex: number, at?: { xMm: number; yMm: number }) => void;
  readonly move: (dxMm: number, dyMm: number) => void;
  readonly resize: (objectId: string, rect: RectMm) => void;
  readonly setFrame: (patch: { xMm?: number; yMm?: number; widthMm?: number; heightMm?: number }) => void;
  readonly rotate: (degrees: number) => void;
  readonly setOpacity: (opacity: number) => void;
  readonly setPage: (pageIndex: number) => void;
  readonly setLocked: (locked: boolean) => void;
  readonly setHidden: (hidden: boolean) => void;
  readonly setLockedFor: (ids: readonly string[], locked: boolean) => void;
  readonly setHiddenFor: (ids: readonly string[], hidden: boolean) => void;
  readonly rename: (id: string, name: string) => void;
  readonly reorder: (direction: 'front' | 'forward' | 'backward' | 'back') => void;
  readonly reorderBefore: (movingId: string, beforeId: string | null) => void;
  readonly duplicate: () => void;
  readonly remove: () => void;
  readonly group: () => void;
  readonly ungroupSelection: () => void;
  readonly setGroup: (groupId: string, patch: { collapsed?: boolean; locked?: boolean; hidden?: boolean; name?: string }) => void;
  readonly align: (action: AlignAction, page: AlignPageContext) => void;
  readonly setPayload: (objectId: string, payload: LayoutPayload) => void;
  readonly addGuideAt: (axis: 'horizontal' | 'vertical', positionMm: number) => void;
  readonly moveGuideTo: (guideId: string, positionMm: number) => void;
  readonly lockGuides: (locked: boolean) => void;
  readonly selectAllOnPage: (pageIndex: number) => void;
  readonly invertOnPage: (pageIndex: number) => void;
}

function resolveSelected(layout: DocumentLayout, ids: readonly string[]) {
  return ids.map((id) => findObject(layout, id)).filter((object): object is NonNullable<typeof object> => object !== undefined);
}

export interface LayoutDesignerInput {
  readonly content: BlockDocument | null;
  readonly selection: LayoutSelection;
  readonly readOnly: boolean;
  /** Mints ids. Supplied by the composer, exactly as it does for blocks. */
  readonly nextId: () => string;
  /** Default typography for a new text object — the template's body preset. */
  readonly typography: { fontId: FontId; sizePt: number };
  /** Applies a new document, recording one undo step. */
  readonly apply: (next: BlockDocument) => void;
}

export function useLayoutDesigner({
  content,
  selection,
  readOnly,
  nextId,
  typography,
  apply,
}: LayoutDesignerInput): LayoutDesigner {
  const layout = useMemo(() => (content ? documentLayout(content) : { objects: [], groups: [], guides: [] }), [content]);

  /**
   * Run a pure layout command and commit the result.
   *
   * The single choke point. `readOnly` is checked HERE rather than at every call site,
   * so a registered letter cannot be edited through any path — including one added
   * later by someone who did not know to check.
   */
  const run = useCallback(
    (command: (current: DocumentLayout) => DocumentLayout) => {
      if (!content || readOnly) return;
      const next = command(layout);
      // Reference equality means the command declined — a locked object, an empty
      // selection, a no-op. Committing anyway would push an undo step for nothing.
      if (next === layout) return;
      apply(setDocumentLayout(content, next));
    },
    [content, layout, readOnly, apply],
  );

  const ids = selection.ids;
  const selected = useMemo(() => resolveSelected(layout, ids), [layout, ids]);
  const bounds = useMemo(() => selectionBounds(selected), [selected]);

  /** Grouping needs two unlocked objects; ungrouping needs a selection inside a group. */
  const canGroup = useMemo(
    () => selected.length >= 2 && selected.every((object) => !effectiveLocked(layout, object)),
    [selected, layout],
  );
  const canUngroup = useMemo(
    () => selected.some((object) => object.groupId !== null),
    [selected],
  );

  const insert = useCallback(
    (kind: LayoutObjectKind, pageIndex: number, at?: { xMm: number; yMm: number }) => {
      const id = nextId();
      run((current) =>
        addObject(current, {
          id,
          kind,
          pageIndex,
          payload: defaultPayload(kind, typography),
          frame: at ? { xMm: at.xMm, yMm: at.yMm } : undefined,
        }),
      );
      // Selecting the new object is what makes "insert" feel finished — otherwise the
      // author has to hunt for what they just created before they can move it.
      selection.select([id]);
    },
    [nextId, run, typography, selection],
  );

  const duplicate = useCallback(() => {
    if (ids.length === 0) return;
    const newIds = ids.map(() => nextId());
    let created: string[] = [];
    run((current) => {
      const result = duplicateObjects(current, ids, newIds);
      created = result.newIds;
      return result.layout;
    });
    if (created.length > 0) selection.select(created);
  }, [ids, nextId, run, selection]);

  const remove = useCallback(() => {
    if (ids.length === 0) return;
    run((current) => deleteObjects(current, ids));
    selection.clear();
  }, [ids, run, selection]);

  const group = useCallback(() => {
    if (!canGroup) return;
    run((current) => groupObjects(current, ids, nextId()));
  }, [canGroup, ids, nextId, run]);

  const ungroupSelection = useCallback(() => {
    // Ungroups the OUTERMOST group of the selection — the one the author sees as "the
    // group", matching what clicking a member selects.
    const outermost = new Set(
      selected
        .map((object) => groupChain(layout, object.groupId))
        .map((chain) => chain[chain.length - 1]?.id)
        .filter((id): id is string => id !== undefined),
    );
    if (outermost.size === 0) return;
    run((current) => [...outermost].reduce((next, groupId) => ungroup(next, groupId), current));
  }, [selected, layout, run]);

  const selectAllOnPage = useCallback(
    (pageIndex: number) =>
      selection.selectAll(
        layout.objects.filter((object) => object.pageIndex === pageIndex && !object.hidden).map((o) => o.id),
      ),
    [layout.objects, selection],
  );

  const invertOnPage = useCallback(
    (pageIndex: number) =>
      selection.invert(
        layout.objects.filter((object) => object.pageIndex === pageIndex && !object.hidden).map((o) => o.id),
      ),
    [layout.objects, selection],
  );

  return useMemo(
    () => ({
      layout,
      selected,
      selectionBounds: bounds,
      canGroup,
      canUngroup,

      insert,
      move: (dxMm, dyMm) => run((current) => moveObjects(current, ids, dxMm, dyMm)),
      resize: (objectId, rect) =>
        run((current) => {
          const object = findObject(current, objectId);
          if (!object) return current;
          // The gesture reports BOUNDS; the frame is what is stored. For an unrotated
          // object they are the same rectangle, and for a rotated one the bounds'
          // offset from the frame is preserved so resizing does not also translate it.
          const currentBounds = objectBounds(object);
          return setObjectFrame(current, objectId, {
            xMm: object.frame.xMm + (rect.xMm - currentBounds.xMm),
            yMm: object.frame.yMm + (rect.yMm - currentBounds.yMm),
            widthMm: object.frame.widthMm + (rect.widthMm - currentBounds.widthMm),
            heightMm: object.frame.heightMm + (rect.heightMm - currentBounds.heightMm),
          });
        }),
      setFrame: (patch) => run((current) => ids.reduce((next, id) => setObjectFrame(next, id, patch), current)),
      rotate: (degrees) => run((current) => rotateObjects(current, ids, degrees)),
      setOpacity: (opacity) => run((current) => setObjectOpacity(current, ids, opacity)),
      setPage: (pageIndex) => run((current) => setObjectPage(current, ids, pageIndex)),
      setLocked: (locked) => run((current) => setObjectLocked(current, ids, locked)),
      setHidden: (hidden) => run((current) => setObjectHidden(current, ids, hidden)),
      setLockedFor: (targetIds, locked) => run((current) => setObjectLocked(current, targetIds, locked)),
      setHiddenFor: (targetIds, hidden) => run((current) => setObjectHidden(current, targetIds, hidden)),
      rename: (id, name) => run((current) => renameObject(current, id, name)),
      reorder: (direction) => run((current) => reorderObjects(current, ids, direction)),
      reorderBefore: (movingId, beforeId) => run((current) => moveObjectBefore(current, movingId, beforeId)),
      duplicate,
      remove,
      group,
      ungroupSelection,
      setGroup: (groupId, patch) => run((current) => setGroupFlag(current, groupId, patch)),
      align: (action, page) => run((current) => applyAlignment(current, ids, action, page)),
      setPayload: (objectId, payload) => run((current) => setObjectPayload(current, objectId, payload)),
      addGuideAt: (axis, positionMm) =>
        run((current) => addGuide(current, { id: nextId(), axis, positionMm, locked: false })),
      moveGuideTo: (guideId, positionMm) => run((current) => moveGuide(current, guideId, positionMm)),
      lockGuides: (locked) => run((current) => setGuidesLocked(current, locked)),
      selectAllOnPage,
      invertOnPage,
    }),
    [
      layout, selected, bounds, canGroup, canUngroup, insert, run, ids, duplicate, remove,
      group, ungroupSelection, nextId, selectAllOnPage, invertOnPage,
    ],
  );
}

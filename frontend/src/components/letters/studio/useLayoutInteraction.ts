/**
 * Document Layout Designer — the pointer gesture engine.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A GESTURE MUTATES THE DOCUMENT ONCE, WHEN IT ENDS.
 * ══════════════════════════════════════════════════════════════════════════
 * A drag produces a pointer event every few milliseconds. Writing each one into the
 * document would push a hundred entries onto the undo stack for one movement, re-run
 * the pagination signature and the validation pass a hundred times, and make dragging
 * a large letter visibly stutter.
 *
 * So a gesture keeps its own PREVIEW state — a delta, or a proposed rectangle — which
 * the canvas renders over the unchanged document. Exactly one command runs, on pointer
 * up. That is what makes dragging smooth, undo sensible ("move" is one step) and the
 * expensive derived state re-run once instead of per frame.
 *
 * ── POINTER CAPTURE, NOT WINDOW LISTENERS ────────────────────────────────
 * `setPointerCapture` keeps the gesture bound to the element that started it, so a
 * drag continues correctly when the pointer leaves the sheet — and ends reliably even
 * if it is released over another window. Window-level mousemove listeners are the
 * usual alternative and leak the gesture when a re-render swaps the element.
 *
 * ── MILLIMETRES ARE THE ONLY UNIT THAT CROSSES THE BOUNDARY ──────────────
 * Pointer events arrive in CSS pixels, scaled by the current zoom. They are converted
 * to sheet millimetres HERE, once, at the boundary — after which nothing downstream
 * knows the zoom exists. That is what lets the same command serve a drag, an arrow key
 * and a typed coordinate.
 */

import { useCallback, useRef, useState } from 'react';
import {
  type PointMm,
  type RectMm,
  clampFrame,
  normaliseRotation,
  rectCentre,
  rectFromPoints,
  roundMm,
} from '../../../letters/layout/layoutGeometry';
import {
  type SmartGuide,
  type SnapSettings,
  type PageSnapContext,
  SNAP_THRESHOLD_PX,
  snapDrag,
  snapResize,
  snapRotation,
} from '../../../letters/layout/snapping';

/** Which resize handle is being dragged. Corners scale two axes, edges one. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Which edges a handle moves. Drives both the resize maths and the snap targets. */
export function handleEdges(handle: ResizeHandle): {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
} {
  return {
    left: handle === 'nw' || handle === 'w' || handle === 'sw',
    right: handle === 'ne' || handle === 'e' || handle === 'se',
    top: handle === 'nw' || handle === 'n' || handle === 'ne',
    bottom: handle === 'sw' || handle === 's' || handle === 'se',
  };
}

/** The gesture currently in progress. `null` between gestures. */
export type Gesture =
  | { readonly kind: 'move'; readonly dxMm: number; readonly dyMm: number }
  | { readonly kind: 'resize'; readonly handle: ResizeHandle; readonly rect: RectMm }
  | { readonly kind: 'rotate'; readonly degrees: number }
  | { readonly kind: 'marquee'; readonly rect: RectMm }
  | null;

export interface InteractionCallbacks {
  /** Commit a move. Called once, on pointer up. */
  readonly onMove: (dxMm: number, dyMm: number) => void;
  readonly onResize: (rect: RectMm) => void;
  readonly onRotate: (degrees: number) => void;
  readonly onMarquee: (rect: RectMm, additive: boolean) => void;
}

export interface InteractionContext {
  /** Pixels per millimetre as currently rendered, including the zoom transform. */
  readonly pxPerMm: number;
  readonly page: PageSnapContext;
  readonly snap: SnapSettings;
  /** Other objects' bounds on this page, for object-to-object snapping. */
  readonly targets: readonly RectMm[];
  readonly guides: readonly import('../../../letters/model/layoutTypes').LayoutGuide[];
}

export interface LayoutInteraction {
  readonly gesture: Gesture;
  readonly smartGuides: readonly SmartGuide[];
  /** True while any gesture is running — suppresses transitions and hover feedback. */
  readonly interacting: boolean;
  readonly beginMove: (event: React.PointerEvent, selectionBounds: RectMm) => void;
  readonly beginResize: (event: React.PointerEvent, handle: ResizeHandle, bounds: RectMm) => void;
  readonly beginRotate: (event: React.PointerEvent, bounds: RectMm, currentDeg: number) => void;
  readonly beginMarquee: (event: React.PointerEvent) => void;
  readonly cancel: () => void;
}

/** Sheet millimetres from a pointer event, relative to the sheet element. */
function pointerToMm(event: React.PointerEvent | PointerEvent, sheet: Element, pxPerMm: number): PointMm {
  const box = sheet.getBoundingClientRect();
  // `getBoundingClientRect` already reflects the zoom transform, so dividing by the
  // measured px-per-mm — which was derived the same way — cancels it exactly. No zoom
  // value appears in this arithmetic, which is why a zoom change needs no correction.
  return {
    xMm: roundMm((event.clientX - box.left) / pxPerMm),
    yMm: roundMm((event.clientY - box.top) / pxPerMm),
  };
}

export function useLayoutInteraction(
  sheetRef: React.RefObject<HTMLElement | null>,
  context: InteractionContext,
  callbacks: InteractionCallbacks,
): LayoutInteraction {
  const [gesture, setGesture] = useState<Gesture>(null);
  const [smartGuides, setSmartGuides] = useState<readonly SmartGuide[]>([]);

  /**
   * Everything the gesture needs, held in a ref.
   *
   * A ref rather than state because the move handler reads it on every pointer event
   * and a state read would capture the value from the render in which the gesture
   * began — the classic stale-closure bug, and the reason drags in hand-rolled
   * canvases so often jump on the second frame.
   */
  const active = useRef<{
    kind: 'move' | 'resize' | 'rotate' | 'marquee';
    origin: PointMm;
    bounds: RectMm;
    handle?: ResizeHandle;
    startRotation?: number;
    startAngle?: number;
    additive?: boolean;
  } | null>(null);

  const thresholdMm = SNAP_THRESHOLD_PX / Math.max(0.0001, context.pxPerMm);

  const finish = useCallback(() => {
    active.current = null;
    setGesture(null);
    setSmartGuides([]);
  }, []);

  const cancel = useCallback(() => {
    // Discards the preview WITHOUT committing — Escape during a drag.
    finish();
  }, [finish]);

  /** Shared pointer-up/move wiring. Returns the handlers to attach to the element. */
  const attach = useCallback(
    (event: React.PointerEvent, onMove: (point: PointMm, shift: boolean, alt: boolean) => void, onEnd: () => void) => {
      const element = event.currentTarget as HTMLElement;
      element.setPointerCapture(event.pointerId);

      const handleMove = (moveEvent: PointerEvent) => {
        const sheet = sheetRef.current;
        if (!sheet) return;
        onMove(pointerToMm(moveEvent, sheet, context.pxPerMm), moveEvent.shiftKey, moveEvent.altKey);
      };

      const handleUp = () => {
        element.removeEventListener('pointermove', handleMove);
        element.removeEventListener('pointerup', handleUp);
        element.removeEventListener('pointercancel', handleCancel);
        onEnd();
        finish();
      };

      const handleCancel = () => {
        element.removeEventListener('pointermove', handleMove);
        element.removeEventListener('pointerup', handleUp);
        element.removeEventListener('pointercancel', handleCancel);
        // A cancelled gesture commits NOTHING — the browser cancels on things like a
        // context menu or a system gesture, and committing there would apply a move
        // the user never finished.
        finish();
      };

      element.addEventListener('pointermove', handleMove);
      element.addEventListener('pointerup', handleUp);
      element.addEventListener('pointercancel', handleCancel);
    },
    [context.pxPerMm, finish, sheetRef],
  );

  const beginMove = useCallback(
    (event: React.PointerEvent, bounds: RectMm) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      event.preventDefault();

      const origin = pointerToMm(event, sheet, context.pxPerMm);
      active.current = { kind: 'move', origin, bounds };
      setGesture({ kind: 'move', dxMm: 0, dyMm: 0 });

      let committed = { dxMm: 0, dyMm: 0 };

      attach(
        event,
        (point, shift) => {
          const state = active.current;
          if (!state) return;

          let dxMm = point.xMm - state.origin.xMm;
          let dyMm = point.yMm - state.origin.yMm;

          // Shift constrains to the dominant axis — the standard straight-line drag.
          if (shift) {
            if (Math.abs(dxMm) > Math.abs(dyMm)) dyMm = 0;
            else dxMm = 0;
          }

          const snapped = snapDrag({
            moving: state.bounds,
            dxMm,
            dyMm,
            others: context.targets,
            guides: context.guides,
            page: context.page,
            settings: context.snap,
            thresholdMm,
          });

          committed = { dxMm: snapped.dxMm, dyMm: snapped.dyMm };
          setGesture({ kind: 'move', dxMm: snapped.dxMm, dyMm: snapped.dyMm });
          setSmartGuides(snapped.guides);
        },
        () => {
          if (committed.dxMm !== 0 || committed.dyMm !== 0) {
            callbacks.onMove(committed.dxMm, committed.dyMm);
          }
        },
      );
    },
    [attach, callbacks, context, sheetRef, thresholdMm],
  );

  const beginResize = useCallback(
    (event: React.PointerEvent, handle: ResizeHandle, bounds: RectMm) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      event.preventDefault();
      event.stopPropagation();

      const origin = pointerToMm(event, sheet, context.pxPerMm);
      active.current = { kind: 'resize', origin, bounds, handle };
      setGesture({ kind: 'resize', handle, rect: bounds });

      let committed = bounds;
      const edges = handleEdges(handle);

      attach(
        event,
        (point, shift) => {
          const state = active.current;
          if (!state) return;

          const dx = point.xMm - state.origin.xMm;
          const dy = point.yMm - state.origin.yMm;

          let { xMm, yMm, widthMm, heightMm } = state.bounds;
          if (edges.left) {
            xMm += dx;
            widthMm -= dx;
          }
          if (edges.right) widthMm += dx;
          if (edges.top) {
            yMm += dy;
            heightMm -= dy;
          }
          if (edges.bottom) heightMm += dy;

          // Shift preserves the aspect ratio, driven by whichever axis moved further.
          if (shift && state.bounds.widthMm > 0 && state.bounds.heightMm > 0) {
            const ratio = state.bounds.heightMm / state.bounds.widthMm;
            if (Math.abs(dx) >= Math.abs(dy)) heightMm = widthMm * ratio;
            else widthMm = heightMm / ratio;
          }

          const snapped = snapResize({
            proposed: { xMm, yMm, widthMm, heightMm },
            movesLeft: edges.left,
            movesRight: edges.right,
            movesTop: edges.top,
            movesBottom: edges.bottom,
            others: context.targets,
            guides: context.guides,
            page: context.page,
            settings: context.snap,
            thresholdMm,
          });

          committed = clampFrame(snapped.rect);
          setGesture({ kind: 'resize', handle, rect: committed });
          setSmartGuides(snapped.guides);
        },
        () => callbacks.onResize(committed),
      );
    },
    [attach, callbacks, context, sheetRef, thresholdMm],
  );

  const beginRotate = useCallback(
    (event: React.PointerEvent, bounds: RectMm, currentDeg: number) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      event.preventDefault();
      event.stopPropagation();

      const origin = pointerToMm(event, sheet, context.pxPerMm);
      const centre = rectCentre(bounds);
      // The angle the pointer STARTED at, so rotation is relative to the grab point
      // rather than jumping to wherever the handle was first clicked.
      const startAngle = Math.atan2(origin.yMm - centre.yMm, origin.xMm - centre.xMm);

      active.current = { kind: 'rotate', origin, bounds, startRotation: currentDeg, startAngle };
      setGesture({ kind: 'rotate', degrees: currentDeg });

      let committed = currentDeg;

      attach(
        event,
        (point, shift) => {
          const state = active.current;
          if (!state || state.startAngle === undefined || state.startRotation === undefined) return;

          const angle = Math.atan2(point.yMm - centre.yMm, point.xMm - centre.xMm);
          const deltaDeg = ((angle - state.startAngle) * 180) / Math.PI;
          // Shift snaps to 15°, the step that makes an exact 90° reachable by hand.
          const next = normaliseRotation(snapRotation(state.startRotation + deltaDeg, shift));

          committed = next;
          setGesture({ kind: 'rotate', degrees: next });
        },
        () => {
          if (committed !== currentDeg) callbacks.onRotate(committed);
        },
      );
    },
    [attach, callbacks, context.pxPerMm, sheetRef],
  );

  const beginMarquee = useCallback(
    (event: React.PointerEvent) => {
      const sheet = sheetRef.current;
      if (!sheet) return;
      event.preventDefault();

      const origin = pointerToMm(event, sheet, context.pxPerMm);
      const additive = event.shiftKey || event.ctrlKey || event.metaKey;
      active.current = { kind: 'marquee', origin, bounds: { ...origin, widthMm: 0, heightMm: 0 }, additive };
      setGesture({ kind: 'marquee', rect: { ...origin, widthMm: 0, heightMm: 0 } });

      let committed: RectMm = { ...origin, widthMm: 0, heightMm: 0 };

      attach(
        event,
        (point) => {
          const state = active.current;
          if (!state) return;
          committed = rectFromPoints(state.origin, point);
          setGesture({ kind: 'marquee', rect: committed });
        },
        () => {
          // A marquee smaller than a millimetre is a CLICK that wobbled, not a drag.
          // Committing it would clear the selection every time someone clicked the
          // sheet with an unsteady hand.
          if (committed.widthMm >= 1 || committed.heightMm >= 1) {
            callbacks.onMarquee(committed, additive);
          }
        },
      );
    },
    [attach, callbacks, context.pxPerMm, sheetRef],
  );

  return {
    gesture,
    smartGuides,
    interacting: gesture !== null,
    beginMove,
    beginResize,
    beginRotate,
    beginMarquee,
    cancel,
  };
}

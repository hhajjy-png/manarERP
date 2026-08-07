import { type RefObject, useCallback, useRef } from 'react';
import { usePersistedState } from '../../../hooks/usePersistedState';

const NUDGE_PX = 16;

export interface ResizableRail {
  readonly width: number;
  readonly railRef: RefObject<HTMLElement>;
  readonly handleRef: RefObject<HTMLElement>;
  readonly startDrag: (e: React.PointerEvent) => void;
  /** Keyboard resizing — the handle is a `role="separator"`, which per WAI-ARIA is
   *  expected to respond to arrow keys, not only to a pointer drag. Which key GROWS the
   *  rail depends on which physical edge the handle sits on (the page is RTL, and a rail
   *  can be on either side of the canvas) — resolved here from the same rects
   *  `startDrag` uses, so a consumer only has to attach this, never reason about it. */
  readonly onHandleKeyDown: (e: React.KeyboardEvent) => void;
}

/**
 * A side rail's width, draggable via a handle on one of its edges and remembered across
 * the session (Document Studio UX Polish Pack v1 — "Responsive Panels").
 *
 * Which physical edge (left or right) the handle sits on is read from the DOM at
 * drag-start (`handleRect` vs `railRect`) rather than assumed from a prop — the page is
 * RTL, and a rail can sit on either side of the canvas depending on which one it is, so
 * this stays correct without the caller having to reason about writing direction. The
 * handle's own CSS placement (which edge it renders ON) is a separate, purely visual
 * concern the consumer's stylesheet already owns via `inset-inline-start/end`.
 */
export function useResizableRail(
  storageKey: string,
  defaultWidth: number,
  min: number,
  max: number,
): ResizableRail {
  const [width, setWidth] = usePersistedState<number>(storageKey, defaultWidth);
  const railRef = useRef<HTMLElement>(null);
  const handleRef = useRef<HTMLElement>(null);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      const rail = railRef.current;
      const handle = handleRef.current;
      if (!rail || !handle) return;
      e.preventDefault();

      const railRect = rail.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const handleOnRight = handleRect.left >= railRect.left + railRect.width / 2;

      function onMove(ev: PointerEvent) {
        const raw = handleOnRight ? ev.clientX - railRect.left : railRect.right - ev.clientX;
        setWidth(Math.min(max, Math.max(min, Math.round(raw))));
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [max, min, setWidth],
  );

  const onHandleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const rail = railRef.current;
      const handle = handleRef.current;
      if (!rail || !handle) return;

      const railRect = rail.getBoundingClientRect();
      const handleRect = handle.getBoundingClientRect();
      const handleOnRight = handleRect.left >= railRect.left + railRect.width / 2;
      // Moving the handle TOWARD the canvas always shrinks the rail, away from it always
      // grows it — which arrow key that is flips with which physical side the handle is
      // on, exactly as it does for the pointer drag above.
      const growsOnArrowRight = !handleOnRight;
      const grows = (e.key === 'ArrowRight') === growsOnArrowRight;
      setWidth((w) => Math.min(max, Math.max(min, w + (grows ? NUDGE_PX : -NUDGE_PX))));
    },
    [max, min, setWidth],
  );

  return { width, railRef, handleRef, startDrag, onHandleKeyDown };
}

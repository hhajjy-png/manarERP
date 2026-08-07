import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface FloatingRect {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
  readonly width: number;
  readonly height: number;
}

export interface FloatingPosition {
  readonly top: number;
  readonly left: number;
  readonly minWidth: number;
}

export interface UseFloatingPositionOptions {
  /** Gap between the anchor and the panel, in px. Default 6. */
  gap?: number;
  /** Minimum distance kept from every viewport edge, in px. Default 8. */
  viewportPad?: number;
  /**
   * `'start'` opens flush with the anchor's leading edge and grows toward the trailing
   * edge (matches `inset-inline-start: 0` — the shape every dropdown in this app already
   * uses). `'center'` centers the panel under/over the anchor's midpoint — the shape a
   * caret-anchored toolbar needs, since a caret has no "start edge" of its own.
   * Default `'start'`.
   */
  align?: 'start' | 'center';
}

/**
 * Positions a panel against an anchor rect using `position: fixed` — this is what makes
 * a `createPortal`-rendered panel escape every ancestor's `overflow`/stacking context,
 * which is the actual defect a bare higher `z-index` cannot fix on its own (an ancestor
 * with `overflow: hidden`/`auto` clips a `position: absolute` descendant before z-index
 * stacking is ever consulted).
 *
 * `getAnchorRect` is a function, not a ref, so the same hook serves both an
 * element-anchored dropdown (`() => trigger.getBoundingClientRect()`) and a
 * point-anchored panel like the floating selection toolbar (`() =>` a caret rect with no
 * backing DOM element).
 *
 * The panel is measured AFTER it mounts (`useLayoutEffect`, before paint) because its
 * own width/height — needed to flip above the anchor or clamp off the trailing edge —
 * is not known until it has rendered once.
 */
export function useFloatingPosition(
  getAnchorRect: () => FloatingRect | null,
  open: boolean,
  options: UseFloatingPositionOptions = {},
): { panelRef: RefObject<HTMLDivElement>; position: FloatingPosition | null; reposition: () => void } {
  const gap = options.gap ?? 6;
  const pad = options.viewportPad ?? 8;
  const align = options.align ?? 'start';

  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<FloatingPosition | null>(null);

  const reposition = useCallback(() => {
    const anchor = getAnchorRect();
    const panel = panelRef.current;
    if (!anchor || !panel) return;

    const panelWidth = panel.offsetWidth;
    const panelHeight = panel.offsetHeight;
    const isRtl = document.documentElement.dir === 'rtl' || getComputedStyle(panel).direction === 'rtl';

    let left =
      align === 'center'
        ? anchor.left + anchor.width / 2 - panelWidth / 2
        : isRtl
          ? anchor.right - panelWidth
          : anchor.left;

    const maxLeft = window.innerWidth - panelWidth - pad;
    left = Math.min(Math.max(left, pad), Math.max(pad, maxLeft));

    let top = anchor.bottom + gap;
    const maxTop = window.innerHeight - panelHeight - pad;
    if (top > maxTop) {
      // Not enough room below — flip above the anchor rather than clip off the bottom
      // edge, but only when there is genuinely more room there; otherwise stay below and
      // let the clamp hold it inside the viewport as closely as it can.
      const above = anchor.top - gap - panelHeight;
      top = above >= pad ? above : Math.min(top, Math.max(pad, maxTop));
    }

    setPosition({ top, left, minWidth: anchor.width });
  }, [getAnchorRect, gap, pad, align]);

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    reposition();
    // Capture-phase so a scroll inside ANY ancestor (a panel's own scrollable body, not
    // just the window) triggers a reposition — a portal panel that does not track a
    // scrolling ancestor drifts away from its anchor the instant that ancestor scrolls.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, reposition]);

  return { panelRef, position, reposition };
}

/** `Element.getBoundingClientRect()` already satisfies `FloatingRect` structurally. */
export function rectOfElement(el: Element | null): FloatingRect | null {
  return el ? el.getBoundingClientRect() : null;
}

/**
 * Closes an open panel on an outside click or `Escape`, checking against EVERY ref
 * given — a panel positioned via `useFloatingPosition` is portaled outside its trigger's
 * DOM subtree, so a click inside the panel is no longer a descendant of the trigger and
 * a check against the trigger ref alone would misread it as "outside" and self-close on
 * every interaction with the panel's own contents.
 */
export function useCloseOnOutsideInteraction(
  open: boolean,
  refs: readonly RefObject<HTMLElement>[],
  onClose: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);
}

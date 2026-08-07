import { type RefObject } from 'react';

/**
 * The draggable edge of a resizable rail — a `role="separator"` per WAI-ARIA's pattern
 * for an adjustable divider between two regions, focusable and responsive to arrow keys.
 * Purely a handle: which edge of its rail it renders on is the consumer's own CSS
 * (`inset-inline-start`/`-end`), and the resize math lives in `useResizableRail`.
 */
export default function RailResizeHandle({
  handleRef,
  label,
  /** Which edge of the RAIL this sits on, relative to reading order — `'before'` for a
   *  rail that comes before the canvas in the DOM (its handle sits at the inline-END,
   *  the edge touching the canvas), `'after'` for one that comes after (handle at the
   *  inline-START). Purely a placement concern; the resize math never needs to know it. */
  edge,
  onPointerDown,
  onKeyDown,
}: {
  handleRef: RefObject<HTMLElement>;
  label: string;
  edge: 'before' | 'after';
  onPointerDown: (e: React.PointerEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div
      ref={handleRef as RefObject<HTMLDivElement>}
      className={`rail-resize-handle rail-resize-handle--${edge}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
    />
  );
}

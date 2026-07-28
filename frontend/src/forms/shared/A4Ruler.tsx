import type { ReactElement } from 'react';

/**
 * CSS px per physical millimetre at the browser's fixed length-unit definition
 * (1in = 96px = 25.4mm). Used ONLY for the ruler's internal `viewBox` coordinate
 * space — the SVG's rendered box is sized in real `mm` (see below), so the ruler
 * is physically exact even if a renderer resolved `mm` at a different scale.
 */
export const PX_PER_MM = 96 / 25.4;

/** Thickness (px) of a ruler bar — exported so the host can reserve the same space. */
export const A4_RULER_THICKNESS = 22;

const MAJOR_TICK_LEN = 11; // every 1cm — labelled
const MID_TICK_LEN = 7;    // every 5mm
const MINOR_TICK_LEN = 4;  // every 1mm
const LABEL_SIZE = 9;

/** Which edge of the sheet the ruler runs along. */
export type A4RulerEdge = 'top' | 'bottom' | 'left' | 'right';

interface A4RulerProps {
  /**
   * The ruler sits just OUTSIDE this edge of the sheet, and its ticks grow AWAY from
   * the paper — so the tick baseline is flush with the physical edge and a reading is
   * a true distance from it. All four edges share one origin: `top`/`bottom` measure
   * rightwards from the sheet's left edge, `left`/`right` measure downwards from its
   * top edge — the same origin the branding coordinates use.
   */
  edge: A4RulerEdge;
  /** Physical length of the ruler in millimetres (210 across an A4, 297 down it). */
  lengthMm: number;
}

/**
 * Screen-only cm ruler along one edge of the blank A4 sheet. Never printed — every
 * ruler is marked `.no-print` AND rendered as a SIBLING of the printable node, so it is
 * structurally absent from every export path (physical print, PDF, accurate preview),
 * which clone `.form-page` alone.
 *
 * PHYSICAL EXACTNESS: the SVG's rendered box is declared in real `mm` and the internal
 * geometry is mapped onto it with `preserveAspectRatio="none"`. A ruler therefore spans
 * exactly `lengthMm` millimetres of the same coordinate space the sheet is drawn in — it
 * cannot drift from the paper even if the two were resolved at different pixel densities.
 */
export default function A4Ruler({ edge, lengthMm }: A4RulerProps): ReactElement {
  const isHorizontal = edge === 'top' || edge === 'bottom';
  const lengthPx = lengthMm * PX_PER_MM;
  const T = A4_RULER_THICKNESS;
  const wholeMm = Math.floor(lengthMm);

  const ticks: ReactElement[] = [];
  const labels: ReactElement[] = [];

  for (let mm = 0; mm <= wholeMm; mm++) {
    const pos = mm * PX_PER_MM;
    const isCm = mm % 10 === 0;
    const isMid = mm % 5 === 0;
    const len = isCm ? MAJOR_TICK_LEN : isMid ? MID_TICK_LEN : MINOR_TICK_LEN;
    const strokeWidth = isCm ? 1 : 0.5;

    // Each edge's ticks start on the side ADJACENT to the paper and grow outward.
    const line =
      edge === 'top'    ? { x1: pos, x2: pos, y1: T, y2: T - len }
    : edge === 'bottom' ? { x1: pos, x2: pos, y1: 0, y2: len }
    : edge === 'left'   ? { x1: T, x2: T - len, y1: pos, y2: pos }
    :                     { x1: 0, x2: len,     y1: pos, y2: pos }; // right

    ticks.push(<line key={mm} {...line} stroke="#64748b" strokeWidth={strokeWidth} />);

    if (isCm && mm > 0) {
      const cm = mm / 10;
      const label =
        edge === 'top'    ? { x: pos, y: T - MAJOR_TICK_LEN - 2, anchor: 'middle' as const }
      : edge === 'bottom' ? { x: pos, y: MAJOR_TICK_LEN + LABEL_SIZE, anchor: 'middle' as const }
      : edge === 'left'   ? { x: T - MAJOR_TICK_LEN - 2, y: pos + 3, anchor: 'end' as const }
      :                     { x: MAJOR_TICK_LEN + 2, y: pos + 3, anchor: 'start' as const }; // right

      labels.push(
        <text key={`l${mm}`} x={label.x} y={label.y} fontSize={LABEL_SIZE} textAnchor={label.anchor} fill="#475569">
          {cm}
        </text>,
      );
    }
  }

  return (
    <svg
      className="no-print"
      data-testid={`a4-ruler-${edge}`}
      viewBox={isHorizontal ? `0 0 ${lengthPx} ${T}` : `0 0 ${T} ${lengthPx}`}
      preserveAspectRatio="none"
      style={
        isHorizontal
          ? { display: 'block', width: `${lengthMm}mm`, height: T }
          : { display: 'block', width: T, height: `${lengthMm}mm` }
      }
      aria-hidden="true"
    >
      <rect
        x={0}
        y={0}
        width={isHorizontal ? lengthPx : T}
        height={isHorizontal ? T : lengthPx}
        fill="#f8fafc"
      />
      {ticks}
      {labels}
    </svg>
  );
}

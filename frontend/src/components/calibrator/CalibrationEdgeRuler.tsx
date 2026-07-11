/**
 * Calibration Studio — physical edge ruler (calibration test sheet only).
 *
 * Renders one real centimetre ruler along a single paper edge as FOREGROUND SVG
 * ink: <line> ticks and <text> labels, nothing else.
 *
 * Physical accuracy contract
 * ──────────────────────────
 * These elements are designed to live inside the calibration test sheet's SVG,
 * whose viewBox is expressed in millimetres (`viewBox="0 0 Wmm Hmm"` on an element
 * sized `Wmm × Hmm`). One SVG user unit is therefore exactly one millimetre, and
 * every number below — tick position, tick length, stroke width, label offset — is
 * a true physical measurement at 100% print scale. No transform, no zoom, no
 * percentage, no pixel value participates in the geometry.
 *
 * Why SVG strokes and not CSS
 * ───────────────────────────
 * An earlier diagnostic grid on this sheet was drawn with CSS backgrounds
 * (repeating-linear-gradient + print-color-adjust) and repeatedly failed to print:
 * browsers and printers drop background ink by default. Foreground SVG strokes are
 * the only technique that prints reliably here, so backgrounds must never come back.
 *
 * Origin: each ruler's zero is the paper corner it starts from. The top and bottom
 * rulers both measure from the left paper edge; the left and right rulers both
 * measure from the top paper edge. That keeps opposing rulers aligned and gives the
 * four of them a single shared origin per axis — so no zero label is ever printed
 * twice, and none is printed at all (a numeral at 0 mm sits inside every printer's
 * non-printable margin and would only ever come out clipped).
 */

import { memo } from 'react';

export type RulerSide = 'top' | 'bottom' | 'left' | 'right';

/** Distance from the paper edge to the ruler baseline (mm). Clears the ~4–5 mm
 *  non-printable margin of common office printers. */
export const RULER_BASE_MM = 6;

/** Tick lengths, measured inward from the baseline (mm). 10 mm marks are longest
 *  and heaviest, so the centimetre hierarchy reads at a glance. */
export const TICK_MINOR_MM = 1.2; // every 1 mm
export const TICK_MID_MM = 2.2; // every 5 mm
export const TICK_MAJOR_MM = 3.6; // every 10 mm

/** Centimetre label baseline, measured inward from the paper edge (mm). Sits clear
 *  of the longest tick (RULER_BASE_MM + TICK_MAJOR_MM = 9.6 mm). */
export const LABEL_OFFSET_MM = 12.4;

/** Total lane reserved at each paper edge (mm). Sheet content stays out of it. */
export const RULER_LANE_MM = 15;

/** Labels are suppressed within this distance of either end of a ruler, so the four
 *  rulers never collide at the four corners and no number is clipped. */
export const CORNER_CLEAR_MM = 18;

/** Ink dark enough to survive a monochrome printer — no opacity, no light grey. */
export const RULER_INK = '#1e293b';

const STROKE_BASELINE = 0.3;
const STROKE_MINOR = 0.18;
const STROKE_MID = 0.25;
const STROKE_MAJOR = 0.4;

const LABEL_FONT_MM = 2.9;
/** Nudge that visually centres a label on its tick along the vertical rulers. */
const LABEL_VCENTER_MM = 0.9;

export interface RulerTick {
  /** Position along the ruler axis, in millimetres from the ruler's zero. */
  mm: number;
  /** Length of the tick, measured inward from the baseline (mm). */
  len: number;
  /** A 10 mm (centimetre) mark. */
  major: boolean;
}

/**
 * Generate one tick per millimetre across the ruler's full length, starting at 0.
 * Pure and deterministic: the sheet never hardcodes tick elements.
 */
export function buildTicks(lengthMm: number): RulerTick[] {
  const ticks: RulerTick[] = [];
  const last = Math.floor(lengthMm);
  for (let mm = 0; mm <= last; mm++) {
    const major = mm % 10 === 0;
    const mid = !major && mm % 5 === 0;
    ticks.push({
      mm,
      len: major ? TICK_MAJOR_MM : mid ? TICK_MID_MM : TICK_MINOR_MM,
      major,
    });
  }
  return ticks;
}

/**
 * The centimetre values that get a printed numeral: every 10 mm mark that is at
 * least CORNER_CLEAR_MM away from both ends of the ruler.
 */
export function labelledCentimetres(lengthMm: number): number[] {
  const out: number[] = [];
  for (let mm = 0; mm <= Math.floor(lengthMm); mm += 10) {
    if (mm >= CORNER_CLEAR_MM && mm <= lengthMm - CORNER_CLEAR_MM) out.push(mm / 10);
  }
  return out;
}

interface Props {
  side: RulerSide;
  /** Length of the ruler run (mm) — the page width for top/bottom, the page height
   *  for left/right. */
  lengthMm: number;
  /** Page size (mm), needed to mirror the bottom and right rulers onto their edges. */
  pageWidthMm: number;
  pageHeightMm: number;
}

/**
 * One physical ruler along one paper edge. Ticks grow inward from a baseline that
 * runs the full length of the edge; centimetre numerals sit inboard of the ticks.
 */
function CalibrationEdgeRulerImpl({ side, lengthMm, pageWidthMm, pageHeightMm }: Props) {
  const ticks = buildTicks(lengthMm);
  const labels = labelledCentimetres(lengthMm);
  const horizontal = side === 'top' || side === 'bottom';

  // Baseline position on the cross axis, and the inward direction (+1 / −1).
  const baseCross =
    side === 'top' ? RULER_BASE_MM
    : side === 'bottom' ? pageHeightMm - RULER_BASE_MM
    : side === 'left' ? RULER_BASE_MM
    : pageWidthMm - RULER_BASE_MM;
  const inward = side === 'top' || side === 'left' ? 1 : -1;

  // Label baseline on the cross axis.
  const labelCross =
    side === 'top' ? LABEL_OFFSET_MM
    : side === 'bottom' ? pageHeightMm - LABEL_OFFSET_MM
    : side === 'left' ? LABEL_OFFSET_MM
    : pageWidthMm - LABEL_OFFSET_MM;

  const labelAnchor: 'middle' | 'start' | 'end' =
    horizontal ? 'middle' : side === 'left' ? 'start' : 'end';

  return (
    <g className={`chq-ruler chq-ruler--${side}`}>
      {/* Baseline. Corner cleanup: the baseline stops RULER_BASE_MM short of each end,
          so the horizontal and vertical baselines no longer cross and double-draw in
          the four corners, and neither baseline strikes through the other ruler's
          first/last tick. This moves NO tick and changes NO measurement — the ticks
          below still run 0…lengthMm, so the 0 mm corner origin and the physical scale
          are exactly as before. Only the connecting rule is shortened. */}
      {horizontal ? (
        <line
          className="chq-ruler__baseline"
          x1={RULER_BASE_MM}
          y1={baseCross}
          x2={lengthMm - RULER_BASE_MM}
          y2={baseCross}
          stroke={RULER_INK}
          strokeWidth={STROKE_BASELINE}
        />
      ) : (
        <line
          className="chq-ruler__baseline"
          x1={baseCross}
          y1={RULER_BASE_MM}
          x2={baseCross}
          y2={lengthMm - RULER_BASE_MM}
          stroke={RULER_INK}
          strokeWidth={STROKE_BASELINE}
        />
      )}

      {/* Ticks — one per millimetre, generated, never hardcoded. */}
      {ticks.map((t) => {
        const end = baseCross + inward * t.len;
        const stroke =
          t.major ? STROKE_MAJOR : t.mm % 5 === 0 ? STROKE_MID : STROKE_MINOR;
        const cls = `chq-ruler__tick chq-ruler__tick--${
          t.major ? 'major' : t.mm % 5 === 0 ? 'mid' : 'minor'
        }`;
        return horizontal ? (
          <line
            key={t.mm}
            className={cls}
            x1={t.mm}
            y1={baseCross}
            x2={t.mm}
            y2={end}
            stroke={RULER_INK}
            strokeWidth={stroke}
          />
        ) : (
          <line
            key={t.mm}
            className={cls}
            x1={baseCross}
            y1={t.mm}
            x2={end}
            y2={t.mm}
            stroke={RULER_INK}
            strokeWidth={stroke}
          />
        );
      })}

      {/* Centimetre numerals — Western digits, monospace, corner-safe. */}
      {labels.map((cm) => {
        const along = cm * 10;
        return (
          <text
            key={cm}
            className="chq-ruler__label"
            x={horizontal ? along : labelCross}
            y={horizontal ? labelCross : along + LABEL_VCENTER_MM}
            textAnchor={labelAnchor}
            fontSize={LABEL_FONT_MM}
            fontWeight="700"
            fill={RULER_INK}
            fontFamily="monospace"
          >
            {cm}
          </text>
        );
      })}
    </g>
  );
}

export const CalibrationEdgeRuler = memo(CalibrationEdgeRulerImpl);

/**
 * All four edge rulers as one memoised frame. Depends only on the page size, so it
 * does not re-render while the operator drags fields around the calibrator.
 */
function CalibrationRulerFrameImpl({
  pageWidthMm,
  pageHeightMm,
}: {
  pageWidthMm: number;
  pageHeightMm: number;
}) {
  return (
    <g className="chq-ruler-frame">
      <CalibrationEdgeRuler side="top" lengthMm={pageWidthMm} pageWidthMm={pageWidthMm} pageHeightMm={pageHeightMm} />
      <CalibrationEdgeRuler side="bottom" lengthMm={pageWidthMm} pageWidthMm={pageWidthMm} pageHeightMm={pageHeightMm} />
      <CalibrationEdgeRuler side="left" lengthMm={pageHeightMm} pageWidthMm={pageWidthMm} pageHeightMm={pageHeightMm} />
      <CalibrationEdgeRuler side="right" lengthMm={pageHeightMm} pageWidthMm={pageWidthMm} pageHeightMm={pageHeightMm} />
    </g>
  );
}

export const CalibrationRulerFrame = memo(CalibrationRulerFrameImpl);

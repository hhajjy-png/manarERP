import type { ResolvedRenderModel } from '../../modules/chequeTemplateRuntime';
import type { ChequeA4Placement } from '../../modules/chequePrint';
import ChequeRenderSurface from './ChequeRenderSurface';
import './chequeA4Sheet.css';

/** The two presentation surfaces. Real Cheque = 178×89mm paper; A4 = the same
 *  cheque fixed on an A4-landscape page. Presentation-only — never persisted. */
export type ChequePaperMode = 'real-cheque' | 'a4';

/**
 * Cheque A4 Sheet — Cheque Template A4 Surface Mode v1.
 *
 * The ONLY difference between Real Cheque mode and A4 mode: the outer paper
 * surface. This component is a pure presentation wrapper — an A4-landscape
 * page (297 × 210 mm) that hosts exactly ONE cheque surface (178 × 89 mm) at a
 * FIXED, hardcoded position, and renders that cheque through the SAME
 * `ChequeRenderSurface` used everywhere else.
 *
 * It adds NO rendering, runtime, binding, or field logic of its own — the
 * cheque, its model, its coordinates, its typography, and its bindings are
 * identical to Real Cheque mode. Only the paper around it changes.
 *
 * DEFAULT position (unchanged — no alignment/offset/calibration controls):
 *   - vertically centered on the page,
 *   - anchored to the far RIGHT paper edge with a small printer-safe margin.
 * Positions are expressed as percentages of the A4 page so the whole sheet
 * scales as one unit on screen and prints at true physical size.
 *
 * A print PROFILE may supply its own `placement` instead — a rectangle in true
 * millimetres (see `ChequeA4Placement`). That is how the Gulf Bank profile puts
 * its measured 180 × 90 mm cheque at x = 117 mm, y = 60 mm, and how its global
 * calibration offsets move the WHOLE cheque area without touching a single field
 * coordinate. Nothing else about the component changes: the same model, the same
 * renderer, the same field geometry. Omitting `placement` reproduces the original
 * 178 × 89 mm behaviour exactly.
 */

const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;
const CHEQUE_WIDTH_MM = 178;
const CHEQUE_HEIGHT_MM = 89;
/** Small fixed printer-safe margin from the right paper edge. */
const PRINTER_SAFE_RIGHT_MARGIN_MM = 5;

/** The historical default placement, restated in the same mm terms a profile uses. */
export const DEFAULT_A4_PLACEMENT: ChequeA4Placement = {
  xMm: A4_WIDTH_MM - CHEQUE_WIDTH_MM - PRINTER_SAFE_RIGHT_MARGIN_MM,
  yMm: (A4_HEIGHT_MM - CHEQUE_HEIGHT_MM) / 2,
  widthMm: CHEQUE_WIDTH_MM,
  heightMm: CHEQUE_HEIGHT_MM,
};

type Props = {
  /** The already-resolved render model (same model as Real Cheque mode). */
  model: ResolvedRenderModel;
  /** Optional cheque background (preview); omitted/false for print. */
  backgroundSrc?: string;
  showBackground?: boolean;
  /** Where the cheque area sits on the sheet, in true mm. Defaults to the 178×89 placement. */
  placement?: ChequeA4Placement;
};

export default function ChequeA4Sheet({ model, backgroundSrc, showBackground, placement }: Props) {
  const area = placement ?? DEFAULT_A4_PLACEMENT;
  return (
    <div className="cha4-sheet" style={{ width: `${A4_WIDTH_MM / 10}cm`, aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}` }}>
      <div
        className="cha4-cheque-slot"
        style={{
          // `left`/`top` are PHYSICAL CSS properties (unlike `inset-inline-*`), so
          // the cheque's place on the sheet is stated geometrically and an RTL
          // ancestor cannot flip it. "Flush with the right edge" is expressed as
          // `xMm = 297 − 180`, never as a direction-dependent anchor.
          left: `${(area.xMm / A4_WIDTH_MM) * 100}%`,
          top: `${(area.yMm / A4_HEIGHT_MM) * 100}%`,
          width: `${(area.widthMm / A4_WIDTH_MM) * 100}%`,
          height: `${(area.heightMm / A4_HEIGHT_MM) * 100}%`,
        }}
      >
        {/* Same cheque, same renderer — fills the fixed slot via its own max-width. */}
        <ChequeRenderSurface model={model} backgroundSrc={backgroundSrc} showBackground={showBackground} />
      </div>
    </div>
  );
}

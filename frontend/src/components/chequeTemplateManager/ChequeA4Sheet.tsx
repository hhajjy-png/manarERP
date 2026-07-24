import type { ResolvedRenderModel } from '../../modules/chequeTemplateRuntime';
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
 * Fixed position (hardcoded — no alignment/offset/calibration controls):
 *   - vertically centered on the page,
 *   - anchored to the far RIGHT paper edge with a small printer-safe margin.
 * Positions are expressed as percentages of the A4 page so the whole sheet
 * scales as one unit on screen and prints at true physical size.
 */

const A4_WIDTH_MM = 297;
const A4_HEIGHT_MM = 210;
const CHEQUE_WIDTH_MM = 178;
const CHEQUE_HEIGHT_MM = 89;
/** Small fixed printer-safe margin from the right paper edge. */
const PRINTER_SAFE_RIGHT_MARGIN_MM = 5;

const CHEQUE_TOP_PCT = ((A4_HEIGHT_MM - CHEQUE_HEIGHT_MM) / 2 / A4_HEIGHT_MM) * 100;
const CHEQUE_RIGHT_PCT = (PRINTER_SAFE_RIGHT_MARGIN_MM / A4_WIDTH_MM) * 100;
const CHEQUE_WIDTH_PCT = (CHEQUE_WIDTH_MM / A4_WIDTH_MM) * 100;
const CHEQUE_HEIGHT_PCT = (CHEQUE_HEIGHT_MM / A4_HEIGHT_MM) * 100;

type Props = {
  /** The already-resolved render model (same model as Real Cheque mode). */
  model: ResolvedRenderModel;
  /** Optional cheque background (preview); omitted/false for print. */
  backgroundSrc?: string;
  showBackground?: boolean;
};

export default function ChequeA4Sheet({ model, backgroundSrc, showBackground }: Props) {
  return (
    <div className="cha4-sheet" style={{ width: `${A4_WIDTH_MM / 10}cm`, aspectRatio: `${A4_WIDTH_MM} / ${A4_HEIGHT_MM}` }}>
      <div
        className="cha4-cheque-slot"
        style={{
          top: `${CHEQUE_TOP_PCT}%`,
          right: `${CHEQUE_RIGHT_PCT}%`,
          width: `${CHEQUE_WIDTH_PCT}%`,
          height: `${CHEQUE_HEIGHT_PCT}%`,
        }}
      >
        {/* Same cheque, same renderer — fills the fixed slot via its own max-width. */}
        <ChequeRenderSurface model={model} backgroundSrc={backgroundSrc} showBackground={showBackground} />
      </div>
    </div>
  );
}

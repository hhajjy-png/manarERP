import type { CSSProperties } from 'react';
import type { ResolvedRenderModel } from '../../modules/chequeTemplateRuntime';
import './chequeRenderSurface.css';

/**
 * Cheque Render Surface — the single, shared "Print Renderer" (Cheque Template
 * Printing v1).
 *
 * Pure and UI-only. It receives an already-resolved ResolvedRenderModel and
 * draws every VISIBLE field onto the physical cheque surface, respecting the
 * model's resolved position, size, rotation, alignment, font, color,
 * visibility, and z-order. It does NOT resolve bindings and does NOT calculate
 * layout — the Runtime Engine already provided everything.
 *
 * This one component is used by BOTH the Live Preview and the Print page, so
 * the printed output is guaranteed to match the preview (no duplicated
 * rendering logic).
 */

type Props = {
  /** The already-resolved render model (the ONLY rendering source). */
  model: ResolvedRenderModel;
  /** Optional cheque background image (the medium, not field data). */
  backgroundSrc?: string;
  /**
   * Whether to render the cheque background image. `true` for the Live Preview
   * (WYSIWYG over the cheque image); `false` for real printing, where the ink
   * must land on pre-printed cheque paper and the background must never print.
   * Only the background differs — all field rendering is identical either way.
   */
  showBackground?: boolean;
  /** Extra class on the surface element (e.g. framing for preview vs. bare for print). */
  className?: string;
};

export default function ChequeRenderSurface({ model, backgroundSrc, showBackground = true, className }: Props) {
  const { surface, visibleFields } = model;

  return (
    <div
      className={`crs-surface${className ? ` ${className}` : ''}`}
      style={{ width: `${surface.widthCm}cm`, aspectRatio: `${surface.widthCm} / ${surface.heightCm}` }}
    >
      {showBackground && backgroundSrc && <img src={backgroundSrc} alt="" className="crs-bg" aria-hidden="true" />}
      {visibleFields.map((f) => {
        const wrapperStyle: CSSProperties = {
          left: `${f.geometry.xPercent}%`,
          top: `${f.geometry.yPercent}%`,
          width: `${f.geometry.widthPercent}%`,
          height: `${f.geometry.heightPercent}%`,
          transform: `rotate(${f.geometry.rotationDeg}deg)`,
          zIndex: f.zIndex,
        };
        const textStyle: CSSProperties = {
          fontSize: f.font.sizePx,
          fontWeight: f.font.weight,
          textAlign: f.align,
          color: f.color,
        };
        return (
          <div key={f.id} className="crs-field" style={wrapperStyle}>
            <span className="crs-field-text" style={textStyle}>{f.text}</span>
          </div>
        );
      })}
    </div>
  );
}

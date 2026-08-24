import type { CSSProperties } from 'react';
import { LTR_ISOLATED_KEYS } from '../../modules/chequeTemplateRuntime';
import type { ResolvedRenderModel, SemanticKey } from '../../modules/chequeTemplateRuntime';
import { fontSizeToCqw, WRAPPED_LINE_HEIGHT_FACTOR } from '../../modules/chequePrint';
import './chequeRenderSurface.css';

const LTR_ISOLATED = new Set<string>(LTR_ISOLATED_KEYS);

/**
 * Dates, amounts and cheque numbers must keep their LOGICAL character order.
 * Both cheque surfaces live under `dir="rtl"`, where the Unicode Bidi Algorithm
 * would otherwise lay out the number runs of `02 / 08 / 2026` right-to-left and
 * make it read `2026 / 08 / 02`. Isolating those fields to LTR pins the order.
 *
 * `text-align` is a PHYSICAL property, so isolation changes no field's position
 * or alignment — pre-calibrated templates print exactly where they did before.
 * Arabic fields (beneficiary, tafqeet, bank/company names) are untouched and stay RTL.
 */
function bidiStyle(binding: SemanticKey | null): CSSProperties {
  if (!binding || !LTR_ISOLATED.has(binding)) return {};
  return { direction: 'ltr', unicodeBidi: 'isolate' };
}

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
          // Container-relative type: `cqw` is a percentage of THIS surface's
          // inline size, so the authored pixel size is reproduced exactly when
          // the surface is at its declared physical width (print) and scales
          // proportionally when it is shrunk to fit a panel (preview). Never
          // viewport-relative — see modules/chequePrint/textFit.ts.
          fontSize: `${fontSizeToCqw(f.font.sizePx, surface.widthCm)}cqw`,
          fontWeight: f.font.weight,
          textAlign: f.align,
          color: f.color,
          ...bidiStyle(f.binding),
        };
        // Wrapping is opt-in per field and stays inside the field's own box: the
        // line height matches `WRAPPED_LINE_HEIGHT_FACTOR`, which is what the
        // engine counted lines with, and a value longer than the box holds still
        // raises the blocking FIELD_TEXT_OVERFLOW error rather than spilling.
        if (f.multiline) textStyle.lineHeight = WRAPPED_LINE_HEIGHT_FACTOR;

        // A SLOTTED field (the cheque date) draws its sub-cells instead of its
        // own text. Every slot shares this one box's top, height and typography,
        // so the digits sit on a single baseline by construction — the only thing
        // that varies between them is the horizontal offset the template author
        // measured off the cheque.
        if (f.slots.length > 0) {
          return (
            <div key={f.id} className="crs-field" style={wrapperStyle}>
              {f.slots.map((slot) => (
                <span
                  key={slot.key}
                  className="crs-slot"
                  data-slot={slot.key}
                  style={{
                    ...textStyle,
                    left: `${slot.xPercent}%`,
                    width: `${slot.widthPercent}%`,
                    textAlign: 'center',
                    ...bidiStyle(slot.binding),
                  }}
                >
                  {slot.text}
                </span>
              ))}
            </div>
          );
        }

        return (
          <div key={f.id} className="crs-field" style={wrapperStyle}>
            <span
              className={`crs-field-text${f.multiline ? ' crs-field-text--wrap' : ''}`}
              data-binding={f.binding ?? ''}
              style={textStyle}
            >
              {f.text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

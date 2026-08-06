/**
 * Document Layout Designer — rendering one positioned object.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THIS IS THE INK. IT RENDERS IDENTICALLY ON SCREEN AND ON PAPER.
 * ══════════════════════════════════════════════════════════════════════════
 * There is no second renderer for print, exactly as there is none for the flow
 * sections: printing captures the live view, so what is drawn here IS what reaches the
 * paper. Every selection frame, handle and guide lives in `LayoutCanvas` — a separate
 * chrome layer that the print stylesheet removes. Keeping ink and chrome in different
 * components is what makes "does this print?" answerable by looking at which file a
 * thing is in.
 *
 * ── EVERY DIMENSION IS A MILLIMETRE, INLINE ──────────────────────────────
 * Position, size, padding and border all arrive as `mm` inline styles computed from
 * the object's own frame — the same discipline `LetterPaper` follows for the sheet.
 * The stylesheet carries appearance only. A `px` here would mean the object printed at
 * a size that depended on the screen it was designed on.
 *
 * ── ROTATION AND THE TRANSFORM ORIGIN ────────────────────────────────────
 * `transform: rotate()` about the CENTRE, which is what `objectCorners` assumes when
 * it computes the shape the blocking reserved-zone rule is judged on. If this rotated
 * about a corner instead, the rule and the rendering would disagree about where the
 * object is — and the rule would be enforcing a position nobody could see.
 */

import { type CSSProperties } from 'react';
import LetterBarcode from '../LetterBarcode';
import { type LayoutObject } from '../../../letters/model/layoutTypes';
import { letterFontStack } from '../../../letters/fonts/fontIntegration';
import './layout-objects.css';

export interface LayoutObjectViewProps {
  readonly object: LayoutObject;
  /** True while the object is being dragged — suppresses transitions so it tracks. */
  readonly interacting?: boolean;
  /**
   * Substitutes `{{Variable}}` tokens for their values.
   *
   * Unconditional here, unlike in a flow paragraph: a layout object's text is edited in
   * the Object Inspector's own field, not in the object itself, so the object is
   * ALWAYS a rendered view and there is no editable surface for a token to be
   * unreachable in. The Inspector shows the raw text; the page shows the values.
   */
  readonly resolveText?: (text: string) => string;
}

/**
 * The object's box: position, size, rotation and opacity.
 *
 * Shared by the ink layer and by the canvas's selection frame, so a handle can never
 * drift from the thing it is attached to.
 */
export function objectBoxStyle(object: LayoutObject): CSSProperties {
  return {
    position: 'absolute',
    insetInlineStart: `${object.frame.xMm}mm`,
    top: `${object.frame.yMm}mm`,
    width: `${object.frame.widthMm}mm`,
    height: `${object.frame.heightMm}mm`,
    transform: object.rotationDeg === 0 ? undefined : `rotate(${object.rotationDeg}deg)`,
    transformOrigin: 'center center',
    opacity: object.opacity,
    zIndex: object.zIndex,
  };
}

export default function LayoutObjectView({ object, interacting, resolveText }: LayoutObjectViewProps) {
  return (
    <div
      className={`lo-object lo-object--${object.kind}${interacting ? ' is-interacting' : ''}`}
      style={objectBoxStyle(object)}
      data-object-id={object.id}
      // Not focusable and not interactive: this layer is ink. Every pointer event is
      // handled by the canvas above it, which owns hit testing so that a rotated
      // object's true shape decides what was clicked rather than its CSS box.
      aria-hidden="true"
    >
      <ObjectContent object={object} resolveText={resolveText} />
    </div>
  );
}

function ObjectContent({
  object,
  resolveText,
}: {
  object: LayoutObject;
  resolveText?: (text: string) => string;
}) {
  const payload = object.payload;
  /** Identity when no resolver is supplied — the object renders its raw text. */
  const show = (text: string) => (resolveText ? resolveText(text) : text);

  switch (payload.kind) {
    case 'textBlock': {
      const text = payload.text;
      return (
        <p
          className="lo-text"
          style={{
            fontFamily: letterFontStack(text.fontId),
            fontSize: `${text.sizePt}pt`,
            lineHeight: text.lineHeight,
            textAlign: text.alignment === 'start' ? 'start' : text.alignment,
            fontWeight: text.marks.includes('bold') ? 700 : 400,
            textDecoration: text.marks.includes('underline') ? 'underline' : 'none',
            // A neutral grey wash, never a hue — the same rule the flow marks follow.
            backgroundColor: text.marks.includes('highlight') ? 'rgba(15, 23, 42, 0.12)' : undefined,
            padding: `${text.paddingMm}mm`,
          }}
        >
          {show(text.text)}
        </p>
      );
    }

    case 'image': {
      const image = payload.image;
      if (!image.imageUrl) {
        // An image object with no source yet is a PLACEHOLDER, not an error: it is what
        // the author sees between placing the box and choosing the picture. It is
        // marked `.no-print` so an unfinished object never reaches paper as a grey box.
        return (
          <div className="no-print lo-placeholder">
            <span>لم تُختَر صورة</span>
          </div>
        );
      }
      return (
        <img
          className="lo-image"
          src={image.imageUrl}
          alt={image.alt}
          style={{ objectFit: image.fit }}
        />
      );
    }

    case 'divider': {
      const divider = payload.divider;
      // Drawn as a border on a full-bleed child rather than as the box's own border,
      // so the divider sits on the frame's centre line and rotating the object turns
      // the rule rather than turning a box that happens to contain one.
      return (
        <span
          className="lo-divider"
          style={{
            borderTopWidth: `${divider.thicknessMm}mm`,
            borderTopStyle: divider.style,
          }}
        />
      );
    }

    case 'table': {
      const table = payload.table;
      return (
        <table
          className="lo-table"
          style={{
            fontFamily: letterFontStack(table.fontId),
            fontSize: `${table.sizePt}pt`,
            // A millimetre border, so the rule prints at the weight it was designed at
            // rather than at whatever one device pixel happens to be.
            ['--lo-table-border' as string]: `${table.borderMm}mm`,
          }}
        >
          <tbody>
            {Array.from({ length: table.rows }, (_, row) => (
              <tr key={row} className={table.headerRow && row === 0 ? 'is-header' : undefined}>
                {Array.from({ length: table.columns }, (_, column) => {
                  const cell = table.cells[row * table.columns + column] ?? '';
                  return table.headerRow && row === 0 ? (
                    <th key={column}>{show(cell)}</th>
                  ) : (
                    <td key={column}>{show(cell)}</td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }

    case 'qrCode': {
      const qr = payload.qr;
      if (!qr.payload) {
        return (
          <div className="no-print lo-placeholder">
            <span>رمز QR بلا محتوى</span>
          </div>
        );
      }
      // Reuses the letter's OWN barcode component — the one encoder in the engine.
      // A second QR library here would be a second answer to "how is a code drawn",
      // and the two would eventually disagree about error correction or quiet zone.
      return (
        <div className="lo-qr">
          <LetterBarcode
            payload={show(qr.payload)}
            reference={show(qr.caption)}
            sizeMm={Math.min(object.frame.widthMm, object.frame.heightMm)}
          />
        </div>
      );
    }
  }
}

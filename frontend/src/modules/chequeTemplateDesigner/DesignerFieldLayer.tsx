import { useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import AlignmentGuidesOverlay from './AlignmentGuidesOverlay';
import type { AlignmentGuide } from './alignmentGuides';
import type { DesignerField } from './designerField.types';
import type { FieldMutationApi } from './fieldGeometry';
import type { DesignerSelectionEngine } from './useDesignerSelection';
import { useDesignerDrag } from './useDesignerDrag';
import type { ResizeCorner } from './useDesignerResize';
import { useDesignerResize } from './useDesignerResize';
import { useDesignerRotation } from './useDesignerRotation';

type Props = {
  fields: DesignerField[];
  selection: DesignerSelectionEngine;
  mutation: FieldMutationApi;
  /**
   * Optional host-provided display-text resolver. Lets a host show resolved
   * values (e.g. mock runtime data for bound fields) without the layer knowing
   * any domain rules. Defaults to the field's own static `value`.
   */
  resolveText?: (field: DesignerField) => string;
  /** Optional predicate: is this field bound to a data source? Drives a subtle indicator. */
  isFieldBound?: (field: DesignerField) => boolean;
};

const RESIZE_CORNERS: ResizeCorner[] = ['tl', 'tr', 'bl', 'br'];

/**
 * Editor field layer — data-driven, plus selection, drag, resize, and
 * rotation. Iterates over the field collection and renders each visible field
 * as a positioned, sized, rotated, styled box with selection handles.
 * Extracted from the Professional module's ChequeFieldLayer.
 *
 * Owns none of the engines' state — it only wires `selection` and `mutation`
 * into Drag/Resize/Rotation, and holds the one piece of purely-rendering
 * state (`activeGuides`), cleared as soon as a gesture ends.
 */
export default function DesignerFieldLayer({ fields, selection, mutation, resolveText, isFieldBound }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [activeGuides, setActiveGuides] = useState<AlignmentGuide[]>([]);

  const drag = useDesignerDrag({
    boundaryRef: layerRef,
    fields,
    isSelected: selection.isSelected,
    mutation,
    onGuidesChange: setActiveGuides,
  });
  const resize = useDesignerResize({
    boundaryRef: layerRef,
    fields,
    mutation,
    onGuidesChange: setActiveGuides,
  });
  const rotation = useDesignerRotation({ boundaryRef: layerRef, mutation });

  return (
    <div className="ctd-field-layer" ref={layerRef}>
      {fields.filter((field) => field.visible).map((field) => {
        const isSelected = selection.isSelected(field.id);
        const displayText = resolveText ? resolveText(field) : field.value;
        const bound = isFieldBound ? isFieldBound(field) : false;
        const wrapperStyle: CSSProperties = {
          left: `${field.x}%`,
          top: `${field.y}%`,
          width: `${field.width}%`,
          height: `${field.height}%`,
          transform: `rotate(${field.rotation}deg)`,
          zIndex: field.zIndex,
        };
        const textStyle: CSSProperties = {
          fontSize: field.fontSize,
          fontWeight: field.fontWeight,
          textAlign: field.textAlign,
          color: field.color,
        };

        return (
          <div
            key={field.id}
            className={`ctd-field-wrapper${isSelected ? ' selected' : ''}`}
            style={wrapperStyle}
            onClick={(e) => { e.stopPropagation(); selection.selectField(field.id); }}
            onPointerDown={(e) => drag.handlePointerDown(e, field)}
            onPointerMove={drag.handlePointerMove}
            onPointerUp={drag.handlePointerUp}
            onPointerCancel={drag.handlePointerCancel}
          >
            <span className="ctd-field-text" style={textStyle}>{displayText}</span>
            {bound && <span className="ctd-field-binding-dot" aria-hidden="true" title="مرتبط ببيانات" />}
            {isSelected && (
              <>
                {RESIZE_CORNERS.map((corner) => (
                  <span
                    key={corner}
                    className={`ctd-field-handle handle-${corner}`}
                    onPointerDown={(e) => resize.handlePointerDown(e, field, corner)}
                    onPointerMove={resize.handlePointerMove}
                    onPointerUp={resize.handlePointerUp}
                    onPointerCancel={resize.handlePointerCancel}
                  />
                ))}
                <span className="ctd-field-rotation-line" />
                <span
                  className="ctd-field-rotation-handle"
                  onPointerDown={(e) => rotation.handlePointerDown(e, field)}
                  onPointerMove={rotation.handlePointerMove}
                  onPointerUp={rotation.handlePointerUp}
                  onPointerCancel={rotation.handlePointerCancel}
                />
              </>
            )}
          </div>
        );
      })}
      <AlignmentGuidesOverlay guides={activeGuides} />
    </div>
  );
}

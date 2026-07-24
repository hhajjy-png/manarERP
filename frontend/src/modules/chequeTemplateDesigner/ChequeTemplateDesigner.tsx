import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import DesignerSurface from './DesignerSurface';
import DesignerFieldLayer from './DesignerFieldLayer';
import PropertiesPanel from './PropertiesPanel';
import type { PropertiesPanelLabels } from './PropertiesPanel';
import { useDesignerHistory } from './useDesignerHistory';
import { useDesignerSelection } from './useDesignerSelection';
import { useDesignerKeyboard } from './useDesignerKeyboard';
import {
  duplicateField,
  deleteField,
  bringForward,
  sendBackward,
  bringToFront,
  sendToBack,
} from './fieldActions';
import type { DesignerField } from './designerField.types';
import type { DesignerSurfaceSpec } from './surface.constants';
import type { FieldMutationApi } from './fieldGeometry';
import './chequeTemplateDesigner.css';

/**
 * ChequeTemplateDesigner — the generic, self-contained WYSIWYG editor
 * (Dual Cheque Printing Modes Foundation v1).
 *
 * Composes the extracted engines (selection, history/undo, drag, resize,
 * rotation, keyboard nudge, alignment/snap/guides) with a surface, a field
 * layer, and a properties panel. It is BUSINESS-LOGIC-FREE and standalone:
 * it imports nothing from the Professional Cheque Printing module, touches no
 * API, no persistence, no printing, no calibration, and no settings. It is
 * intended to later be embedded inside Official Cheque Management as the
 * "Cheque Template" mode — a host will supply the surface spec, the initial
 * fields, and (later) wire persistence/printing around it.
 *
 * This foundation pack does NOT wire it into any route, tab, or page.
 */
export interface ChequeTemplateDesignerProps {
  /** Physical surface the design maps onto (e.g. the cheque medium). */
  surface: DesignerSurfaceSpec;
  /** The starting field collection. The designer owns edits from here on. */
  initialFields: DesignerField[];
  /** Optional background image (data URL or asset URL) drawn behind the fields. */
  backgroundSrc?: string;
  /** Notified with the current fields after each edit (never on initial mount). */
  onChange?: (fields: DesignerField[]) => void;
  /** Optional label overrides for the properties panel (host localisation). */
  labels?: Partial<PropertiesPanelLabels>;
  /** Optional host-injected properties section for the selected field (e.g. a data-source control). */
  renderFieldExtras?: (field: DesignerField, patch: (patch: Partial<DesignerField>) => void) => ReactNode;
  /** Optional display-text resolver (e.g. mock runtime values for bound fields). Defaults to the field's own value. */
  resolveText?: (field: DesignerField) => string;
  /** Optional predicate driving a subtle "bound" indicator per field. */
  isFieldBound?: (field: DesignerField) => boolean;
  /** Extra class on the root element. */
  className?: string;
}

export default function ChequeTemplateDesigner({
  surface,
  initialFields,
  backgroundSrc,
  onChange,
  labels,
  renderFieldExtras,
  resolveText,
  isFieldBound,
  className,
}: ChequeTemplateDesignerProps) {
  const history = useDesignerHistory(initialFields);
  const selection = useDesignerSelection();
  const { fields, beginChange, updateField, commit, undo, redo, canUndo, canRedo } = history;

  const mutation: FieldMutationApi = useMemo(() => ({ beginChange, updateField }), [beginChange, updateField]);
  const selectedField = fields.find((f) => f.id === selection.selectedFieldId) ?? null;
  useDesignerKeyboard({ selectedField, mutation });

  // Notify the host of GENUINE field changes only — architecturally resilient
  // to the parent's callback identity.
  //
  // The latest `onChange` is kept in a ref (updated each render), so this
  // effect never lists `onChange` in its dependency array. A parent that
  // recreates `onChange` on every render therefore can NOT retrigger the
  // notification, which is what previously caused an infinite render loop.
  //
  // The effect depends only on `fields` and fires once per real change,
  // detected by reference against `lastNotifiedFields`. That ref starts at the
  // initial `fields`, so mounting the designer is never reported as a change
  // (and StrictMode's double-invoked mount effect stays a no-op).
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastNotifiedFields = useRef(fields);
  useEffect(() => {
    if (fields === lastNotifiedFields.current) return;
    lastNotifiedFields.current = fields;
    onChangeRef.current?.(fields);
  }, [fields]);

  const selectedId = selectedField?.id ?? null;

  function handleProperty(patch: Partial<DesignerField>) {
    if (!selectedId) return;
    commit((prev) => prev.map((f) => (f.id === selectedId ? { ...f, ...patch } : f)));
  }
  function handleDuplicate() {
    if (!selectedId) return;
    commit((prev) => duplicateField(prev, selectedId).fields);
  }
  function handleDelete() {
    if (!selectedId) return;
    commit((prev) => deleteField(prev, selectedId));
  }
  function handleBringForward() {
    if (!selectedId) return;
    commit((prev) => bringForward(prev, selectedId));
  }
  function handleSendBackward() {
    if (!selectedId) return;
    commit((prev) => sendBackward(prev, selectedId));
  }
  function handleBringToFront() {
    if (!selectedId) return;
    commit((prev) => bringToFront(prev, selectedId));
  }
  function handleSendToBack() {
    if (!selectedId) return;
    commit((prev) => sendToBack(prev, selectedId));
  }

  return (
    <div className={`ctd-root${className ? ` ${className}` : ''}`}>
      <div className="ctd-toolbar">
        <button type="button" className="ctd-btn secondary" disabled={!canUndo} onClick={undo}>Undo</button>
        <button type="button" className="ctd-btn secondary" disabled={!canRedo} onClick={redo}>Redo</button>
      </div>
      <div className="ctd-layout">
        <div className="ctd-canvas">
          <DesignerSurface spec={surface} onClick={selection.clearSelection}>
            {backgroundSrc && <img src={backgroundSrc} alt="" className="ctd-surface-image" />}
            <DesignerFieldLayer fields={fields} selection={selection} mutation={mutation} resolveText={resolveText} isFieldBound={isFieldBound} />
          </DesignerSurface>
        </div>
        <PropertiesPanel
          field={selectedField}
          labels={labels}
          onPropertyChange={handleProperty}
          renderExtras={renderFieldExtras}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onBringForward={handleBringForward}
          onSendBackward={handleSendBackward}
          onBringToFront={handleBringToFront}
          onSendToBack={handleSendToBack}
        />
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import type { DesignerField, DesignerTextAlign } from './designerField.types';

/**
 * Properties Panel — the designer's single editing panel. Read-only identity
 * (ID / Label / Current Value / Visible) plus editable geometry and styling
 * (X, Y, Width, Height, Rotation, Font Size, Font Weight, Text Alignment,
 * Text Color) and per-field actions (Duplicate, Delete, Layer Ordering).
 *
 * Extracted from the Professional module's FieldInspector, with one
 * decoupling change: it does NOT depend on the app i18n. Labels default to
 * English and can be fully overridden via the `labels` prop, so a host (e.g.
 * the future Official Cheque Management embed) can localise it without this
 * generic component importing any app-specific translation keys.
 *
 * It performs no lookups and holds no state — every change goes back up
 * through `onPropertyChange` or an action callback.
 */

export interface PropertiesPanelLabels {
  title: string;
  empty: string;
  fieldId: string;
  label: string;
  value: string;
  visible: string;
  visibleYes: string;
  visibleNo: string;
  x: string;
  y: string;
  width: string;
  height: string;
  rotation: string;
  fontSize: string;
  fontWeight: string;
  weightNormal: string;
  weightSemibold: string;
  weightBold: string;
  textAlign: string;
  alignLeft: string;
  alignCenter: string;
  alignRight: string;
  color: string;
  duplicate: string;
  delete: string;
  bringForward: string;
  sendBackward: string;
  bringToFront: string;
  sendToBack: string;
}

export const DEFAULT_PROPERTIES_PANEL_LABELS: PropertiesPanelLabels = {
  title: 'Properties',
  empty: 'Select a field to edit its properties.',
  fieldId: 'Field ID',
  label: 'Label',
  value: 'Current value',
  visible: 'Visible',
  visibleYes: 'Yes',
  visibleNo: 'No',
  x: 'X (%)',
  y: 'Y (%)',
  width: 'Width (%)',
  height: 'Height (%)',
  rotation: 'Rotation (°)',
  fontSize: 'Font size',
  fontWeight: 'Font weight',
  weightNormal: 'Normal',
  weightSemibold: 'Semibold',
  weightBold: 'Bold',
  textAlign: 'Text align',
  alignLeft: 'Left',
  alignCenter: 'Center',
  alignRight: 'Right',
  color: 'Text color',
  duplicate: 'Duplicate',
  delete: 'Delete',
  bringForward: 'Bring forward',
  sendBackward: 'Send backward',
  bringToFront: 'Bring to front',
  sendToBack: 'Send to back',
};

type Props = {
  field: DesignerField | null;
  labels?: Partial<PropertiesPanelLabels>;
  onPropertyChange: (patch: Partial<DesignerField>) => void;
  /**
   * Optional host-injected section rendered under the built-in properties for
   * the selected field (e.g. a Data Source binding control). Keeps
   * domain-specific UI out of this generic panel. Receives the field and a
   * patch function that commits one undo step.
   */
  renderExtras?: (field: DesignerField, patch: (patch: Partial<DesignerField>) => void) => ReactNode;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
};

function parseNumber(raw: string, fallback: number): number {
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default function PropertiesPanel({
  field,
  labels,
  onPropertyChange,
  renderExtras,
  onDuplicate,
  onDelete,
  onBringForward,
  onSendBackward,
  onBringToFront,
  onSendToBack,
}: Props) {
  const l = { ...DEFAULT_PROPERTIES_PANEL_LABELS, ...labels };

  if (!field) {
    return (
      <div className="ctd-inspector">
        <h4>{l.title}</h4>
        <p className="ctd-inspector-empty">{l.empty}</p>
      </div>
    );
  }

  return (
    <div className="ctd-inspector">
      <h4>{l.title}</h4>
      <table className="ctd-inspector-identity">
        <tbody>
          <tr>
            <td className="ctd-inspector-key">{l.fieldId}</td>
            <td className="ctd-inspector-mono">{field.id}</td>
          </tr>
          <tr>
            <td className="ctd-inspector-key">{l.label}</td>
            <td><strong>{field.label}</strong></td>
          </tr>
          <tr>
            <td className="ctd-inspector-key">{l.value}</td>
            <td><strong>{field.value}</strong></td>
          </tr>
          <tr>
            <td className="ctd-inspector-key">{l.visible}</td>
            <td>
              <span className={`ctd-pill ${field.visible ? 'green' : 'gray'}`}>
                {field.visible ? l.visibleYes : l.visibleNo}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <div className="ctd-inspector-properties">
        <div className="ctd-form-grid">
          <div className="ctd-field">
            <label>{l.x}</label>
            <input type="number" step={0.1} value={Math.round(field.x * 10) / 10}
              onChange={(e) => onPropertyChange({ x: parseNumber(e.target.value, field.x) })} />
          </div>
          <div className="ctd-field">
            <label>{l.y}</label>
            <input type="number" step={0.1} value={Math.round(field.y * 10) / 10}
              onChange={(e) => onPropertyChange({ y: parseNumber(e.target.value, field.y) })} />
          </div>
          <div className="ctd-field">
            <label>{l.width}</label>
            <input type="number" step={0.1} value={Math.round(field.width * 10) / 10}
              onChange={(e) => onPropertyChange({ width: parseNumber(e.target.value, field.width) })} />
          </div>
          <div className="ctd-field">
            <label>{l.height}</label>
            <input type="number" step={0.1} value={Math.round(field.height * 10) / 10}
              onChange={(e) => onPropertyChange({ height: parseNumber(e.target.value, field.height) })} />
          </div>
          <div className="ctd-field">
            <label>{l.rotation}</label>
            <input type="number" step={1} value={Math.round(field.rotation)}
              onChange={(e) => onPropertyChange({ rotation: ((parseNumber(e.target.value, field.rotation) % 360) + 360) % 360 })} />
          </div>
          <div className="ctd-field">
            <label>{l.fontSize}</label>
            <input type="number" step={1} min={6} max={48} value={field.fontSize}
              onChange={(e) => onPropertyChange({ fontSize: parseNumber(e.target.value, field.fontSize) })} />
          </div>
          <div className="ctd-field">
            <label>{l.fontWeight}</label>
            <select value={field.fontWeight} onChange={(e) => onPropertyChange({ fontWeight: parseNumber(e.target.value, field.fontWeight) })}>
              <option value={400}>{l.weightNormal}</option>
              <option value={600}>{l.weightSemibold}</option>
              <option value={700}>{l.weightBold}</option>
            </select>
          </div>
          <div className="ctd-field">
            <label>{l.textAlign}</label>
            <select value={field.textAlign} onChange={(e) => onPropertyChange({ textAlign: e.target.value as DesignerTextAlign })}>
              <option value="left">{l.alignLeft}</option>
              <option value="center">{l.alignCenter}</option>
              <option value="right">{l.alignRight}</option>
            </select>
          </div>
          <div className="ctd-field">
            <label>{l.color}</label>
            <input type="color" value={field.color} onChange={(e) => onPropertyChange({ color: e.target.value })} />
          </div>
        </div>
      </div>

      {renderExtras && (
        <div className="ctd-inspector-extras">{renderExtras(field, onPropertyChange)}</div>
      )}

      <div className="ctd-inspector-actions">
        <button type="button" className="ctd-btn secondary" onClick={onDuplicate}>{l.duplicate}</button>
        <button type="button" className="ctd-btn danger" onClick={onDelete}>{l.delete}</button>
        <button type="button" className="ctd-btn secondary" onClick={onBringForward}>{l.bringForward}</button>
        <button type="button" className="ctd-btn secondary" onClick={onSendBackward}>{l.sendBackward}</button>
        <button type="button" className="ctd-btn secondary" onClick={onBringToFront}>{l.bringToFront}</button>
        <button type="button" className="ctd-btn secondary" onClick={onSendToBack}>{l.sendToBack}</button>
      </div>
    </div>
  );
}

/**
 * Cheque Template Designer — generic field model (Dual Cheque Printing Modes
 * Foundation v1).
 *
 * A DesignerField describes one positioned, styled text box on a design
 * surface. This is the business-logic-free core extracted for the future
 * "Cheque Template" printing mode. It is generalised from the Professional
 * Cheque Printing module's field model, deliberately OMITTING that module's
 * business/binding fields:
 *   - `type`       — document-specific field vocabulary
 *   - `semanticId` — runtime data-binding key (Preview Data / DB records)
 * Those are host concerns a consumer layer owns later, not the editor.
 *
 * Coordinates are percentages (0–100) of the design surface, so they are
 * resolution-independent: the editor preview and any future print output
 * scale together without recalculation. No mm/px conversion happens here.
 */

export type DesignerTextAlign = 'left' | 'center' | 'right';

export interface DesignerField {
  /** Stable identity — the key every engine (selection, drag, resize, …) matches on. */
  id: string;
  /** Human-readable name shown in the properties panel. */
  label: string;
  /** The text rendered inside the box. */
  value: string;
  /** Horizontal position, as a percentage (0–100) of the surface width. */
  x: number;
  /** Vertical position, as a percentage (0–100) of the surface height. */
  y: number;
  /** Box width, as a percentage (0–100) of the surface width. */
  width: number;
  /** Box height, as a percentage (0–100) of the surface height. */
  height: number;
  /** Rotation, in degrees clockwise, normalized to [0, 360). */
  rotation: number;
  fontSize: number;
  fontWeight: number;
  textAlign: DesignerTextAlign;
  /** Text color, as a hex string (e.g. "#000000"). */
  color: string;
  /** Stacking order — higher renders on top. Only matters when boxes overlap. */
  zIndex: number;
  /**
   * Optional opaque data-source key linking this field to external runtime
   * data. The editor treats it as an opaque string and never interprets it;
   * the host / runtime engine decides what a value means. Absent = not bound
   * (static). See the Cheque Template Runtime Engine.
   */
  binding?: string;
  visible: boolean;
}

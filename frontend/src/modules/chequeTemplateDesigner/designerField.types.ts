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
  /**
   * Opt-in line wrapping inside the field's own box.
   *
   * Cheque fields are single-line by nature (payee, date, amount) and the
   * renderer pins `white-space: nowrap` on them — wrapping is what once pushed a
   * too-long value down onto the field below. Absent/false therefore keeps that
   * behaviour for every existing template and every designer-authored field.
   *
   * A profile whose measured box is genuinely a multi-line area — the tafqeet
   * band on the Gulf Bank cheque is 16 mm tall and is meant to take a second
   * line — sets this explicitly. The number of lines is never open-ended: it is
   * whatever the field's own HEIGHT allows (`maxLinesFor`), and a value longer
   * than that still raises the blocking overflow error.
   */
  multiline?: boolean;
  /**
   * Optional INTERNAL SLOTS — sub-cells drawn inside this one field's box.
   *
   * A field with slots is still exactly ONE field: one selectable object, one
   * border, one set of handles, one x/y, one saved coordinate. The slots are
   * rendering detail INSIDE it, not fields of their own, and nothing can select,
   * drag, resize or rotate them.
   *
   * The cheque date is what this exists for. The bank's date box carries printed
   * `/` separators, so the day, the month and the year must land in three fixed
   * cells — but they are one date and are calibrated as one object. Modelling
   * them as three fields made the operator align three boxes by hand; modelling
   * them as three slots of one field makes the alignment a property of the
   * template, not of the operator's aim.
   *
   * Offsets are percentages of THIS FIELD's own box, so they scale with it and
   * are invariant under any move: moving the field moves every slot with it, by
   * construction, with no group logic anywhere.
   */
  slots?: DesignerFieldSlot[];
  visible: boolean;
}

/**
 * One sub-cell inside a field's box.
 *
 * Every slot shares its parent's vertical box and typography, so the slots of a
 * field sit on one baseline by construction — there is no per-slot y, height,
 * font size or alignment that could drift.
 */
export interface DesignerFieldSlot {
  /**
   * Stable key. It is also the data-source key the runtime engine resolves this
   * slot's text against — the same opaque-string contract as `binding`.
   */
  key: string;
  /** Left offset inside the parent box, as a percentage of the parent's width. */
  xPercent: number;
  /** Slot width, as a percentage of the parent's width. */
  widthPercent: number;
}

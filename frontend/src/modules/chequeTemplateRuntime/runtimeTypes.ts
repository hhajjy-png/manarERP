/**
 * Cheque Template Runtime Engine — types (Cheque Template Runtime Engine v1).
 *
 * The runtime engine transforms a stored cheque template + a runtime data
 * object into a fully-resolved, React-independent render model. These types
 * describe its input, output, and validation surface. No UI, no printer, no
 * dialog concepts appear here.
 */
import type { DesignerField, DesignerSurfaceSpec, DesignerTextAlign } from '../chequeTemplateDesigner';

/**
 * Stable semantic keys the runtime data object is addressed by. These are the
 * canonical, language-independent identifiers persisted as a field's `binding`
 * (never display text, never translated labels). The Data Source dropdown maps
 * Arabic labels onto these ids for display only.
 */
export type SemanticKey =
  | 'beneficiary'
  | 'chequeDate'
  | 'chequeDay'
  | 'chequeMonth'
  | 'chequeYear'
  | 'amount'
  | 'amountInWords'
  | 'chequeNumber'
  | 'bankName'
  | 'branchName'
  | 'companyName'
  | 'issueDate';

export const SEMANTIC_KEYS: readonly SemanticKey[] = [
  'beneficiary',
  'chequeDate',
  'chequeDay',
  'chequeMonth',
  'chequeYear',
  'amount',
  'amountInWords',
  'chequeNumber',
  'bankName',
  'branchName',
  'companyName',
  'issueDate',
] as const;

/**
 * The semantic keys that MUST carry real cheque data before a physical cheque may
 * be printed — the legally material face of the instrument. In print mode a field
 * bound to one of these that cannot resolve a real runtime value raises an
 * `UNRESOLVED_DATA_BINDING` error and blocks printing, instead of silently
 * falling back to the template's design-time sample text.
 *
 * Keys outside this set (bank/branch/company/cheque number, issue date) are
 * supporting text: an unresolved one falls back to the field's static value and
 * is reported as `info`, never blocking a print.
 *
 * `chequeDay` / `chequeMonth` / `chequeYear` are the SAME cheque date, split
 * into its three digit groups for cheque stock that already carries printed `/`
 * separators (Gulf Bank). A template uses either the whole `chequeDate` or the
 * three parts — never both — and either way the date is legally material, so all
 * four are required. A template that binds none of them is unaffected: the
 * requirement is only ever evaluated for a field that IS bound to the key.
 */
export const REQUIRED_PRINT_KEYS: readonly SemanticKey[] = [
  'beneficiary',
  'chequeDate',
  'chequeDay',
  'chequeMonth',
  'chequeYear',
  'amount',
  'amountInWords',
] as const;

/**
 * Semantic keys whose value is a Latin-ordered number or date and must therefore
 * keep its LOGICAL character order when rendered inside the app's RTL surfaces.
 *
 * Without isolation, the Unicode Bidi Algorithm reorders the number runs of a
 * string like `02 / 08 / 2026` in an RTL paragraph — the neutral `" / "`
 * separators take the RTL base direction (UBA W6 → N1, where European numbers
 * count as R), so the date is laid out right-to-left and READS as
 * `2026 / 08 / 02`. The renderer pins `direction: ltr; unicode-bidi: isolate` on
 * exactly these fields. Alignment is unaffected — `text-align` is physical.
 */
export const LTR_ISOLATED_KEYS: readonly SemanticKey[] = [
  'chequeDate',
  'chequeDay',
  'chequeMonth',
  'chequeYear',
  'issueDate',
  'amount',
  'chequeNumber',
] as const;

/** Placeholder runtime data. For this pack the values are mock-only. */
export type RuntimeData = Partial<Record<SemanticKey, string>>;

/** The engine's template input — structurally compatible with a stored template. */
export interface RuntimeTemplateInput {
  id?: string;
  name?: string;
  surface: DesignerSurfaceSpec;
  fields: DesignerField[];
}

// ── Validation ──────────────────────────────────────────────────────────────

export type RenderIssueSeverity = 'error' | 'warning' | 'info';

export type RenderIssueCode =
  | 'INVALID_TEMPLATE'
  | 'EMPTY_TEMPLATE'
  | 'MISSING_FIELD_PROPS'
  | 'INVALID_POSITION'
  | 'INVALID_SIZE'
  | 'INVISIBLE_FIELD'
  /**
   * PRINT MODE ONLY. A field bound to a semantic key could not resolve a real
   * runtime value. For a `REQUIRED_PRINT_KEYS` binding this is an `error`, so
   * `meta.hasErrors` becomes true and the print button is disabled; for any other
   * binding it is `info` and the static value still prints. This is the guard
   * that stops a design-time sample or mock value reaching cheque paper.
   */
  | 'UNRESOLVED_DATA_BINDING'
  /**
   * PRINT MODE ONLY. A field's resolved value cannot fit inside its own box, so
   * the renderer would have to clip it. The field box is clipped rather than
   * allowed to overlap its neighbours, but silently cropping an amount or a payee
   * on a financial instrument is unacceptable — so this is an `error`, it sets
   * `meta.hasErrors`, and it blocks printing until the template box is widened
   * (or the font reduced). Nothing is ever auto-truncated.
   */
  | 'FIELD_TEXT_OVERFLOW';

export interface RenderIssue {
  code: RenderIssueCode;
  severity: RenderIssueSeverity;
  /** The field the issue concerns, or null for template-level issues. */
  fieldId: string | null;
  message: string;
}

// ── Resolved render model ─────────────────────────────────────────────────────

export interface ResolvedGeometry {
  /** Canonical layout units — percentages of the surface. */
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  /** Physical units, derived from the surface size (convenience for future print/PDF). */
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  /** Rotation, degrees clockwise, normalized to [0, 360). */
  rotationDeg: number;
}

export interface ResolvedFont {
  sizePx: number;
  weight: number;
}

/** One fully-resolved render object. Contains everything a renderer needs — no lookups left to do. */
export interface ResolvedRenderField {
  id: string;
  /** Final rendered text (runtime value if bound, else the field's own static value). */
  text: string;
  /** The semantic key this field resolved against, or null if it is a static/layout-only field. */
  binding: SemanticKey | null;
  geometry: ResolvedGeometry;
  font: ResolvedFont;
  align: DesignerTextAlign;
  color: string;
  visible: boolean;
  zIndex: number;
  /** Carried through from the field: may the text wrap inside its own box? Default false. */
  multiline: boolean;
  /** How many wrapped lines the box holds. Always 1 for a single-line field. */
  maxLines: number;
  /**
   * Resolved INTERNAL SLOTS, or `[]` for an ordinary single-value field.
   *
   * A slotted field renders its slots INSTEAD of its own text: the field is one
   * object with one box, and the slots are fixed sub-cells inside it (the cheque
   * date's day / month / year). They share the parent's vertical box and
   * typography, so they cannot drift apart vertically, and their horizontal
   * offsets are percentages of the parent — so moving the field moves them all.
   */
  slots: ResolvedRenderSlot[];
}

/** One resolved sub-cell of a slotted field. */
export interface ResolvedRenderSlot {
  key: string;
  /** Final rendered text for this slot. */
  text: string;
  /** The semantic key it resolved against, or null when the key is not a data source. */
  binding: SemanticKey | null;
  /** Offsets inside the PARENT field's box, as percentages of that box. */
  xPercent: number;
  widthPercent: number;
}

export interface ResolvedSurface {
  widthCm: number;
  heightCm: number;
  widthMm: number;
  heightMm: number;
}

/** The engine's output — the single source future preview / print / PDF will consume. */
export interface ResolvedRenderModel {
  surface: ResolvedSurface;
  /** All resolved fields in painting order (ascending zIndex); includes invisible ones (flagged). */
  fields: ResolvedRenderField[];
  /** Convenience: only the visible fields, same order. */
  visibleFields: ResolvedRenderField[];
  issues: RenderIssue[];
  meta: {
    fieldCount: number;
    visibleCount: number;
    hasErrors: boolean;
  };
}

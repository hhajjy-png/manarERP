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
  'amount',
  'amountInWords',
  'chequeNumber',
  'bankName',
  'branchName',
  'companyName',
  'issueDate',
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
  | 'INVISIBLE_FIELD';

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

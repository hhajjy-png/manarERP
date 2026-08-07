/**
 * Letter Engine — what a validation rule is given.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CONTEXT CARRIES FACTS, NEVER CALCULATIONS.
 * ══════════════════════════════════════════════════════════════════════════
 * Geometry arrives as the registry's own `PageGeometry`, and layout arrives as the
 * paginator's own `PaginationResult` — not as pre-chewed numbers. A rule that wants a
 * band height calls `usableBandMm(geometry, pageIndex)` exactly as the paginator does,
 * so there is one implementation of every measurement in the engine and a rule can
 * never disagree with the layout it is judging.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FORM EDITOR UX REBUILD v2 — SHRUNK TO WHAT THE THREE SURVIVING RULES READ.
 * ══════════════════════════════════════════════════════════════════════════
 * The pre-rebuild shape carried status, reference, issueDate, subject, recipient,
 * resolvedVariables, unresolvedBindings, subjectLineCount, the branding selection and
 * the barcode payload — one field per rule that has since been deleted. None of the
 * three surviving rules (`E4_reservedZoneOverlap`, `E13_impossibleGeometry`,
 * `E16_objectInReservedZone`) reads any of them; each needs only geometry, content
 * (for the positioned layer) and the paginator's own layout. Carrying the rest forward
 * would have been exactly the dead capability §7 of the rebuild asks to remove.
 */

import { type PageGeometry } from '../registry/geometryRegistry';
import { type PaginationResult } from '../pagination/paginate';
import { type BlockDocument } from '../model/blockTypes';

/**
 * The inputs a rule can depend on.
 *
 * Declared per rule so the runner can re-evaluate only what a change actually
 * affects — dragging a layout object must not re-run the geometry rule, and typing in
 * the body must not re-run the layout-object rule.
 */
export type ValidationInput = 'content' | 'pagination' | 'geometry';

export const VALIDATION_INPUTS: readonly ValidationInput[] = ['content', 'pagination', 'geometry'];

/** The document under validation, as the rules see it. */
export interface LetterValidationContext {
  readonly geometry: PageGeometry;
  /** The block document — read for its positioned-object layer (`E16`). */
  readonly content: BlockDocument;
  /** The layout the paginator produced for this exact content. */
  readonly pagination: PaginationResult;
}

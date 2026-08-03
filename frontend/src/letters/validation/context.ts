/**
 * Letter Engine — what a validation rule is given.
 *
 * P0 declared this shape as `unknown`, deliberately: "binding it to a shape now would
 * force the foundation to anticipate what a measurement pass produces, and guessing
 * that is exactly the speculative design this pack avoids." The measurement pass now
 * exists, so the shape is known and is written down here.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE CONTEXT CARRIES FACTS, NEVER CALCULATIONS.
 * ══════════════════════════════════════════════════════════════════════════
 * Geometry arrives as the registry's own `PageGeometry`, and layout arrives as the
 * paginator's own `PaginationResult` — not as pre-chewed numbers. A rule that wants a
 * band height calls `usableBandMm(geometry, pageIndex)` exactly as the paginator does,
 * so there is one implementation of every measurement in the engine and a rule can
 * never disagree with the layout it is judging.
 */

import { type PageGeometry } from '../registry/geometryRegistry';
import { type DocumentTemplate } from '../registry/templateRegistry';
import { type PaginationResult } from '../pagination/paginate';
import { type BlockDocument } from '../model/blockTypes';

/**
 * The inputs a rule can depend on.
 *
 * Declared per rule so the runner can re-evaluate only what a change actually
 * affects — typing in the subject must not re-run the geometry rules.
 */
export type ValidationInput =
  | 'subject'
  | 'recipient'
  | 'issueDate'
  | 'content'
  | 'typography'
  | 'pagination'
  | 'geometry'
  | 'status';

export const VALIDATION_INPUTS: readonly ValidationInput[] = [
  'subject',
  'recipient',
  'issueDate',
  'content',
  'typography',
  'pagination',
  'geometry',
  'status',
];

/** The document under validation, as the rules see it. */
export interface LetterValidationContext {
  readonly template: DocumentTemplate;
  readonly geometry: PageGeometry;

  /** Lifecycle facts. A draft is legitimately incomplete; a registered letter is not. */
  readonly status: string;
  readonly reference: string | null;

  readonly issueDate: string;
  readonly subject: string;
  readonly recipient: {
    readonly name: string;
    readonly title: string;
    readonly organisation: string;
  };
  readonly content: BlockDocument;

  /** The layout the paginator produced for this exact content. */
  readonly pagination: PaginationResult;

  /**
   * Measured heights in millimetres, keyed by flow item id.
   *
   * Supplied rather than re-measured: the paginator already measured every item, and a
   * second measurement pass could disagree with the layout being judged.
   */
  readonly itemHeightsMm: Readonly<Record<string, number>>;

  /** Rendered line count of the subject — measured, since it depends on the font. */
  readonly subjectLineCount: number;

  /**
   * The branding selection, and whether it actually resolved to a usable image.
   *
   * Both facts are needed and they are different: an id that no longer resolves (the
   * asset was deleted or switched off in Settings) is a selection the user believes is
   * in place and is not — which is precisely what W4 exists to tell them.
   */
  readonly signatureAssetId: string | null;
  readonly stampAssetId: string | null;
  readonly signatureResolved: boolean;
  readonly stampResolved: boolean;

  /**
   * The exact payload that will be encoded, or `''` before a reference exists.
   *
   * Passed in rather than rebuilt here: the payload the validator judges must be the
   * one the renderer encodes, and for a registered letter that string comes from the
   * frozen snapshot rather than from today's field values.
   */
  readonly barcodePayload: string;

  /** Injected so date rules are deterministic in tests. */
  readonly now: Date;
}

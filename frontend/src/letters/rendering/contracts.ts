/**
 * Letter Engine — rendering contracts (INV-6, INV-7).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  INTERFACES ONLY. NO RENDERER IS IMPLEMENTED OR REGISTERED IN THIS PACK.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * INV-7: "Preview, PDF and Printing must always render from the same Document Model.
 * There must never be multiple rendering engines."
 *
 * The chain this file fixes in place:
 *
 *     Document Model  →  ONE renderer  →  ONE DOM node  →  { screen
 *                                                          | validation
 *                                                          | accurate preview
 *                                                          | print
 *                                                          | PDF }
 *
 * Every consumer hangs off the SAME node. That is not a tidiness preference — it is
 * the only arrangement in which the thing the validator measures and the thing the
 * printer emits are guaranteed to be the same thing. The moment a second renderer
 * exists, "content never enters the reserved zone" becomes a claim about one render
 * path and a hope about the others.
 *
 * THE SINGLE-RENDERER RULE IS ENFORCED AT RUNTIME, NOT DOCUMENTED
 * ──────────────────────────────────────────────────────────────
 * `registerDocumentRenderer` throws on a second call. A later pack cannot quietly add
 * a bespoke preview renderer "just for this one path" — it will fail on load, in
 * every test that exercises it.
 *
 * INV-6 shows up here too: `RenderRequest` carries the block model, never HTML, and
 * there is no inverse operation. Nothing in this contract turns a rendered node back
 * into a document, because that inverse is exactly the HTML round-trip the engine
 * forbids.
 */

import { type LetterDocument } from '../model/documentTypes';
import { type DocumentTemplate } from '../registry/templateRegistry';
import { type PrintProfileId } from '../registry/geometryRegistry';
import { type LayoutVersion } from '../versioning/versions';

/**
 * Why a render is being produced.
 *
 * A target may change what is DECORATED — the on-screen bands and rulers exist for
 * `screen` and for no other target — but never what is LAID OUT. Two targets that
 * paginate differently would be two rendering engines wearing one name.
 */
export type RenderTarget = 'screen' | 'validation' | 'accuratePreview' | 'print' | 'pdf';

export const RENDER_TARGETS: readonly RenderTarget[] = [
  'screen',
  'validation',
  'accuratePreview',
  'print',
  'pdf',
];

/** Everything a renderer needs. Note the absence of any HTML input (INV-6). */
export interface RenderRequest {
  readonly document: LetterDocument;
  readonly template: DocumentTemplate;
  /** Frozen on the document; passed explicitly so a renderer never re-derives it. */
  readonly printProfileId: PrintProfileId;
  readonly layoutVersion: LayoutVersion;
  readonly target: RenderTarget;
}

/**
 * What a renderer produced.
 *
 * `rootNode` is THE node — the one the validator measures, the one
 * `composeStyledFromNode` clones for PDF, the one the print path submits. There is
 * one, and every consumer receives this same one.
 */
export interface RenderResult {
  readonly target: RenderTarget;
  readonly pageCount: number;
  readonly rootNode: Element;
}

/** The engine's renderer. Exactly one implementation may ever be registered. */
export interface DocumentRenderer {
  /** Identifier, used only in the error raised when a second renderer is registered. */
  readonly rendererId: string;
  render(request: RenderRequest): RenderResult;
}

/* ── The single-renderer registry ───────────────────────────────────────── */

let registeredRenderer: DocumentRenderer | null = null;

/**
 * Register the engine's renderer.
 *
 * Throws if one is already registered. Not a convenience check — this is INV-7's
 * enforcement point, and the reason a second render path cannot be introduced
 * quietly.
 */
export function registerDocumentRenderer(renderer: DocumentRenderer): void {
  if (registeredRenderer !== null) {
    throw new Error(
      `[LetterEngine] A document renderer ("${registeredRenderer.rendererId}") is already ` +
        `registered; refusing to register "${renderer.rendererId}". The engine has exactly one ` +
        `renderer so that preview, print and PDF cannot diverge (INV-7).`,
    );
  }
  registeredRenderer = renderer;
}

/**
 * The registered renderer.
 *
 * Throws when none is registered — which is the state throughout P0, and correctly so:
 * no pack before P3 has anything to render, and a null-returning accessor would invite
 * a caller to silently skip rendering.
 */
export function getDocumentRenderer(): DocumentRenderer {
  if (registeredRenderer === null) {
    throw new Error(
      `[LetterEngine] No document renderer is registered. The renderer is introduced by the ` +
        `geometry pack; nothing before it can render a document.`,
    );
  }
  return registeredRenderer;
}

/** Is a renderer registered? For callers that can legitimately handle absence. */
export function hasDocumentRenderer(): boolean {
  return registeredRenderer !== null;
}

/**
 * Clear the registered renderer.
 *
 * FOR TESTS ONLY, and named so that its presence in production code is obvious in
 * review. Module-level singletons are otherwise untestable: the second test to
 * register a renderer would fail on the first test's registration.
 */
export function __resetDocumentRendererForTests(): void {
  registeredRenderer = null;
}

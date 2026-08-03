/**
 * Letter Engine — the Block Model (INV-6).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE DOCUMENT'S SOLE SOURCE OF TRUTH. HTML IS NEVER STORED, AND THERE IS NO
 *  HTML ROUND-TRIP. RENDERED OUTPUT IS GENERATED *FROM* THIS MODEL.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * WHY A BLOCK MODEL AND NOT `contenteditable` OVER THE DOCUMENT
 * ────────────────────────────────────────────────────────────
 * Four reasons, each of which would independently justify the extra work:
 *
 *  1. FORMATTING BECOMES ENUMERABLE. A block's style is a small typed record, which
 *     is what makes "clear formatting", "snapshot the typography at registration"
 *     and "reject an unregistered font id" straightforward rather than DOM archaeology.
 *
 *  2. PAGINATION BECOMES MEASURABLE PER UNIT. The paginator's unit is the block.
 *     Splitting one large editable region into printable pages means walking text
 *     nodes and measuring line boxes — considerably harder and considerably more
 *     fragile against a rule that says content must never cross a millimetre boundary.
 *
 *  3. ARABIC BIDI DAMAGE IS CONTAINED. Mixed Arabic body text with LTR numerals and
 *     Latin references inside one free editable region produces well-known cursor and
 *     selection defects. A per-block boundary limits their blast radius.
 *
 *  4. PASTE IS TRIVIALLY SANITISED. Inbound HTML maps to blocks or is rejected. With
 *     a free editable region, pasting from Word imports colours, fonts, tables and
 *     inline styles that violate the approved toolbar contract.
 *
 * WHAT THIS PACK CONTAINS: TYPES AND STRUCTURAL FACTS ONLY.
 * There are no editing commands here — no split, no merge, no mark application. Those
 * are the editor (P7). P0 ships the shape of the model, its structural constants and
 * (in `blockModelIntegrity.ts`) the means to prove a value conforms to it.
 */

import { type FontId } from '../../styles/fontRegistry';
import { type TextAlignment } from '../registry/typographyPresets';

/**
 * Version of the block model's own shape, stored with every document.
 *
 * Distinct from the three engine version axes: those describe rules for rendering a
 * document, this describes the document's serialised structure. It exists from day
 * one so that a later change to the model is an explicit migration decision rather
 * than a silent coercion of stored drafts.
 */
export const CONTENT_MODEL_VERSION = 1;

/**
 * Inline marks. Exactly two, and the pair is closed.
 *
 * Italic is absent by registry evidence, not by taste — see
 * `PROHIBITED_TOOLBAR_COMMANDS`. Colour and highlight are absent because official
 * letters are black on pre-printed stock.
 */
export type InlineMark = 'bold' | 'underline';

export const INLINE_MARKS: readonly InlineMark[] = ['bold', 'underline'];

/**
 * A run of text sharing the same marks. The smallest addressable unit of content.
 *
 * `text` is plain text. It is never HTML, never a markup fragment, and is never
 * parsed — it is rendered as a text node.
 */
export interface InlineSpan {
  readonly text: string;
  readonly marks: readonly InlineMark[];
}

/**
 * Kinds of block.
 *
 * `pageBreak` is declared here in P0 although no editor can insert one until P7's
 * second phase. That is deliberate: the paginator (P4) must honour manual breaks, and
 * a stored document containing one must round-trip. Adding the kind later would
 * change the serialised shape and force a `CONTENT_MODEL_VERSION` bump for documents
 * already in the field — which INV-14 exists to avoid.
 */
export type BlockKind = 'paragraph' | 'listItem' | 'pageBreak';

export const BLOCK_KINDS: readonly BlockKind[] = ['paragraph', 'listItem', 'pageBreak'];

/** List rendering style. Present only on a `listItem`. */
export type ListType = 'numbered' | 'bulleted';

export const LIST_TYPES: readonly ListType[] = ['numbered', 'bulleted'];

/**
 * Deepest indent a block may reach. Two levels, capped hard.
 *
 * Level 0 is flush with the measure. A deeper hierarchy than two is not something an
 * official letter expresses, and every level is a horizontal measurement the
 * paginator must model.
 */
export const MAX_INDENT_LEVEL = 2;

/**
 * A block's own formatting. Applies to the WHOLE block, never to part of it.
 *
 * The asymmetry against inline marks is the model's central editorial decision:
 * marks apply to a character range, attributes apply to a whole block. A paragraph
 * carrying three fonts is not an official letter, and making that unrepresentable
 * removes an entire class of pagination surprise.
 */
export interface BlockAttributes {
  /** Registry id. Never a family name (INV-5). */
  readonly fontId: FontId;
  /** Points. Must be a rung of the editor's size ladder. */
  readonly sizePt: number;
  readonly alignment: TextAlignment;
  /** 0 … MAX_INDENT_LEVEL. */
  readonly indentLevel: number;
  /** Present if and only if `kind === 'listItem'`. */
  readonly listType?: ListType;
}

/**
 * One block of document content.
 *
 * `id` is supplied by the caller and is stable for the block's lifetime — the
 * paginator caches measurements against it, and the editor's undo stack addresses
 * blocks by it. P0 deliberately provides no id generator: minting ids is the editor's
 * concern, and a generator here would be an unused dependency with a global.
 */
export interface Block {
  readonly id: string;
  readonly kind: BlockKind;
  /** Empty for a `pageBreak`; the content runs for every other kind. */
  readonly spans: readonly InlineSpan[];
  readonly attributes: BlockAttributes;
}

/**
 * The complete editable content of a document.
 *
 * This is what is persisted, and it is JSON — no HTML, no markup string, no
 * serialised DOM.
 */
export interface BlockDocument {
  readonly contentModelVersion: number;
  readonly blocks: readonly Block[];
}

/* ── Type guards ────────────────────────────────────────────────────────── */

export function isInlineMark(value: unknown): value is InlineMark {
  return typeof value === 'string' && (INLINE_MARKS as readonly string[]).includes(value);
}

export function isBlockKind(value: unknown): value is BlockKind {
  return typeof value === 'string' && (BLOCK_KINDS as readonly string[]).includes(value);
}

export function isListType(value: unknown): value is ListType {
  return typeof value === 'string' && (LIST_TYPES as readonly string[]).includes(value);
}

/** Does this block carry text? `pageBreak` does not. */
export function isTextBlock(block: Block): boolean {
  return block.kind === 'paragraph' || block.kind === 'listItem';
}

/* ── Construction helpers ───────────────────────────────────────────────────
   Structural only. These build a well-formed value; they do not EDIT one. */

/** A span of unmarked text. */
export function createSpan(text: string, marks: readonly InlineMark[] = []): InlineSpan {
  return { text, marks };
}

/**
 * A block, with the caller supplying both the id and the attributes.
 *
 * Attributes are required rather than defaulted: a default here would silently decide
 * a document's typography, and typography is the template's decision (see
 * `registry/typographyPresets`), never this module's.
 */
export function createBlock(
  id: string,
  kind: BlockKind,
  spans: readonly InlineSpan[],
  attributes: BlockAttributes,
): Block {
  return { id, kind, spans, attributes };
}

/** An empty document with no blocks at all. */
export function createEmptyBlockDocument(): BlockDocument {
  return { contentModelVersion: CONTENT_MODEL_VERSION, blocks: [] };
}

/** A document containing a single empty paragraph — the editor's starting state. */
export function createInitialBlockDocument(
  firstBlockId: string,
  attributes: BlockAttributes,
): BlockDocument {
  return {
    contentModelVersion: CONTENT_MODEL_VERSION,
    blocks: [createBlock(firstBlockId, 'paragraph', [createSpan('')], attributes)],
  };
}

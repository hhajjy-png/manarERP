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
import { type DocumentLayout } from './layoutTypes';
import { type Condition } from '../variables/conditions';

/**
 * Version of the block model's own shape, stored with every document.
 *
 * Distinct from the three engine version axes: those describe rules for rendering a
 * document, this describes the document's serialised structure. It exists from day
 * one so that a later change to the model is an explicit migration decision rather
 * than a silent coercion of stored drafts.
 */
/**
 * ── VERSION 2 — Document Studio Foundation v1 ────────────────────────────
 * Version 2 is a PURELY ADDITIVE widening of version 1:
 *
 *   · three new inline marks   (highlight, superscript, subscript)
 *   · one new block kind       (heading)
 *   · seven new OPTIONAL block attributes
 *
 * Nothing was removed, narrowed or renamed, so every version-1 document is already a
 * structurally valid version-2 document. The migration in
 * `blockCommands.parseDocument` therefore re-stamps the version and changes not one
 * byte of content — which is what makes it safe to run on stored drafts.
 *
 * Every new attribute is optional, and every reader treats `undefined` as "the
 * engine's historical behaviour". That is deliberate: a required field with a default
 * would make an untouched v1 paragraph and a deliberately-reset v2 paragraph
 * indistinguishable in storage.
 *
 * ── VERSION 3 — Document Layout Designer v1 ─────────────────────────────
 * Additive again, and for the same reason: version 3 adds ONE optional field,
 * `layout`, carrying the positioned-object layer (see `model/layoutTypes`). A
 * version-2 document has no layout layer, which is indistinguishable from a version-3
 * document whose author placed no objects — so the migration is a re-stamp for the
 * second time, and a version-1 document still arrives at the same place through it.
 *
 * The layer lives INSIDE `contentJson` deliberately. That column is a free-form string
 * the backend stores verbatim and never parses, so the entire designer needs no
 * schema change, no migration and no new endpoint — and the document stays ONE value
 * that saves, loads and versions atomically. A second column would have made it
 * possible to save a layout whose blocks did not arrive.
 *
 * ── VERSION 4 — Professional Document Automation v1 ─────────────────────
 * Additive for the third time: an optional `condition` on a block's attributes, and an
 * optional `bindings` field on the document carrying which employee, contract and
 * project its variables resolve against. Nothing removed, nothing narrowed — so the
 * migration is a re-stamp again, and a version-1 draft still arrives here in one step.
 *
 * Variable TOKENS need no model change at all: they are ordinary characters in
 * ordinary block text (`{{Employee}}`), and substitution happens on the way to the
 * screen and the paper, never on the way to storage. See `variables/variableSyntax`.
 */
export const CONTENT_MODEL_VERSION = 4;

/** Versions of the model this build can read. Older ones are migrated, never coerced. */
export const SUPPORTED_CONTENT_MODEL_VERSIONS: readonly number[] = [1, 2, 3, 4];

/**
 * Inline marks. Five, and the set is closed.
 *
 * Italic is still absent by registry evidence, not by taste — no approved Arabic face
 * ships one, so the browser would synthesise a slant. Colour is still absent because
 * official letters are black on pre-printed stock.
 *
 * `highlight` joined in v2 and is rendered as a NEUTRAL GREY WASH rather than a hue,
 * so the black-on-stock rule survives the addition intact. `superscript` and
 * `subscript` joined with it; both are whole-paragraph marks like the rest, so a
 * paragraph is raised or lowered entirely or not at all.
 */
export type InlineMark = 'bold' | 'underline' | 'highlight' | 'superscript' | 'subscript';

export const INLINE_MARKS: readonly InlineMark[] = [
  'bold',
  'underline',
  'highlight',
  'superscript',
  'subscript',
];

/**
 * Marks that cannot coexist on the same block.
 *
 * Raised and lowered text is a contradiction rather than a combination, and letting
 * both sit in the array would leave the renderer to pick a winner silently.
 * `toggleBlockMark` drops the opposite member when one is applied.
 */
export const MUTUALLY_EXCLUSIVE_MARKS: readonly (readonly [InlineMark, InlineMark])[] = [
  ['superscript', 'subscript'],
];

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
export type BlockKind = 'paragraph' | 'listItem' | 'heading' | 'pageBreak';

export const BLOCK_KINDS: readonly BlockKind[] = ['paragraph', 'listItem', 'heading', 'pageBreak'];

/**
 * Heading depth. Six levels, matching the six the Document Studio toolbar offers.
 *
 * A heading is a BLOCK KIND rather than a font size, so the document outline can be
 * derived from structure instead of guessed from typography — which is the whole
 * reason a "Heading 1" that is merely 22 pt bold is not good enough.
 */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export const HEADING_LEVELS: readonly HeadingLevel[] = [1, 2, 3, 4, 5, 6];

export function isHeadingLevel(value: unknown): value is HeadingLevel {
  return typeof value === 'number' && (HEADING_LEVELS as readonly number[]).includes(value);
}

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

  /* ── Version 2 additions. Every one optional; see CONTENT_MODEL_VERSION ──
     `undefined` means "the engine's historical behaviour", never "zero" — the two
     are different facts and storing them identically would lose one of them. */

  /** Present if and only if `kind === 'heading'`. */
  readonly headingLevel?: HeadingLevel;
  /**
   * The named paragraph style this block was last set from, for the toolbar to
   * reflect. Presentational bookkeeping: the concrete type is always in the
   * attributes themselves, so a style id this build no longer knows changes nothing
   * about how the block renders.
   */
  readonly paragraphStyleId?: string;
  /** As `paragraphStyleId`, for the named character style. */
  readonly characterStyleId?: string;
  /** Multiplier. A rung of `LINE_HEIGHT_LADDER`; `undefined` = the renderer's default. */
  readonly lineHeight?: number;
  /** Space after the block, in points. A rung of `PARAGRAPH_SPACING_LADDER_PT`. */
  readonly paragraphSpacingPt?: number;
  /** Tracking, in points. A rung of `LETTER_SPACING_LADDER_PT`. Never negative. */
  readonly letterSpacingPt?: number;
  /**
   * First-line indent, in millimetres. Mutually exclusive with `hangingIndentMm` —
   * a paragraph cannot both push and pull its first line, and
   * `setBlockIndentation` clears one when the other is set.
   */
  readonly firstLineIndentMm?: number;
  /** Hanging indent, in millimetres. Mutually exclusive with `firstLineIndentMm`. */
  readonly hangingIndentMm?: number;

  /**
   * Version 4: the block renders only when this evaluates true.
   *
   * Absent means "always". A block whose condition is false is not rendered, not
   * measured and not paginated — it is as if it were not in the document, which is the
   * only reading that keeps the page count honest. See `variables/conditions` for why
   * every broken condition resolves to `true` rather than hiding content.
   */
  readonly condition?: Condition;
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
  /**
   * The positioned-object layer (version 3).
   *
   * Optional: absent means the author placed no objects, which is the state of every
   * letter written before this pack and of most letters written after it. Absent and
   * empty are treated identically by every reader, so nothing has to decide which one
   * a document "really" is.
   */
  readonly layout?: DocumentLayout;
  /**
   * Which records this letter's variables resolve against (version 4).
   *
   * A BINDING IS DOCUMENT CONTENT, exactly as the recipient's name is — "this letter
   * is about employee 42" is a fact the letter asserts. Storing it here rather than as
   * a foreign key on the `Letter` table is what lets the whole variables engine ship
   * with no schema change, and it keeps the letter one value that saves, undoes and
   * versions atomically.
   */
  readonly bindings?: DocumentBindings;
}

/**
 * The records a letter's variables read from.
 *
 * Ids only, never copies of the records. Values are resolved live while the letter is
 * a draft and frozen into the registration snapshot when it is issued — see
 * `variables/variableResolver` for why both halves are necessary.
 */
export interface DocumentBindings {
  readonly employeeId?: number | null;
  readonly contractId?: number | null;
  readonly projectId?: number | null;
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
  return block.kind === 'paragraph' || block.kind === 'listItem' || block.kind === 'heading';
}

/** Is this a heading, and therefore an outline entry? */
export function isHeadingBlock(block: Block): boolean {
  return block.kind === 'heading';
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

/**
 * Letter Engine — paragraph operations on the Block Model.
 *
 * PURE. No React, no DOM, no ids minted here, no clock. Every function takes a
 * document and returns a NEW one, which is what lets the composer's undo stack be a
 * plain array of documents and lets all of this be tested without rendering anything.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE COMPOSER'S INVARIANT: ONE SPAN PER BLOCK.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * The Block Model allows a block to hold several spans, each with its own marks —
 * that is the shape a future pack may need. THIS EDITOR NEVER PRODUCES ONE. Formatting
 * applies to a whole paragraph, so a paragraph carries exactly one span and its marks
 * describe the entire paragraph.
 *
 * That is not a simplification for its own sake. It is the rule that makes partial-word
 * formatting and mixed fonts inside one paragraph UNREPRESENTABLE rather than merely
 * discouraged:
 *
 *   · Mixed fonts are already impossible — `fontId` is a BLOCK attribute, so a
 *     paragraph has one font by construction.
 *   · Partial-word bold would need a second span. Every operation below collapses to
 *     one span, so there is no code path that can create the second.
 *
 * `normaliseToSingleSpan` is applied on the way in as well as on the way out, so a
 * document written by some other tool is brought to the invariant rather than being
 * quietly half-honoured.
 */

import {
  type Block,
  type BlockAttributes,
  type BlockDocument,
  type BlockKind,
  type InlineMark,
  type ListType,
  CONTENT_MODEL_VERSION,
  MAX_INDENT_LEVEL,
  MUTUALLY_EXCLUSIVE_MARKS,
  SUPPORTED_CONTENT_MODEL_VERSIONS,
  createBlock,
  createSpan,
} from '../model/blockTypes';
import {
  type CharacterStyle,
  type ParagraphStyle,
  paragraphStyleAttributes,
} from '../registry/documentStyles';
// INV-4: the Geometry Registry is the single home of a millimetre, including the one
// that means "no indent". A bare `0` here would be a numeric millimetre in an editor
// command, which is exactly what `noHardcodedGeometry.test.ts` forbids.
import { NO_INDENT_MM } from '../registry/geometryRegistry';
import { type DocumentLayout, EMPTY_LAYOUT } from '../model/layoutTypes';
import { type DocumentBindings } from '../model/blockTypes';
import { type Condition, conditionVariables, evaluateCondition } from '../variables/conditions';
import { type ResolvedVariables } from '../variables/variableResolver';
import { tokenNames } from '../variables/variableSyntax';

/* ── Reading ────────────────────────────────────────────────────────────── */

/** A block's whole text. Joins spans, so it is correct even for a foreign document. */
export function blockText(block: Block): string {
  return block.spans.map((s) => s.text).join('');
}

/**
 * The marks covering a whole block.
 *
 * A mark counts only if EVERY non-empty span carries it — a paragraph is bold when all
 * of it is bold, which is the only reading consistent with paragraph-level formatting.
 * An empty paragraph reports the marks of its single empty span, so typing into a
 * freshly-bolded blank line stays bold.
 */
export function blockMarks(block: Block): InlineMark[] {
  if (block.spans.length === 0) return [];
  const meaningful = block.spans.filter((s) => s.text.length > 0);
  const considered = meaningful.length > 0 ? meaningful : block.spans;
  const [first, ...rest] = considered;
  return first.marks.filter((mark) => rest.every((s) => s.marks.includes(mark)));
}

export function blockHasMark(block: Block, mark: InlineMark): boolean {
  return blockMarks(block).includes(mark);
}

export function findBlock(document: BlockDocument, blockId: string): Block | undefined {
  return document.blocks.find((b) => b.id === blockId);
}

export function blockIndex(document: BlockDocument, blockId: string): number {
  return document.blocks.findIndex((b) => b.id === blockId);
}

/** Plain text of the whole document, one line per block. */
export function documentText(document: BlockDocument): string {
  return document.blocks.map(blockText).join('\n');
}

/** Is there nothing but whitespace in the entire document? */
export function isDocumentEmpty(document: BlockDocument): boolean {
  return documentText(document).trim().length === 0;
}

/* ── The invariant ──────────────────────────────────────────────────────── */

/**
 * Collapse a block to exactly one span, preserving text and the marks that covered
 * all of it. Applied on load and after every edit.
 */
export function normaliseToSingleSpan(block: Block): Block {
  const text = blockText(block);
  const marks = blockMarks(block);
  if (block.spans.length === 1 && block.spans[0].text === text) return block;
  return { ...block, spans: [createSpan(text, marks)] };
}

/** Bring a whole document to the composer's invariant. */
export function normaliseDocument(document: BlockDocument): BlockDocument {
  return { ...document, blocks: document.blocks.map(normaliseToSingleSpan) };
}

/* ── Writing ────────────────────────────────────────────────────────────── */

function replaceBlock(document: BlockDocument, blockId: string, next: Block): BlockDocument {
  const index = blockIndex(document, blockId);
  if (index < 0) return document;
  const blocks = [...document.blocks];
  blocks[index] = normaliseToSingleSpan(next);
  return { ...document, blocks };
}

/** Replace a paragraph's text, keeping its formatting. */
export function setBlockText(document: BlockDocument, blockId: string, text: string): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;
  return replaceBlock(document, blockId, { ...block, spans: [createSpan(text, blockMarks(block))] });
}

/**
 * Change a paragraph's attributes.
 *
 * `indentLevel` is clamped rather than rejected: a toolbar that lets the user press
 * "indent" once more than allowed should stop, not throw.
 */
export function setBlockAttributes(
  document: BlockDocument,
  blockId: string,
  patch: Partial<BlockAttributes>,
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;

  const merged: BlockAttributes = { ...block.attributes, ...patch };
  const clamped: BlockAttributes = {
    ...merged,
    indentLevel: Math.min(MAX_INDENT_LEVEL, Math.max(0, Math.round(merged.indentLevel))),
  };
  return replaceBlock(document, blockId, { ...block, attributes: clamped });
}

/** Apply attributes to every block — the section-wide form of the same operation. */
export function setAllBlockAttributes(
  document: BlockDocument,
  patch: Partial<BlockAttributes>,
): BlockDocument {
  return document.blocks.reduce((doc, block) => setBlockAttributes(doc, block.id, patch), document);
}

/**
 * Toggle a mark across a WHOLE paragraph.
 *
 * There is no character range parameter, and that absence is the feature: an editor
 * that cannot express "bold these three letters" cannot produce it by accident.
 */
export function toggleBlockMark(document: BlockDocument, blockId: string, mark: InlineMark): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;

  const marks = blockMarks(block);
  const next = marks.includes(mark)
    ? marks.filter((m) => m !== mark)
    : [...marks.filter((m) => !conflictsWith(mark, m)), mark];
  return replaceBlock(document, blockId, { ...block, spans: [createSpan(blockText(block), next)] });
}

/**
 * Do these two marks contradict each other?
 *
 * Applying superscript to a subscripted paragraph REPLACES it rather than stacking, so
 * the impossible pair never reaches the model. Enforcing it here as well as in the
 * integrity checker is deliberate: the checker catches a foreign document, this stops
 * the editor authoring one.
 */
function conflictsWith(mark: InlineMark, other: InlineMark): boolean {
  return MUTUALLY_EXCLUSIVE_MARKS.some(
    ([a, b]) => (a === mark && b === other) || (b === mark && a === other),
  );
}

/** Replace a block's marks outright — the whole-paragraph form of a character style. */
export function setBlockMarks(
  document: BlockDocument,
  blockId: string,
  marks: readonly InlineMark[],
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;
  return replaceBlock(document, blockId, {
    ...block,
    spans: [createSpan(blockText(block), [...marks])],
  });
}

/**
 * Strip every mark and return the paragraph to the supplied default attributes.
 *
 * Returns the block to `paragraph` as well: a heading is a formatting decision in this
 * model, so "clear formatting" that left a Heading 2 behind would have cleared
 * everything except the most conspicuous thing on the line. The defaults object is
 * spread verbatim, so every version-2 attribute the caller omits is dropped rather
 * than zeroed — the block returns to "the engine's historical behaviour", which is
 * what `undefined` means throughout the model.
 */
export function clearBlockFormatting(
  document: BlockDocument,
  blockId: string,
  defaults: BlockAttributes,
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;
  return replaceBlock(document, blockId, {
    ...block,
    kind: block.kind === 'pageBreak' ? block.kind : 'paragraph',
    spans: [createSpan(blockText(block), [])],
    attributes: defaults,
  });
}

/* ── Block kind ─────────────────────────────────────────────────────────── */

/**
 * Change a block's kind, keeping the attribute invariants intact.
 *
 * `headingLevel` and `listType` are each valid on exactly one kind, so switching kinds
 * has to add or drop them. Doing it here — rather than leaving every caller to
 * remember — is what stops a paragraph carrying a stale heading level that the
 * document outline would then list as a heading.
 */
export function setBlockKind(
  document: BlockDocument,
  blockId: string,
  kind: BlockKind,
  extra: { readonly headingLevel?: BlockAttributes['headingLevel']; readonly listType?: ListType } = {},
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;

  const rest: BlockAttributes = { ...block.attributes };
  // Deleted rather than set to `undefined`: the integrity checker asks whether the key
  // is PRESENT, so an explicit `undefined` would still read as "declared".
  delete (rest as { headingLevel?: unknown }).headingLevel;
  delete (rest as { listType?: unknown }).listType;

  const attributes: BlockAttributes = {
    ...rest,
    ...(kind === 'heading' ? { headingLevel: extra.headingLevel ?? 1 } : {}),
    ...(kind === 'listItem' ? { listType: extra.listType ?? 'bulleted' } : {}),
  };

  return replaceBlock(document, blockId, { ...block, kind, attributes });
}

/**
 * Turn a list item on or off.
 *
 * Toggling the SAME list type returns the block to a paragraph, which is how every
 * word processor's list buttons behave — pressing "bulleted" on a bulleted line means
 * "stop being a list", not "be a list harder".
 */
export function toggleListType(
  document: BlockDocument,
  blockId: string,
  listType: ListType,
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;
  const isSame = block.kind === 'listItem' && block.attributes.listType === listType;
  return isSame
    ? setBlockKind(document, blockId, 'paragraph')
    : setBlockKind(document, blockId, 'listItem', { listType });
}

/* ── Named styles ───────────────────────────────────────────────────────── */

/**
 * Apply a named paragraph style.
 *
 * The style writes a patch of ORDINARY attributes plus a kind — nothing downstream
 * learns that styles exist (see `registry/documentStyles`). Applying Body or Quote
 * also clears any heading level, because `setBlockKind` owns that invariant.
 */
export function applyParagraphStyle(
  document: BlockDocument,
  blockId: string,
  style: ParagraphStyle,
): BlockDocument {
  const withKind = setBlockKind(document, blockId, style.kind, { headingLevel: style.headingLevel });
  const styled = setBlockAttributes(withKind, blockId, paragraphStyleAttributes(style));

  // Weight is carried by the `bold` MARK rather than by an attribute of its own.
  //
  // The model has exactly one way to say "heavier", and adding a second would let a
  // paragraph be bold by mark and light by attribute at the same time. Routing a
  // style's weight through the mark also keeps the Bold button honest: a Heading 1
  // reports as bold, because it is.
  const block = findBlock(styled, blockId);
  if (!block) return styled;

  const marks = blockMarks(block);
  const wantsBold = style.weight >= 700;
  if (wantsBold === marks.includes('bold')) return styled;

  return setBlockMarks(
    styled,
    blockId,
    wantsBold ? [...marks, 'bold'] : marks.filter((mark) => mark !== 'bold'),
  );
}

/**
 * Apply a named character style — a whole-paragraph mark set, per the registry's note
 * on why a character RANGE is unrepresentable in this engine.
 */
export function applyCharacterStyle(
  document: BlockDocument,
  blockId: string,
  style: CharacterStyle,
): BlockDocument {
  const marked = setBlockMarks(document, blockId, style.marks as readonly InlineMark[]);
  return setBlockAttributes(marked, blockId, { characterStyleId: style.id });
}

/* ── Indentation ────────────────────────────────────────────────────────── */

/**
 * Set the first-line or hanging indent, enforcing that only one can be non-zero.
 *
 * A paragraph cannot both push and pull its first line. Rather than rejecting the
 * contradiction, setting one CLEARS the other — the user asked for the new one, and an
 * error message about a field they did not touch would be the wrong answer to that.
 */
export function setBlockIndentation(
  document: BlockDocument,
  blockId: string,
  patch: { readonly firstLineIndentMm?: number; readonly hangingIndentMm?: number },
): BlockDocument {
  // Only the OPPOSITE key is cleared, and only when the new value is non-zero. Setting
  // an indent to zero is "I want no first-line indent", not "also discard my hanging
  // indent" — clearing unconditionally would silently undo a choice the user kept.
  if (patch.firstLineIndentMm !== undefined) {
    return setBlockAttributes(document, blockId, {
      firstLineIndentMm: patch.firstLineIndentMm,
      ...(patch.firstLineIndentMm > NO_INDENT_MM ? { hangingIndentMm: NO_INDENT_MM } : {}),
    });
  }
  if (patch.hangingIndentMm !== undefined) {
    return setBlockAttributes(document, blockId, {
      hangingIndentMm: patch.hangingIndentMm,
      ...(patch.hangingIndentMm > NO_INDENT_MM ? { firstLineIndentMm: NO_INDENT_MM } : {}),
    });
  }
  return document;
}

/** Step the block indent one level in or out. Clamped by `setBlockAttributes`. */
export function stepBlockIndent(
  document: BlockDocument,
  blockId: string,
  direction: 'in' | 'out',
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;
  const next = block.attributes.indentLevel + (direction === 'in' ? 1 : -1);
  return setBlockAttributes(document, blockId, { indentLevel: next });
}

/* ── Format painter ─────────────────────────────────────────────────────── */

/**
 * A copied format: everything about how a block looks, and nothing about what it says.
 *
 * Deliberately a separate type rather than a `Block`: carrying the text would make it
 * possible to paste content by accident through a formatting tool, and carrying the id
 * would make it possible to paste a block onto itself.
 */
export interface BlockFormat {
  readonly kind: BlockKind;
  readonly attributes: BlockAttributes;
  readonly marks: readonly InlineMark[];
}

/** Lift a block's format. Pure — the source document is untouched and unread after. */
export function copyBlockFormat(block: Block): BlockFormat {
  return { kind: block.kind, attributes: block.attributes, marks: blockMarks(block) };
}

/**
 * Paint a copied format onto another block.
 *
 * A `pageBreak` is never repainted: it has no typography, and giving it some would
 * produce a block the integrity checker rejects for carrying spans it must not have.
 */
export function applyBlockFormat(
  document: BlockDocument,
  blockId: string,
  format: BlockFormat,
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block || block.kind === 'pageBreak' || format.kind === 'pageBreak') return document;

  return replaceBlock(document, blockId, {
    ...block,
    kind: format.kind,
    spans: [createSpan(blockText(block), [...format.marks])],
    attributes: format.attributes,
  });
}

/**
 * Insert a new empty paragraph after another, inheriting its formatting.
 *
 * Inheritance is deliberate: pressing Enter mid-letter should continue in the same
 * type, not drop back to a default the user did not choose.
 */
export function insertParagraphAfter(
  document: BlockDocument,
  afterBlockId: string,
  newBlockId: string,
  attributes?: BlockAttributes,
): BlockDocument {
  const index = blockIndex(document, afterBlockId);
  if (index < 0) return document;

  const inherited = attributes ?? document.blocks[index].attributes;
  const blocks = [...document.blocks];
  blocks.splice(index + 1, 0, createBlock(newBlockId, 'paragraph', [createSpan('')], inherited));
  return { ...document, blocks };
}

/** Append an empty paragraph at the end. */
export function appendParagraph(
  document: BlockDocument,
  newBlockId: string,
  attributes: BlockAttributes,
): BlockDocument {
  return {
    ...document,
    blocks: [...document.blocks, createBlock(newBlockId, 'paragraph', [createSpan('')], attributes)],
  };
}

/**
 * Split a paragraph at a caret offset — Enter pressed mid-text.
 *
 * The tail keeps the head's formatting, because the two halves were one paragraph a
 * moment ago and the user did not ask for a style change.
 */
export function splitParagraph(
  document: BlockDocument,
  blockId: string,
  offset: number,
  newBlockId: string,
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;

  const text = blockText(block);
  const cut = Math.min(Math.max(0, offset), text.length);
  const marks = blockMarks(block);

  const head: Block = { ...block, spans: [createSpan(text.slice(0, cut), marks)] };
  const tail = createBlock(newBlockId, 'paragraph', [createSpan(text.slice(cut), marks)], block.attributes);

  const index = blockIndex(document, blockId);
  const blocks = [...document.blocks];
  blocks.splice(index, 1, head, tail);
  return { ...document, blocks };
}

/**
 * Merge a paragraph into the one before it — Backspace at offset 0.
 *
 * Returns the caret offset the composer should restore to, which is the length of the
 * previous paragraph before the merge. Without it the caret would jump to the start or
 * the end of the joined text instead of staying where the seam is.
 */
export function mergeWithPrevious(
  document: BlockDocument,
  blockId: string,
): { document: BlockDocument; focusBlockId: string; caretOffset: number } | null {
  const index = blockIndex(document, blockId);
  if (index <= 0) return null;

  const previous = document.blocks[index - 1];
  const current = document.blocks[index];
  const caretOffset = blockText(previous).length;

  const merged: Block = {
    ...previous,
    spans: [createSpan(blockText(previous) + blockText(current), blockMarks(previous))],
  };

  const blocks = [...document.blocks];
  blocks.splice(index - 1, 2, merged);
  return { document: { ...document, blocks }, focusBlockId: previous.id, caretOffset };
}

/**
 * Remove a paragraph.
 *
 * A document is never left with zero paragraphs — there would be nothing to type into
 * and no attributes to inherit from. Removing the last one clears it instead.
 */
export function removeBlock(document: BlockDocument, blockId: string): BlockDocument {
  if (document.blocks.length <= 1) {
    const only = document.blocks[0];
    return only ? replaceBlock(document, only.id, { ...only, spans: [createSpan('')] }) : document;
  }
  return { ...document, blocks: document.blocks.filter((b) => b.id !== blockId) };
}

/** Move a paragraph one position up or down. A no-op at either end. */
export function moveBlock(document: BlockDocument, blockId: string, direction: 'up' | 'down'): BlockDocument {
  const index = blockIndex(document, blockId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= document.blocks.length) return document;

  const blocks = [...document.blocks];
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return { ...document, blocks };
}

/* ── Variables and conditions ─────────────────────────────────────────────
   The seam between the block model and the automation layer. Nothing in
   `letters/variables/` imports a block, and nothing here parses a token — these three
   functions are the whole boundary. */

/** Every variable name the document's text mentions, in first-seen order. */
export function documentVariableNames(document: BlockDocument): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  const add = (text: string) => {
    for (const name of tokenNames(text)) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  };

  for (const block of document.blocks) {
    add(blockText(block));
    // A condition's variables count as used: a letter whose only mention of
    // `{{Salary}}` is a condition still depends on it, and validation must say so.
    for (const name of conditionVariables(block.attributes.condition)) {
      if (seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }

  for (const object of document.layout?.objects ?? []) {
    if (object.payload.kind === 'textBlock') add(object.payload.text.text);
    if (object.payload.kind === 'table') object.payload.table.cells.forEach(add);
    if (object.payload.kind === 'qrCode') add(object.payload.qr.payload);
  }

  return names;
}

/**
 * The blocks that actually render, after conditions are evaluated.
 *
 * Used by the composer AND by the measurement mirror, which is what keeps a hidden
 * block out of the page count as well as off the page. A conditional block that was
 * measured but not painted would leave a gap the paginator had reserved for nothing.
 */
export function visibleBlocks(document: BlockDocument, resolved: ResolvedVariables): Block[] {
  return document.blocks.filter((block) => evaluateCondition(block.attributes.condition, resolved));
}

/** Set or clear a block's condition. `undefined` removes it. */
export function setBlockCondition(
  document: BlockDocument,
  blockId: string,
  condition: Condition | undefined,
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;

  const attributes: BlockAttributes = { ...block.attributes };
  // Deleted rather than set to `undefined`: the integrity checker asks whether the key
  // is PRESENT, and an explicit `undefined` would still read as "declared".
  if (condition === undefined) delete (attributes as { condition?: unknown }).condition;
  else (attributes as { condition?: Condition }).condition = condition;

  return replaceBlock(document, blockId, { ...block, attributes });
}

/** Replace the document's variable bindings. */
export function setDocumentBindings(document: BlockDocument, bindings: DocumentBindings): BlockDocument {
  const empty = !bindings.employeeId && !bindings.contractId && !bindings.projectId;
  if (empty) {
    // Dropped when empty, for the same reason an empty layout is: a letter that binds
    // nothing must serialise identically to one written before bindings existed.
    const { bindings: _dropped, ...rest } = document;
    return rest;
  }
  return { ...document, bindings };
}

/* ── The layout layer ─────────────────────────────────────────────────────
   The positioned-object layer rides INSIDE the document so the two save, load, undo
   and version as one value — see `CONTENT_MODEL_VERSION`. These two functions are the
   whole seam between the block commands and the layout commands; nothing in
   `letters/layout/` imports a block, and nothing here reaches into an object. */

/** The document's layout layer, or the empty one. Absent and empty are the same. */
export function documentLayout(document: BlockDocument): DocumentLayout {
  return document.layout ?? EMPTY_LAYOUT;
}

/**
 * Replace the layout layer.
 *
 * An EMPTY layout is dropped rather than stored, so a document that has never carried
 * an object serialises byte-identically to one written before this pack. That keeps
 * "the author placed nothing" and "this letter predates the designer" the same value,
 * which is what makes the version-3 migration a re-stamp.
 */
export function setDocumentLayout(document: BlockDocument, layout: DocumentLayout): BlockDocument {
  const empty =
    layout.objects.length === 0 && layout.groups.length === 0 && layout.guides.length === 0;

  if (empty) {
    const { layout: _dropped, ...rest } = document;
    return rest;
  }
  return { ...document, layout };
}

/* ── Serialisation ──────────────────────────────────────────────────────────
   JSON in, JSON out. There is no HTML on either side, and no inverse that turns
   rendered output back into a document — that inverse IS the HTML round-trip the
   engine forbids. */

/** Serialise for storage. */
export function serialiseDocument(document: BlockDocument): string {
  return JSON.stringify(normaliseDocument(document));
}

/**
 * Migrate a stored document to the current content-model version.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  VERSION 1 → 2 CHANGES NOT ONE BYTE OF CONTENT.
 * ══════════════════════════════════════════════════════════════════════════
 * Version 2 widened the model and removed nothing (see `CONTENT_MODEL_VERSION`): three
 * additional marks, one additional block kind, seven OPTIONAL attributes. A version-1
 * document is therefore already a structurally valid version-2 document, and the
 * migration is a re-stamp.
 *
 * That is not a shortcut taken to avoid writing a migration — it is the property the
 * version-2 design was chosen FOR. Had any new attribute been required, every stored
 * draft would need a value invented for it, and an invented value is indistinguishable
 * from one the author chose. Optional-with-`undefined`-meaning-historical-behaviour is
 * what makes the upgrade lossless in both directions of reading.
 *
 * Returns `null` for a version this build does not know, rather than coercing it —
 * coercion would re-render a document under rules it was never written for, which is
 * exactly what INV-9 exists to prevent.
 */
export function migrateDocument(parsed: BlockDocument): BlockDocument | null {
  const version = parsed.contentModelVersion;
  if (!SUPPORTED_CONTENT_MODEL_VERSIONS.includes(version)) return null;
  if (version === CONTENT_MODEL_VERSION) return parsed;

  // Two historical versions now, and BOTH are re-stamps — version 2 widened the model
  // with optional attributes, version 3 added the optional layout layer. A version-1
  // document therefore passes straight through to 3 without an intermediate shape,
  // which is only correct BECAUSE every step was additive. The moment a step is not,
  // this becomes a real chain and each hop has to run in order.
  return { ...parsed, contentModelVersion: CONTENT_MODEL_VERSION };
}

/**
 * Parse a stored document.
 *
 * Returns `null` for anything unreadable rather than throwing or guessing: the caller
 * knows what to do with an unreadable draft (start a fresh one and say so), and this
 * module does not.
 *
 * A document written under a SUPPORTED older version is migrated rather than rejected.
 * Before that was true, bumping the version would have made every stored draft parse
 * as `null` — and the composer's load path treats `null` as "start a fresh document",
 * so the bump alone would have silently emptied every letter in the system.
 */
export function parseDocument(stored: string | null | undefined): BlockDocument | null {
  if (!stored || stored.trim() === '') return null;
  try {
    const parsed = JSON.parse(stored) as BlockDocument;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.blocks)) return null;
    const migrated = migrateDocument(parsed);
    if (!migrated) return null;
    return normaliseDocument(migrated);
  } catch {
    return null;
  }
}

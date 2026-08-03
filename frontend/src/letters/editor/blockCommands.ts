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
  type InlineMark,
  CONTENT_MODEL_VERSION,
  MAX_INDENT_LEVEL,
  createBlock,
  createSpan,
} from '../model/blockTypes';

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
  const next = marks.includes(mark) ? marks.filter((m) => m !== mark) : [...marks, mark];
  return replaceBlock(document, blockId, { ...block, spans: [createSpan(blockText(block), next)] });
}

/** Strip every mark and return the paragraph to the supplied default attributes. */
export function clearBlockFormatting(
  document: BlockDocument,
  blockId: string,
  defaults: BlockAttributes,
): BlockDocument {
  const block = findBlock(document, blockId);
  if (!block) return document;
  return replaceBlock(document, blockId, {
    ...block,
    spans: [createSpan(blockText(block), [])],
    attributes: defaults,
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

/* ── Serialisation ──────────────────────────────────────────────────────────
   JSON in, JSON out. There is no HTML on either side, and no inverse that turns
   rendered output back into a document — that inverse IS the HTML round-trip the
   engine forbids. */

/** Serialise for storage. */
export function serialiseDocument(document: BlockDocument): string {
  return JSON.stringify(normaliseDocument(document));
}

/**
 * Parse a stored document.
 *
 * Returns `null` for anything unreadable rather than throwing or guessing: the caller
 * knows what to do with an unreadable draft (start a fresh one and say so), and this
 * module does not.
 */
export function parseDocument(stored: string | null | undefined): BlockDocument | null {
  if (!stored || stored.trim() === '') return null;
  try {
    const parsed = JSON.parse(stored) as BlockDocument;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.blocks)) return null;
    if (parsed.contentModelVersion !== CONTENT_MODEL_VERSION) return null;
    return normaliseDocument(parsed);
  } catch {
    return null;
  }
}

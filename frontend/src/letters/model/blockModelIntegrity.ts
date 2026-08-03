/**
 * Letter Engine — Block Model integrity checking (INV-5, INV-6).
 *
 * WHAT THIS IS
 * ────────────
 * A pure, DOM-free check that a value is a STRUCTURALLY VALID block document. It
 * answers "is this a well-formed model?" — not "is this a publishable letter?". The
 * latter is the validation engine's job (P4) and runs against rendered geometry;
 * this runs against the data alone.
 *
 * The two are deliberately separate. Structural integrity is an invariant of every
 * document at every moment, including an empty draft nobody could publish. Publishing
 * rules are per-template and per-status. Merging them would mean an empty draft could
 * not be saved.
 *
 * WHY IT RETURNS A LIST RATHER THAN A BOOLEAN
 * ───────────────────────────────────────────
 * The callers that matter are load paths handling data that may predate the current
 * build. "Invalid" is not actionable; "block 4 references font id `foo`, which the
 * registry does not resolve" is. A boolean would force every caller to re-derive the
 * reason it already computed.
 */

import { findFont } from '../../styles/fontRegistry';
import { FONT_SIZE_LADDER_PT, TEXT_ALIGNMENTS } from '../registry/typographyPresets';
import {
  type Block,
  type BlockDocument,
  CONTENT_MODEL_VERSION,
  MAX_INDENT_LEVEL,
  isBlockKind,
  isInlineMark,
  isListType,
} from './blockTypes';

/** One structural defect, with enough context to locate it. */
export interface BlockModelDefect {
  /** Index of the offending block, or `null` for a document-level defect. */
  readonly blockIndex: number | null;
  readonly blockId: string | null;
  readonly message: string;
}

/**
 * Every structural defect in a block document, in document order.
 *
 * An empty array means the value conforms. The check is total — it does not stop at
 * the first defect, because a load path reporting one problem at a time turns a
 * single bad migration into a dozen round trips.
 */
export function validateBlockDocument(document: BlockDocument): BlockModelDefect[] {
  const defects: BlockModelDefect[] = [];

  if (document.contentModelVersion !== CONTENT_MODEL_VERSION) {
    defects.push({
      blockIndex: null,
      blockId: null,
      message:
        `Content model version ${document.contentModelVersion} is not the version this build ` +
        `understands (${CONTENT_MODEL_VERSION}). It must be migrated explicitly, never coerced.`,
    });
  }

  if (!Array.isArray(document.blocks)) {
    defects.push({ blockIndex: null, blockId: null, message: '`blocks` must be an array.' });
    return defects;
  }

  const seenIds = new Set<string>();

  document.blocks.forEach((block, index) => {
    defects.push(...validateBlock(block, index, seenIds));
  });

  return defects;
}

/** Convenience predicate over `validateBlockDocument`. */
export function isValidBlockDocument(document: BlockDocument): boolean {
  return validateBlockDocument(document).length === 0;
}

/**
 * Throwing form, for callers that genuinely cannot proceed — a renderer handed a
 * malformed model, for instance, where continuing would produce a page nobody can
 * account for.
 */
export function assertValidBlockDocument(document: BlockDocument): void {
  const defects = validateBlockDocument(document);
  if (defects.length === 0) return;
  const detail = defects
    .map((d) => (d.blockIndex === null ? `document: ${d.message}` : `block ${d.blockIndex}: ${d.message}`))
    .join('; ');
  throw new Error(`[LetterEngine] Invalid block document — ${detail}`);
}

/* ── Per-block checks ───────────────────────────────────────────────────── */

function validateBlock(block: Block, index: number, seenIds: Set<string>): BlockModelDefect[] {
  const defects: BlockModelDefect[] = [];
  const id = typeof block?.id === 'string' ? block.id : null;
  const at = (message: string): BlockModelDefect => ({ blockIndex: index, blockId: id, message });

  if (!block || typeof block !== 'object') {
    return [at('Block is not an object.')];
  }

  /* Identity — ids must be present and unique, because the paginator caches
     measurements against them and the undo stack addresses blocks by them. */
  if (typeof block.id !== 'string' || block.id.length === 0) {
    defects.push(at('Block id must be a non-empty string.'));
  } else if (seenIds.has(block.id)) {
    defects.push(at(`Duplicate block id "${block.id}".`));
  } else {
    seenIds.add(block.id);
  }

  if (!isBlockKind(block.kind)) {
    defects.push(at(`Unknown block kind "${String(block.kind)}".`));
  }

  /* Spans. A page break carries none; every other kind carries an array — possibly
     containing a single empty span, which is how an empty paragraph is represented. */
  if (!Array.isArray(block.spans)) {
    defects.push(at('`spans` must be an array.'));
  } else if (block.kind === 'pageBreak' && block.spans.length > 0) {
    defects.push(at('A pageBreak block must carry no spans.'));
  } else {
    block.spans.forEach((span, spanIndex) => {
      if (typeof span?.text !== 'string') {
        defects.push(at(`Span ${spanIndex} has a non-string \`text\`.`));
      }
      if (!Array.isArray(span?.marks)) {
        defects.push(at(`Span ${spanIndex} has a non-array \`marks\`.`));
      } else {
        for (const mark of span.marks) {
          if (!isInlineMark(mark)) {
            defects.push(at(`Span ${spanIndex} carries unknown mark "${String(mark)}".`));
          }
        }
        if (new Set(span.marks).size !== span.marks.length) {
          defects.push(at(`Span ${spanIndex} repeats a mark.`));
        }
      }
    });
  }

  defects.push(...validateAttributes(block, at));

  return defects;
}

function validateAttributes(
  block: Block,
  at: (message: string) => BlockModelDefect,
): BlockModelDefect[] {
  const defects: BlockModelDefect[] = [];
  const attributes = block.attributes;

  if (!attributes || typeof attributes !== 'object') {
    return [at('Block attributes are missing.')];
  }

  /* INV-5 — a font id that the registry cannot resolve is a structural defect, not a
     rendering fallback. `findFont` is used rather than direct indexing precisely
     because a stored `"constructor"` would otherwise reach the prototype chain. */
  if (!findFont(attributes.fontId)) {
    defects.push(at(`Font id "${String(attributes.fontId)}" is not in the Font Registry.`));
  }

  if (typeof attributes.sizePt !== 'number' || !FONT_SIZE_LADDER_PT.includes(attributes.sizePt)) {
    defects.push(
      at(
        `Size ${String(attributes.sizePt)} pt is not a rung of the editor's ladder ` +
          `(${FONT_SIZE_LADDER_PT.join(', ')}).`,
      ),
    );
  }

  if (!(TEXT_ALIGNMENTS as readonly string[]).includes(attributes.alignment)) {
    defects.push(at(`Unknown alignment "${String(attributes.alignment)}".`));
  }

  if (
    typeof attributes.indentLevel !== 'number' ||
    !Number.isInteger(attributes.indentLevel) ||
    attributes.indentLevel < 0 ||
    attributes.indentLevel > MAX_INDENT_LEVEL
  ) {
    defects.push(
      at(`Indent level ${String(attributes.indentLevel)} is outside 0…${MAX_INDENT_LEVEL}.`),
    );
  }

  /* `listType` present exactly when the block is a list item — the structural
     invariant that keeps the single block shape honest about its three kinds. */
  const hasListType = attributes.listType !== undefined;
  if (block.kind === 'listItem') {
    if (!hasListType) {
      defects.push(at('A listItem block must declare `listType`.'));
    } else if (!isListType(attributes.listType)) {
      defects.push(at(`Unknown list type "${String(attributes.listType)}".`));
    }
  } else if (hasListType) {
    defects.push(at(`Only a listItem block may declare \`listType\` (kind is "${block.kind}").`));
  }

  return defects;
}

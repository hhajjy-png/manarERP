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
  isLadderFirstLineIndentMm,
  isLadderHangingIndentMm,
  isLadderLetterSpacingPt,
  isLadderLineHeight,
  isLadderParagraphSpacingPt,
} from '../registry/toolbarCommands';
import {
  type Block,
  type BlockDocument,
  CONTENT_MODEL_VERSION,
  MAX_INDENT_LEVEL,
  MUTUALLY_EXCLUSIVE_MARKS,
  isBlockKind,
  isHeadingLevel,
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
        /* Raised AND lowered is a contradiction, not a combination. Caught here so a
           document written by some other tool cannot leave the renderer to pick a
           winner silently. */
        for (const [a, b] of MUTUALLY_EXCLUSIVE_MARKS) {
          if (span.marks.includes(a) && span.marks.includes(b)) {
            defects.push(at(`Span ${spanIndex} carries both "${a}" and "${b}", which cannot coexist.`));
          }
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
     invariant that keeps the single block shape honest about its kinds. */
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

  /* `headingLevel` present exactly when the block is a heading — the same invariant,
     applied to the kind version 2 added. Without it a paragraph could carry a level
     the outline would then list as a heading it is not. */
  const hasHeadingLevel = attributes.headingLevel !== undefined;
  if (block.kind === 'heading') {
    if (!hasHeadingLevel) {
      defects.push(at('A heading block must declare `headingLevel`.'));
    } else if (!isHeadingLevel(attributes.headingLevel)) {
      defects.push(at(`Heading level ${String(attributes.headingLevel)} is outside 1…6.`));
    }
  } else if (hasHeadingLevel) {
    defects.push(at(`Only a heading block may declare \`headingLevel\` (kind is "${block.kind}").`));
  }

  defects.push(...validateVersion2Attributes(attributes, at));

  return defects;
}

/**
 * The optional attributes version 2 added.
 *
 * Each is checked ONLY when present. `undefined` means "the engine's historical
 * behaviour" and is always valid — including on a version-1 document that has just been
 * migrated, which is precisely why the migration needs to change no content.
 *
 * Every one is checked against its LADDER rather than against a numeric range. That is
 * the structural half of lifting the four spacing prohibitions: an off-ladder value is
 * a defect the load path reports, not a number the renderer quietly accepts.
 */
function validateVersion2Attributes(
  attributes: Block['attributes'],
  at: (message: string) => BlockModelDefect,
): BlockModelDefect[] {
  const defects: BlockModelDefect[] = [];

  const ladders: readonly {
    readonly key: 'lineHeight' | 'paragraphSpacingPt' | 'letterSpacingPt' | 'firstLineIndentMm' | 'hangingIndentMm';
    readonly isRung: (value: number) => boolean;
    readonly what: string;
  }[] = [
    { key: 'lineHeight', isRung: isLadderLineHeight, what: "the line-height ladder" },
    { key: 'paragraphSpacingPt', isRung: isLadderParagraphSpacingPt, what: 'the paragraph-spacing ladder (pt)' },
    { key: 'letterSpacingPt', isRung: isLadderLetterSpacingPt, what: 'the letter-spacing ladder (pt)' },
    { key: 'firstLineIndentMm', isRung: isLadderFirstLineIndentMm, what: 'the first-line-indent ladder (mm)' },
    { key: 'hangingIndentMm', isRung: isLadderHangingIndentMm, what: 'the hanging-indent ladder (mm)' },
  ];

  for (const { key, isRung, what } of ladders) {
    const value = attributes[key];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !isRung(value)) {
      defects.push(at(`\`${key}\` ${String(value)} is not a rung of ${what}.`));
    }
  }

  /* A paragraph cannot both push and pull its first line. Both at zero is not a
     contradiction — it is two explicit "none"s — so only non-zero pairs are a defect. */
  if ((attributes.firstLineIndentMm ?? 0) > 0 && (attributes.hangingIndentMm ?? 0) > 0) {
    defects.push(
      at('`firstLineIndentMm` and `hangingIndentMm` are mutually exclusive; only one may be non-zero.'),
    );
  }

  /* Style ids are presentational bookkeeping and are NOT validated against the style
     registry. An id this build no longer declares degrades to "custom" in the picker
     and changes nothing about how the block renders — so rejecting it would fail a
     document over a label. */
  for (const key of ['paragraphStyleId', 'characterStyleId'] as const) {
    const value = attributes[key];
    if (value !== undefined && typeof value !== 'string') {
      defects.push(at(`\`${key}\` must be a string when present.`));
    }
  }

  return defects;
}

/**
 * Letter Engine — paragraph operations.
 *
 * These are pure functions, so this suite is the real specification of the composer's
 * editing behaviour: what a keystroke, an Enter, a Backspace and a formatting command
 * do to the document, tested without rendering anything.
 *
 * The invariant under test throughout is ONE SPAN PER BLOCK. Every assertion that
 * checks span count is checking that partial-word formatting and mixed fonts inside a
 * paragraph remain unrepresentable rather than merely unimplemented.
 */
import { describe, it, expect } from 'vitest';
import {
  type Block,
  type BlockAttributes,
  type BlockDocument,
  CONTENT_MODEL_VERSION,
  MAX_INDENT_LEVEL,
  createBlock,
  createSpan,
} from '../../letters/model/blockTypes';
import { isValidBlockDocument } from '../../letters/model/blockModelIntegrity';
import {
  appendParagraph,
  blockHasMark,
  blockMarks,
  blockText,
  clearBlockFormatting,
  documentText,
  findBlock,
  insertParagraphAfter,
  isDocumentEmpty,
  mergeWithPrevious,
  moveBlock,
  normaliseDocument,
  normaliseToSingleSpan,
  parseDocument,
  removeBlock,
  serialiseDocument,
  setAllBlockAttributes,
  setBlockAttributes,
  setBlockText,
  splitParagraph,
  toggleBlockMark,
} from '../../letters/editor/blockCommands';

const BODY: BlockAttributes = {
  fontId: 'traditionalArabic',
  sizePt: 16,
  alignment: 'justify',
  indentLevel: 0,
};

function para(id: string, text: string, marks: ('bold' | 'underline')[] = [], attrs: BlockAttributes = BODY): Block {
  return createBlock(id, 'paragraph', [createSpan(text, marks)], attrs);
}

function doc(blocks: Block[]): BlockDocument {
  return { contentModelVersion: CONTENT_MODEL_VERSION, blocks };
}

/** Every block in the document holds exactly one span. */
function spanCounts(document: BlockDocument): number[] {
  return document.blocks.map((b) => b.spans.length);
}

describe('Reading', () => {
  it('reads a block’s text and a document’s text', () => {
    const d = doc([para('a', 'السطر الأول'), para('b', 'السطر الثاني')]);
    expect(blockText(d.blocks[0])).toBe('السطر الأول');
    expect(documentText(d)).toBe('السطر الأول\nالسطر الثاني');
  });

  it('reports a whitespace-only document as empty', () => {
    expect(isDocumentEmpty(doc([para('a', ''), para('b', '   \n ')]))).toBe(true);
    expect(isDocumentEmpty(doc([para('a', 'نص')]))).toBe(false);
  });

  it('a mark counts only when it covers the WHOLE paragraph', () => {
    // A foreign document could carry mixed spans; the composer treats "bold" as a
    // property of the paragraph, so a partially-bold paragraph is not bold.
    const mixed = createBlock('a', 'paragraph', [createSpan('عريض', ['bold']), createSpan('عادي')], BODY);
    expect(blockMarks(mixed)).toEqual([]);

    const allBold = createBlock('b', 'paragraph', [createSpan('عريض', ['bold']), createSpan('أيضًا', ['bold'])], BODY);
    expect(blockHasMark(allBold, 'bold')).toBe(true);
  });

  it('ignores empty spans when deciding a paragraph’s marks', () => {
    const block = createBlock('a', 'paragraph', [createSpan('', []), createSpan('نص', ['bold'])], BODY);
    expect(blockHasMark(block, 'bold')).toBe(true);
  });

  it('an empty paragraph keeps its marks, so typing continues bold', () => {
    expect(blockHasMark(para('a', '', ['bold']), 'bold')).toBe(true);
  });
});

describe('THE INVARIANT — one span per block', () => {
  it('collapses a multi-span block, preserving text and covering marks', () => {
    const mixed = createBlock('a', 'paragraph', [createSpan('أ', ['bold']), createSpan('ب', ['bold'])], BODY);
    const normalised = normaliseToSingleSpan(mixed);
    expect(normalised.spans).toHaveLength(1);
    expect(normalised.spans[0].text).toBe('أب');
    expect(normalised.spans[0].marks).toEqual(['bold']);
  });

  it('drops marks that did not cover the whole paragraph', () => {
    const mixed = createBlock('a', 'paragraph', [createSpan('أ', ['bold']), createSpan('ب')], BODY);
    expect(normaliseToSingleSpan(mixed).spans[0].marks).toEqual([]);
  });

  it('normalises a whole foreign document on the way in', () => {
    const foreign = doc([
      createBlock('a', 'paragraph', [createSpan('x', ['bold']), createSpan('y')], BODY),
      createBlock('b', 'paragraph', [createSpan('p'), createSpan('q')], BODY),
    ]);
    expect(spanCounts(normaliseDocument(foreign))).toEqual([1, 1]);
  });

  it('EVERY command leaves one span per block', () => {
    // The property that makes partial-word formatting unreachable: there is no code
    // path in this module that can produce a second span.
    let d = doc([para('a', 'أول'), para('b', 'ثانٍ')]);
    d = setBlockText(d, 'a', 'محدَّث');
    d = toggleBlockMark(d, 'a', 'bold');
    d = toggleBlockMark(d, 'a', 'underline');
    d = setBlockAttributes(d, 'a', { alignment: 'center' });
    d = insertParagraphAfter(d, 'a', 'c');
    d = splitParagraph(d, 'b', 2, 'e');
    d = clearBlockFormatting(d, 'a', BODY);
    expect(spanCounts(d).every((n) => n === 1)).toBe(true);
  });

  it('produces documents the model validator accepts', () => {
    let d = doc([para('a', 'نص')]);
    d = toggleBlockMark(d, 'a', 'bold');
    d = insertParagraphAfter(d, 'a', 'b');
    d = setBlockAttributes(d, 'b', { sizePt: 18 });
    expect(isValidBlockDocument(d)).toBe(true);
  });
});

describe('Typing', () => {
  it('replaces a paragraph’s text and keeps its formatting', () => {
    const d = setBlockText(doc([para('a', 'قديم', ['bold'])]), 'a', 'جديد');
    expect(blockText(d.blocks[0])).toBe('جديد');
    expect(blockHasMark(d.blocks[0], 'bold')).toBe(true);
  });

  it('returns the document untouched for an unknown block', () => {
    const d = doc([para('a', 'نص')]);
    expect(setBlockText(d, 'nope', 'x')).toBe(d);
  });

  it('does not mutate the original document', () => {
    const original = doc([para('a', 'نص')]);
    const next = setBlockText(original, 'a', 'آخر');
    expect(blockText(original.blocks[0])).toBe('نص');
    expect(next).not.toBe(original);
  });
});

describe('Formatting applies to a WHOLE paragraph', () => {
  it('toggles a mark on and off across the paragraph', () => {
    let d = doc([para('a', 'نص')]);
    d = toggleBlockMark(d, 'a', 'bold');
    expect(blockHasMark(d.blocks[0], 'bold')).toBe(true);
    d = toggleBlockMark(d, 'a', 'bold');
    expect(blockHasMark(d.blocks[0], 'bold')).toBe(false);
  });

  it('takes no character range — there is no parameter for one', () => {
    // The signature itself is the guarantee: (document, blockId, mark).
    expect(toggleBlockMark.length).toBe(3);
  });

  it('carries both marks at once', () => {
    let d = doc([para('a', 'نص')]);
    d = toggleBlockMark(d, 'a', 'bold');
    d = toggleBlockMark(d, 'a', 'underline');
    expect(blockMarks(d.blocks[0]).sort()).toEqual(['bold', 'underline']);
  });

  it('changes font and size for the paragraph, never for part of it', () => {
    const d = setBlockAttributes(doc([para('a', 'نص')]), 'a', { fontId: 'amiri', sizePt: 18 });
    expect(d.blocks[0].attributes.fontId).toBe('amiri');
    expect(d.blocks[0].attributes.sizePt).toBe(18);
    expect(d.blocks[0].spans).toHaveLength(1);
  });

  it('clamps indent rather than throwing', () => {
    expect(setBlockAttributes(doc([para('a', 'x')]), 'a', { indentLevel: 9 }).blocks[0].attributes.indentLevel).toBe(MAX_INDENT_LEVEL);
    expect(setBlockAttributes(doc([para('a', 'x')]), 'a', { indentLevel: -4 }).blocks[0].attributes.indentLevel).toBe(0);
  });

  it('applies attributes across every paragraph in one go', () => {
    const d = setAllBlockAttributes(doc([para('a', 'x'), para('b', 'y')]), { alignment: 'center' });
    expect(d.blocks.map((b) => b.attributes.alignment)).toEqual(['center', 'center']);
  });

  it('clear formatting strips marks and restores the template defaults', () => {
    let d = doc([para('a', 'نص', ['bold', 'underline'], { ...BODY, fontId: 'amiri', sizePt: 22, alignment: 'center' })]);
    d = clearBlockFormatting(d, 'a', BODY);
    expect(blockMarks(d.blocks[0])).toEqual([]);
    expect(d.blocks[0].attributes).toEqual(BODY);
    expect(blockText(d.blocks[0])).toBe('نص');
  });
});

describe('Enter — creating and splitting paragraphs', () => {
  it('inserts an empty paragraph after another, inheriting its formatting', () => {
    const styled = { ...BODY, fontId: 'amiri' as const, sizePt: 18, alignment: 'center' as const };
    const d = insertParagraphAfter(doc([para('a', 'عنوان', [], styled)]), 'a', 'b');
    expect(d.blocks.map((b) => b.id)).toEqual(['a', 'b']);
    expect(blockText(d.blocks[1])).toBe('');
    // Continuing mid-letter must not drop back to a default the user did not choose.
    expect(d.blocks[1].attributes).toEqual(styled);
  });

  it('splits a paragraph at the caret, both halves keeping the formatting', () => {
    const d = splitParagraph(doc([para('a', 'الأولالثاني', ['bold'])]), 'a', 5, 'b');
    expect(blockText(d.blocks[0])).toBe('الأول');
    expect(blockText(d.blocks[1])).toBe('الثاني');
    expect(blockHasMark(d.blocks[0], 'bold')).toBe(true);
    expect(blockHasMark(d.blocks[1], 'bold')).toBe(true);
  });

  it('clamps an out-of-range caret instead of losing text', () => {
    const at0 = splitParagraph(doc([para('a', 'نص')]), 'a', -5, 'b');
    expect([blockText(at0.blocks[0]), blockText(at0.blocks[1])]).toEqual(['', 'نص']);

    const atEnd = splitParagraph(doc([para('a', 'نص')]), 'a', 99, 'b');
    expect([blockText(atEnd.blocks[0]), blockText(atEnd.blocks[1])]).toEqual(['نص', '']);
  });

  it('appends a paragraph at the end', () => {
    const d = appendParagraph(doc([para('a', 'x')]), 'b', BODY);
    expect(d.blocks).toHaveLength(2);
    expect(blockText(d.blocks[1])).toBe('');
  });
});

describe('Backspace at the start — merging', () => {
  it('joins a paragraph into the previous one and reports the seam', () => {
    const result = mergeWithPrevious(doc([para('a', 'الأول'), para('b', 'الثاني')]), 'b');
    expect(result).not.toBeNull();
    expect(blockText(result!.document.blocks[0])).toBe('الأولالثاني');
    expect(result!.document.blocks).toHaveLength(1);
    expect(result!.focusBlockId).toBe('a');
    // The caret belongs at the seam — not at the start or the end of the joined text.
    expect(result!.caretOffset).toBe('الأول'.length);
  });

  it('keeps the PREVIOUS paragraph’s formatting', () => {
    const result = mergeWithPrevious(
      doc([para('a', 'أول', ['bold']), para('b', 'ثانٍ', ['underline'])]),
      'b',
    );
    expect(blockMarks(result!.document.blocks[0])).toEqual(['bold']);
  });

  it('does nothing at the first paragraph', () => {
    expect(mergeWithPrevious(doc([para('a', 'x')]), 'a')).toBeNull();
  });
});

describe('Removing and moving', () => {
  it('removes a paragraph', () => {
    const d = removeBlock(doc([para('a', 'x'), para('b', 'y')]), 'a');
    expect(d.blocks.map((b) => b.id)).toEqual(['b']);
  });

  it('never leaves the document with zero paragraphs — it clears the last one', () => {
    // There would be nothing to type into and no attributes to inherit from.
    const d = removeBlock(doc([para('a', 'x')]), 'a');
    expect(d.blocks).toHaveLength(1);
    expect(blockText(d.blocks[0])).toBe('');
  });

  it('moves a paragraph up and down, and stops at the ends', () => {
    const start = doc([para('a', '1'), para('b', '2'), para('c', '3')]);
    expect(moveBlock(start, 'b', 'up').blocks.map((b) => b.id)).toEqual(['b', 'a', 'c']);
    expect(moveBlock(start, 'b', 'down').blocks.map((b) => b.id)).toEqual(['a', 'c', 'b']);
    expect(moveBlock(start, 'a', 'up').blocks.map((b) => b.id)).toEqual(['a', 'b', 'c']);
    expect(moveBlock(start, 'c', 'down').blocks.map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('Serialisation is JSON, never HTML', () => {
  it('round-trips a document unchanged', () => {
    const original = doc([para('a', 'نص', ['bold']), para('b', 'آخر', [], { ...BODY, sizePt: 18 })]);
    const restored = parseDocument(serialiseDocument(original));
    expect(restored).toEqual(normaliseDocument(original));
  });

  it('emits no markup', () => {
    const serialised = serialiseDocument(doc([para('a', 'نص', ['bold'])]));
    for (const forbidden of ['<p', '<span', '<b>', '<strong', '</', 'innerHTML']) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it('keeps angle brackets in the text as content, never as markup', () => {
    const restored = parseDocument(serialiseDocument(doc([para('a', 'القيمة < 5 و > 1')])));
    expect(blockText(restored!.blocks[0])).toBe('القيمة < 5 و > 1');
  });

  it('normalises on the way out as well as on the way in', () => {
    const foreign = doc([createBlock('a', 'paragraph', [createSpan('أ'), createSpan('ب')], BODY)]);
    expect(JSON.parse(serialiseDocument(foreign)).blocks[0].spans).toHaveLength(1);
  });

  it('returns null for absent, blank or unreadable content', () => {
    // A draft with corrupt content is still a draft the user can rewrite — the caller
    // decides that, not this module.
    expect(parseDocument(null)).toBeNull();
    expect(parseDocument('')).toBeNull();
    expect(parseDocument('   ')).toBeNull();
    expect(parseDocument('{not json')).toBeNull();
    expect(parseDocument('[]')).toBeNull();
    expect(parseDocument('{"blocks":"nope"}')).toBeNull();
  });

  it('refuses a content model version this build does not understand', () => {
    expect(parseDocument(JSON.stringify({ contentModelVersion: 99, blocks: [] }))).toBeNull();
  });
});

describe('Purity', () => {
  it('no command mutates its input', () => {
    const original = doc([para('a', 'نص'), para('b', 'آخر')]);
    const snapshot = JSON.stringify(original);

    toggleBlockMark(original, 'a', 'bold');
    setBlockAttributes(original, 'a', { sizePt: 22 });
    insertParagraphAfter(original, 'a', 'c');
    splitParagraph(original, 'a', 1, 'd');
    mergeWithPrevious(original, 'b');
    removeBlock(original, 'a');
    moveBlock(original, 'a', 'down');
    clearBlockFormatting(original, 'a', BODY);

    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('history can be a plain array of documents', () => {
    // The payoff for purity: undo needs no special machinery.
    const v0 = doc([para('a', '')]);
    const v1 = setBlockText(v0, 'a', 'أ');
    const v2 = toggleBlockMark(v1, 'a', 'bold');
    const history = [v0, v1, v2];

    expect(blockText(history[0].blocks[0])).toBe('');
    expect(blockText(history[1].blocks[0])).toBe('أ');
    expect(blockHasMark(history[2].blocks[0], 'bold')).toBe(true);
    expect(findBlock(history[1], 'a')).toBeDefined();
  });
});

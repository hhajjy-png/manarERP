/**
 * Block Model — integrity (INV-6).
 *
 * INV-6: "The document source of truth is the Block Model. Never store HTML. Never use
 * HTML round-trip editing."
 *
 * Two things are proven here.
 *
 *  · THE MODEL IS JSON, AND ONLY JSON. It survives a `JSON.parse(JSON.stringify(…))`
 *    round trip unchanged, carries no markup-bearing field, and the engine exposes no
 *    inverse operation that would turn rendered output back into a document — that
 *    inverse IS the HTML round trip the invariant forbids.
 *
 *  · MALFORMED MODELS ARE REJECTED WITH A REASON. The callers that matter are load
 *    paths handling data that may predate the current build, and "invalid" is not
 *    actionable where "block 4 names a font the registry does not resolve" is. Each
 *    case below is a defect a real stored document could plausibly carry.
 *
 * Structural integrity is deliberately separate from publishing validity: an empty
 * draft is a perfectly valid model and an unpublishable letter. Merging the two would
 * mean an empty draft could not be saved.
 */
import { describe, it, expect } from 'vitest';
import {
  type Block,
  type BlockAttributes,
  type BlockDocument,
  BLOCK_KINDS,
  CONTENT_MODEL_VERSION,
  INLINE_MARKS,
  LIST_TYPES,
  MAX_INDENT_LEVEL,
  createBlock,
  createEmptyBlockDocument,
  createInitialBlockDocument,
  createSpan,
  isBlockKind,
  isInlineMark,
  isListType,
  isTextBlock,
} from '../../letters/model/blockTypes';
import {
  assertValidBlockDocument,
  isValidBlockDocument,
  validateBlockDocument,
} from '../../letters/model/blockModelIntegrity';

/** Attributes matching the approved body preset — the baseline every fixture varies from. */
const BODY_ATTRS: BlockAttributes = {
  fontId: 'traditionalArabic',
  sizePt: 16,
  alignment: 'justify',
  indentLevel: 0,
};

function doc(blocks: readonly Block[]): BlockDocument {
  return { contentModelVersion: CONTENT_MODEL_VERSION, blocks };
}

/** A structurally valid two-paragraph document. */
function validDocument(): BlockDocument {
  return doc([
    createBlock('b1', 'paragraph', [createSpan('السلام عليكم ورحمة الله وبركاته')], BODY_ATTRS),
    createBlock(
      'b2',
      'paragraph',
      [createSpan('نفيدكم علمًا بأن '), createSpan('العقد', ['bold', 'underline']), createSpan(' قد مُدّد.')],
      BODY_ATTRS,
    ),
  ]);
}

/** Messages from every defect, joined — keeps the assertions readable. */
function defectText(document: BlockDocument): string {
  return validateBlockDocument(document)
    .map((d) => d.message)
    .join(' | ');
}

describe('Block Model — shape', () => {
  it('declares the closed sets the editor may use', () => {
    expect([...INLINE_MARKS]).toEqual(['bold', 'underline']);
    expect([...BLOCK_KINDS]).toEqual(['paragraph', 'listItem', 'pageBreak']);
    expect([...LIST_TYPES]).toEqual(['numbered', 'bulleted']);
    expect(MAX_INDENT_LEVEL).toBe(2);
  });

  it('has no italic mark — the registry says the fonts have no italic face', () => {
    expect(INLINE_MARKS).not.toContain('italic');
    expect(isInlineMark('italic')).toBe(false);
  });

  it('guards discriminate correctly', () => {
    expect(isInlineMark('bold')).toBe(true);
    expect(isInlineMark('strike')).toBe(false);
    expect(isBlockKind('pageBreak')).toBe(true);
    expect(isBlockKind('table')).toBe(false);
    expect(isListType('numbered')).toBe(true);
    expect(isListType('roman')).toBe(false);
  });

  it('distinguishes text-bearing blocks from a page break', () => {
    expect(isTextBlock(createBlock('a', 'paragraph', [createSpan('x')], BODY_ATTRS))).toBe(true);
    expect(isTextBlock(createBlock('b', 'listItem', [createSpan('x')], { ...BODY_ATTRS, listType: 'numbered' }))).toBe(true);
    expect(isTextBlock(createBlock('c', 'pageBreak', [], BODY_ATTRS))).toBe(false);
  });
});

describe('Block Model — construction helpers', () => {
  it('creates an empty document with no blocks', () => {
    const empty = createEmptyBlockDocument();
    expect(empty.blocks).toEqual([]);
    expect(empty.contentModelVersion).toBe(CONTENT_MODEL_VERSION);
    // An empty document is STRUCTURALLY valid: it is an unpublishable draft, not a
    // malformed model.
    expect(isValidBlockDocument(empty)).toBe(true);
  });

  it('creates the editor’s starting state: one empty paragraph', () => {
    const initial = createInitialBlockDocument('b1', BODY_ATTRS);
    expect(initial.blocks).toHaveLength(1);
    expect(initial.blocks[0].kind).toBe('paragraph');
    expect(initial.blocks[0].spans[0].text).toBe('');
    expect(isValidBlockDocument(initial)).toBe(true);
  });
});

describe('Block Model — INV-6: the model is JSON, never HTML', () => {
  it('survives a JSON round trip unchanged', () => {
    const original = validDocument();
    const roundTripped: BlockDocument = JSON.parse(JSON.stringify(original));
    expect(roundTripped).toEqual(original);
    expect(isValidBlockDocument(roundTripped)).toBe(true);
  });

  it('carries no markup-bearing field anywhere in its serialised form', () => {
    const serialised = JSON.stringify(validDocument());
    for (const forbidden of ['html', 'innerHTML', 'outerHTML', 'dangerouslySetInnerHTML', '<p>', '<span', '</']) {
      expect(serialised.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });

  it('keys are a closed, markup-free set', () => {
    const keys = new Set<string>();
    const collect = (value: unknown): void => {
      if (Array.isArray(value)) return value.forEach(collect);
      if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          keys.add(k);
          collect(v);
        }
      }
    };
    collect(validDocument());
    expect([...keys].sort()).toEqual([
      'alignment',
      'attributes',
      'blocks',
      'contentModelVersion',
      'fontId',
      'id',
      'indentLevel',
      'kind',
      'marks',
      'sizePt',
      'spans',
      'text',
    ]);
  });

  it('treats span text as plain text, never as markup to parse', () => {
    // A letter may legitimately contain angle brackets. They are content, and nothing
    // in the model parses them.
    const withBrackets = doc([createBlock('b1', 'paragraph', [createSpan('القيمة < 5 و > 1')], BODY_ATTRS)]);
    expect(isValidBlockDocument(withBrackets)).toBe(true);
    expect(JSON.parse(JSON.stringify(withBrackets)).blocks[0].spans[0].text).toBe('القيمة < 5 و > 1');
  });
});

describe('Block Model — integrity: a valid document', () => {
  it('reports no defects', () => {
    expect(validateBlockDocument(validDocument())).toEqual([]);
    expect(isValidBlockDocument(validDocument())).toBe(true);
    expect(() => assertValidBlockDocument(validDocument())).not.toThrow();
  });

  it('accepts a list item, a page break and the maximum indent', () => {
    const document = doc([
      createBlock('b1', 'listItem', [createSpan('البند الأول')], { ...BODY_ATTRS, listType: 'numbered' }),
      createBlock('b2', 'listItem', [createSpan('البند الثاني')], {
        ...BODY_ATTRS,
        listType: 'bulleted',
        indentLevel: MAX_INDENT_LEVEL,
      }),
      createBlock('b3', 'pageBreak', [], BODY_ATTRS),
    ]);
    expect(validateBlockDocument(document)).toEqual([]);
  });
});

describe('Block Model — integrity: rejected documents', () => {
  it('rejects a content-model version this build does not understand', () => {
    // Never coerced. A silently upgraded draft is a draft whose meaning changed
    // without anyone deciding it should.
    const stale: BlockDocument = { contentModelVersion: 0, blocks: [] };
    expect(defectText(stale)).toMatch(/Content model version 0/);
  });

  it('rejects a font id the Font Registry does not resolve (INV-5)', () => {
    const document = doc([
      createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, fontId: 'notAFont' as never }),
    ]);
    expect(defectText(document)).toMatch(/Font id "notAFont" is not in the Font Registry/);
  });

  it('rejects a prototype-chain font id', () => {
    // `findFont` uses an own-property check, so a stored `"constructor"` cannot resolve
    // to a function that survives an `undefined` test and fails later on `.family`.
    const document = doc([
      createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, fontId: 'constructor' as never }),
    ]);
    expect(defectText(document)).toMatch(/Font id "constructor" is not in the Font Registry/);
  });

  it('rejects a size off the editor’s ladder', () => {
    const document = doc([
      createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, sizePt: 11 }),
    ]);
    expect(defectText(document)).toMatch(/11 pt is not a rung/);
  });

  it('rejects an unknown alignment, including a physical one', () => {
    const document = doc([
      createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, alignment: 'left' as never }),
    ]);
    expect(defectText(document)).toMatch(/Unknown alignment "left"/);
  });

  it('rejects an indent level outside 0…2, and a fractional one', () => {
    expect(defectText(doc([createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, indentLevel: 3 })])))
      .toMatch(/Indent level 3 is outside/);
    expect(defectText(doc([createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, indentLevel: -1 })])))
      .toMatch(/Indent level -1 is outside/);
    expect(defectText(doc([createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, indentLevel: 1.5 })])))
      .toMatch(/Indent level 1.5 is outside/);
  });

  it('rejects duplicate and empty block ids', () => {
    // Ids must be unique and stable: the paginator caches measurements against them
    // and the undo stack addresses blocks by them.
    const duplicated = doc([
      createBlock('same', 'paragraph', [createSpan('a')], BODY_ATTRS),
      createBlock('same', 'paragraph', [createSpan('b')], BODY_ATTRS),
    ]);
    expect(defectText(duplicated)).toMatch(/Duplicate block id "same"/);
    expect(defectText(doc([createBlock('', 'paragraph', [createSpan('a')], BODY_ATTRS)])))
      .toMatch(/Block id must be a non-empty string/);
  });

  it('rejects an unknown block kind', () => {
    const document = doc([createBlock('b1', 'table' as never, [createSpan('x')], BODY_ATTRS)]);
    expect(defectText(document)).toMatch(/Unknown block kind "table"/);
  });

  it('enforces that listType is present exactly when the block is a list item', () => {
    const missing = doc([createBlock('b1', 'listItem', [createSpan('x')], BODY_ATTRS)]);
    expect(defectText(missing)).toMatch(/listItem block must declare `listType`/);

    const spurious = doc([
      createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, listType: 'numbered' }),
    ]);
    expect(defectText(spurious)).toMatch(/Only a listItem block may declare `listType`/);

    const unknownType = doc([
      createBlock('b1', 'listItem', [createSpan('x')], { ...BODY_ATTRS, listType: 'roman' as never }),
    ]);
    expect(defectText(unknownType)).toMatch(/Unknown list type "roman"/);
  });

  it('rejects a page break carrying spans', () => {
    const document = doc([createBlock('b1', 'pageBreak', [createSpan('x')], BODY_ATTRS)]);
    expect(defectText(document)).toMatch(/pageBreak block must carry no spans/);
  });

  it('rejects unknown and repeated inline marks', () => {
    expect(defectText(doc([createBlock('b1', 'paragraph', [createSpan('x', ['italic' as never])], BODY_ATTRS)])))
      .toMatch(/unknown mark "italic"/);
    expect(defectText(doc([createBlock('b1', 'paragraph', [createSpan('x', ['bold', 'bold'])], BODY_ATTRS)])))
      .toMatch(/repeats a mark/);
  });

  it('rejects non-string span text and non-array marks', () => {
    const document = doc([
      { id: 'b1', kind: 'paragraph', spans: [{ text: 5 as never, marks: [] }], attributes: BODY_ATTRS },
      { id: 'b2', kind: 'paragraph', spans: [{ text: 'x', marks: 'bold' as never }], attributes: BODY_ATTRS },
    ]);
    const text = defectText(document);
    expect(text).toMatch(/non-string `text`/);
    expect(text).toMatch(/non-array `marks`/);
  });

  it('reports EVERY defect, not just the first', () => {
    // A load path that surfaced one problem per attempt would turn a single bad
    // migration into a dozen round trips.
    const document = doc([
      createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, fontId: 'nope' as never, sizePt: 11, indentLevel: 9 }),
    ]);
    expect(validateBlockDocument(document).length).toBeGreaterThanOrEqual(3);
  });

  it('locates each defect by block index and id', () => {
    const document = doc([
      createBlock('good', 'paragraph', [createSpan('x')], BODY_ATTRS),
      createBlock('bad', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, sizePt: 13 }),
    ]);
    const defects = validateBlockDocument(document);
    expect(defects).toHaveLength(1);
    expect(defects[0].blockIndex).toBe(1);
    expect(defects[0].blockId).toBe('bad');
  });

  it('the throwing form names the offending block', () => {
    const document = doc([
      createBlock('b1', 'paragraph', [createSpan('x')], { ...BODY_ATTRS, sizePt: 13 }),
    ]);
    expect(() => assertValidBlockDocument(document)).toThrow(/block 0/);
  });
});

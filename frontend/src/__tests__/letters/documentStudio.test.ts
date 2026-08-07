/**
 * Document Studio Foundation v1 — the pure layers.
 *
 * Everything this pack added that has no React in it: the content-model migration, the
 * lifted-prohibition record, the named styles, the statistics counters, and Arabic
 * find-and-replace.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE MIGRATION TEST IS THE ONE THAT MATTERS MOST.
 * ══════════════════════════════════════════════════════════════════════════
 * Bumping `CONTENT_MODEL_VERSION` without a migration would have made every stored
 * draft parse as `null` — and the composer's load path treats `null` as "start a fresh
 * document". The failure mode is not an error message; it is every letter in the system
 * silently opening blank. There is no louder way for that to fail than a test.
 */

import { describe, it, expect } from 'vitest';

import {
  CONTENT_MODEL_VERSION,
  SUPPORTED_CONTENT_MODEL_VERSIONS,
  createBlock,
  createSpan,
  type BlockAttributes,
  type BlockDocument,
} from '../../letters/model/blockTypes';
import { validateBlockDocument } from '../../letters/model/blockModelIntegrity';
import {
  applyCharacterStyle,
  applyParagraphStyle,
  blockMarks,
  blockText,
  copyBlockFormat,
  applyBlockFormat,
  clearBlockFormatting,
  findBlock,
  migrateDocument,
  parseDocument,
  serialiseDocument,
  setBlockIndentation,
  stepBlockIndent,
  toggleBlockMark,
  toggleListType,
} from '../../letters/editor/blockCommands';
import {
  PROHIBITED_TOOLBAR_COMMANDS,
  LIFTED_TOOLBAR_PROHIBITIONS,
  LINE_HEIGHT_LADDER,
  LETTER_SPACING_LADDER_PT,
  PARAGRAPH_SPACING_LADDER_PT,
  TOOLBAR_COMMANDS,
  isProhibitedToolbarCommand,
  isToolbarCommandId,
} from '../../letters/registry/toolbarCommands';
import {
  getAllParagraphStyles,
  getCharacterStyle,
  getParagraphStyle,
  matchCharacterStyle,
  matchParagraphStyle,
  paragraphStyleWeightIsReal,
} from '../../letters/registry/documentStyles';
import { caretStats, detectLanguage, documentStats, textStats } from '../../letters/editor/documentStats';
import {
  DEFAULT_SEARCH_OPTIONS,
  findInDocument,
  findInText,
  replaceAllInDocument,
  replaceMatch,
} from '../../letters/editor/documentSearch';
import { buildDocumentOutline } from '../../letters/editor/documentOutline';
import { FONT_SIZE_LADDER_PT } from '../../letters/registry/typographyPresets';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const BODY: BlockAttributes = {
  fontId: 'traditionalArabic',
  sizePt: 16,
  alignment: 'justify',
  indentLevel: 0,
};

function doc(...texts: string[]): BlockDocument {
  return {
    contentModelVersion: CONTENT_MODEL_VERSION,
    blocks: texts.map((text, i) => createBlock(`b${i}`, 'paragraph', [createSpan(text)], BODY)),
  };
}

/* ══ The content-model migration ═══════════════════════════════════════════ */

describe('Content model version 2 — a stored version-1 draft still opens', () => {
  /** Exactly what a draft written before this pack looks like in the database. */
  const storedV1 = JSON.stringify({
    contentModelVersion: 1,
    blocks: [
      { id: 'b1', kind: 'paragraph', spans: [{ text: 'نص محفوظ سابقًا', marks: ['bold'] }], attributes: BODY },
    ],
  });

  it('parses a version-1 document instead of rejecting it', () => {
    const parsed = parseDocument(storedV1);
    expect(parsed, 'a v1 draft must not parse as null — null means "start fresh", i.e. data loss').not.toBeNull();
    expect(parsed!.blocks).toHaveLength(1);
    expect(blockText(parsed!.blocks[0])).toBe('نص محفوظ سابقًا');
  });

  it('re-stamps it to the current version and changes NOTHING else', () => {
    const parsed = parseDocument(storedV1)!;
    expect(parsed.contentModelVersion).toBe(CONTENT_MODEL_VERSION);

    // The migration is a re-stamp: content, marks and attributes are byte-identical.
    const original = JSON.parse(storedV1) as BlockDocument;
    expect(parsed.blocks[0].attributes).toEqual(original.blocks[0].attributes);
    expect(blockMarks(parsed.blocks[0])).toEqual(['bold']);
  });

  it('a migrated document is structurally valid under the new rules', () => {
    // The proof that version 2 is purely additive: a v1 body passes the v2 checker
    // without a single field being invented for it.
    expect(validateBlockDocument(parseDocument(storedV1)!)).toEqual([]);
  });

  it('declares which versions it can read, and refuses the rest', () => {
    // Version 3 joined with Document Layout Designer v1, which added the optional
    // layout layer. Additive again, so a version-1 draft still migrates in one step.
    expect([...SUPPORTED_CONTENT_MODEL_VERSIONS]).toEqual([1, 2, 3, 4]);
    expect(migrateDocument({ contentModelVersion: 99, blocks: [] })).toBeNull();
    // Refused, never coerced: rendering an unknown version under today's rules is
    // exactly what INV-9 exists to prevent.
    expect(parseDocument(JSON.stringify({ contentModelVersion: 99, blocks: [] }))).toBeNull();
  });

  it('round-trips a version-2 document unchanged', () => {
    const original = doc('أ', 'ب');
    expect(parseDocument(serialiseDocument(original))).toEqual(original);
  });
});

/* ══ The lifted prohibitions ═══════════════════════════════════════════════ */

describe('Lifted prohibitions are recorded, not merely deleted', () => {
  it('every lifted id is now a real catalogued command', () => {
    for (const lifted of LIFTED_TOOLBAR_PROHIBITIONS) {
      expect(isToolbarCommandId(lifted.id), `"${lifted.id}" is not in the catalogue`).toBe(true);
      expect(TOOLBAR_COMMANDS[lifted.id]).toBeDefined();
    }
  });

  it('an id is prohibited or lifted, never both', () => {
    for (const lifted of LIFTED_TOOLBAR_PROHIBITIONS) {
      expect(isProhibitedToolbarCommand(lifted.id), `"${lifted.id}" is on both lists`).toBe(false);
    }
  });

  it('each lift carries the original reason AND what answers it', () => {
    // A prohibition that vanishes without a record is indistinguishable from one that
    // was never considered. This is what makes the decision auditable later.
    for (const lifted of LIFTED_TOOLBAR_PROHIBITIONS) {
      expect(lifted.originalReason.length, `"${lifted.id}" has no original reason`).toBeGreaterThan(20);
      expect(lifted.answeredBy.length, `"${lifted.id}" has no answer`).toBeGreaterThan(20);
    }
  });

  it('keeps the prohibitions that were NOT lifted', () => {
    // Italic and colour are the two most likely to be re-added by someone who has not
    // read why they are absent — and neither was part of this pack's decision.
    for (const id of ['italic', 'textColor', 'insertImage', 'insertTable', 'insertTextBox', 'pageSetup', 'watermark']) {
      expect(isProhibitedToolbarCommand(id), `"${id}" must remain prohibited`).toBe(true);
      expect(isToolbarCommandId(id), `"${id}" must not enter the catalogue`).toBe(false);
    }
  });

  it('every spacing ladder is bounded and non-negative', () => {
    // The structural answer to "unmodelled pagination input": a bounded set is a
    // bounded validation surface. A negative tracking rung would break Arabic joining.
    for (const ladder of [LINE_HEIGHT_LADDER, PARAGRAPH_SPACING_LADDER_PT, LETTER_SPACING_LADDER_PT]) {
      expect(ladder.length).toBeGreaterThan(1);
      expect(ladder.length).toBeLessThanOrEqual(8);
      expect(ladder.every((rung) => rung >= 0)).toBe(true);
    }
  });
});

/* ══ Named styles ══════════════════════════════════════════════════════════ */

describe('Paragraph and character styles', () => {
  it('every style asks for a weight its font actually ships', () => {
    // The Amiri pairing, inherited from the typography presets: Traditional Arabic has
    // no real bold, so a bold style set in it would be a browser-synthesised smear.
    for (const style of getAllParagraphStyles()) {
      expect(paragraphStyleWeightIsReal(style), `"${style.id}" would be faux-weighted`).toBe(true);
    }
  });

  it('every style sits on EVERY editor ladder it touches', () => {
    // Caught a real defect on its first run: the heading styles had inherited the
    // typography presets' 1.3 leading, which is not a rung of LINE_HEIGHT_LADDER. The
    // failure mode is nasty and silent — the document builds on screen, and only fails
    // when it is reopened and the integrity checker rejects the stored block.
    for (const style of getAllParagraphStyles()) {
      expect(FONT_SIZE_LADDER_PT, `"${style.id}" size is off-ladder`).toContain(style.sizePt);
      expect(LINE_HEIGHT_LADDER, `"${style.id}" line height is off-ladder`).toContain(style.lineHeight);
      expect(PARAGRAPH_SPACING_LADDER_PT, `"${style.id}" spacing is off-ladder`).toContain(style.paragraphSpacingPt);
    }
  });

  it('a document built from every style is structurally valid', () => {
    // The end-to-end form of the assertion above: apply each style in turn and confirm
    // the result is a document that could actually be saved and reopened.
    for (const style of getAllParagraphStyles()) {
      const next = applyParagraphStyle(doc('نص'), 'b0', style);
      expect(validateBlockDocument(next), `"${style.id}" produces an invalid block`).toEqual([]);
    }
  });

  it('applying a heading style makes it a heading block with its level', () => {
    const next = applyParagraphStyle(doc('عنوان'), 'b0', getParagraphStyle('heading2'));
    const block = findBlock(next, 'b0')!;
    expect(block.kind).toBe('heading');
    expect(block.attributes.headingLevel).toBe(2);
    // Weight rides the `bold` mark — the model has exactly one way to say "heavier".
    expect(blockMarks(block)).toContain('bold');
    expect(validateBlockDocument(next)).toEqual([]);
  });

  it('returning to Body clears the heading level rather than stranding it', () => {
    const heading = applyParagraphStyle(doc('عنوان'), 'b0', getParagraphStyle('heading1'));
    const body = applyParagraphStyle(heading, 'b0', getParagraphStyle('body'));
    const block = findBlock(body, 'b0')!;
    expect(block.kind).toBe('paragraph');
    expect(block.attributes.headingLevel).toBeUndefined();
    // A stranded level would make the outline list a paragraph as a heading.
    expect(validateBlockDocument(body)).toEqual([]);
  });

  it('reports "custom" once a styled paragraph is edited by hand', () => {
    const styled = applyParagraphStyle(doc('عنوان'), 'b0', getParagraphStyle('heading3'));
    const block = findBlock(styled, 'b0')!;
    expect(matchParagraphStyle(block.attributes, block.kind, blockMarks(block))?.id).toBe('heading3');

    // Toggling bold off no longer matches Heading 3, which declares weight 700.
    const unbolded = toggleBlockMark(styled, 'b0', 'bold');
    const changed = findBlock(unbolded, 'b0')!;
    expect(matchParagraphStyle(changed.attributes, changed.kind, blockMarks(changed))).toBeUndefined();
  });

  it('a character style sets exactly its marks, and matches as a set', () => {
    const next = applyCharacterStyle(doc('نص'), 'b0', getCharacterStyle('strong'));
    const marks = blockMarks(findBlock(next, 'b0')!);
    expect([...marks].sort()).toEqual(['bold', 'underline']);
    expect(matchCharacterStyle(marks)?.id).toBe('strong');
    expect(matchCharacterStyle([])?.id).toBe('none');
  });
});

/* ══ New marks and attributes ══════════════════════════════════════════════ */

describe('The marks and attributes version 2 added', () => {
  it('superscript and subscript replace each other rather than stacking', () => {
    const raised = toggleBlockMark(doc('س'), 'b0', 'superscript');
    const lowered = toggleBlockMark(raised, 'b0', 'subscript');
    const marks = blockMarks(findBlock(lowered, 'b0')!);
    expect(marks).toContain('subscript');
    expect(marks).not.toContain('superscript');
    expect(validateBlockDocument(lowered)).toEqual([]);
  });

  it('rejects a document that carries both, however it was written', () => {
    const contradictory: BlockDocument = {
      contentModelVersion: CONTENT_MODEL_VERSION,
      blocks: [createBlock('b0', 'paragraph', [createSpan('س', ['superscript', 'subscript'])], BODY)],
    };
    const defects = validateBlockDocument(contradictory);
    expect(defects).toHaveLength(1);
    expect(defects[0].message).toMatch(/cannot coexist/);
  });

  it('rejects an off-ladder spacing value', () => {
    const offLadder: BlockDocument = {
      contentModelVersion: CONTENT_MODEL_VERSION,
      blocks: [createBlock('b0', 'paragraph', [createSpan('x')], { ...BODY, lineHeight: 1.42 })],
    };
    expect(validateBlockDocument(offLadder)[0].message).toMatch(/line-height ladder/);
  });

  it('treats an absent spacing attribute as historical behaviour, not as a defect', () => {
    // `undefined` must always be valid — it is what every migrated v1 block carries.
    expect(validateBlockDocument(doc('x'))).toEqual([]);
  });

  it('the two indents are mutually exclusive, and setting one clears the other', () => {
    const first = setBlockIndentation(doc('x'), 'b0', { firstLineIndentMm: 10 });
    expect(findBlock(first, 'b0')!.attributes.firstLineIndentMm).toBe(10);

    const hanging = setBlockIndentation(first, 'b0', { hangingIndentMm: 5 });
    const block = findBlock(hanging, 'b0')!;
    expect(block.attributes.hangingIndentMm).toBe(5);
    expect(block.attributes.firstLineIndentMm).toBe(0);
    expect(validateBlockDocument(hanging)).toEqual([]);
  });

  it('setting an indent to zero does NOT discard the other one', () => {
    // Setting an indent to zero means "I want no first-line indent", not "also throw
    // away the hanging indent I deliberately kept".
    const hanging = setBlockIndentation(doc('x'), 'b0', { hangingIndentMm: 10 });
    const zeroed = setBlockIndentation(hanging, 'b0', { firstLineIndentMm: 0 });
    expect(findBlock(zeroed, 'b0')!.attributes.hangingIndentMm).toBe(10);
  });

  it('rejects a document where both indents are non-zero', () => {
    const both: BlockDocument = {
      contentModelVersion: CONTENT_MODEL_VERSION,
      blocks: [createBlock('b0', 'paragraph', [createSpan('x')], { ...BODY, firstLineIndentMm: 5, hangingIndentMm: 5 })],
    };
    expect(validateBlockDocument(both)[0].message).toMatch(/mutually exclusive/);
  });

  it('clamps the indent level rather than throwing at the ceiling', () => {
    let d = doc('x');
    for (let i = 0; i < 5; i += 1) d = stepBlockIndent(d, 'b0', 'in');
    expect(findBlock(d, 'b0')!.attributes.indentLevel).toBe(2);
    for (let i = 0; i < 5; i += 1) d = stepBlockIndent(d, 'b0', 'out');
    expect(findBlock(d, 'b0')!.attributes.indentLevel).toBe(0);
  });
});

/* ══ Lists ═════════════════════════════════════════════════════════════════ */

describe('Lists', () => {
  it('toggling the same list type returns the block to a paragraph', () => {
    const listed = toggleListType(doc('بند'), 'b0', 'bulleted');
    expect(findBlock(listed, 'b0')!.kind).toBe('listItem');
    expect(findBlock(listed, 'b0')!.attributes.listType).toBe('bulleted');

    const unlisted = toggleListType(listed, 'b0', 'bulleted');
    expect(findBlock(unlisted, 'b0')!.kind).toBe('paragraph');
    expect(findBlock(unlisted, 'b0')!.attributes.listType).toBeUndefined();
    expect(validateBlockDocument(unlisted)).toEqual([]);
  });

  it('switching list type keeps it a list', () => {
    const bulleted = toggleListType(doc('بند'), 'b0', 'bulleted');
    const numbered = toggleListType(bulleted, 'b0', 'numbered');
    expect(findBlock(numbered, 'b0')!.attributes.listType).toBe('numbered');
    expect(validateBlockDocument(numbered)).toEqual([]);
  });
});

/* ══ Format painter ════════════════════════════════════════════════════════ */

describe('The format painter copies formatting and never text', () => {
  it('paints kind, attributes and marks onto another block, leaving its text alone', () => {
    const source = applyParagraphStyle(doc('العنوان', 'الفقرة'), 'b0', getParagraphStyle('heading2'));
    const format = copyBlockFormat(findBlock(source, 'b0')!);
    const painted = applyBlockFormat(source, 'b1', format);

    const target = findBlock(painted, 'b1')!;
    expect(blockText(target), 'the painter must never carry text').toBe('الفقرة');
    expect(target.kind).toBe('heading');
    expect(target.attributes.headingLevel).toBe(2);
    expect(blockMarks(target)).toContain('bold');
    expect(validateBlockDocument(painted)).toEqual([]);
  });

  it('clearing formatting returns a heading to a plain paragraph', () => {
    const heading = applyParagraphStyle(doc('عنوان'), 'b0', getParagraphStyle('heading1'));
    const cleared = clearBlockFormatting(heading, 'b0', BODY);
    const block = findBlock(cleared, 'b0')!;
    expect(block.kind).toBe('paragraph');
    expect(block.attributes.headingLevel).toBeUndefined();
    expect(blockMarks(block)).toEqual([]);
    expect(blockText(block), 'text must survive a formatting reset').toBe('عنوان');
  });
});

/* ══ Statistics ════════════════════════════════════════════════════════════ */

describe('Document statistics', () => {
  it('counts Arabic words across Arabic punctuation', () => {
    // The naive `split(' ')` reads this as three words; the Arabic comma is U+060C.
    expect(textStats('الأول،الثاني والثالث').words).toBe(3);
  });

  it('does not let a tatweel or a diacritic split a word', () => {
    expect(textStats('مـــحـــمـــد').words).toBe(1);
    expect(textStats('مُحَمَّد').words).toBe(1);
  });

  it('separates total characters from characters without spaces', () => {
    const stats = textStats('ab cd');
    expect(stats.characters).toBe(5);
    expect(stats.charactersNoSpaces).toBe(4);
  });

  it('includes the section values, not only the body', () => {
    // The status bar reports the LETTER's length; the subject and recipient are part
    // of the letter even though the block model does not hold them.
    const withSections = documentStats(doc('كلمة واحدة'), ['موضوع الخطاب']);
    expect(withSections.words).toBe(4);
  });

  it('reports reading time as a whole minute, and none for an empty document', () => {
    expect(documentStats(doc(''), []).readingMinutes).toBe(0);
    expect(documentStats(doc('كلمة'), []).readingMinutes).toBe(1);
  });

  it('counts paragraphs and headings separately', () => {
    const withHeading = applyParagraphStyle(doc('عنوان', 'نص'), 'b0', getParagraphStyle('heading1'));
    const stats = documentStats(withHeading, []);
    expect(stats.paragraphs).toBe(2);
    expect(stats.headings).toBe(1);
  });

  it('reports caret line and column one-based, and the selection size', () => {
    const stats = caretStats('سطر أول\nسطر ثانٍ', 8, 12);
    expect(stats.line).toBe(2);
    expect(stats.column).toBe(1);
    expect(stats.selectedCharacters).toBe(4);
  });

  it('clamps an out-of-range selection rather than producing a negative column', () => {
    const stats = caretStats('قصير', 99, 200);
    expect(stats.column).toBeGreaterThan(0);
    expect(stats.selectedCharacters).toBe(0);
  });

  it('detects the document language, and says "mixed" when it genuinely is', () => {
    expect(detectLanguage('خطاب رسمي بالعربية')).toBe('ar');
    expect(detectLanguage('An English letter')).toBe('en');
    expect(detectLanguage('')).toBe('unknown');
    // One product name does not flip an Arabic letter to "mixed"…
    expect(detectLanguage('خطاب رسمي طويل جدا بالعربية الفصحى ويذكر Word مرة')).toBe('ar');
    // …but a genuinely bilingual passage does.
    expect(detectLanguage('خطاب رسمي — an English clause quoted in full')).toBe('mixed');
  });
});

/* ══ Find and replace ══════════════════════════════════════════════════════ */

describe('Find and replace — Arabic normalisation', () => {
  it('folds alef forms, teh marbuta and alef maksura', () => {
    expect(findInText('أحمد', 'احمد')).toHaveLength(1);
    expect(findInText('شركة المنار', 'شركه')).toHaveLength(1);
    expect(findInText('على الطريق', 'علي')).toHaveLength(1);
  });

  it('finds a diacritised word by its undiacritised spelling', () => {
    // The case the index map exists for: folding REMOVES characters, so the hit's
    // offsets have to be mapped back to the original string.
    const hits = findInText('نص مُحَمَّد هنا', 'محمد');
    expect(hits).toHaveLength(1);
    expect('نص مُحَمَّد هنا'.slice(hits[0].start, hits[0].end)).toBe('مُحَمَّد');
  });

  it('replaces a diacritised match exactly where it was highlighted', () => {
    // The regression this guards: an unmapped offset writes the replacement into the
    // middle of a neighbouring word and silently corrupts the paragraph.
    const source: BlockDocument = {
      contentModelVersion: CONTENT_MODEL_VERSION,
      blocks: [createBlock('b0', 'paragraph', [createSpan('السيد مُحَمَّد المحترم')], BODY)],
    };
    const { document: next, replaced } = replaceAllInDocument(source, 'محمد', 'خالد');
    expect(replaced).toBe(1);
    expect(blockText(next.blocks[0])).toBe('السيد خالد المحترم');
  });

  it('honours match-case and whole-word', () => {
    expect(findInText('Letter letter', 'letter')).toHaveLength(2);
    expect(findInText('Letter letter', 'letter', { ...DEFAULT_SEARCH_OPTIONS, matchCase: true })).toHaveLength(1);
    expect(findInText('كتاب كتابان', 'كتاب')).toHaveLength(2);
    expect(findInText('كتاب كتابان', 'كتاب', { ...DEFAULT_SEARCH_OPTIONS, wholeWord: true })).toHaveLength(1);
  });

  it('can switch the Arabic fold off', () => {
    const literal = { ...DEFAULT_SEARCH_OPTIONS, normaliseArabicForms: false };
    expect(findInText('شركة', 'شركه', literal)).toHaveLength(0);
    expect(findInText('شركة', 'شركة', literal)).toHaveLength(1);
  });

  it('matches non-overlapping, so replace-all is unambiguous', () => {
    expect(findInText('اااا', 'اا')).toHaveLength(2);
  });

  it('does not loop when the replacement contains the query', () => {
    // Replacing forwards and re-searching is the classic way to hang here.
    const { document: next, replaced } = replaceAllInDocument(doc('نص نص'), 'نص', 'نص جديد');
    expect(replaced).toBe(2);
    expect(blockText(next.blocks[0])).toBe('نص جديد نص جديد');
  });

  it('finds across blocks in document order', () => {
    const result = findInDocument(doc('كلمة هنا', 'كلمة هناك'), 'كلمة');
    expect(result.matches.map((m) => m.blockId)).toEqual(['b0', 'b1']);
  });

  it('refuses a stale single replacement instead of corrupting the paragraph', () => {
    const original = doc('نص طويل');
    const match = findInDocument(original, 'طويل').matches[0];
    // The paragraph changed under the result list — an autosave round trip, an undo.
    const changed = { ...original, blocks: [createBlock('b0', 'paragraph', [createSpan('قصير')], BODY)] };
    expect(replaceMatch(changed, match, 'س', 'طويل')).toBe(changed);
  });

  it('returns nothing for an empty query rather than matching everywhere', () => {
    expect(findInText('نص', '')).toEqual([]);
    expect(findInDocument(doc('نص'), '').matches).toEqual([]);
  });
});

/* ══ Outline ═══════════════════════════════════════════════════════════════ */

describe('The document outline', () => {
  // Form Editor UX Rebuild v2 removed date, recipient and subject as fixed sections —
  // the document is generic now, and the outline's fixed skeleton shrank to match.
  const values = {
    hasSignature: true,
    reference: 'OL-2026-000001',
  };

  it('always lists the three sections, empty ones included', () => {
    // An outline that hid an empty section until it had content would be missing
    // exactly the entry the author needs to click on to go and write it.
    const entries = buildDocumentOutline(doc(''), { ...values, hasSignature: false }, null);
    expect(entries.filter((e) => e.kind === 'section').map((e) => e.sectionKind)).toEqual([
      'content', 'signature', 'barcode',
    ]);
    expect(entries.find((e) => e.sectionKind === 'signature')!.empty).toBe(true);
  });

  it('nests heading blocks under content at their declared level', () => {
    const withHeadings = applyParagraphStyle(doc('الأول', 'نص', 'الثاني'), 'b0', getParagraphStyle('heading1'));
    const both = applyParagraphStyle(withHeadings, 'b2', getParagraphStyle('heading3'));
    const headings = buildDocumentOutline(both, values, null).filter((e) => e.kind === 'heading');

    expect(headings.map((e) => e.depth)).toEqual([1, 3]);
    expect(headings.map((e) => e.label)).toEqual(['الأول', 'الثاني']);
  });

  it('does NOT list a paragraph that merely looks like a heading', () => {
    // The whole reason `heading` is a block kind: a bolded 22 pt paragraph is emphasis,
    // not structure, and an outline inferred from typography would get this wrong.
    const bolded = toggleBlockMark(doc('يبدو كعنوان'), 'b0', 'bold');
    expect(buildDocumentOutline(bolded, values, null).filter((e) => e.kind === 'heading')).toEqual([]);
  });
});

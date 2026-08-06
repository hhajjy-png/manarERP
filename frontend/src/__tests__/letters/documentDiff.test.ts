/**
 * Professional Document Automation v1 — the diff engine and Smart Export metadata.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE PROPERTY THE WHOLE OF TRACK CHANGES RESTS ON: BLOCKS MATCH BY ID.
 * ══════════════════════════════════════════════════════════════════════════
 * A positional diff reports every paragraph after an insertion as changed — a cascade
 * of false positives that makes review useless. The block model gives every block a
 * stable id that survives every edit, and that is the only reason an exact diff is
 * available here at all. The first test below is that guarantee.
 */

import { describe, it, expect } from 'vitest';

import {
  CONTENT_MODEL_VERSION,
  createBlock,
  createSpan,
  type BlockAttributes,
  type BlockDocument,
} from '../../letters/model/blockTypes';
import { type LayoutObject, defaultPayload } from '../../letters/model/layoutTypes';
import { blockText } from '../../letters/editor/blockCommands';
import {
  CHANGE_CATEGORY_OF,
  changeCounts,
  diffDocuments,
  diffWords,
  rejectChange,
  type DiffSections,
} from '../../letters/revisions/documentDiff';
import { EXPORT_FORMATS, exportFilename } from '../../components/letters/studio/exportPipeline';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const BODY: BlockAttributes = { fontId: 'traditionalArabic', sizePt: 16, alignment: 'justify', indentLevel: 0 };
const TYPO = { fontId: 'traditionalArabic' as const, sizePt: 16 };

function doc(entries: [string, string][]): BlockDocument {
  return {
    contentModelVersion: CONTENT_MODEL_VERSION,
    blocks: entries.map(([id, text]) => createBlock(id, 'paragraph', [createSpan(text)], BODY)),
  };
}

function object(over: Partial<LayoutObject> & { id: string }): LayoutObject {
  return {
    kind: 'textBlock',
    name: over.id,
    pageIndex: 0,
    frame: { xMm: 10, yMm: 10, widthMm: 20, heightMm: 10 },
    rotationDeg: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
    zIndex: 1,
    payload: defaultPayload('textBlock', TYPO),
    ...over,
  };
}

const SECTIONS: DiffSections = {
  subject: 'موضوع',
  issueDate: '2026-01-01',
  recipientName: 'جهة',
  recipientTitle: '',
  recipientOrganisation: '',
};

/* ══ Word diff ═════════════════════════════════════════════════════════════ */

describe('Word-level diff', () => {
  it('marks unchanged words as same and reports only what moved', () => {
    const runs = diffWords('السيد أحمد المحترم', 'السيد خالد المحترم');
    expect(runs.some((r) => r.kind === 'removed' && r.text.includes('أحمد'))).toBe(true);
    expect(runs.some((r) => r.kind === 'added' && r.text.includes('خالد'))).toBe(true);
    expect(runs.some((r) => r.kind === 'same' && r.text.includes('السيد'))).toBe(true);
  });

  it('reassembles to the ORIGINAL strings exactly, whitespace included', () => {
    // A diff that loses whitespace cannot be used to rebuild text, and rejecting a
    // change has to rebuild text. Separators are kept as their own tokens for this.
    const before = 'أ  ب\nج';
    const after = 'أ ب د';
    const runs = diffWords(before, after);

    const rebuiltBefore = runs.filter((r) => r.kind !== 'added').map((r) => r.text).join('');
    const rebuiltAfter = runs.filter((r) => r.kind !== 'removed').map((r) => r.text).join('');
    expect(rebuiltBefore).toBe(before);
    expect(rebuiltAfter).toBe(after);
  });

  it('handles an empty side without producing a diff of nothing', () => {
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'جديد')).toEqual([{ kind: 'added', text: 'جديد' }]);
    expect(diffWords('قديم', '')).toEqual([{ kind: 'removed', text: 'قديم' }]);
  });

  it('degrades to a whole-paragraph replacement beyond the size bound', () => {
    // The LCS table is n×m; a review panel is not worth a hundred megabytes.
    const long = 'كلمة '.repeat(1500);
    const runs = diffWords(long, `${long}آخر`);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.kind)).toEqual(['removed', 'added']);
  });

  it('is stable — the same inputs give the same runs', () => {
    expect(diffWords('أ ب ج', 'أ د ج')).toEqual(diffWords('أ ب ج', 'أ د ج'));
  });
});

/* ══ Document diff ═════════════════════════════════════════════════════════ */

describe('Document diff', () => {
  it('matches blocks by ID, so an insertion does not report its neighbours as changed', () => {
    // THE test. A positional diff would report b1 and b2 as changed here; an id-matched
    // one reports exactly one insertion.
    const base = doc([['b1', 'أول'], ['b2', 'ثاني']]);
    const next = doc([['b0', 'جديد'], ['b1', 'أول'], ['b2', 'ثاني']]);

    const changes = diffDocuments(base, next);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('blockInserted');
    expect(changes[0].targetId).toBe('b0');
  });

  it('reports a deletion, a text change and a format change separately', () => {
    const base = doc([['b1', 'أول'], ['b2', 'ثاني']]);
    const next: BlockDocument = {
      ...base,
      blocks: [
        createBlock('b1', 'paragraph', [createSpan('أول معدّل')], { ...BODY, sizePt: 18 }),
      ],
    };

    const kinds = diffDocuments(base, next).map((c) => c.kind).sort();
    expect(kinds).toEqual(['blockDeleted', 'blockFormatChanged', 'blockTextChanged']);
  });

  it('detects a reorder without reporting it as an edit', () => {
    const base = doc([['b1', 'أ'], ['b2', 'ب']]);
    const next = doc([['b2', 'ب'], ['b1', 'أ']]);
    const changes = diffDocuments(base, next);
    expect(changes.every((c) => c.kind === 'blockMoved')).toBe(true);
    expect(changes.length).toBeGreaterThan(0);
  });

  it('reports NOTHING for two identical documents', () => {
    const document = doc([['b1', 'نص']]);
    expect(diffDocuments(document, document, SECTIONS, SECTIONS)).toEqual([]);
  });

  it('diffs the section fields, which live outside the block model', () => {
    const document = doc([['b1', 'نص']]);
    const changes = diffDocuments(document, document, SECTIONS, { ...SECTIONS, subject: 'موضوع آخر' });
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe('sectionChanged');
    expect(changes[0].targetId).toBe('subject');
  });

  it('separates an object MOVE from an object EDIT', () => {
    // "The logo moved" and "the logo's text changed" are different things to review.
    const base: BlockDocument = { ...doc([['b1', 'x']]), layout: { objects: [object({ id: 'o1' })], groups: [], guides: [] } };
    const moved: BlockDocument = {
      ...base,
      layout: { objects: [object({ id: 'o1', frame: { xMm: 50, yMm: 60, widthMm: 20, heightMm: 10 } })], groups: [], guides: [] },
    };
    const renamed: BlockDocument = {
      ...base,
      layout: { objects: [object({ id: 'o1', name: 'شعار' })], groups: [], guides: [] },
    };

    expect(diffDocuments(base, moved)[0].kind).toBe('objectMoved');
    expect(diffDocuments(base, renamed)[0].kind).toBe('objectChanged');
  });

  it('reports objects added and removed', () => {
    const empty = doc([['b1', 'x']]);
    const withObject: BlockDocument = { ...empty, layout: { objects: [object({ id: 'o1' })], groups: [], guides: [] } };

    expect(diffDocuments(empty, withObject)[0].kind).toBe('objectInserted');
    expect(diffDocuments(withObject, empty)[0].kind).toBe('objectDeleted');
  });

  it('counts changes per category for the filter chips', () => {
    const base = doc([['b1', 'أ'], ['b2', 'ب']]);
    const next: BlockDocument = {
      ...base,
      blocks: [
        createBlock('b1', 'paragraph', [createSpan('أ معدّل')], BODY),
        createBlock('b2', 'paragraph', [createSpan('ب')], { ...BODY, alignment: 'center' }),
      ],
    };
    const counts = changeCounts(diffDocuments(base, next));
    expect(counts.text).toBe(1);
    expect(counts.format).toBe(1);
    expect(counts.object).toBe(0);
  });

  it('assigns every change kind to exactly one category', () => {
    for (const change of diffDocuments(doc([['b1', 'أ']]), doc([['b1', 'ب'], ['b2', 'ج']]))) {
      expect(CHANGE_CATEGORY_OF[change.kind]).toBeDefined();
    }
  });
});

/* ══ Rejecting ═════════════════════════════════════════════════════════════ */

describe('Rejecting a change', () => {
  it('removes an inserted block', () => {
    const base = doc([['b1', 'أ']]);
    const next = doc([['b1', 'أ'], ['b2', 'جديد']]);
    const change = diffDocuments(base, next).find((c) => c.kind === 'blockInserted')!;

    const reverted = rejectChange(next, base, change);
    expect(reverted.blocks.map((b) => b.id)).toEqual(['b1']);
  });

  it('never leaves the document with no blocks', () => {
    // The editor would have nothing to type into and no attributes to inherit from.
    const base: BlockDocument = { contentModelVersion: CONTENT_MODEL_VERSION, blocks: [] };
    const next = doc([['b1', 'الوحيدة']]);
    const change = diffDocuments(base, next).find((c) => c.kind === 'blockInserted')!;
    expect(rejectChange(next, base, change).blocks).toHaveLength(1);
  });

  it('restores a deleted block AT ITS ORIGINAL POSITION', () => {
    // Putting it back at the end would be a second, unrequested change.
    const base = doc([['b1', 'أ'], ['b2', 'ب'], ['b3', 'ج']]);
    const next = doc([['b1', 'أ'], ['b3', 'ج']]);
    const change = diffDocuments(base, next).find((c) => c.kind === 'blockDeleted')!;

    const reverted = rejectChange(next, base, change);
    expect(reverted.blocks.map((b) => b.id)).toEqual(['b1', 'b2', 'b3']);
  });

  it('reverts a text change to exactly the baseline text', () => {
    const base = doc([['b1', 'الأصل']]);
    const next = doc([['b1', 'المعدَّل']]);
    const change = diffDocuments(base, next).find((c) => c.kind === 'blockTextChanged')!;
    expect(blockText(rejectChange(next, base, change).blocks[0])).toBe('الأصل');
  });

  it('reverts a format change without touching the text', () => {
    const base = doc([['b1', 'نص']]);
    const next: BlockDocument = {
      ...base,
      blocks: [createBlock('b1', 'paragraph', [createSpan('نص')], { ...BODY, sizePt: 22 })],
    };
    const change = diffDocuments(base, next).find((c) => c.kind === 'blockFormatChanged')!;
    const reverted = rejectChange(next, base, change);
    expect(reverted.blocks[0].attributes.sizePt).toBe(16);
    expect(blockText(reverted.blocks[0])).toBe('نص');
  });

  it('reverts an object move and restores a deleted object', () => {
    const base: BlockDocument = { ...doc([['b1', 'x']]), layout: { objects: [object({ id: 'o1' })], groups: [], guides: [] } };
    const moved: BlockDocument = {
      ...base,
      layout: { objects: [object({ id: 'o1', frame: { xMm: 90, yMm: 90, widthMm: 20, heightMm: 10 } })], groups: [], guides: [] },
    };
    const moveChange = diffDocuments(base, moved)[0];
    expect(rejectChange(moved, base, moveChange).layout!.objects[0].frame.xMm).toBe(10);

    const deleted: BlockDocument = { ...base, layout: { objects: [], groups: [], guides: [] } };
    const deleteChange = diffDocuments(base, deleted)[0];
    expect(rejectChange(deleted, base, deleteChange).layout!.objects).toHaveLength(1);
  });

  it('leaves the document alone for a section change', () => {
    // Section values live outside the block model; the composer restores them from the
    // baseline's own fields.
    const document = doc([['b1', 'نص']]);
    const change = diffDocuments(document, document, SECTIONS, { ...SECTIONS, subject: 'آخر' })[0];
    expect(rejectChange(document, document, change)).toBe(document);
  });

  it('rejecting every change reproduces the baseline document', () => {
    // The end-to-end property: review is only trustworthy if undoing everything gets
    // you exactly back to where you started.
    const base = doc([['b1', 'أول'], ['b2', 'ثاني'], ['b3', 'ثالث']]);
    const next = doc([['b1', 'أول معدّل'], ['b3', 'ثالث'], ['b4', 'رابع']]);

    let current = next;
    for (const change of diffDocuments(base, next)) {
      current = rejectChange(current, base, change);
    }

    expect(current.blocks.map((b) => b.id).sort()).toEqual(['b1', 'b2', 'b3']);
    expect(current.blocks.map(blockText).sort()).toEqual(['أول', 'ثالث', 'ثاني']);
  });
});

/* ══ Smart Export ══════════════════════════════════════════════════════════ */

describe('Smart Export metadata', () => {
  it('offers print, PDF and HTML, and lists Word as unsupported WITH a reason', () => {
    // Listed rather than omitted, so an author who has been told the feature exists
    // finds out why it is greyed instead of hunting for a menu.
    const available = EXPORT_FORMATS.filter((f) => f.available).map((f) => f.id);
    expect(available).toEqual(['print', 'pdf', 'html']);

    const word = EXPORT_FORMATS.find((f) => f.id === 'docx')!;
    expect(word.available).toBe(false);
    expect(word.unavailableReasonAr!.length).toBeGreaterThan(40);
  });

  it('names a file by its reference when there is one', () => {
    expect(exportFilename('OL-2026-000001', 'أي موضوع')).toBe('OL-2026-000001');
  });

  it('falls back to the subject for a draft, stripped of illegal characters', () => {
    expect(exportFilename(null, 'طلب: صيانة/طرق')).toBe('طلب صيانةطرق');
    expect(exportFilename(null, '   ')).toBe('letter-draft');
  });
});

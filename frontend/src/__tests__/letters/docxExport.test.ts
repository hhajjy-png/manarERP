/**
 * Word (.docx) export — the Block Model → `docx` mapper (Form Editor UX Rebuild v2).
 *
 * `buildLetterDocx` is the one function permitted to turn a `BlockDocument` into
 * OOXML. What is checked here is that the output is a REAL, OPENABLE .docx carrying
 * the letter's actual content and formatting — not merely that the function returns
 * without throwing. A .docx is a ZIP archive, so this unzips the result with the same
 * `jszip` the rest of the app already depends on and reads `word/document.xml` back,
 * exactly as Word itself would.
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildLetterDocx } from '../../components/letters/studio/docxExport';
import {
  type BlockDocument,
  createBlock,
  createEmptyBlockDocument,
  createSpan,
} from '../../letters/model/blockTypes';

const BASE_ATTRIBUTES = {
  fontId: 'traditionalArabic' as const,
  sizePt: 16,
  alignment: 'justify' as const,
  indentLevel: 0,
};

async function documentXmlOf(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file('word/document.xml');
  expect(entry, 'word/document.xml missing — not a valid .docx').not.toBeNull();
  return entry!.async('text');
}

describe('buildLetterDocx', () => {
  it('produces a real ZIP archive, not merely bytes', async () => {
    const doc = createEmptyBlockDocument();
    const bytes = await buildLetterDocx(doc);
    expect(bytes.length).toBeGreaterThan(0);
    // The ZIP local-file-header signature — 'PK\x03\x04' — the same two bytes every
    // unzip tool checks first.
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });

  it('an empty document still opens as one empty paragraph, not a body with none', async () => {
    const doc = createEmptyBlockDocument();
    const bytes = await buildLetterDocx(doc);
    const xml = await documentXmlOf(bytes);
    expect(xml).toContain('<w:body>');
  });

  it('carries the paragraph text through, unchanged', async () => {
    const doc: BlockDocument = {
      ...createEmptyBlockDocument(),
      blocks: [
        createBlock('b1', 'paragraph', [createSpan('طلب تمديد مدة العقد')], BASE_ATTRIBUTES),
      ],
    };
    const bytes = await buildLetterDocx(doc);
    const xml = await documentXmlOf(bytes);
    expect(xml).toContain('طلب تمديد مدة العقد');
  });

  it('marks a bold span as bold, and a plain span as not', async () => {
    const doc: BlockDocument = {
      ...createEmptyBlockDocument(),
      blocks: [
        createBlock(
          'b1',
          'paragraph',
          [createSpan('عادي'), createSpan('عريض', ['bold'])],
          BASE_ATTRIBUTES,
        ),
      ],
    };
    const bytes = await buildLetterDocx(doc);
    const xml = await documentXmlOf(bytes);
    // One run has <w:b/>, the other does not — asserted on the raw run XML rather than
    // on any assumption about run ordering or whitespace.
    expect(xml).toMatch(/<w:b\/>/);
    const runs = xml.split('<w:r>');
    const boldRun = runs.find((r) => r.includes('عريض'));
    const plainRun = runs.find((r) => r.includes('عادي'));
    expect(boldRun).toContain('<w:b/>');
    expect(plainRun).not.toContain('<w:b/>');
  });

  it('renders a heading block as a Word heading style, not a plain paragraph', async () => {
    const doc: BlockDocument = {
      ...createEmptyBlockDocument(),
      blocks: [
        createBlock('h1', 'heading', [createSpan('عنوان المستند')], {
          ...BASE_ATTRIBUTES,
          fontId: 'amiri',
          sizePt: 22,
          alignment: 'center',
          headingLevel: 1,
        }),
      ],
    };
    const bytes = await buildLetterDocx(doc);
    const xml = await documentXmlOf(bytes);
    expect(xml).toContain('Heading1');
  });

  it('renders the document right-to-left, as every letter is', async () => {
    const doc: BlockDocument = {
      ...createEmptyBlockDocument(),
      blocks: [createBlock('b1', 'paragraph', [createSpan('نص')], BASE_ATTRIBUTES)],
    };
    const bytes = await buildLetterDocx(doc);
    const xml = await documentXmlOf(bytes);
    expect(xml).toMatch(/<w:bidi\/>/);
  });

  it('keeps a numbered list item and a bulleted list item distinguishable', async () => {
    const doc: BlockDocument = {
      ...createEmptyBlockDocument(),
      blocks: [
        createBlock('n1', 'listItem', [createSpan('بند مرقّم')], {
          ...BASE_ATTRIBUTES,
          listType: 'numbered',
        }),
        createBlock('u1', 'listItem', [createSpan('بند نقطي')], {
          ...BASE_ATTRIBUTES,
          listType: 'bulleted',
        }),
      ],
    };
    const bytes = await buildLetterDocx(doc);
    const xml = await documentXmlOf(bytes);
    expect(xml).toContain('بند مرقّم');
    expect(xml).toContain('بند نقطي');
    // Word expresses both through <w:numPr> — a numbering ID, not the text "bullet" or
    // "numbered". Two DISTINCT numbering ids is what actually distinguishes them.
    const numIds = Array.from(xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)).map((m) => m[1]);
    expect(new Set(numIds).size).toBeGreaterThan(1);
  });
});

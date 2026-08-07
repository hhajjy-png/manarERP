/**
 * Letter Engine binding — Word (.docx) export (Form Editor UX Rebuild v2).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE BLOCK MODEL MAPS DIRECTLY TO A .docx. THE RENDERED PAGE NEVER DOES.
 * ══════════════════════════════════════════════════════════════════════════
 * `exportPipeline.ts` used to record Word as unsupported for exactly one reason: there
 * is no path from a rendered page to a .docx without writing a second renderer with a
 * second idea of what an official letter looks like. That reasoning still holds for a
 * page→docx path — it is why this file does not clone `.lp-stack` the way the PDF/HTML
 * exporters do.
 *
 * What changed is the destination. This maps the SAME `BlockDocument` the paper is
 * painted from — one `docx.Paragraph` per block, one `docx.TextRun` per inline span,
 * reading the identical `fontId`/`sizePt`/marks/`alignment`/`indentLevel` fields
 * `LetterSections.blockStyle` reads for the screen. There is still exactly one idea of
 * what the letter's content is; this is a second RENDERER of it, not a second SOURCE.
 *
 * ── WHAT IS DELIBERATELY NOT REPRODUCED ──────────────────────────────────
 * The reserved header/footer bands, the pre-printed letterhead stock, the barcode and
 * the signature image are PAGE composition, not document content — they come from the
 * Geometry Registry, the registration snapshot and the company branding system
 * respectively, never from a block. Word has no notion of a millimetre-exact reserved
 * zone on customer letterhead, so a .docx that tried to reproduce it would be
 * decorating a guess. The content — every paragraph, heading, list and mark — is
 * reproduced in full, which is what "preserve formatting as much as practical" means
 * for a destination that is not a physical sheet.
 *
 * ── WHY THIS FILE, AND NOT `letters/`─────────────────────────────────────
 * `engineBoundary.test.ts` forbids the engine from importing any package outside the
 * shared Font Registry — a hard rule proven mechanically, not a style preference. `docx`
 * is a package import, so this binding lives beside `exportPipeline.ts` in
 * `components/letters/studio/`, exactly as the PDF/HTML composer does, and reads the
 * engine's pure types (`BlockDocument`, `Block`) without the engine ever knowing this
 * file exists.
 */

import {
  AlignmentType,
  Document,
  HeadingLevel,
  HighlightColor,
  LevelFormat,
  LineRuleType,
  Packer,
  PageBreak,
  Paragraph,
  TextRun,
} from 'docx';
import {
  type Block,
  type BlockAttributes,
  type BlockDocument,
  MAX_INDENT_LEVEL,
} from '../../../letters/model/blockTypes';
import { findLetterFont } from '../../../letters/fonts/fontIntegration';
import { INDENT_STEP_MM } from '../../../letters/registry/geometryRegistry';

/** 1440 twips per inch, 25.4mm per inch — the one unit conversion this file needs. */
const TWIPS_PER_MM = 1440 / 25.4;
const NUMBERED_LIST_REFERENCE = 'letter-numbered-list';

function mmToTwip(mm: number): number {
  return Math.round(mm * TWIPS_PER_MM);
}

/** `TextRun.size` is in half-points. */
function ptToHalfPt(pt: number): number {
  return Math.round(pt * 2);
}

/** Paragraph spacing is in twips — twentieths of a point. */
function ptToTwips(pt: number): number {
  return Math.round(pt * 20);
}

const DOCX_HEADING_LEVEL: Readonly<Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]>> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

function alignmentOf(alignment: BlockAttributes['alignment']): (typeof AlignmentType)[keyof typeof AlignmentType] {
  switch (alignment) {
    case 'justify':
      return AlignmentType.JUSTIFIED;
    case 'center':
      return AlignmentType.CENTER;
    default:
      return AlignmentType.START;
  }
}

/**
 * The registry family name for a block's font — `findLetterFont`, the same lookup
 * `letterFontStack` uses for the screen. Falls back to the id itself only if a stored
 * document names a font this build no longer resolves, which mirrors how the screen
 * degrades rather than refusing to export an otherwise-valid document.
 */
function fontFamilyOf(fontId: BlockAttributes['fontId']): string {
  return findLetterFont(fontId)?.family ?? fontId;
}

/** One `TextRun` per inline span — the smallest addressable unit in both models. */
function runsOf(block: Block, fontFamily: string, sizeHalfPt: number): TextRun[] {
  return block.spans.map(
    (span) =>
      new TextRun({
        text: span.text,
        bold: span.marks.includes('bold'),
        underline: span.marks.includes('underline') ? {} : undefined,
        // The same neutral grey wash `LetterSections` paints on screen — never a hue,
        // for the same reason: official letters are black on pre-printed stock.
        highlight: span.marks.includes('highlight') ? HighlightColor.LIGHT_GRAY : undefined,
        superScript: span.marks.includes('superscript'),
        subScript: span.marks.includes('subscript'),
        font: fontFamily,
        size: sizeHalfPt,
        rightToLeft: true,
      }),
  );
}

/** One `Paragraph` per block, in document order. */
function paragraphOf(block: Block): Paragraph {
  if (block.kind === 'pageBreak') {
    return new Paragraph({ children: [new PageBreak()] });
  }

  const attrs = block.attributes;
  const fontFamily = fontFamilyOf(attrs.fontId);
  const sizeHalfPt = ptToHalfPt(attrs.sizePt);
  const isList = block.kind === 'listItem';

  return new Paragraph({
    children: runsOf(block, fontFamily, sizeHalfPt),
    // Every letter is Arabic RTL — the same assumption `LetterPaper` makes with
    // `dir="rtl"` on the sheet itself.
    bidirectional: true,
    alignment: alignmentOf(attrs.alignment),
    heading: block.kind === 'heading' ? DOCX_HEADING_LEVEL[attrs.headingLevel ?? 1] : undefined,
    bullet: isList && attrs.listType === 'bulleted' ? { level: attrs.indentLevel } : undefined,
    numbering:
      isList && attrs.listType === 'numbered'
        ? { reference: NUMBERED_LIST_REFERENCE, level: attrs.indentLevel }
        : undefined,
    // A list item's indent comes from its own numbering/bullet level, set below in
    // `buildNumberingConfig` — applying a manual indent on top would double it.
    indent: isList
      ? undefined
      : {
          start: attrs.indentLevel > 0 ? mmToTwip(attrs.indentLevel * INDENT_STEP_MM) : undefined,
          firstLine: attrs.firstLineIndentMm ? mmToTwip(attrs.firstLineIndentMm) : undefined,
          hanging: attrs.hangingIndentMm ? mmToTwip(attrs.hangingIndentMm) : undefined,
        },
    spacing: {
      after: attrs.paragraphSpacingPt ? ptToTwips(attrs.paragraphSpacingPt) : undefined,
      line: attrs.lineHeight ? Math.round(attrs.lineHeight * 240) : undefined,
      lineRule: attrs.lineHeight ? LineRuleType.AUTO : undefined,
    },
  });
}

/**
 * The one numbering style every ordered list in the letter shares, at the model's own
 * two indent levels plus the flush level — `MAX_INDENT_LEVEL` read from the engine
 * rather than restated, so a future change to the ladder cannot silently fall out of
 * step with this file.
 */
function buildNumberingConfig() {
  const levels = Array.from({ length: MAX_INDENT_LEVEL + 1 }, (_unused, level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.START,
    style: {
      paragraph: {
        indent: {
          start: mmToTwip(INDENT_STEP_MM * (level + 1)),
          hanging: mmToTwip(INDENT_STEP_MM * 0.6),
        },
      },
    },
  }));
  return { reference: NUMBERED_LIST_REFERENCE, levels };
}

/**
 * Build the .docx bytes for a letter's content.
 *
 * An empty document still produces one empty paragraph rather than a body with no
 * children at all — Word opens the latter, but it is not a shape any other export
 * destination produces, and there is no reason this one should be the exception.
 */
export async function buildLetterDocx(document: BlockDocument): Promise<Uint8Array> {
  const paragraphs = document.blocks.map(paragraphOf);

  const file = new Document({
    numbering: { config: [buildNumberingConfig()] },
    sections: [{ children: paragraphs.length > 0 ? paragraphs : [new Paragraph({ children: [new TextRun('')] })] }],
  });

  const blob = await Packer.toBlob(file);
  return new Uint8Array(await blob.arrayBuffer());
}

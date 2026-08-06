/**
 * Letter Engine — named paragraph and character styles (Document Studio Foundation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A STYLE IS A NAMED SET OF ATTRIBUTES THE EDITOR ALREADY HAS. IT IS NOT A
 *  NEW KIND OF FORMATTING, AND IT INTRODUCES NO NEW RENDERING PATH.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Applying "Heading 2" writes `kind: 'heading'`, `headingLevel: 2` and a handful of
 * ordinary block attributes. Nothing downstream — not `blockStyle`, not the
 * measurement mirror, not the paginator, not the print pipeline — learns that styles
 * exist. That is the entire design: a style is a SHORTCUT THROUGH THE EXISTING MODEL,
 * so a document containing headings is a document containing blocks with attributes,
 * and it paginates and prints by the rules already in force.
 *
 * ── WHY `paragraphStyleId` IS STORED AT ALL ──────────────────────────────
 * Purely so the toolbar can show which style is active. It is never read to decide how
 * to render: the concrete type is in the attributes themselves. A stored id this build
 * no longer declares therefore degrades to "custom" in the picker and changes nothing
 * about the page — which is the correct behaviour for a registry that will gain
 * entries later.
 *
 * ── THE AMIRI PAIRING IS INHERITED, NOT REOPENED ─────────────────────────
 * Every bold style below names `amiri`, for exactly the reason recorded in
 * `typographyPresets.ts`: the approved body face, Traditional Arabic, ships no real
 * bold, and asking the browser to synthesise one produces a smear that rasterises
 * differently between screen and PDF. `documentStyles.test.ts` asserts every style's
 * weight is a weight its font actually declares, so this cannot silently regress.
 *
 * ── NO FONT-FAMILY STRING APPEARS HERE ───────────────────────────────────
 * INV-5. Only `FontId` values, exactly as the typography presets do — and
 * `fontRegistryEnforcement.test.ts` fails the build if a family literal appears
 * anywhere under `src/letters/`.
 */

import { type FontId, findFont } from '../../styles/fontRegistry';
import {
  type BlockAttributes,
  type BlockKind,
  type HeadingLevel,
} from '../model/blockTypes';
import { type TextAlignment } from './typographyPresets';

/* ── Paragraph styles ───────────────────────────────────────────────────── */

/**
 * The attributes a paragraph style writes.
 *
 * A `Partial<BlockAttributes>` deliberately: a style states what it decides and stays
 * silent about the rest, so applying "Quote" does not reset a font the author chose
 * on purpose. `indentLevel` is the one exception — it is part of what "Quote" means.
 */
export interface ParagraphStyle {
  readonly id: string;
  readonly labelAr: string;
  readonly labelEn: string;
  /** The block kind this style produces. Headings produce `heading`. */
  readonly kind: BlockKind;
  /** Present exactly when `kind === 'heading'`. */
  readonly headingLevel?: HeadingLevel;
  readonly fontId: FontId;
  readonly sizePt: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly alignment: TextAlignment;
  readonly paragraphSpacingPt: number;
  /** Shown in the picker so the six heading levels are distinguishable at a glance. */
  readonly outlineDepth: number;
}

/**
 * The eight styles the Official Letter offers.
 *
 * Sizes are rungs of `FONT_SIZE_LADDER_PT` without exception — a style that set an
 * off-ladder size would produce a block the integrity checker rejects, which is the
 * check working rather than a limitation to route around.
 *
 * The six heading levels compress from 22 pt down to 14 pt across a range that is
 * genuinely narrow, because an official letter is not a report: H1 and H6 are four
 * points apart, and the distinction between deep levels is carried by weight and
 * alignment as much as by size.
 *
 * ── LINE HEIGHTS ARE LADDER RUNGS, NOT PRESET VALUES ─────────────────────
 * Every `lineHeight` below is a rung of `LINE_HEIGHT_LADDER`. That is a hard
 * constraint, not a preference: a style setting an off-ladder value produces a block
 * `blockModelIntegrity` rejects, so the document could be built but not saved and
 * reopened. The typography presets use 1.3 for their heading role; the two display
 * levels here take 1.15 instead — tighter leading on large type is typographically
 * correct anyway, so the constraint and the craft agree.
 */
export const PARAGRAPH_STYLES = {
  body: {
    id: 'body',
    labelAr: 'نص عادي',
    labelEn: 'Body',
    kind: 'paragraph',
    fontId: 'traditionalArabic',
    sizePt: 16,
    weight: 400,
    lineHeight: 1.35,
    alignment: 'justify',
    paragraphSpacingPt: 0,
    outlineDepth: 0,
  },
  heading1: {
    id: 'heading1',
    labelAr: 'عنوان ١',
    labelEn: 'Heading 1',
    kind: 'heading',
    headingLevel: 1,
    fontId: 'amiri',
    sizePt: 22,
    weight: 700,
    lineHeight: 1.15,
    alignment: 'center',
    paragraphSpacingPt: 9,
    outlineDepth: 1,
  },
  heading2: {
    id: 'heading2',
    labelAr: 'عنوان ٢',
    labelEn: 'Heading 2',
    kind: 'heading',
    headingLevel: 2,
    fontId: 'amiri',
    sizePt: 20,
    weight: 700,
    lineHeight: 1.15,
    alignment: 'start',
    paragraphSpacingPt: 6,
    outlineDepth: 2,
  },
  heading3: {
    id: 'heading3',
    labelAr: 'عنوان ٣',
    labelEn: 'Heading 3',
    kind: 'heading',
    headingLevel: 3,
    fontId: 'amiri',
    sizePt: 18,
    weight: 700,
    lineHeight: 1.35,
    alignment: 'start',
    paragraphSpacingPt: 6,
    outlineDepth: 3,
  },
  heading4: {
    id: 'heading4',
    labelAr: 'عنوان ٤',
    labelEn: 'Heading 4',
    kind: 'heading',
    headingLevel: 4,
    fontId: 'amiri',
    sizePt: 16,
    weight: 700,
    lineHeight: 1.35,
    alignment: 'start',
    paragraphSpacingPt: 3,
    outlineDepth: 4,
  },
  heading5: {
    id: 'heading5',
    labelAr: 'عنوان ٥',
    labelEn: 'Heading 5',
    kind: 'heading',
    headingLevel: 5,
    fontId: 'amiri',
    sizePt: 16,
    weight: 400,
    lineHeight: 1.35,
    alignment: 'start',
    paragraphSpacingPt: 3,
    outlineDepth: 5,
  },
  heading6: {
    id: 'heading6',
    labelAr: 'عنوان ٦',
    labelEn: 'Heading 6',
    kind: 'heading',
    headingLevel: 6,
    fontId: 'amiri',
    sizePt: 14,
    weight: 400,
    lineHeight: 1.35,
    alignment: 'start',
    paragraphSpacingPt: 3,
    outlineDepth: 6,
  },
  quote: {
    id: 'quote',
    labelAr: 'اقتباس',
    labelEn: 'Quote',
    kind: 'paragraph',
    fontId: 'traditionalArabic',
    sizePt: 14,
    weight: 400,
    lineHeight: 1.5,
    alignment: 'start',
    paragraphSpacingPt: 6,
    outlineDepth: 0,
  },
} as const satisfies Record<string, ParagraphStyle>;

export type ParagraphStyleId = keyof typeof PARAGRAPH_STYLES;

export const PARAGRAPH_STYLE_IDS = Object.keys(PARAGRAPH_STYLES) as ParagraphStyleId[];

/* ── Character styles ───────────────────────────────────────────────────── */

/**
 * A named set of marks.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A CHARACTER STYLE HERE APPLIES TO THE WHOLE PARAGRAPH, NOT TO A RANGE.
 * ══════════════════════════════════════════════════════════════════════════
 * That is not a shortcut: the composer's one-span-per-block invariant makes a
 * character range unrepresentable by construction (see `blockCommands`), and a style
 * that pretended otherwise would have to introduce the second span the whole model
 * exists to prevent. Applying "تأكيد" therefore marks the paragraph, exactly as
 * pressing Bold does — the style's value is that it NAMES a combination, so "how do we
 * mark a quoted reference" has one answer instead of five.
 */
export interface CharacterStyle {
  readonly id: string;
  readonly labelAr: string;
  readonly labelEn: string;
  /** The marks this style sets. An empty array is the "none" style. */
  readonly marks: readonly ('bold' | 'underline' | 'highlight' | 'superscript' | 'subscript')[];
}

export const CHARACTER_STYLES = {
  none: { id: 'none', labelAr: 'بلا نمط', labelEn: 'None', marks: [] },
  emphasis: { id: 'emphasis', labelAr: 'تأكيد', labelEn: 'Emphasis', marks: ['bold'] },
  strong: { id: 'strong', labelAr: 'تأكيد قوي', labelEn: 'Strong', marks: ['bold', 'underline'] },
  reference: { id: 'reference', labelAr: 'إشارة مرجعية', labelEn: 'Reference', marks: ['underline'] },
  notation: { id: 'notation', labelAr: 'تنويه', labelEn: 'Notation', marks: ['highlight'] },
} as const satisfies Record<string, CharacterStyle>;

export type CharacterStyleId = keyof typeof CHARACTER_STYLES;

export const CHARACTER_STYLE_IDS = Object.keys(CHARACTER_STYLES) as CharacterStyleId[];

/* ── Queries ────────────────────────────────────────────────────────────── */

/** A paragraph style known at compile time. */
export function getParagraphStyle(id: ParagraphStyleId): ParagraphStyle {
  return PARAGRAPH_STYLES[id];
}

/** Lookup by an untrusted id — e.g. one read from a stored document. */
export function findParagraphStyle(id: string | null | undefined): ParagraphStyle | undefined {
  if (!id) return undefined;
  if (!Object.prototype.hasOwnProperty.call(PARAGRAPH_STYLES, id)) return undefined;
  return (PARAGRAPH_STYLES as Record<string, ParagraphStyle>)[id];
}

export function getCharacterStyle(id: CharacterStyleId): CharacterStyle {
  return CHARACTER_STYLES[id];
}

export function findCharacterStyle(id: string | null | undefined): CharacterStyle | undefined {
  if (!id) return undefined;
  if (!Object.prototype.hasOwnProperty.call(CHARACTER_STYLES, id)) return undefined;
  return (CHARACTER_STYLES as Record<string, CharacterStyle>)[id];
}

/** Every paragraph style, in declaration order — Body first, then H1…H6, then Quote. */
export function getAllParagraphStyles(): ParagraphStyle[] {
  return PARAGRAPH_STYLE_IDS.map((id) => PARAGRAPH_STYLES[id]);
}

export function getAllCharacterStyles(): CharacterStyle[] {
  return CHARACTER_STYLE_IDS.map((id) => CHARACTER_STYLES[id]);
}

/**
 * The attribute patch a paragraph style writes.
 *
 * Returned as a patch rather than applied here, so the pure command in `blockCommands`
 * stays the only thing that edits a document.
 */
export function paragraphStyleAttributes(style: ParagraphStyle): Partial<BlockAttributes> {
  return {
    fontId: style.fontId,
    sizePt: style.sizePt,
    alignment: style.alignment,
    lineHeight: style.lineHeight,
    paragraphSpacingPt: style.paragraphSpacingPt,
    headingLevel: style.headingLevel,
    paragraphStyleId: style.id,
  };
}

/**
 * Does this style ask for a weight the font actually ships?
 *
 * The same check `presetWeightIsReal` performs for typography presets, for the same
 * reason: a `false` means the browser would synthesise the face. The registry test
 * uses it to keep the Amiri pairing from regressing into faux bold.
 */
export function paragraphStyleWeightIsReal(style: ParagraphStyle): boolean {
  const meta = findFont(style.fontId);
  if (!meta) return false;
  return meta.weights.includes(style.weight);
}

/**
 * Which style, if any, a block's attributes currently match.
 *
 * Compares the CONCRETE attributes rather than trusting `paragraphStyleId`, so a
 * paragraph whose font or size was changed by hand after a style was applied reports
 * as `undefined` — "custom" — instead of continuing to claim a style it no longer
 * matches. That is what makes the toolbar's style picker honest.
 */
export function matchParagraphStyle(
  attributes: BlockAttributes,
  kind: BlockKind,
  marks: readonly string[] = [],
): ParagraphStyle | undefined {
  const isBold = marks.includes('bold');
  return getAllParagraphStyles().find(
    (style) =>
      style.kind === kind &&
      style.headingLevel === attributes.headingLevel &&
      style.fontId === attributes.fontId &&
      style.sizePt === attributes.sizePt &&
      style.alignment === attributes.alignment &&
      // Weight lives on the `bold` mark — see `applyParagraphStyle` for why the model
      // has exactly one way to say "heavier".
      (style.weight >= 700) === isBold &&
      (attributes.lineHeight ?? style.lineHeight) === style.lineHeight &&
      (attributes.paragraphSpacingPt ?? style.paragraphSpacingPt) === style.paragraphSpacingPt,
  );
}

/** Which character style a mark set matches, comparing as sets rather than as arrays. */
export function matchCharacterStyle(marks: readonly string[]): CharacterStyle | undefined {
  const applied = new Set(marks);
  return getAllCharacterStyles().find(
    (style) => style.marks.length === applied.size && style.marks.every((mark) => applied.has(mark)),
  );
}

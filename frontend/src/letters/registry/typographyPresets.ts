/**
 * Letter Engine — typography presets (INV-5).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  ONLY `FontId` VALUES APPEAR HERE. NO `font-family` STRING, EVER.
 * ══════════════════════════════════════════════════════════════════════════
 * Every preset names a font by its registry id. Resolving that id to a family — and
 * to a real font stack — happens in `fonts/fontIntegration.ts`, which is the single
 * sanctioned path from an id to a family string. `fontRegistryEnforcement.test.ts`
 * fails the build if a family literal appears anywhere under `src/letters/`.
 *
 * WHY A ROLE MAP RATHER THAN PER-SECTION FONTS
 * ────────────────────────────────────────────
 * Sections declare a typographic ROLE ("this is a heading"); the template maps roles
 * to concrete type. That indirection is what lets a future template restyle every
 * heading in one entry instead of editing each section, and it is why the section
 * specs in `model/sectionTypes.ts` carry a role rather than a font.
 *
 * THE AMIRI DECISION — recorded because it looks arbitrary and is not
 * ────────────────────────────────────────────────────────────────────
 * The approved body font, Traditional Arabic, declares `supportsBold: false` and
 * `weights: [400]` in the Font Registry: it has NO real bold face. Setting a bold
 * heading in it would make the browser synthesise a slant-and-smear that looks wrong
 * on official stock and rasterises differently between screen and PDF.
 *
 * Amiri is `category: 'Official'`, lists `letters` in `recommendedFor`, and ships a
 * genuine 700 weight. So headings and the subject use Amiri Bold while the body stays
 * Traditional Arabic — a deliberate two-font pairing, entirely inside the approved
 * registry. `templateRegistry.test.ts` asserts every bold preset resolves to a font
 * with a real bold face, so this cannot silently regress.
 */

import { type FontId, findFont } from '../../styles/fontRegistry';

/**
 * A typographic role a section can ask for. Roles, not sections: two sections may
 * legitimately share type, and one section's type may legitimately change role.
 */
export type TypographyRole = 'body' | 'heading' | 'subject' | 'recipient' | 'date' | 'footer';

export const TYPOGRAPHY_ROLES: readonly TypographyRole[] = [
  'body',
  'heading',
  'subject',
  'recipient',
  'date',
  'footer',
];

/**
 * Logical alignment — NOT physical.
 *
 * The approved set is Justify / Right / Centre, with Left prohibited. Expressed
 * logically, that is exactly `justify | start | center`: under the engine's RTL
 * direction `start` IS right, and the prohibited option simply has no name here.
 * `end` is deliberately absent, so "left-align" is not merely discouraged — it is
 * unrepresentable.
 */
export type TextAlignment = 'justify' | 'start' | 'center';

export const TEXT_ALIGNMENTS: readonly TextAlignment[] = ['justify', 'start', 'center'];

/**
 * The font sizes a user may choose in the editor, in points.
 *
 * A fixed ladder rather than a free number, for three reasons: the approved
 * typography defines only a handful of roles; a free field invites 11 pt bodies that
 * break the official register; and every size is an input to pagination, so a bounded
 * set is a bounded validation surface.
 *
 * This constrains USER-SELECTABLE content type only. Engine-rendered chrome — the
 * page-footer strip — is not user-editable and is not bound by it.
 */
export const FONT_SIZE_LADDER_PT: readonly number[] = [14, 16, 18, 20, 22];

/** Is this a size the editor may set? */
export function isLadderSizePt(sizePt: number): boolean {
  return FONT_SIZE_LADDER_PT.includes(sizePt);
}

export interface TypographyPreset {
  readonly role: TypographyRole;
  /** Registry id. Never a family name. */
  readonly fontId: FontId;
  readonly sizePt: number;
  /**
   * Numeric weight. Must be a weight the font actually declares — asserted by test,
   * so a preset can never promise a face the font file does not contain.
   */
  readonly weight: number;
  readonly lineHeight: number;
  readonly alignment: TextAlignment;
}

/** A complete role → type mapping. A template names one of these. */
export type TypographyPresetSet = Readonly<Record<TypographyRole, TypographyPreset>>;

export type TypographyPresetSetId = keyof typeof TYPOGRAPHY_PRESET_SETS;

/**
 * Preset sets. One in v1, named for the document class it dresses rather than for the
 * template that uses it — a second official-style template should reuse it, not clone it.
 */
export const TYPOGRAPHY_PRESET_SETS = {
  officialArabic: {
    /** Flowing letter body. The approved default: Traditional Arabic 16 pt, justified. */
    body: {
      role: 'body',
      fontId: 'traditionalArabic',
      sizePt: 16,
      weight: 400,
      lineHeight: 1.35,
      alignment: 'justify',
    },
    /** Main document title. Approved range 20–22 pt Bold; 22 is the default. */
    heading: {
      role: 'heading',
      fontId: 'amiri',
      sizePt: 22,
      weight: 700,
      lineHeight: 1.3,
      alignment: 'center',
    },
    /** The subject line. Approved: 18 pt Bold. */
    subject: {
      role: 'subject',
      fontId: 'amiri',
      sizePt: 18,
      weight: 700,
      lineHeight: 1.35,
      alignment: 'center',
    },
    /** Addressee block. Body type, start-aligned. */
    recipient: {
      role: 'recipient',
      fontId: 'traditionalArabic',
      sizePt: 16,
      weight: 400,
      lineHeight: 1.35,
      alignment: 'start',
    },
    /** Issue date. Body type, start-aligned. */
    date: {
      role: 'date',
      fontId: 'traditionalArabic',
      sizePt: 16,
      weight: 400,
      lineHeight: 1.35,
      alignment: 'start',
    },
    /**
     * The page-footer strip. Engine chrome, not user content — hence a size off the
     * editor's ladder, which constrains only what a user may choose.
     */
    footer: {
      role: 'footer',
      fontId: 'traditionalArabic',
      sizePt: 10,
      weight: 400,
      lineHeight: 1.2,
      alignment: 'center',
    },
  },
} as const satisfies Record<string, TypographyPresetSet>;

export const TYPOGRAPHY_PRESET_SET_IDS = Object.keys(
  TYPOGRAPHY_PRESET_SETS,
) as TypographyPresetSetId[];

/* ── Queries ────────────────────────────────────────────────────────────── */

/** A preset set known at compile time. */
export function getTypographyPresetSet(id: TypographyPresetSetId): TypographyPresetSet {
  return TYPOGRAPHY_PRESET_SETS[id];
}

/** The preset for one role within a set. */
export function getTypographyPreset(
  setId: TypographyPresetSetId,
  role: TypographyRole,
): TypographyPreset {
  return TYPOGRAPHY_PRESET_SETS[setId][role];
}

/** Lookup by an untrusted set id — e.g. from a stored document. */
export function findTypographyPresetSet(
  id: string | null | undefined,
): TypographyPresetSet | undefined {
  if (!id) return undefined;
  if (!Object.prototype.hasOwnProperty.call(TYPOGRAPHY_PRESET_SETS, id)) return undefined;
  return (TYPOGRAPHY_PRESET_SETS as Record<string, TypographyPresetSet>)[id];
}

/**
 * Does this preset ask for a weight the font actually ships?
 *
 * A `false` here means the browser would synthesise the face. The registry-integrity
 * test uses this to keep the Amiri decision above from regressing into faux bold.
 */
export function presetWeightIsReal(preset: TypographyPreset): boolean {
  const meta = findFont(preset.fontId);
  if (!meta) return false;
  return meta.weights.includes(preset.weight);
}

/**
 * Letter Engine — Font Registry integration layer (INV-5).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE ONLY SANCTIONED PATH FROM A `FontId` TO A FONT-FAMILY STRING.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * INV-5: "All typography must use Font Registry. Never use font-family strings
 * directly. Only FontId values are stored." Everything the engine stores, compares
 * and transports is a `FontId`. A family string is needed exactly once — at the CSS
 * boundary — and `letterFontStack()` below is the one function permitted to produce
 * it, by delegating to the registry's own `fontStackFor`. It does not build a stack;
 * it asks for one.
 *
 * `fontRegistryEnforcement.test.ts` fails the build if a family literal appears
 * anywhere under `src/letters/`, including in this file.
 *
 * WHY THIS LAYER EXISTS AT ALL RATHER THAN CALLING THE REGISTRY DIRECTLY
 * ─────────────────────────────────────────────────────────────────────
 * Two engine-specific decisions that do not belong in the shared registry, because
 * they are true of letters and not of the rest of the application:
 *
 *   1. HOW A TYPOGRAPHY ROLE RESOLVES. Sections name a role; the template maps roles
 *      to presets; this resolves the pair into concrete, renderable type.
 *   2. WHAT COUNTS AS A REAL WEIGHT. The registry reports what a font file contains;
 *      this is where the engine decides that promising a face the file lacks is an
 *      error rather than an acceptable browser-synthesised approximation.
 *
 * THIS PACK MODIFIES NOTHING IN THE FONT REGISTRY.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  FONT PICKER — DYNAMIC REGISTRY HOTFIX v2 — no allow-list, no curation
 * ══════════════════════════════════════════════════════════════════════════
 * Fourth policy this function has carried: `category === 'Official'` (three fonts) →
 * `recommendedFor` includes `'letters'` (five fonts) → a named ten-family allow-list
 * (`APPROVED_LETTER_FONT_IDS`) → and now, on explicit instruction, back to THIS —
 * every font the registry itself marks `enabled`, with no name, category, or
 * `recommendedFor` filter of any kind layered on top. `getEnabledFonts()` alone
 * decides membership.
 *
 * This makes the Font Registry the single, sole and dynamic source of truth for the
 * letter picker: a font added to `FontRegistry` in the future and marked `enabled`
 * appears in the letter composer automatically, with zero changes to this file or
 * any other. A font marked `enabled: false` disappears the same way, for the same
 * reason. There is no second list anywhere in the engine for this to drift out of
 * sync with.
 */

import {
  type FontId,
  type FontMeta,
  findFont,
  fontStackFor,
  getEnabledFonts,
} from '../../styles/fontRegistry';
import {
  type TypographyPreset,
  type TypographyRole,
  type TypographyPresetSetId,
  getTypographyPreset,
} from '../registry/typographyPresets';
import { type DocumentTemplate } from '../registry/templateRegistry';

/**
 * The fonts a letter may be set in — every registry font marked `enabled`, exactly as
 * `getEnabledFonts()` reports it. See the file header for the full policy history.
 *
 * Each family appears exactly once. The registry itself already guarantees this — one
 * entry per family, with every weight/file the family ships declared inside that one
 * entry's `weights` array (see `FontMeta`) — so no separate de-duplication step exists
 * or is needed here.
 */
export function getLetterFontPool(): FontMeta[] {
  return getEnabledFonts();
}

/** Ids of the letter font pool. */
export function getLetterFontIds(): FontId[] {
  return getLetterFontPool().map((f) => f.id as FontId);
}

/** Is this font id inside the letter pool? */
export function isLetterPoolFontId(id: string | null | undefined): boolean {
  if (!id) return false;
  return getLetterFontIds().some((poolId) => poolId === id);
}

/**
 * Font metadata for an id that came from stored data.
 *
 * Returns `undefined` rather than throwing so a load path can report precisely which
 * document references a font this build no longer knows, instead of crashing.
 */
export function findLetterFont(id: string | null | undefined): FontMeta | undefined {
  return findFont(id);
}

/**
 * A CSS font stack for a registry id.
 *
 * THE ONLY FUNCTION IN THE ENGINE THAT MAY RETURN A FAMILY STRING, and it produces
 * none of its own — `fontStackFor` builds it from the registry, with the registry's
 * own fallback tail, so a letter degrades exactly as every other document in the
 * application degrades.
 */
export function letterFontStack(id: FontId): string {
  return fontStackFor(id);
}

/**
 * Type resolved for rendering: a preset plus the font metadata behind it.
 *
 * Carries `weightIsReal` rather than leaving callers to re-derive it, so the decision
 * "would the browser have to synthesise this face?" is made once, here.
 */
export interface ResolvedTypography {
  readonly role: TypographyRole;
  readonly fontId: FontId;
  readonly meta: FontMeta;
  readonly sizePt: number;
  readonly weight: number;
  readonly lineHeight: number;
  readonly alignment: TypographyPreset['alignment'];
  /** `false` means the font file lacks this weight and the browser would fake it. */
  readonly weightIsReal: boolean;
}

/**
 * Resolve a typography role within a preset set.
 *
 * Throws on an unresolvable font id: a preset naming a font the registry does not
 * have is a build-time defect in the registry, not a runtime condition to degrade
 * through — and the registry integrity test catches it long before this could fire.
 */
export function resolveTypography(
  presetSetId: TypographyPresetSetId,
  role: TypographyRole,
): ResolvedTypography {
  const preset = getTypographyPreset(presetSetId, role);
  const meta = findFont(preset.fontId);
  if (!meta) {
    throw new Error(
      `[LetterEngine] Typography preset "${presetSetId}.${role}" names font id ` +
        `"${preset.fontId}", which the Font Registry does not resolve.`,
    );
  }
  return {
    role,
    fontId: preset.fontId,
    meta,
    sizePt: preset.sizePt,
    weight: preset.weight,
    lineHeight: preset.lineHeight,
    alignment: preset.alignment,
    weightIsReal: meta.weights.includes(preset.weight),
  };
}

/** Resolve a role using the template's own preset set — the usual call. */
export function resolveTemplateTypography(
  template: DocumentTemplate,
  role: TypographyRole,
): ResolvedTypography {
  return resolveTypography(template.typographyPresetSetId, role);
}

/**
 * Does this font have a real bold face?
 *
 * The check behind the engine's two-font pairing: Traditional Arabic reports `false`,
 * which is why headings and the subject are set in Amiri rather than a synthesised
 * bold of the body face.
 */
export function hasRealBold(id: FontId): boolean {
  const meta = findFont(id);
  return meta?.supportsBold === true;
}

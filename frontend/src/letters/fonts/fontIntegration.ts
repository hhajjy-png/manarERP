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
 * Three engine-specific decisions that do not belong in the shared registry, because
 * they are true of letters and not of the rest of the application:
 *
 *   1. WHICH FONTS A LETTER MAY USE. The registry's twelve families serve charts,
 *      tables and dashboards too. A letter's pool is narrower — see below.
 *   2. HOW A TYPOGRAPHY ROLE RESOLVES. Sections name a role; the template maps roles
 *      to presets; this resolves the pair into concrete, renderable type.
 *   3. WHAT COUNTS AS A REAL WEIGHT. The registry reports what a font file contains;
 *      this is where the engine decides that promising a face the file lacks is an
 *      error rather than an acceptable browser-synthesised approximation.
 *
 * THIS PACK MODIFIES NOTHING IN THE FONT REGISTRY.
 * The design work flagged that non-bundled families break print fidelity — a system
 * font renders from whatever the machine happens to ship, so the same registered
 * document can paginate differently on a different PC. The registry has no `bundled`
 * flag today, and adding one would mean editing a file outside this pack's boundary.
 * It is not needed in v1 for a simple reason: the letter pool is the `Official`
 * category, whose three members are all `@font-face`-declared in the repository.
 * Tahoma — the one system font in the registry — is `UI` and therefore already out of
 * the pool. Widening the pool beyond `Official` is what would require the flag, and
 * that is recorded as a deferred item, not done here.
 */

import {
  type FontId,
  type FontMeta,
  findFont,
  fontStackFor,
  getFontsByCategory,
} from '../../styles/fontRegistry';
import {
  type TypographyPreset,
  type TypographyRole,
  type TypographyPresetSetId,
  getTypographyPreset,
} from '../registry/typographyPresets';
import { type DocumentTemplate } from '../registry/templateRegistry';

/**
 * The fonts a letter may be set in.
 *
 * The registry's `Official` category — Traditional Arabic, Simplified Arabic Fixed
 * and Amiri. All three are bundled `@font-face` families, so a document renders
 * identically on every machine, which is a precondition for the safe-zone guarantee:
 * a font that resolves differently elsewhere paginates differently elsewhere.
 */
export function getLetterFontPool(): FontMeta[] {
  return getFontsByCategory('Official');
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

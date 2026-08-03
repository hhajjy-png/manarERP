/**
 * INV-5 — "All typography must use Font Registry. Never use font-family strings
 * directly. Only FontId values are stored."
 *
 * Two halves:
 *
 *  1. A SOURCE SCAN proving no family string is written in the engine. The single
 *     sanctioned escape is `letterFontStack()`, which does not build a stack — it
 *     asks the registry for one.
 *
 *  2. REGISTRY-AGREEMENT ASSERTIONS proving every font the engine names actually
 *     exists, is enabled, and really ships the weight its preset asks for. This is
 *     the half that keeps the Traditional-Arabic-has-no-bold decision from silently
 *     regressing into browser-synthesised faux bold on official stationery.
 */
import { describe, it, expect } from 'vitest';
import { readEngineSources, matchingLines } from './engineSourceScan';
import { FontRegistry, findFont, fontStackFor } from '../../styles/fontRegistry';
import {
  TYPOGRAPHY_PRESET_SETS,
  TYPOGRAPHY_PRESET_SET_IDS,
  TYPOGRAPHY_ROLES,
  FONT_SIZE_LADDER_PT,
  TEXT_ALIGNMENTS,
  presetWeightIsReal,
} from '../../letters/registry/typographyPresets';
import {
  getLetterFontPool,
  getLetterFontIds,
  isLetterPoolFontId,
  letterFontStack,
  resolveTypography,
  hasRealBold,
} from '../../letters/fonts/fontIntegration';

const SOURCES = readEngineSources();

/** Every family name the registry declares — the strings that must never be typed. */
const ALL_FAMILY_NAMES = Object.values(FontRegistry).map((f) => f.family);

describe('INV-5 — no font-family string is written in the engine', () => {
  it('finds engine sources to scan', () => {
    expect(SOURCES.length).toBeGreaterThan(10);
  });

  it('no source declares a `font-family` / `fontFamily` STRING value', () => {
    // Two distinct shapes, kept separate deliberately:
    //
    //   · `font-family:` — the CSS property. Always a violation inside engine
    //     TypeScript, whatever follows it.
    //   · `fontFamily` assigned a STRING or TEMPLATE literal — the JS style-object
    //     form. The value is what matters: `fontFamily` also happens to be the id of
    //     the font-picker toolbar command, which is assigned an object and stores no
    //     family at all. Matching the bare identifier would flag that and teach the
    //     next reader to disable the check.
    const cssProperty = /font-family\s*:/i;
    const styleObject = /fontFamily\s*[:=]\s*['"`]/;
    const hits = [
      ...SOURCES.flatMap((f) => matchingLines(f, cssProperty)),
      ...SOURCES.flatMap((f) => matchingLines(f, styleObject)),
    ];
    expect(hits, `font-family declaration(s) in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('every `fontFamily` in the engine is the toolbar command id, nothing more', () => {
    // Pins the exemption above so it cannot silently widen. The identifier legitimately
    // appears in exactly two roles: the catalogue that declares the command, and a
    // template's allow-list that selects it. Anywhere else — or any other shape — and
    // the reason has to be re-examined rather than assumed benign.
    const ALLOWED_FILES = ['registry/toolbarCommands.ts', 'registry/templateRegistry.ts'];
    const hits = SOURCES.flatMap((f) => matchingLines(f, /fontFamily/));

    const wrongFile = hits.filter((h) => !ALLOWED_FILES.some((file) => h.startsWith(`${file}:`)));
    expect(wrongFile, `\`fontFamily\` outside the command catalogue/allow-list:\n${wrongFile.join('\n')}`).toEqual([]);

    // And in those two files it is only ever a bare id — a union member, an object key,
    // or a quoted list entry — never a value assigned a family string.
    for (const hit of hits) {
      expect(hit, `unexpected \`fontFamily\` shape: ${hit}`).toMatch(
        /\|\s*'fontFamily'|fontFamily:\s*\{|id:\s*'fontFamily'|^\S+\s+'fontFamily',$/,
      );
    }
  });

  it('no source contains a registry family name as a literal', () => {
    const hits: string[] = [];
    for (const family of ALL_FAMILY_NAMES) {
      // Case-sensitive and exact: `'cairo'` is a FontId and is fine; `'Cairo'` is a
      // family name and is not.
      const pattern = new RegExp(`["'\`]${family.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
      for (const file of SOURCES) hits.push(...matchingLines(file, pattern));
    }
    expect(hits, `Font family literal(s) in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('`letterFontStack` delegates to the registry rather than building a stack', () => {
    for (const id of getLetterFontIds()) {
      expect(letterFontStack(id)).toBe(fontStackFor(id));
    }
  });
});

describe('Typography presets agree with the Font Registry', () => {
  it('every preset set covers every declared role', () => {
    for (const setId of TYPOGRAPHY_PRESET_SET_IDS) {
      const set = TYPOGRAPHY_PRESET_SETS[setId];
      for (const role of TYPOGRAPHY_ROLES) {
        expect(set[role], `${setId} is missing role "${role}"`).toBeDefined();
        expect(set[role].role).toBe(role);
      }
    }
  });

  it('every preset names a font the registry resolves and has enabled', () => {
    for (const setId of TYPOGRAPHY_PRESET_SET_IDS) {
      for (const role of TYPOGRAPHY_ROLES) {
        const preset = TYPOGRAPHY_PRESET_SETS[setId][role];
        const meta = findFont(preset.fontId);
        expect(meta, `${setId}.${role} names unknown font "${preset.fontId}"`).toBeDefined();
        expect(meta?.enabled, `${setId}.${role} names disabled font "${preset.fontId}"`).toBe(true);
      }
    }
  });

  it('every preset asks for a weight the font file actually ships', () => {
    // The assertion that keeps faux bold off official stationery. A preset promising a
    // face the font lacks would be silently synthesised by the browser and would
    // rasterise differently between screen and PDF.
    for (const setId of TYPOGRAPHY_PRESET_SET_IDS) {
      for (const role of TYPOGRAPHY_ROLES) {
        const preset = TYPOGRAPHY_PRESET_SETS[setId][role];
        expect(
          presetWeightIsReal(preset),
          `${setId}.${role} asks font "${preset.fontId}" for weight ${preset.weight}, ` +
            `which it does not declare`,
        ).toBe(true);
      }
    }
  });

  it('records the two-font pairing: the body face has no real bold, the heading face does', () => {
    // Not decoration — this is WHY headings are Amiri while the body stays Traditional
    // Arabic. If either side of this ever flips, the pairing should be revisited
    // deliberately rather than discovered on paper.
    expect(hasRealBold('traditionalArabic')).toBe(false);
    expect(hasRealBold('amiri')).toBe(true);

    const set = TYPOGRAPHY_PRESET_SETS.officialArabic;
    expect(set.body.fontId).toBe('traditionalArabic');
    expect(set.heading.fontId).toBe('amiri');
    expect(set.heading.weight).toBe(700);
    expect(set.subject.fontId).toBe('amiri');
    expect(set.subject.weight).toBe(700);
  });

  it('the approved sizes are honoured: body 16 pt, subject 18 pt, heading 20–22 pt', () => {
    const set = TYPOGRAPHY_PRESET_SETS.officialArabic;
    expect(set.body.sizePt).toBe(16);
    expect(set.body.lineHeight).toBe(1.35);
    expect(set.subject.sizePt).toBe(18);
    expect(set.heading.sizePt).toBeGreaterThanOrEqual(20);
    expect(set.heading.sizePt).toBeLessThanOrEqual(22);
  });

  it('the size ladder is the approved five rungs, ascending', () => {
    expect([...FONT_SIZE_LADDER_PT]).toEqual([14, 16, 18, 20, 22]);
  });

  it('alignment is logical and has no "end" — left-align is unrepresentable', () => {
    // The approved set is Justify / Right / Centre with Left prohibited. Expressed
    // logically under RTL that is exactly justify | start | center, and the prohibited
    // option simply has no name.
    expect([...TEXT_ALIGNMENTS].sort()).toEqual(['center', 'justify', 'start']);
    expect(TEXT_ALIGNMENTS).not.toContain('end');
    expect(TEXT_ALIGNMENTS).not.toContain('left');
  });
});

describe('The letter font pool', () => {
  it('is the registry\'s Official category', () => {
    const pool = getLetterFontPool();
    expect(pool.length).toBeGreaterThan(0);
    for (const font of pool) expect(font.category).toBe('Official');
  });

  it('excludes the system font, so a document paginates identically on every machine', () => {
    // Tahoma is the registry's one OS-supplied family: it renders from whatever the
    // machine ships, so the same registered document could paginate differently
    // elsewhere — and a different pagination can put content in a reserved zone.
    expect(isLetterPoolFontId('tahoma')).toBe(false);
    expect(FontRegistry.tahoma.category).toBe('UI');
  });

  it('every pool member is enabled and recommended for letters', () => {
    for (const font of getLetterFontPool()) {
      expect(font.enabled).toBe(true);
      expect(font.recommendedFor).toContain('letters');
    }
  });

  it('rejects unknown, empty and prototype-chain ids', () => {
    expect(isLetterPoolFontId('nope')).toBe(false);
    expect(isLetterPoolFontId('')).toBe(false);
    expect(isLetterPoolFontId(null)).toBe(false);
    expect(isLetterPoolFontId('constructor')).toBe(false);
    expect(isLetterPoolFontId('toString')).toBe(false);
  });
});

describe('resolveTypography', () => {
  it('resolves a role into concrete, renderable type', () => {
    const body = resolveTypography('officialArabic', 'body');
    expect(body.fontId).toBe('traditionalArabic');
    expect(body.sizePt).toBe(16);
    expect(body.meta.family).toBe(FontRegistry.traditionalArabic.family);
    expect(body.weightIsReal).toBe(true);
  });

  it('reports whether the browser would have to synthesise the face', () => {
    for (const role of TYPOGRAPHY_ROLES) {
      expect(resolveTypography('officialArabic', role).weightIsReal).toBe(true);
    }
  });
});

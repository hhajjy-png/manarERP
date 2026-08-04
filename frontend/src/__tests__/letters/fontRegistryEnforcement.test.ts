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
import {
  FontRegistry,
  FONT_IDS,
  findFont,
  fontStackFor,
  getAllFonts,
  getEnabledFonts,
} from '../../styles/fontRegistry';
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
  // Font Picker — Dynamic Registry Hotfix v2 — FOURTH policy for this pool, on
  // explicit instruction: no allow-list, no curation layer, no filter on category
  // or recommendedFor. The pool is exactly `getEnabledFonts()` — every registered,
  // enabled font, full stop. Three prior policies (`category === 'Official'`;
  // `recommendedFor` including `'letters'`; a named ten-family allow-list) are
  // superseded, in that order.

  it('is exactly every enabled registry font — no name, category, or usage filter', () => {
    const poolIds = getLetterFontPool().map((f) => f.id).sort();
    const enabledIds = getEnabledFonts().map((f) => f.id).sort();
    expect(poolIds).toEqual(enabledIds);
  });

  it('is the full twelve-font registry today — nothing curated out', () => {
    const names = getLetterFontPool().map((f) => f.displayName).sort();
    expect(names).toHaveLength(FONT_IDS.length);
    expect(names).toEqual([...getAllFonts().map((f) => f.displayName)].sort());
  });

  it('includes UI-category fonts too — no category restricts membership', () => {
    // Under the prior allow-list, `ibmPlexArabic` and `tajawal` were the two
    // deliberately-excluded UI fonts. Under this dynamic policy there is no
    // curation layer left to exclude them.
    expect(isLetterPoolFontId('ibmPlexArabic')).toBe(true);
    expect(isLetterPoolFontId('tajawal')).toBe(true);
  });

  it('is NOT reducible to `category`', () => {
    const categories = new Set(getLetterFontPool().map((f) => f.category));
    expect(categories.size).toBeGreaterThan(1); // spans UI/Official/Classic/Modern/Decorative
  });

  it('is NOT reducible to `recommendedFor`', () => {
    // `scheherazade`, `pdfDinArabic`, `sultan` and `ptBoldHeading` carry no `'letters'`
    // tag at all, yet all four are in the pool — proving membership does not derive
    // from this field.
    for (const id of ['scheherazade', 'pdfDinArabic', 'sultan', 'ptBoldHeading'] as const) {
      expect(FontRegistry[id].recommendedFor, id).not.toContain('letters');
      expect(isLetterPoolFontId(id), id).toBe(true);
    }
  });

  it('includes the system font — the same recorded print-fidelity trade-off as before', () => {
    // Tahoma has no `@font-face` in this repository and renders from whatever the OS
    // ships. Recorded again here rather than silently dropped from the history.
    expect(isLetterPoolFontId('tahoma')).toBe(true);
  });

  it('every pool member is enabled', () => {
    for (const font of getLetterFontPool()) {
      expect(font.enabled).toBe(true);
    }
  });

  it('tracks `getEnabledFonts()` dynamically — a disabled font drops out with no code change here', () => {
    // Proven structurally: `getLetterFontPool` IS `getEnabledFonts()`, not a filtered
    // copy of it, so a future font that ships disabled is simply absent, and a future
    // font that ships enabled simply appears — with zero changes to this file.
    const enabledIds = new Set(getEnabledFonts().map((f) => f.id));
    for (const font of getLetterFontPool()) {
      expect(enabledIds.has(font.id)).toBe(true);
    }
  });

  it('each family appears exactly once — no per-file or per-weight duplicate', () => {
    // Guaranteed structurally by the registry's own data model (one entry per family,
    // every weight declared inside that entry's `weights` array — see `FontMeta`),
    // not by any de-duplication step in this pool. Asserted directly so a future
    // change to that model cannot silently reintroduce duplicates here.
    const ids = getLetterFontPool().map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
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

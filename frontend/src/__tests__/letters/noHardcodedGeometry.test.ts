/**
 * INV-4 — "Safe Zones are configuration only. No hardcoded geometry values may exist
 * outside the Geometry Registry."
 *
 * This test is that invariant's mechanical enforcement. It is not a style check: a
 * millimetre written into a component is a millimetre that can silently disagree with
 * the one the validator enforces, and the consequence of that disagreement is content
 * printed inside a reserved zone — INV-2/INV-3, the two rules the whole module exists
 * to protect.
 *
 * It also carries INV-1 ("millimetres only, pixels at the rendering boundary"): a
 * `px` dimension anywhere in the engine means geometry has left millimetre space
 * somewhere it should not have.
 *
 * SCOPE: `src/letters/**\/*.ts(x)`, comments stripped (see `engineSourceScan.ts`),
 * with `registry/geometryRegistry.ts` as the ONE permitted home.
 */
import { describe, it, expect } from 'vitest';
import { readEngineSources, matchingLines, type EngineSourceFile } from './engineSourceScan';
import {
  PAGE_SIZES,
  getPageGeometry,
  sideMarginMm,
  contentBottomLimitMm,
  textBandBottomMm,
  usableBandMm,
} from '../../letters/registry/geometryRegistry';

/** The single file permitted to contain a page dimension. */
const GEOMETRY_REGISTRY = 'registry/geometryRegistry.ts';

const SOURCES = readEngineSources();
const OTHER_FILES: EngineSourceFile[] = SOURCES.filter((f) => f.relativePath !== GEOMETRY_REGISTRY);

describe('INV-4 — geometry lives only in the Geometry Registry', () => {
  it('finds engine sources to scan (guards against a silently empty scan)', () => {
    // A scan that walks nothing passes every assertion below. This is the tripwire.
    expect(SOURCES.length).toBeGreaterThan(10);
    expect(SOURCES.map((f) => f.relativePath)).toContain(GEOMETRY_REGISTRY);
    expect(OTHER_FILES.length).toBeGreaterThan(8);
  });

  it('no file outside the registry assigns a numeric literal to a millimetre field', () => {
    // e.g. `reservedTopMm: 40`, `contentWidthMm = 160`
    const pattern = /\b\w*[Mm]m\s*[:=]\s*-?\d/;
    const hits = OTHER_FILES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Millimetre value(s) declared outside ${GEOMETRY_REGISTRY}:\n${hits.join('\n')}`).toEqual([]);
  });

  it('no file outside the registry contains a millimetre CSS/dimension literal', () => {
    // e.g. `'40mm'`, `` `${x}mm` `` with a literal number, `height: 297mm`
    const pattern = /\d+(?:\.\d+)?\s*mm\b/;
    const hits = OTHER_FILES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Millimetre literal(s) outside ${GEOMETRY_REGISTRY}:\n${hits.join('\n')}`).toEqual([]);
  });

  it('no file outside the registry contains the A4 page dimensions', () => {
    const pattern = /\b(?:210|297)\b/;
    const hits = OTHER_FILES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `A4 dimension(s) outside ${GEOMETRY_REGISTRY}:\n${hits.join('\n')}`).toEqual([]);
  });

  it('INV-1 — no pixel dimension anywhere in the engine', () => {
    // Pixels belong at the rendering boundary, which no P0 file is. A `px` literal
    // here would mean geometry had left millimetre space.
    const pattern = /\d+(?:\.\d+)?\s*px\b|\bpixels?\b\s*[:=]\s*-?\d/i;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Pixel dimension(s) in the engine:\n${hits.join('\n')}`).toEqual([]);
  });
});

describe('Geometry Registry — the values it is the sole home of', () => {
  const geometry = getPageGeometry('companyLetterhead', 1);

  it('declares A4 portrait', () => {
    expect(PAGE_SIZES.A4.widthMm).toBe(210);
    expect(PAGE_SIZES.A4.heightMm).toBe(297);
    expect(geometry.pageSizeId).toBe('A4');
  });

  it('declares the approved reserved zones and content area', () => {
    expect(geometry.reservedTopMm).toBe(40);
    expect(geometry.reservedBottomMm).toBe(20);
    expect(geometry.contentTopMm).toBe(55);
    expect(geometry.contentWidthMm).toBe(160);
  });

  it('derives the margins and bands rather than storing them', () => {
    expect(sideMarginMm(geometry)).toBe(25);
    expect(contentBottomLimitMm(geometry)).toBe(277);
    expect(textBandBottomMm(geometry)).toBe(269);
  });

  it('derives the usable text band: 214 mm on page 1, 224 mm on continuation pages', () => {
    // The page-footer strip sits INSIDE the content band, which is precisely why the
    // first page yields 214 mm and not 222 mm.
    expect(usableBandMm(geometry, 0)).toBe(214);
    expect(usableBandMm(geometry, 1)).toBe(224);
    expect(usableBandMm(geometry, 4)).toBe(224);
  });
});

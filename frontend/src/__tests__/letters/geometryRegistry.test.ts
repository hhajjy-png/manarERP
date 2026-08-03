/**
 * Geometry Registry — integrity.
 *
 * The numeric assertions live in `noHardcodedGeometry.test.ts`, next to the invariant
 * they belong to. THIS file asserts the registry's *structural* soundness: that no
 * declared geometry can describe an impossible page, that derived values are derived
 * rather than stored, and that an unresolvable geometry FAILS rather than substituting
 * a neighbour's.
 *
 * That last property is the one worth stating plainly. A registry that fell back to
 * "the closest available geometry" would render a historical document under another
 * version's millimetres — silently, with no error, producing a reprint that no longer
 * matches the copy in the recipient's file. Under INV-9 that is a correctness failure,
 * so every lookup here throws instead.
 */
import { describe, it, expect } from 'vitest';
import {
  PAGE_SIZES,
  PRINT_PROFILE_IDS,
  getPageGeometry,
  findPageGeometry,
  isPrintProfileId,
  pageSizeOf,
  sideMarginMm,
  contentBottomLimitMm,
  textBandBottomMm,
  contentTopForPageMm,
  usableBandMm,
  footerStripTopMm,
  reservedZonesMm,
  type PageGeometry,
} from '../../letters/registry/geometryRegistry';
import { LAYOUT_VERSIONS } from '../../letters/versioning/versions';

/** Every (layout version, profile) pair the registry declares. */
const ALL_PAIRS = LAYOUT_VERSIONS.flatMap((v) =>
  PRINT_PROFILE_IDS.map((profileId) => [v.version, profileId] as const),
);

describe('Geometry Registry — declared pairs', () => {
  it('declares geometry for every layout version × profile combination', () => {
    expect(ALL_PAIRS.length).toBeGreaterThan(0);
    for (const [version, profileId] of ALL_PAIRS) {
      expect(() => getPageGeometry(profileId, version)).not.toThrow();
    }
  });

  it('every page size is a positive portrait sheet', () => {
    for (const size of Object.values(PAGE_SIZES)) {
      expect(size.widthMm).toBeGreaterThan(0);
      expect(size.heightMm).toBeGreaterThan(size.widthMm);
    }
  });
});

describe.each(ALL_PAIRS)('Geometry (layout v%s, profile "%s") — physical soundness', (version, profileId) => {
  const geometry: PageGeometry = getPageGeometry(profileId, version);
  const page = pageSizeOf(geometry);

  it('names a declared page size', () => {
    expect(PAGE_SIZES[geometry.pageSizeId]).toBeDefined();
  });

  it('leaves a usable band between the two reserved zones', () => {
    expect(geometry.reservedTopMm).toBeGreaterThanOrEqual(0);
    expect(geometry.reservedBottomMm).toBeGreaterThanOrEqual(0);
    expect(geometry.reservedTopMm + geometry.reservedBottomMm).toBeLessThan(page.heightMm);
  });

  it('never starts content inside the reserved header — on any page (INV-2)', () => {
    // The continuation value is the one at risk: it is deliberately smaller than the
    // first page's, and this is what stops it being lowered past the reserved band.
    expect(geometry.contentTopMm).toBeGreaterThanOrEqual(geometry.reservedTopMm);
    expect(geometry.continuationContentTopMm).toBeGreaterThanOrEqual(geometry.reservedTopMm);
    expect(geometry.continuationContentTopMm).toBeLessThanOrEqual(geometry.contentTopMm);
  });

  it('keeps the text column inside the sheet with equal margins', () => {
    expect(geometry.contentWidthMm).toBeGreaterThan(0);
    expect(geometry.contentWidthMm).toBeLessThan(page.widthMm);
    expect(sideMarginMm(geometry)).toBeGreaterThan(0);
    // Centred: the two margins together are exactly the leftover width.
    expect(sideMarginMm(geometry) * 2 + geometry.contentWidthMm).toBe(page.widthMm);
  });

  it('fits the page-footer strip inside the content band, not the reserved footer (INV-3)', () => {
    expect(geometry.footerStripMm).toBeGreaterThan(0);
    expect(footerStripTopMm(geometry)).toBe(textBandBottomMm(geometry));
    // Strictly above the reserved footer's top edge.
    expect(textBandBottomMm(geometry)).toBeLessThan(contentBottomLimitMm(geometry));
    expect(contentBottomLimitMm(geometry)).toBeLessThan(page.heightMm);
  });

  it('yields a positive usable band on the first and on continuation pages', () => {
    expect(usableBandMm(geometry, 0)).toBeGreaterThan(0);
    expect(usableBandMm(geometry, 1)).toBeGreaterThan(0);
    // Continuation pages carry no date/subject block, so they gain height.
    expect(usableBandMm(geometry, 1)).toBeGreaterThanOrEqual(usableBandMm(geometry, 0));
  });

  it('treats every page after the first identically', () => {
    expect(contentTopForPageMm(geometry, 0)).toBe(geometry.contentTopMm);
    for (const pageIndex of [1, 2, 7]) {
      expect(contentTopForPageMm(geometry, pageIndex)).toBe(geometry.continuationContentTopMm);
      expect(usableBandMm(geometry, pageIndex)).toBe(usableBandMm(geometry, 1));
    }
  });

  it('exposes the two reserved zones as one source for both the overlay and the validator', () => {
    // The band drawn on screen and the band enforced by validation come from this one
    // call, so the thing the user sees and the thing that blocks printing cannot drift.
    const zones = reservedZonesMm(geometry);
    expect(zones).toHaveLength(2);

    const header = zones.find((z) => z.zone === 'header');
    expect(header?.startMm).toBe(0);
    expect(header?.endMm).toBe(geometry.reservedTopMm);

    const footer = zones.find((z) => z.zone === 'footer');
    expect(footer?.startMm).toBe(contentBottomLimitMm(geometry));
    expect(footer?.endMm).toBe(page.heightMm);
    expect(footer!.endMm - footer!.startMm).toBe(geometry.reservedBottomMm);
  });

  it('declares a known continuation stock', () => {
    expect(['letterhead', 'plain']).toContain(geometry.continuationStock);
  });
});

describe('Geometry Registry — lookup refuses to substitute', () => {
  it('throws for an undeclared layout version', () => {
    expect(() => getPageGeometry('companyLetterhead', 99)).toThrow(/layout version 99/);
  });

  it('throws for an undeclared profile', () => {
    expect(() => getPageGeometry('nope' as never, 1)).toThrow(/print profile "nope"/);
  });

  it('the non-throwing lookup returns undefined rather than a prototype member', () => {
    expect(findPageGeometry('companyLetterhead', 1)).toBeDefined();
    expect(findPageGeometry('companyLetterhead', 99)).toBeUndefined();
    expect(findPageGeometry('nope', 1)).toBeUndefined();
    expect(findPageGeometry('constructor', 1)).toBeUndefined();
    expect(findPageGeometry('toString', 1)).toBeUndefined();
    expect(findPageGeometry('__proto__', 1)).toBeUndefined();
  });

  it('`isPrintProfileId` guards untrusted stored values', () => {
    expect(isPrintProfileId('companyLetterhead')).toBe(true);
    expect(isPrintProfileId('nope')).toBe(false);
    expect(isPrintProfileId('')).toBe(false);
    expect(isPrintProfileId(null)).toBe(false);
    expect(isPrintProfileId(undefined)).toBe(false);
    expect(isPrintProfileId('constructor')).toBe(false);
  });
});

/**
 * Print Profile Registry — integrity.
 *
 * A print profile models a PHYSICAL SHEET OF PAPER. The two properties worth
 * asserting are unusual, and both are here because of INV-4:
 *
 *  1. THE FILE CONTAINS NO NUMERIC DIMENSION AT ALL. Geometry literals are permitted
 *     in the Geometry Registry only, so a profile NAMES its millimetres rather than
 *     restating them. That is checked directly against the file's source, because it
 *     is the kind of rule that decays the moment someone adds "just one" convenience
 *     constant.
 *
 *  2. RESERVED IDS CARRY NO GEOMETRY. Government letterhead and customer stationery
 *     have not been measured. Declaring them as usable profiles would require
 *     inventing reserved-zone millimetres — creating a profile that, the day somebody
 *     enables it, silently violates INV-2/INV-3 with the validator agreeing because it
 *     was fed fiction. So the ids are held, and nothing more.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  PRINT_PROFILES,
  RESERVED_PRINT_PROFILE_IDS,
  getAllPrintProfiles,
  getEnabledPrintProfiles,
  getPrintProfile,
  findPrintProfile,
  isReservedPrintProfileId,
  getProfileGeometry,
  getContinuationStock,
} from '../../letters/registry/printProfileRegistry';
import { PRINT_PROFILE_IDS, getPageGeometry } from '../../letters/registry/geometryRegistry';

describe('Print Profile Registry — structure', () => {
  it('the record key equals each profile’s own id', () => {
    for (const id of PRINT_PROFILE_IDS) {
      expect(PRINT_PROFILES[id].id).toBe(id);
    }
  });

  it('ships exactly one active profile in v1', () => {
    const enabled = getEnabledPrintProfiles();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].id).toBe('companyLetterhead');
  });

  it('every declared profile has geometry, and every geometry has a profile', () => {
    // Guaranteed by construction — `PrintProfileId` is derived from the geometry keys —
    // and asserted so that a future refactor cannot quietly decouple them.
    expect(getAllPrintProfiles().map((p) => p.id).sort()).toEqual([...PRINT_PROFILE_IDS].sort());
  });

  it('describes the company letterhead as pre-printed stock', () => {
    const profile = getPrintProfile('companyLetterhead');
    expect(profile.stationeryKind).toBe('preprintedLetterhead');
    expect(profile.displayNameAr).toBe('ورق الشركة الرسمي');
  });
});

describe('Print Profile Registry — INV-4: it holds no millimetres of its own', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, '../../letters/registry/printProfileRegistry.ts'),
    'utf8',
  );
  // Comments may explain millimetres; code may not declare them.
  const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('declares no millimetre field', () => {
    expect(CODE).not.toMatch(/\b\w*[Mm]m\s*[:=]\s*-?\d/);
  });

  it('declares no numeric dimension literal at all', () => {
    // Deliberately strict: any multi-digit number in this file would be a dimension,
    // because a profile has no other use for one.
    expect(CODE).not.toMatch(/\b\d{2,}\b/);
  });

  it('reaches its geometry only through the Geometry Registry', () => {
    expect(getProfileGeometry('companyLetterhead', 1)).toBe(getPageGeometry('companyLetterhead', 1));
    expect(getContinuationStock('companyLetterhead', 1)).toBe(
      getPageGeometry('companyLetterhead', 1).continuationStock,
    );
  });
});

describe('Print Profile Registry — reservations', () => {
  it('holds the three future stationery ids', () => {
    expect(RESERVED_PRINT_PROFILE_IDS.map((r) => r.id)).toEqual([
      'governmentLetterhead',
      'plainA4',
      'customerStationery',
    ]);
  });

  it('a reservation is not a usable profile', () => {
    for (const reserved of RESERVED_PRINT_PROFILE_IDS) {
      expect(isReservedPrintProfileId(reserved.id)).toBe(true);
      expect(findPrintProfile(reserved.id)).toBeUndefined();
      expect(PRINT_PROFILE_IDS).not.toContain(reserved.id);
    }
  });

  it('every reservation records why it has no geometry yet', () => {
    // The note is what stops a future maintainer promoting one of these without first
    // measuring the paper.
    for (const reserved of RESERVED_PRINT_PROFILE_IDS) {
      expect(reserved.note.length).toBeGreaterThan(20);
    }
  });

  it('reserved ids do not collide with declared ones', () => {
    const declared = new Set<string>(PRINT_PROFILE_IDS);
    for (const reserved of RESERVED_PRINT_PROFILE_IDS) {
      expect(declared.has(reserved.id)).toBe(false);
    }
  });
});

describe('Print Profile Registry — lookup safety', () => {
  it('returns undefined for unknown, empty and prototype-chain ids', () => {
    expect(findPrintProfile('companyLetterhead')).toBeDefined();
    expect(findPrintProfile('nope')).toBeUndefined();
    expect(findPrintProfile('')).toBeUndefined();
    expect(findPrintProfile(null)).toBeUndefined();
    expect(findPrintProfile(undefined)).toBeUndefined();
    expect(findPrintProfile('constructor')).toBeUndefined();
    expect(findPrintProfile('toString')).toBeUndefined();
    expect(findPrintProfile('__proto__')).toBeUndefined();
  });
});

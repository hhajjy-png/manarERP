/**
 * Versioning axes and resolver — integrity (INV-9).
 *
 * INV-9: "Historical documents are immutable. Template Version, Layout Version,
 * Barcode Version and Print Profile must always reproduce the exact historical output."
 *
 * The behaviour that makes that true is unusual enough to be worth stating: the
 * resolver THROWS on an unregistered version rather than falling back to the latest.
 * A silent fallback is the single most dangerous thing this module could do — it would
 * render a historical document under today's rules, with no error and no trace,
 * producing a reprint that no longer matches the copy in the recipient's file. So
 * every test below that looks like it is asserting an error message is really
 * asserting the absence of a fallback.
 *
 * This pack registers NO implementations on any axis. That is asserted, not assumed.
 */
import { describe, it, expect } from 'vitest';
import {
  BARCODE_VERSIONS,
  BARCODE_VERSION_LATEST,
  LAYOUT_VERSIONS,
  LAYOUT_VERSION_LATEST,
  TEMPLATE_VERSIONS,
  TEMPLATE_VERSION_LATEST,
  VERSION_AXES,
  findVersion,
  getVersions,
  isKnownVersion,
  isKnownVersionStamp,
  latestVersion,
  latestVersionStamp,
  type VersionAxis,
} from '../../letters/versioning/versions';
import { createVersionResolver } from '../../letters/versioning/resolver';

describe('Version axes — declaration', () => {
  it('declares exactly the three independent axes', () => {
    expect([...VERSION_AXES]).toEqual(['template', 'layout', 'barcode']);
  });

  it('every axis declares at least one version, ascending and unique', () => {
    for (const axis of VERSION_AXES) {
      const versions = getVersions(axis);
      expect(versions.length).toBeGreaterThan(0);
      const numbers = versions.map((v) => v.version);
      expect(new Set(numbers).size).toBe(numbers.length);
      expect([...numbers].sort((a, b) => a - b)).toEqual(numbers);
    }
  });

  it('v1 ships exactly one ACTIVE version per axis, and no historical versions', () => {
    // The retention obligation begins with the second version, not this one — so the
    // absence of historical branches here is a fact worth pinning.
    for (const axis of VERSION_AXES) {
      const versions = getVersions(axis);
      expect(versions).toHaveLength(1);
      expect(versions[0].version).toBe(1);
      expect(versions[0].status).toBe('active');
      expect(versions.filter((v) => v.status === 'historical')).toHaveLength(0);
    }
  });

  it('every version records what it establishes', () => {
    for (const axis of VERSION_AXES) {
      for (const descriptor of getVersions(axis)) {
        expect(descriptor.note.length).toBeGreaterThan(20);
      }
    }
  });

  it('the three axes are separate lists, not aliases of one', () => {
    // Independence is the whole point: a typography change must not invalidate every
    // issued barcode, and a payload change must not repaginate history.
    expect(TEMPLATE_VERSIONS).not.toBe(LAYOUT_VERSIONS);
    expect(LAYOUT_VERSIONS).not.toBe(BARCODE_VERSIONS);
    expect(TEMPLATE_VERSIONS).not.toBe(BARCODE_VERSIONS);
  });
});

describe('Version axes — LATEST and stamps', () => {
  it('every LATEST is a declared version on its own axis', () => {
    expect(isKnownVersion('template', TEMPLATE_VERSION_LATEST)).toBe(true);
    expect(isKnownVersion('layout', LAYOUT_VERSION_LATEST)).toBe(true);
    expect(isKnownVersion('barcode', BARCODE_VERSION_LATEST)).toBe(true);
    expect(latestVersion('template')).toBe(TEMPLATE_VERSION_LATEST);
    expect(latestVersion('layout')).toBe(LAYOUT_VERSION_LATEST);
    expect(latestVersion('barcode')).toBe(BARCODE_VERSION_LATEST);
  });

  it('a new document’s stamp carries all three axes and is fully known', () => {
    const stamp = latestVersionStamp();
    expect(stamp).toEqual({ templateVersion: 1, layoutVersion: 1, barcodeVersion: 1 });
    expect(isKnownVersionStamp(stamp)).toBe(true);
  });

  it('a stamp naming an undeclared version on ANY axis is rejected', () => {
    // The guard a load path uses before trusting stored versions. One unknown axis is
    // enough — the document cannot be reproduced faithfully.
    expect(isKnownVersionStamp({ templateVersion: 99, layoutVersion: 1, barcodeVersion: 1 })).toBe(false);
    expect(isKnownVersionStamp({ templateVersion: 1, layoutVersion: 99, barcodeVersion: 1 })).toBe(false);
    expect(isKnownVersionStamp({ templateVersion: 1, layoutVersion: 1, barcodeVersion: 99 })).toBe(false);
  });

  it('lookup rejects undeclared versions', () => {
    for (const axis of VERSION_AXES) {
      expect(isKnownVersion(axis, 0)).toBe(false);
      expect(isKnownVersion(axis, 2)).toBe(false);
      expect(isKnownVersion(axis, -1)).toBe(false);
      expect(findVersion(axis, 2)).toBeUndefined();
      expect(findVersion(axis, 1)).toBeDefined();
    }
  });
});

describe('Version resolver — contract', () => {
  const AXIS: VersionAxis = 'barcode';

  it('starts empty', () => {
    const resolver = createVersionResolver<string>(AXIS, 'test implementation');
    expect(resolver.registeredVersions()).toEqual([]);
    expect(resolver.has(1)).toBe(false);
    expect(resolver.find(1)).toBeUndefined();
  });

  it('binds an implementation to a declared version', () => {
    const resolver = createVersionResolver<string>(AXIS, 'test implementation');
    resolver.register(1, 'impl-v1');
    expect(resolver.resolve(1)).toBe('impl-v1');
    expect(resolver.has(1)).toBe(true);
    expect(resolver.registeredVersions()).toEqual([1]);
  });

  it('refuses to bind to an UNDECLARED version', () => {
    const resolver = createVersionResolver<string>(AXIS, 'test implementation');
    expect(() => resolver.register(99, 'ghost')).toThrow(/undeclared barcode version 99/);
  });

  it('refuses to OVERWRITE an existing binding', () => {
    // Overwriting would change how already-issued documents render — the exact
    // failure INV-9 forbids, arriving as a silent code change rather than a decision.
    const resolver = createVersionResolver<string>(AXIS, 'test implementation');
    resolver.register(1, 'impl-v1');
    expect(() => resolver.register(1, 'impl-v1-replacement')).toThrow(/already registered/);
    expect(resolver.resolve(1)).toBe('impl-v1');
  });

  it('THROWS rather than falling back when a version has no implementation', () => {
    // The assertion this whole file exists for.
    const resolver = createVersionResolver<string>(AXIS, 'test implementation');
    resolver.register(1, 'impl-v1');
    expect(() => resolver.resolve(2)).toThrow(/No test implementation registered/);
    expect(() => resolver.resolve(2)).toThrow(/Refusing to fall back/);
  });

  it('offers a non-throwing lookup for callers that can handle absence', () => {
    const resolver = createVersionResolver<string>(AXIS, 'test implementation');
    expect(resolver.find(1)).toBeUndefined();
    expect(() => resolver.find(1)).not.toThrow();
  });

  it('keeps resolvers on different axes fully independent', () => {
    const barcode = createVersionResolver<string>('barcode', 'payload builder');
    const layout = createVersionResolver<string>('layout', 'layout engine');
    barcode.register(1, 'barcode-v1');
    expect(layout.has(1)).toBe(false);
    expect(barcode.axis).toBe('barcode');
    expect(layout.axis).toBe('layout');
  });

  it('reports registered versions ascending', () => {
    const resolver = createVersionResolver<string>(AXIS, 'test implementation');
    resolver.register(1, 'a');
    expect(resolver.registeredVersions()).toEqual([1]);
  });
});

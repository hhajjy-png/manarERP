/**
 * Letter Engine — the backend/frontend mirror.
 *
 * The template registry lives in the frontend and the two packages cannot import each
 * other, so a handful of facts are restated on the backend. Restated facts drift
 * silently — a prefix changed on one side, a version bumped on the other — and the
 * symptom of that drift would be reference numbers with the wrong prefix, or documents
 * stamped with a version that does not describe how they were rendered.
 *
 * So this test READS THE FRONTEND SOURCE and compares. It is the same discipline the
 * font registry's metadata test already uses against the project's real CSS files:
 * verify against the actual artefact, never against a second copy of the claim.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  BARCODE_VERSION_LATEST,
  CONTENT_MODEL_VERSION,
  DEFAULT_PRINT_PROFILE_ID,
  LAYOUT_VERSION_LATEST,
  LETTER_TEMPLATES,
  OFFICIAL_LETTER_KEY,
  REFERENCE_SEQUENCE_PAD,
  RESERVED_REFERENCE_PREFIXES,
  TEMPLATE_VERSION_LATEST,
  findLetterTemplate,
  formatReference,
  getEnabledTemplates,
  isCreatableTemplateKey,
  isWellFormedReference,
  referencePrefixFor,
} from '../letterTemplates.constants';

const FRONTEND = resolve(__dirname, '../../../../../frontend/src/letters');

function readFrontend(relativePath: string): string {
  return readFileSync(resolve(FRONTEND, relativePath), 'utf8');
}

describe('Backend mirror agrees with the frontend registry', () => {
  it('finds the frontend registry to compare against', () => {
    // Tripwire: if the path ever moves, this must fail loudly rather than let every
    // assertion below pass vacuously against an unread file.
    expect(readFrontend('registry/templateRegistry.ts').length).toBeGreaterThan(500);
  });

  it('mirrors the one enabled template key and its reference prefix', () => {
    const source = readFrontend('registry/templateRegistry.ts');
    expect(source).toContain(`key: '${OFFICIAL_LETTER_KEY}'`);
    expect(source).toContain(`referencePrefix: '${referencePrefixFor(OFFICIAL_LETTER_KEY)}'`);
  });

  it('mirrors the reserved reference prefixes exactly, in order', () => {
    const source = readFrontend('registry/templateRegistry.ts');
    const frontendPrefixes = [...source.matchAll(/prefix:\s*'([A-Z]+)'/g)].map((m) => m[1]);
    expect(frontendPrefixes).toEqual([...RESERVED_REFERENCE_PREFIXES]);
  });

  it('mirrors the three version LATEST constants', () => {
    const source = readFrontend('versioning/versions.ts');
    expect(source).toContain(`TEMPLATE_VERSION_LATEST: TemplateVersion = ${TEMPLATE_VERSION_LATEST}`);
    expect(source).toContain(`LAYOUT_VERSION_LATEST: LayoutVersion = ${LAYOUT_VERSION_LATEST}`);
    expect(source).toContain(`BARCODE_VERSION_LATEST: BarcodeVersion = ${BARCODE_VERSION_LATEST}`);
  });

  it('mirrors the content model version', () => {
    expect(readFrontend('model/blockTypes.ts')).toContain(
      `CONTENT_MODEL_VERSION = ${CONTENT_MODEL_VERSION}`,
    );
  });

  it('mirrors the default print profile id', () => {
    expect(readFrontend('registry/printProfileRegistry.ts')).toContain(
      `id: '${DEFAULT_PRINT_PROFILE_ID}'`,
    );
  });
});

describe('Template registry — backend side', () => {
  it('exposes exactly one enabled template (INV-10)', () => {
    expect(getEnabledTemplates()).toHaveLength(1);
    expect(getEnabledTemplates()[0].key).toBe(OFFICIAL_LETTER_KEY);
  });

  it('permits creating only the official letter', () => {
    expect(isCreatableTemplateKey(OFFICIAL_LETTER_KEY)).toBe(true);
    expect(isCreatableTemplateKey('circular')).toBe(false);
    expect(isCreatableTemplateKey('')).toBe(false);
    expect(isCreatableTemplateKey(null)).toBe(false);
    expect(isCreatableTemplateKey('constructor')).toBe(false);
  });

  it('a reserved prefix is not a creatable template', () => {
    for (const prefix of RESERVED_REFERENCE_PREFIXES) {
      expect(LETTER_TEMPLATES.some((t) => t.referencePrefix === prefix)).toBe(false);
    }
  });

  it('reference prefixes are unique across templates and reservations', () => {
    const all = [...LETTER_TEMPLATES.map((t) => t.referencePrefix), ...RESERVED_REFERENCE_PREFIXES];
    expect(new Set(all).size).toBe(all.length);
  });

  it('refuses to invent a prefix for an unknown template', () => {
    // No safe default exists: the prefix is burned permanently into an issued number.
    expect(() => referencePrefixFor('circular')).toThrow(/Unknown template key/);
    expect(findLetterTemplate('circular')).toBeUndefined();
  });
});

describe('Reference number format', () => {
  it('is PREFIX-YEAR-000000 with six padded digits', () => {
    expect(formatReference(OFFICIAL_LETTER_KEY, 2026, 1)).toBe('OL-2026-000001');
    expect(formatReference(OFFICIAL_LETTER_KEY, 2026, 123)).toBe('OL-2026-000123');
    expect(formatReference(OFFICIAL_LETTER_KEY, 2027, 999999)).toBe('OL-2027-999999');
    expect(REFERENCE_SEQUENCE_PAD).toBe(6);
  });

  it('sorts lexicographically in issue order within a year — the padding earns its keep', () => {
    const refs = [1, 2, 10, 99, 100].map((n) => formatReference(OFFICIAL_LETTER_KEY, 2026, n));
    expect([...refs].sort()).toEqual(refs);
  });

  it('recognises well-formed references, including reserved prefixes', () => {
    expect(isWellFormedReference('OL-2026-000001')).toBe(true);
    expect(isWellFormedReference('CIR-2026-000001')).toBe(true);
    expect(isWellFormedReference('OL-2026-1')).toBe(false);
    expect(isWellFormedReference('XX-2026-000001')).toBe(false);
    expect(isWellFormedReference('OL-26-000001')).toBe(false);
    expect(isWellFormedReference('')).toBe(false);
  });
});

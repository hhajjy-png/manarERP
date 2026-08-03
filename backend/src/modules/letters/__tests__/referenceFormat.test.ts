/**
 * Letter Engine — P7: the reference format abstraction.
 *
 * The point of these tests is not that `OL-2026-000001` renders correctly — that is one
 * line. It is that the SCHEME can be replaced without breaking anything already issued,
 * which is the requirement the abstraction exists to satisfy and the one that is easy
 * to violate by accident later.
 */

import { describe, expect, it } from 'vitest';

import {
  ACTIVE_REFERENCE_FORMAT_ID,
  REFERENCE_FORMATTERS,
  REFERENCE_SEQUENCE_PAD,
  getActiveReferenceFormatter,
  getReferenceFormatter,
  matchesAnyReferenceFormat,
  type ReferenceFormatter,
} from '../referenceFormat';
import {
  allKnownReferencePrefixes,
  formatReference,
  isWellFormedReference,
} from '../letterTemplates.constants';

const PREFIXES = allKnownReferencePrefixes();

describe('the active format — what is issued today', () => {
  it('renders prefix, year and zero-padded sequence', () => {
    expect(formatReference('officialLetter', 2026, 1)).toBe('OL-2026-000001');
    expect(formatReference('officialLetter', 2026, 42)).toBe('OL-2026-000042');
    expect(formatReference('officialLetter', 2030, 999999)).toBe('OL-2030-999999');
  });

  it('pads to exactly the declared width', () => {
    const rendered = formatReference('officialLetter', 2026, 7);
    expect(rendered.split('-')[2]).toHaveLength(REFERENCE_SEQUENCE_PAD);
  });

  it('is unchanged from the format P1 shipped', () => {
    // Refactoring the format behind an abstraction must not alter a single character:
    // references issued under P1 are already permanent.
    expect(formatReference('officialLetter', 2026, 1)).toBe('OL-2026-000001');
  });

  it('refuses to format for an unknown template rather than inventing a prefix', () => {
    // A wrong prefix would be burned permanently into an issued number.
    expect(() => formatReference('circular', 2026, 1)).toThrow();
  });
});

describe('the abstraction — a future pack can replace the scheme', () => {
  it('exposes the active formatter by id, not by hardcoding', () => {
    expect(getActiveReferenceFormatter().id).toBe(ACTIVE_REFERENCE_FORMAT_ID);
    expect(REFERENCE_FORMATTERS.map((f) => f.id)).toContain(ACTIVE_REFERENCE_FORMAT_ID);
  });

  it('every registered formatter is complete and self-describing', () => {
    for (const formatter of REFERENCE_FORMATTERS) {
      expect(formatter.id.length, formatter.id).toBeGreaterThan(0);
      expect(formatter.describeAr.length, formatter.id).toBeGreaterThan(0);
      const rendered = formatter.format({ prefix: 'OL', year: 2026, sequence: 1 });
      expect(rendered.length, formatter.id).toBeGreaterThan(0);
      // A formatter must recognise its own output, or verification breaks the day it
      // becomes the active one.
      expect(formatter.matches(rendered, PREFIXES), formatter.id).toBe(true);
    }
  });

  it('a replacement scheme needs no change to the allocator’s contract', () => {
    // Demonstrates the seam: a formatter is data, and swapping it changes only the
    // rendered string. Nothing here touches sequences, transactions or the register.
    const slashFormat: ReferenceFormatter = {
      id: 'yearSlashSequence-test',
      describeAr: 'سنة/بادئة/تسلسل',
      format: ({ prefix, year, sequence }) => `${year}/${prefix}/${sequence}`,
      matches: (ref) => /^\d{4}\/[A-Z]+\/\d+$/.test(ref),
    };
    expect(slashFormat.format({ prefix: 'OL', year: 2026, sequence: 7 })).toBe('2026/OL/7');
    expect(slashFormat.matches('2026/OL/7', PREFIXES)).toBe(true);
  });

  it('refuses an unknown format id rather than substituting one', () => {
    expect(() => getReferenceFormatter('does-not-exist')).toThrow(/Refusing to substitute/);
  });
});

describe('recognition survives a scheme change', () => {
  it('accepts what the engine issues', () => {
    expect(isWellFormedReference('OL-2026-000001')).toBe(true);
  });

  it('accepts reserved prefixes held for future document types', () => {
    // A prefix reservation exists so a future type cannot collide with one already
    // associated with something else; recognition must honour it now.
    expect(isWellFormedReference('CIR-2026-000001')).toBe(true);
    expect(isWellFormedReference('GOV-2026-000001')).toBe(true);
  });

  it('rejects strings the engine never issued', () => {
    expect(isWellFormedReference('OL-2026-1')).toBe(false);          // unpadded
    expect(isWellFormedReference('XX-2026-000001')).toBe(false);      // unknown prefix
    expect(isWellFormedReference('OL/2026/000001')).toBe(false);      // wrong separator
    expect(isWellFormedReference('')).toBe(false);
    expect(isWellFormedReference('OL-2026-000001 ')).toBe(false);     // trailing space
  });

  it('checks EVERY registered formatter, not only the active one', () => {
    // This is the property that keeps old paper valid. When a second formatter is
    // added, references issued under the first must still be recognised — so the
    // check is an `some` across the registry rather than a call to the active one.
    for (const formatter of REFERENCE_FORMATTERS) {
      const issued = formatter.format({ prefix: 'OL', year: 2026, sequence: 3 });
      expect(matchesAnyReferenceFormat(issued, PREFIXES), formatter.id).toBe(true);
    }
  });

  it('does not treat an empty prefix list as a match-everything wildcard', () => {
    // A regex built from an empty alternation would match far too much.
    expect(matchesAnyReferenceFormat('OL-2026-000001', [])).toBe(false);
  });
});

/**
 * Barcode Content Settings v1 — the reference SUGGESTION rule.
 *
 * `nextReferenceNumber` is a proposal, not a counter: it reads the value the operator
 * last saved and offers the one after it into an editable box. These pin the two things
 * that make it safe — the width of the number never changes underneath the operator, and
 * anything without a clear trailing number is handed back untouched instead of guessed at.
 */
import { describe, it, expect } from 'vitest';
import { nextReferenceNumber } from '../forms/shared/formNumber';

describe('nextReferenceNumber — increments the trailing number, preserving width', () => {
  it.each([
    ['MN-2026-00125', 'MN-2026-00126'],
    ['كتاب-154', 'كتاب-155'],
    ['REF0009', 'REF0010'],
    ['1', '2'],
    ['REF-000', 'REF-001'],
  ])('%s → %s', (last, expected) => {
    expect(nextReferenceNumber(last)).toBe(expected);
  });

  it('keeps leading zeros at their original width', () => {
    expect(nextReferenceNumber('A-00001')).toBe('A-00002');
    expect(nextReferenceNumber('A-000099')).toBe('A-000100');
  });

  it('lets a run overflow its width rather than wrapping or truncating', () => {
    expect(nextReferenceNumber('REF-999')).toBe('REF-1000');
    expect(nextReferenceNumber('9')).toBe('10');
  });

  it('stays exact past the safe-integer range — a rounded reference would be wrong', () => {
    // 16 digits: `Number` would round this and hand back a different reference.
    expect(nextReferenceNumber('R-9007199254740993')).toBe('R-9007199254740994');
  });

  it('increments the LAST run only — earlier numbers in the string are left alone', () => {
    expect(nextReferenceNumber('MN-2026-00125')).toBe('MN-2026-00126');
    expect(nextReferenceNumber('154/2026')).toBe('154/2027');
  });

  it('returns the value untouched when it does not end in a number', () => {
    for (const asIs of ['قرار إداري', 'MN-2026-A', 'كتاب رقم 154/2026 (نهائي)', 'REF-']) {
      expect(nextReferenceNumber(asIs)).toBe(asIs);
    }
  });

  it('returns empty for empty — a first-ever open proposes nothing, it does not generate', () => {
    expect(nextReferenceNumber('')).toBe('');
  });
});

import { describe, it, expect } from 'vitest';
import { sortRowsClient } from '../lib/clientSort';

/** Enterprise Data Grid Foundation v1 — المقارن المحلي الموحّد للجداول المحمَّلة كاملةً. */

describe('sortRowsClient', () => {
  it('no active column → copy in original order', () => {
    const rows = [{ a: 2 }, { a: 1 }];
    expect(sortRowsClient(rows, null, 'asc')).toEqual([{ a: 2 }, { a: 1 }]);
  });

  it('numbers sort numerically both directions', () => {
    const rows = [{ n: 10 }, { n: 2 }, { n: 33 }];
    expect(sortRowsClient(rows, 'n', 'asc').map((r) => r.n)).toEqual([2, 10, 33]);
    expect(sortRowsClient(rows, 'n', 'desc').map((r) => r.n)).toEqual([33, 10, 2]);
  });

  it('ISO date strings sort chronologically', () => {
    const rows = [{ d: '2026-03-01T00:00:00Z' }, { d: '2025-12-31T00:00:00Z' }];
    expect(sortRowsClient(rows, 'd', 'asc')[0].d).toContain('2025');
  });

  it('codes with numbers use numeric collation (C-2 before C-10)', () => {
    const rows = [{ c: 'C-10' }, { c: 'C-2' }];
    expect(sortRowsClient(rows, 'c', 'asc').map((r) => r.c)).toEqual(['C-2', 'C-10']);
  });

  it('blanks always last in both directions (matches server nulls-last policy)', () => {
    const rows = [{ v: null }, { v: 'ب' }, { v: '' }, { v: 'أ' }];
    expect(sortRowsClient(rows, 'v', 'asc').map((r) => r.v)).toEqual(['أ', 'ب', null, '']);
    expect(sortRowsClient(rows, 'v', 'desc').map((r) => r.v)).toEqual(['ب', 'أ', null, '']);
  });

  it('stable: ties keep server order', () => {
    const rows = [{ k: 1, tag: 'first' }, { k: 1, tag: 'second' }];
    expect(sortRowsClient(rows, 'k', 'desc').map((r) => r.tag)).toEqual(['first', 'second']);
  });

  it('custom accessor reaches nested relation values', () => {
    const rows = [{ role: { name: 'ب' } }, { role: { name: 'أ' } }];
    const sorted = sortRowsClient(rows, 'role', 'asc', (r) => r.role.name);
    expect(sorted[0].role.name).toBe('أ');
  });
});

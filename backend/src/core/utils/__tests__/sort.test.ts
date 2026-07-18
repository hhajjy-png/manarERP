import { describe, it, expect } from 'vitest';
import { buildOrderBy, sortRowsInMemory, SortWhitelist } from '../sort';

/**
 * Enterprise Data Grid Foundation v1 — القائمة البيضاء هي حدّ الأمان الوحيد بين
 * معطيات الاستعلام و orderBy في Prisma، فكل مسار رفض/قبول هنا مسار أمني.
 */

const WL: SortWhitelist = {
  code: 'code',
  name: 'name',
  hireDate: { field: 'hireDate', nullable: true },
  customerName: (dir) => ({ customer: { name: dir } }),
};

const DEFAULT = [{ id: 'desc' }];

describe('buildOrderBy — whitelist validation', () => {
  it('no sortBy → default ordering returned untouched (same reference semantics)', () => {
    expect(buildOrderBy({}, WL, DEFAULT)).toEqual([{ id: 'desc' }]);
    expect(buildOrderBy({ sortDir: 'asc' }, WL, DEFAULT)).toEqual([{ id: 'desc' }]);
  });

  it('non-whitelisted sortBy → silently falls back to default', () => {
    expect(buildOrderBy({ sortBy: 'passwordHash', sortDir: 'asc' }, WL, DEFAULT)).toEqual(DEFAULT);
    expect(buildOrderBy({ sortBy: 'id; DROP TABLE', sortDir: 'asc' }, WL, DEFAULT)).toEqual(DEFAULT);
  });

  it('prototype-chain keys are rejected (own-property check, not `in`)', () => {
    expect(buildOrderBy({ sortBy: '__proto__' }, WL, DEFAULT)).toEqual(DEFAULT);
    expect(buildOrderBy({ sortBy: 'constructor' }, WL, DEFAULT)).toEqual(DEFAULT);
    expect(buildOrderBy({ sortBy: 'toString' }, WL, DEFAULT)).toEqual(DEFAULT);
  });

  it('non-string sortBy (array/object query pollution) → default', () => {
    expect(buildOrderBy({ sortBy: ['code'] as unknown }, WL, DEFAULT)).toEqual(DEFAULT);
    expect(buildOrderBy({ sortBy: { $gt: '' } as unknown }, WL, DEFAULT)).toEqual(DEFAULT);
  });
});

describe('buildOrderBy — direction coercion', () => {
  it('asc passes through; anything else coerces to desc', () => {
    expect(buildOrderBy({ sortBy: 'code', sortDir: 'asc' }, WL, DEFAULT)[0]).toEqual({ code: 'asc' });
    expect(buildOrderBy({ sortBy: 'code', sortDir: 'desc' }, WL, DEFAULT)[0]).toEqual({ code: 'desc' });
    expect(buildOrderBy({ sortBy: 'code', sortDir: 'DELETE' }, WL, DEFAULT)[0]).toEqual({ code: 'desc' });
    expect(buildOrderBy({ sortBy: 'code' }, WL, DEFAULT)[0]).toEqual({ code: 'desc' });
  });
});

describe('buildOrderBy — mapping shapes', () => {
  it('scalar mapping → { field: dir } + stable tiebreaker appended', () => {
    expect(buildOrderBy({ sortBy: 'name', sortDir: 'asc' }, WL, DEFAULT)).toEqual([
      { name: 'asc' },
      { id: 'desc' },
    ]);
  });

  it('nullable mapping → nulls last so blank cells never lead the ascending view', () => {
    expect(buildOrderBy({ sortBy: 'hireDate', sortDir: 'asc' }, WL, DEFAULT)[0]).toEqual({
      hireDate: { sort: 'asc', nulls: 'last' },
    });
  });

  it('function mapping → relation orderBy fragment', () => {
    expect(buildOrderBy({ sortBy: 'customerName', sortDir: 'desc' }, WL, DEFAULT)[0]).toEqual({
      customer: { name: 'desc' },
    });
  });

  it('explicit tiebreaker overrides the default-as-tiebreaker fallback', () => {
    const result = buildOrderBy(
      { sortBy: 'code', sortDir: 'asc' },
      WL,
      [{ date: 'desc' }, { id: 'desc' }],
      [{ id: 'desc' }],
    );
    expect(result).toEqual([{ code: 'asc' }, { id: 'desc' }]);
  });
});

describe('sortRowsInMemory — read-model sorting (payroll unified grid, GL report)', () => {
  type Row = { name: string; net: number | null };
  const ROWS: Row[] = [
    { name: 'ب', net: 300 },
    { name: 'أ', net: null },
    { name: 'ج', net: 100 },
  ];
  const WL_MEM = {
    name: (r: Row) => r.name,
    net: (r: Row) => r.net,
  };

  it('no/invalid sortBy → rows returned in original order', () => {
    expect(sortRowsInMemory(ROWS, {}, WL_MEM)).toEqual(ROWS);
    expect(sortRowsInMemory(ROWS, { sortBy: 'hacked' }, WL_MEM)).toEqual(ROWS);
    expect(sortRowsInMemory(ROWS, { sortBy: '__proto__' }, WL_MEM)).toEqual(ROWS);
  });

  it('numeric asc with nulls last (imported rows without breakdown sink to bottom)', () => {
    const sorted = sortRowsInMemory(ROWS, { sortBy: 'net', sortDir: 'asc' }, WL_MEM);
    expect(sorted.map((r) => r.net)).toEqual([100, 300, null]);
  });

  it('numeric desc keeps nulls last too', () => {
    const sorted = sortRowsInMemory(ROWS, { sortBy: 'net', sortDir: 'desc' }, WL_MEM);
    expect(sorted.map((r) => r.net)).toEqual([300, 100, null]);
  });

  it('Arabic text sorts by Arabic collation', () => {
    const sorted = sortRowsInMemory(ROWS, { sortBy: 'name', sortDir: 'asc' }, WL_MEM);
    expect(sorted.map((r) => r.name)).toEqual(['أ', 'ب', 'ج']);
  });

  it('stable on ties', () => {
    const rows = [{ name: 'x', net: 1 }, { name: 'y', net: 1 }];
    const sorted = sortRowsInMemory(rows, { sortBy: 'net', sortDir: 'desc' }, WL_MEM);
    expect(sorted.map((r) => r.name)).toEqual(['x', 'y']);
  });
});

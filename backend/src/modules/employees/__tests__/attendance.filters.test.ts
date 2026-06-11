import { describe, it, expect } from 'vitest';
import { buildAttendanceWhere, aggregateAttendanceStats } from '../attendance.filters';

// ── buildAttendanceWhere ──────────────────────────────────────────────────────

describe('buildAttendanceWhere', () => {
  it('returns empty object when no filters supplied', () => {
    expect(buildAttendanceWhere({})).toEqual({});
  });

  it('filters by employeeId when provided as a numeric string', () => {
    const where = buildAttendanceWhere({ employeeId: '7' });
    expect(where.employeeId).toBe(7);
  });

  it('ignores employeeId when empty string', () => {
    const where = buildAttendanceWhere({ employeeId: '' });
    expect(where.employeeId).toBeUndefined();
  });

  it('filters by status', () => {
    const where = buildAttendanceWhere({ status: 'PRESENT' });
    expect(where.status).toBe('PRESENT');
  });

  it('ignores status when empty string', () => {
    const where = buildAttendanceWhere({ status: '' });
    expect(where.status).toBeUndefined();
  });

  it('sets date.gte when from is provided', () => {
    const where = buildAttendanceWhere({ from: '2026-01-01' });
    expect((where.date as { gte?: Date })?.gte).toBeInstanceOf(Date);
    expect((where.date as { gte?: Date })?.gte?.toISOString()).toContain('2026-01-01');
  });

  it('sets date.lte when to is provided', () => {
    const where = buildAttendanceWhere({ to: '2026-12-31' });
    expect((where.date as { lte?: Date })?.lte).toBeInstanceOf(Date);
    expect((where.date as { lte?: Date })?.lte?.toISOString()).toContain('2026-12-31');
  });

  it('sets both date bounds when from and to are provided', () => {
    const where = buildAttendanceWhere({ from: '2026-01-01', to: '2026-01-31' });
    const date = where.date as { gte?: Date; lte?: Date };
    expect(date.gte).toBeInstanceOf(Date);
    expect(date.lte).toBeInstanceOf(Date);
  });

  it('omits date when neither from nor to is provided', () => {
    const where = buildAttendanceWhere({});
    expect(where.date).toBeUndefined();
  });

  it('adds OR search clause over notes and employee name/code', () => {
    const where = buildAttendanceWhere({ search: 'أحمد' });
    expect(Array.isArray(where.OR)).toBe(true);
    const or = where.OR as unknown[];
    expect(or.length).toBe(3);
  });

  it('omits OR when search is empty string', () => {
    const where = buildAttendanceWhere({ search: '' });
    expect(where.OR).toBeUndefined();
  });

  it('combines all filters simultaneously', () => {
    const where = buildAttendanceWhere({
      employeeId: '3',
      status: 'LATE',
      from: '2026-01-01',
      to: '2026-01-31',
      search: 'test',
    });
    expect(where.employeeId).toBe(3);
    expect(where.status).toBe('LATE');
    expect(where.date).toBeDefined();
    expect(where.OR).toBeDefined();
  });
});

// ── aggregateAttendanceStats ──────────────────────────────────────────────────

describe('aggregateAttendanceStats', () => {
  it('returns zero counts when groupBy result is empty', () => {
    const stats = aggregateAttendanceStats([], 0);
    expect(stats).toEqual({ total: 0, present: 0, absent: 0, late: 0, leave: 0 });
  });

  it('maps PRESENT status to present count', () => {
    const stats = aggregateAttendanceStats(
      [{ status: 'PRESENT', _count: { status: 10 } }],
      10,
    );
    expect(stats.present).toBe(10);
  });

  it('maps all four statuses correctly', () => {
    const groupByResult = [
      { status: 'PRESENT', _count: { status: 5 } },
      { status: 'ABSENT',  _count: { status: 3 } },
      { status: 'LATE',    _count: { status: 2 } },
      { status: 'LEAVE',   _count: { status: 1 } },
    ];
    const stats = aggregateAttendanceStats(groupByResult, 11);
    expect(stats).toEqual({ total: 11, present: 5, absent: 3, late: 2, leave: 1 });
  });

  it('uses the total parameter as stats.total, not sum of counts', () => {
    const stats = aggregateAttendanceStats(
      [{ status: 'PRESENT', _count: { status: 5 } }],
      99,
    );
    expect(stats.total).toBe(99);
  });

  it('ignores unknown status values without throwing', () => {
    expect(() =>
      aggregateAttendanceStats([{ status: 'UNKNOWN', _count: { status: 1 } }], 1),
    ).not.toThrow();
  });
});

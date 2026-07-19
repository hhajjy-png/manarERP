import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { holiday: { findMany: vi.fn() } },
}));

import { HolidayGenerationPlanner } from '../services/HolidayGenerationPlanner';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as { holiday: { findMany: ReturnType<typeof vi.fn> } };

describe('HolidayGenerationPlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plans all 3 fixed holidays as NEW when nothing exists yet for that year', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    const plan = await new HolidayGenerationPlanner().plan(2027);
    expect(plan.year).toBe(2027);
    expect(plan.comparison.summary.NEW).toBe(3);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.invalidCandidates).toHaveLength(0);
  });

  it('categorizes an exact existing match as EXISTING, not NEW', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([{ date: new Date('2027-01-01T00:00:00Z'), name: 'رأس السنة الميلادية', id: 1, notes: null, createdAt: new Date() }]);
    const plan = await new HolidayGenerationPlanner().plan(2027);
    expect(plan.comparison.summary.EXISTING).toBe(1);
    expect(plan.comparison.summary.NEW).toBe(2);
  });

  it('surfaces a name mismatch as a conflict (CHANGED) via HolidayConflictService', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([{ date: new Date('2027-01-01T00:00:00Z'), name: 'عطلة مُدخلة يدويًا بمسمّى مختلف', id: 1, notes: null, createdAt: new Date() }]);
    const plan = await new HolidayGenerationPlanner().plan(2027);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].category).toBe('CHANGED');
  });

  it('scopes the existing-holiday lookup to the requested year only', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    await new HolidayGenerationPlanner().plan(2029);
    const whereArg = mockPrisma.holiday.findMany.mock.calls[0][0].where;
    expect(whereArg.date.gte.getUTCFullYear()).toBe(2029);
    expect(whereArg.date.lte.getUTCFullYear()).toBe(2029);
  });

  it('is safe to plan the same year repeatedly without any DB write (read-only)', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    await new HolidayGenerationPlanner().plan(2030);
    await new HolidayGenerationPlanner().plan(2030);
    // findMany only — no create/update/delete method exists on the mock at all.
    expect(Object.keys(mockPrisma.holiday)).toEqual(['findMany']);
  });
});

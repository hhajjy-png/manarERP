import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    holiday: { findMany: vi.fn(), create: vi.fn() },
  },
}));

import { planHolidayGeneration, applyHolidayGenerationPlan } from '../holidays/generateHolidaysWorkflow';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  holiday: {
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
};

describe('planHolidayGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plans all 3 fixed holidays to create when nothing exists yet for that year', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    const plan = await planHolidayGeneration(2027);
    expect(plan.year).toBe(2027);
    expect(plan.toCreate).toHaveLength(3);
    expect(plan.duplicates).toHaveLength(0);
  });

  it('skips a fixed holiday already registered for that exact date (duplicate detection)', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([{ date: new Date('2027-01-01T00:00:00Z'), name: 'رأس السنة' }]);
    const plan = await planHolidayGeneration(2027);
    expect(plan.toCreate).toHaveLength(2);
    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0].existingName).toBe('رأس السنة');
  });

  it('is safe to plan repeatedly (idempotent planning — no DB writes happen during planning)', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    await planHolidayGeneration(2028);
    await planHolidayGeneration(2028);
    expect(mockPrisma.holiday.create).not.toHaveBeenCalled();
  });

  it('scopes the existing-holiday lookup to the target year only', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    await planHolidayGeneration(2029);
    const whereArg = mockPrisma.holiday.findMany.mock.calls[0][0].where;
    expect(whereArg.date.gte.getUTCFullYear()).toBe(2029);
    expect(whereArg.date.lt.getUTCFullYear()).toBe(2030);
  });
});

describe('applyHolidayGenerationPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates one row per planned candidate and returns the created count', async () => {
    mockPrisma.holiday.create.mockResolvedValue({});
    const plan = {
      year: 2027,
      toCreate: [
        { date: new Date('2027-01-01T00:00:00Z'), name: 'رأس السنة الميلادية', origin: 'FIXED_GREGORIAN' as const, status: 'OFFICIAL' as const },
      ],
      duplicates: [],
    };
    const result = await applyHolidayGenerationPlan(plan);
    expect(result.createdCount).toBe(1);
    expect(mockPrisma.holiday.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.holiday.create).toHaveBeenCalledWith({
      data: { date: plan.toCreate[0].date, name: 'رأس السنة الميلادية', notes: '[FIXED_GREGORIAN:OFFICIAL]' },
    });
  });

  it('does nothing and creates zero rows when the plan is empty', async () => {
    const result = await applyHolidayGenerationPlan({ year: 2027, toCreate: [], duplicates: [] });
    expect(result.createdCount).toBe(0);
    expect(mockPrisma.holiday.create).not.toHaveBeenCalled();
  });
});

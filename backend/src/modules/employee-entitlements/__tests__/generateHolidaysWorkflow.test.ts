import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    holiday: { findMany: vi.fn(), create: vi.fn() },
  },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { planHolidayGeneration, applyHolidayGenerationPlan } from '../holidays/generateHolidaysWorkflow';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  holiday: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

const fakeReq = {} as import('express').Request;

/**
 * غلاف توافق فقط (@deprecated في generateHolidaysWorkflow.ts) — التغطية الكاملة
 * لمنطق التخطيط/التنفيذ الفعلي في HolidayGenerationPlanner.test.ts و
 * HolidayGenerationExecutor.test.ts. هذا الملف يتحقق فقط من أن التفويض يعمل.
 */
describe('generateHolidaysWorkflow (deprecated compatibility shim)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('planHolidayGeneration delegates to HolidayGenerationPlanner and returns a full comparison plan', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    const plan = await planHolidayGeneration(2027);
    expect(plan.year).toBe(2027);
    expect(plan.comparison.summary.NEW).toBe(3);
  });

  it('applyHolidayGenerationPlan delegates to HolidayGenerationExecutor and creates the planned rows', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    mockPrisma.holiday.create.mockResolvedValue({ id: 1 });
    const report = await applyHolidayGenerationPlan(2027, fakeReq);
    expect(report.year).toBe(2027);
    expect(report.createdCount).toBe(3);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { holiday: { findMany: vi.fn(), create: vi.fn() } },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { HolidayGenerationExecutor } from '../services/HolidayGenerationExecutor';
import { HolidayGenerationPlanner } from '../services/HolidayGenerationPlanner';
import { FixedHolidayProvider } from '../holidays/providers/FixedHolidayProvider';
import { prisma } from '../../../config/database';
import { recordAudit } from '../../../core/middleware/audit';

const mockPrisma = prisma as unknown as {
  holiday: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};
const fakeReq = {} as import('express').Request;

/** يعزل هذه الاختبارات عن حساب العطل الهجرية الحقيقي (Al-Ojairi Integration Pack v1) — تختبر آلية المنفِّذ (create/skip/idempotency/audit) فقط. */
const fixedOnlyExecutor = () => new HolidayGenerationExecutor(new HolidayGenerationPlanner([new FixedHolidayProvider()]));

describe('HolidayGenerationExecutor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates only the NEW-category candidates and returns an accurate report', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    mockPrisma.holiday.create.mockImplementation(({ data }: { data: { name: string } }) => Promise.resolve({ id: 1, ...data }));

    const report = await fixedOnlyExecutor().execute(2027, fakeReq);

    expect(report.year).toBe(2027);
    expect(report.createdCount).toBe(3);
    expect(mockPrisma.holiday.create).toHaveBeenCalledTimes(3);
    expect(report.conflictCount).toBe(0);
  });

  it('never creates a row for a CHANGED (name-mismatch) entry — manual review only', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([
      { date: new Date('2027-01-01T00:00:00Z'), name: 'اسم مختلف يدويًا', id: 1, notes: null, createdAt: new Date() },
    ]);
    mockPrisma.holiday.create.mockImplementation(({ data }: { data: { name: string } }) => Promise.resolve({ id: 2, ...data }));

    const report = await fixedOnlyExecutor().execute(2027, fakeReq);

    expect(report.createdCount).toBe(2); // only the 2 remaining fixed holidays, not the mismatched Jan 1
    expect(report.conflictCount).toBe(1);
    for (const call of mockPrisma.holiday.create.mock.calls) {
      expect(call[0].data.date.toISOString().slice(0, 10)).not.toBe('2027-01-01');
    }
  });

  it('is idempotent — a second run creates nothing once everything already exists (safe regeneration)', async () => {
    // First run creates 3; simulate the DB now containing them for a second call.
    mockPrisma.holiday.findMany.mockResolvedValue([
      { date: new Date('2027-01-01T00:00:00Z'), name: 'رأس السنة الميلادية', id: 1, notes: null, createdAt: new Date() },
      { date: new Date('2027-02-25T00:00:00Z'), name: 'العيد الوطني', id: 2, notes: null, createdAt: new Date() },
      { date: new Date('2027-02-26T00:00:00Z'), name: 'يوم التحرير', id: 3, notes: null, createdAt: new Date() },
    ]);

    const report = await fixedOnlyExecutor().execute(2027, fakeReq);

    expect(report.createdCount).toBe(0);
    expect(mockPrisma.holiday.create).not.toHaveBeenCalled();
  });

  it('records an audit entry for every created holiday', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    mockPrisma.holiday.create.mockImplementation(({ data }: { data: { name: string } }) => Promise.resolve({ id: 1, ...data }));

    await fixedOnlyExecutor().execute(2027, fakeReq);

    expect(recordAudit).toHaveBeenCalledTimes(3);
  });

  it('tags a generated Hijri holiday note with [HIJRI:EXPECTED_ALOJAIRI] so status survives read-back (Part 3)', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    mockPrisma.holiday.create.mockImplementation(({ data }: { data: { name: string; notes: string } }) => Promise.resolve({ id: 1, ...data }));

    await new HolidayGenerationExecutor().execute(2027, fakeReq); // default (Fixed + Hijri) providers

    const hijriCall = mockPrisma.holiday.create.mock.calls.find((c) => c[0].data.notes === '[HIJRI:EXPECTED_ALOJAIRI]');
    expect(hijriCall).toBeDefined();
  });
});

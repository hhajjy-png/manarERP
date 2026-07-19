import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { holiday: { findMany: vi.fn() } },
}));

import { HolidayGenerationPlanner } from '../services/HolidayGenerationPlanner';
import { FixedHolidayProvider } from '../holidays/providers/FixedHolidayProvider';
import { DEFAULT_HOLIDAY_PROVIDERS } from '../holidays/providers';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as { holiday: { findMany: ReturnType<typeof vi.fn> } };

/** يعزل هذه الاختبارات عن حساب العطل الهجرية الحقيقي (Al-Ojairi Integration Pack v1) — تختبر منطق المقارنة/التعارض فقط. */
const fixedOnlyPlanner = () => new HolidayGenerationPlanner([new FixedHolidayProvider()]);

describe('HolidayGenerationPlanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('plans all 3 fixed holidays as NEW when nothing exists yet for that year', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    const plan = await fixedOnlyPlanner().plan(2027);
    expect(plan.year).toBe(2027);
    expect(plan.comparison.summary.NEW).toBe(3);
    expect(plan.conflicts).toHaveLength(0);
    expect(plan.invalidCandidates).toHaveLength(0);
    expect(plan.warnings).toEqual([]);
  });

  it('categorizes an exact existing match as EXISTING, not NEW', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([{ date: new Date('2027-01-01T00:00:00Z'), name: 'رأس السنة الميلادية', id: 1, notes: null, createdAt: new Date() }]);
    const plan = await fixedOnlyPlanner().plan(2027);
    expect(plan.comparison.summary.EXISTING).toBe(1);
    expect(plan.comparison.summary.NEW).toBe(2);
  });

  it('surfaces a name mismatch as a conflict (CHANGED) via HolidayConflictService', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([{ date: new Date('2027-01-01T00:00:00Z'), name: 'عطلة مُدخلة يدويًا بمسمّى مختلف', id: 1, notes: null, createdAt: new Date() }]);
    const plan = await fixedOnlyPlanner().plan(2027);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0].category).toBe('CHANGED');
  });

  it('scopes the existing-holiday lookup to the requested year only', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    await fixedOnlyPlanner().plan(2029);
    const whereArg = mockPrisma.holiday.findMany.mock.calls[0][0].where;
    expect(whereArg.date.gte.getUTCFullYear()).toBe(2029);
    expect(whereArg.date.lte.getUTCFullYear()).toBe(2029);
  });

  it('is safe to plan the same year repeatedly without any DB write (read-only)', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    await fixedOnlyPlanner().plan(2030);
    await fixedOnlyPlanner().plan(2030);
    // findMany only — no create/update/delete method exists on the mock at all.
    expect(Object.keys(mockPrisma.holiday)).toEqual(['findMany']);
  });
});

describe('HolidayGenerationPlanner — Hijri integration (Al-Ojairi Integration Pack v1)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes real Hijri holiday candidates (EXPECTED_ALOJAIRI) alongside the fixed ones by default', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    const plan = await new HolidayGenerationPlanner(DEFAULT_HOLIDAY_PROVIDERS).plan(2027);
    expect(plan.comparison.summary.NEW).toBeGreaterThan(3); // 3 fixed + real Hijri candidates
    const hijriEntries = plan.comparison.entries.filter((e) => e.origin === 'HIJRI');
    expect(hijriEntries.length).toBeGreaterThan(0);
    expect(hijriEntries.every((e) => e.status === 'EXPECTED_ALOJAIRI')).toBe(true);
    expect(plan.warnings).toEqual([]);
  });

  it('surfaces an UNSUPPORTED_YEAR warning for a year outside the Hijri-supported range, without failing the whole plan', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    const plan = await new HolidayGenerationPlanner(DEFAULT_HOLIDAY_PROVIDERS).plan(2200);
    expect(plan.comparison.summary.NEW).toBe(3); // fixed holidays still generated
    expect(plan.warnings.some((w) => w.code === 'UNSUPPORTED_YEAR')).toBe(true);
  });
});

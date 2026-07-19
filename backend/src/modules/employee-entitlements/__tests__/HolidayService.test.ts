import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    holiday: { findMany: vi.fn() },
  },
}));

import { HolidayService } from '../services/HolidayService';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  holiday: { findMany: ReturnType<typeof vi.fn> };
};

describe('HolidayService.listHolidays', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps raw Holiday rows into the public Holiday model with derived origin/status', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([
      { id: 1, date: new Date('2026-01-01T00:00:00Z'), name: 'رأس السنة', notes: null, createdAt: new Date() },
      { id: 2, date: new Date('2026-04-20T00:00:00Z'), name: 'عيد الفطر', notes: null, createdAt: new Date() },
    ]);
    const service = new HolidayService();
    const holidays = await service.listHolidays();

    expect(holidays[0]).toMatchObject({ id: 1, origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' });
    expect(holidays[1]).toMatchObject({ id: 2, origin: 'HIJRI', status: 'MANUALLY_ADJUSTED' });
  });

  it('passes an unfiltered query when no date range is given', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([]);
    await new HolidayService().listHolidays();
    expect(mockPrisma.holiday.findMany).toHaveBeenCalledWith({ where: undefined, orderBy: { date: 'asc' } });
  });
});

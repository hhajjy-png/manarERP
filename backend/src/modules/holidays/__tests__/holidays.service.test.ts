import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { holiday: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() } },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));

import { holidaysService } from '../holidays.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  holiday: { findMany: ReturnType<typeof vi.fn> };
};

describe('holidaysService.list — derived origin/status (Kuwait Holiday Intelligence Pack v1, Part 2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tags a fixed-date row as FIXED_GREGORIAN / OFFICIAL', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([
      { id: 1, date: new Date('2026-01-01T00:00:00Z'), name: 'رأس السنة', notes: null, createdAt: new Date() },
    ]);
    const rows = await holidaysService.list();
    expect(rows[0]).toMatchObject({ origin: 'FIXED_GREGORIAN', status: 'OFFICIAL' });
  });

  it('tags a non-fixed row as HIJRI / MANUALLY_ADJUSTED', async () => {
    mockPrisma.holiday.findMany.mockResolvedValue([
      { id: 2, date: new Date('2026-04-20T00:00:00Z'), name: 'عيد الفطر', notes: null, createdAt: new Date() },
    ]);
    const rows = await holidaysService.list();
    expect(rows[0]).toMatchObject({ origin: 'HIJRI', status: 'MANUALLY_ADJUSTED' });
  });

  it('preserves every original field (id/date/name/notes/createdAt) unchanged', async () => {
    const raw = { id: 3, date: new Date('2026-06-01T00:00:00Z'), name: 'عطلة تجريبية', notes: 'ملاحظة', createdAt: new Date('2026-01-01T00:00:00Z') };
    mockPrisma.holiday.findMany.mockResolvedValue([raw]);
    const rows = await holidaysService.list();
    expect(rows[0]).toMatchObject(raw);
  });
});

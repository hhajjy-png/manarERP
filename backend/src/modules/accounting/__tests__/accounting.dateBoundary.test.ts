import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Date Boundary Consistency Pack v1 — regression coverage for
 * AccountingService.listJournalEntries / listPayments.
 *
 * Before this pack, `to`/`toDate` was converted with a bare `new Date(query.to)`
 * (midnight), silently dropping any row posted later on the final day of the
 * range. The fix routes it through the canonical `endOfDay()` helper, matching
 * every other financial report (Trial Balance, GL Report, GL Statement, ...).
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    journalEntry: { findMany: vi.fn(), count: vi.fn() },
    payment:      { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { AccountingService } from '../accounting.service';
import { prisma } from '../../../config/database';
import { endOfDay } from '../../../core/utils/dateWindows';

const mockPrisma = prisma as unknown as {
  journalEntry: { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
  payment:      { findMany: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn> };
};

describe('AccountingService.listJournalEntries — date boundary', () => {
  let service: AccountingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AccountingService();
    mockPrisma.journalEntry.findMany.mockResolvedValue([]);
    mockPrisma.journalEntry.count.mockResolvedValue(0);
  });

  it('resolves `to` to end-of-day (23:59:59.999), not midnight', async () => {
    await service.listJournalEntries({ to: '2025-12-31' });

    const where = mockPrisma.journalEntry.findMany.mock.calls[0][0].where;
    const lte = where.date.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
    expect(lte.getTime()).toBe(endOfDay(new Date('2025-12-31')).getTime());
  });

  it('keeps both gte and lte bounds when from and to are both given', async () => {
    await service.listJournalEntries({ from: '2025-01-01', to: '2025-12-31' });

    const where = mockPrisma.journalEntry.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toEqual(new Date('2025-01-01'));
    expect(where.date.lte.getTime()).toBe(endOfDay(new Date('2025-12-31')).getTime());
  });
});

describe('AccountingService.listPayments — date boundary', () => {
  let service: AccountingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AccountingService();
    mockPrisma.payment.findMany.mockResolvedValue([]);
    mockPrisma.payment.count.mockResolvedValue(0);
  });

  it('resolves `to` to end-of-day (23:59:59.999), not midnight', async () => {
    await service.listPayments({ to: '2025-12-31' });

    const where = mockPrisma.payment.findMany.mock.calls[0][0].where;
    const lte = where.date.lte as Date;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
    expect(lte.getSeconds()).toBe(59);
    expect(lte.getMilliseconds()).toBe(999);
  });
});

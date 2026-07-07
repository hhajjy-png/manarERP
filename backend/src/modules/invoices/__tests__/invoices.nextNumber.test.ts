import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { invoice: { findMany: vi.fn() } },
}));
// Silence unrelated collaborators pulled in by the service module graph.
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn() }));
vi.mock('../../transactions/transactions.service', () => ({ transactionsService: { postEntry: vi.fn(), clearByReference: vi.fn() } }));

import { InvoicesService } from '../invoices.service';
import { prisma } from '../../../config/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

describe('InvoicesService.getNextInvoiceNumber — collision-safe (max-based)', () => {
  let service: InvoicesService;
  beforeEach(() => { service = new InvoicesService(); vi.clearAllMocks(); });

  it('returns MN-INV-<year>-00001 when no invoices exist for the year', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    await expect(service.getNextInvoiceNumber(2026)).resolves.toBe('MN-INV-2026-00001');
  });

  it('uses the numeric MAX suffix + 1, tolerating gaps that count() would mis-handle', async () => {
    // Only two rows survive (00002 deleted) but the max issued suffix is 00003 → next must be 00004,
    // never 00003 (which a count()-based scheme would produce and collide on).
    mockPrisma.invoice.findMany.mockResolvedValue([
      { number: 'MN-INV-2026-00001' },
      { number: 'MN-INV-2026-00003' },
    ]);
    await expect(service.getNextInvoiceNumber(2026)).resolves.toBe('MN-INV-2026-00004');
  });

  it('ignores non-numeric (manual) suffixes when computing the max', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { number: 'MN-INV-2026-00007' },
      { number: 'MN-INV-2026-A12' },
      { number: 'MN-INV-2026-CUSTOM' },
    ]);
    await expect(service.getNextInvoiceNumber(2026)).resolves.toBe('MN-INV-2026-00008');
  });

  it('scopes the prefix to the requested year', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    await service.getNextInvoiceNumber(2027);
    const arg = mockPrisma.invoice.findMany.mock.calls[0][0];
    expect(arg.where.number.startsWith).toBe('MN-INV-2027-');
  });
});

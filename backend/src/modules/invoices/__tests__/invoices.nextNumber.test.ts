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

  // ── Historical numbering: per-year sequence, no cross-year collision ─────────
  it('historical year 2024 scopes to its own prefix (independent sequence)', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    const n = await service.getNextInvoiceNumber(2024);
    expect(n).toBe('MN-INV-2024-00001');
    expect(mockPrisma.invoice.findMany.mock.calls[0][0].where.number.startsWith).toBe('MN-INV-2024-');
  });

  it('2024 and 2026 can both produce 00001 — distinct full numbers, no collision', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([]);
    const n2024 = await service.getNextInvoiceNumber(2024);
    const n2026 = await service.getNextInvoiceNumber(2026);
    expect(n2024).toBe('MN-INV-2024-00001');
    expect(n2026).toBe('MN-INV-2026-00001');
    expect(n2024).not.toBe(n2026); // البادئة السنوية تمنع التعارض على الفهرس الفريد
  });

  it('continues the 2024 sequence from its own MAX (does not renumber existing)', async () => {
    // موجود لسنة 2024: 00001 و00005 → التالي 00006 (MAX+1)، بلا مساس بالأرقام القائمة.
    mockPrisma.invoice.findMany.mockResolvedValue([
      { number: 'MN-INV-2024-00001' }, { number: 'MN-INV-2024-00005' },
    ]);
    expect(await service.getNextInvoiceNumber(2024)).toBe('MN-INV-2024-00006');
  });
});

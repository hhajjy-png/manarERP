import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { DashboardSummary } from '../../../shared/services/financial/financial.types';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice:   { aggregate: vi.fn() },
    payment:   { aggregate: vi.fn() },
    account:   { count: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

import { dashboardSummaryService } from '../../../shared/services/financial/dashboard-summary.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  invoice:   { aggregate: ReturnType<typeof vi.fn> };
  payment:   { aggregate: ReturnType<typeof vi.fn> };
  account:   { count: ReturnType<typeof vi.fn> };
  $queryRaw: ReturnType<typeof vi.fn>;
};

const emptyAgg = { _sum: { total: 0, paidAmount: 0 }, _count: { customerId: 0, supplierId: 0 } };
const emptyAmt = { _sum: { amount: 0 } };

// Run one call in beforeAll so all tests share a single Prisma interaction.
// The service caches the result, making repeated calls no-ops.
let result: DashboardSummary;
let rawCalls: Array<[{ strings: readonly string[] }]>;

beforeAll(async () => {
  mockPrisma.invoice.aggregate.mockResolvedValue(emptyAgg);
  mockPrisma.payment.aggregate.mockResolvedValue(emptyAmt);
  mockPrisma.account.count.mockResolvedValue(3);
  mockPrisma.$queryRaw
    .mockResolvedValueOnce([{ id: 1, name: 'شركة الخليج', outstanding: 1500.500 }])
    .mockResolvedValueOnce([{ id: 2, name: 'مورد السلام',  outstanding:  800.250 }]);

  result    = await dashboardSummaryService.getSummary();
  rawCalls  = mockPrisma.$queryRaw.mock.calls as typeof rawCalls;
});

describe('dashboardSummaryService.getSummary', () => {
  // ─── Shape ──────────────────────────────────────────────────────────────────

  it('returns all required DashboardSummary fields', () => {
    expect(result).toMatchObject({
      generatedAt:         expect.any(String),
      arSummary:           expect.objectContaining({ totalOutstanding: 0, criticalOver90: 0, entityCount: 0 }),
      apSummary:           expect.objectContaining({ totalOutstanding: 0, criticalOver90: 0, entityCount: 0 }),
      collectionsLast30:   0,
      paymentsLast30:      0,
      activeAccountsCount: 3,
    });
  });

  it('generatedAt is a valid ISO date string', () => {
    expect(new Date(result.generatedAt).toISOString()).toBe(result.generatedAt);
  });

  // ─── Row mapping ─────────────────────────────────────────────────────────────

  it('maps topCustomers rows correctly', () => {
    expect(result.topCustomers).toHaveLength(1);
    expect(result.topCustomers[0]).toMatchObject({ id: 1, name: 'شركة الخليج', outstanding: 1500.500 });
  });

  it('maps topSuppliers rows correctly', () => {
    expect(result.topSuppliers).toHaveLength(1);
    expect(result.topSuppliers[0]).toMatchObject({ id: 2, name: 'مورد السلام', outstanding: 800.250 });
  });

  // ─── SQL table names — regression guard for the HTTP 400 bug ─────────────────
  // Bug: $queryRaw used Prisma model names (Invoice, Customer, Supplier) instead of
  // the @@map table names (invoices, customers, suppliers). SQLite could not find the
  // tables, threw PrismaClientKnownRequestError P2010, and the error handler returned
  // HTTP 400 to the frontend.

  it('$queryRaw is called exactly twice (top-customers + top-suppliers queries)', () => {
    expect(rawCalls).toHaveLength(2);
  });

  it('customer query uses plural lowercase table names: invoices + customers', () => {
    // $queryRaw tagged template passes TemplateStringsArray as first arg
    const parts = Array.from(rawCalls[0][0] as unknown as string[]);
    const sql   = parts.join('');
    expect(sql).toMatch(/FROM invoices/i);
    expect(sql).toMatch(/JOIN customers/i);
    // Regression guard: singular model names must not appear
    expect(sql).not.toMatch(/FROM\s+Invoice\b/);
    expect(sql).not.toMatch(/JOIN\s+Customer\b/);
  });

  it('supplier query uses plural lowercase table names: invoices + suppliers', () => {
    const parts = Array.from(rawCalls[1][0] as unknown as string[]);
    const sql   = parts.join('');
    expect(sql).toMatch(/FROM invoices/i);
    expect(sql).toMatch(/JOIN suppliers/i);
    // Regression guard: singular model names must not appear
    expect(sql).not.toMatch(/FROM\s+Invoice\b/);
    expect(sql).not.toMatch(/JOIN\s+Supplier\b/);
  });
});

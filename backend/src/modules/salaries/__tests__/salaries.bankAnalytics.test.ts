import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findMany: vi.fn(), findUnique: vi.fn() },
    salaryPayment: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn(), findFirst: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { round3, bankAnalyticsService, resolveEmployeePayments } from '../salaries.bankAnalytics.service';

describe('round3', () => {
  it('rounds to 3 decimal places', () => {
    expect(round3(1.0005)).toBe(1.001);
    expect(round3(100)).toBe(100);
    expect(round3(0.1234567)).toBe(0.123);
  });

  it('handles zero', () => {
    expect(round3(0)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(round3(-1.0005)).toBe(-1);
  });
});

describe('resolveEmployeePayments', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when employee not found', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    const result = await resolveEmployeePayments(999);
    expect(result).toBeNull();
  });

  it('uses civilId match when payments exist', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 1, fullName: 'أحمد', civilId: '123456789', bankAccount: 'ACC001',
    } as any);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(3);
    const result = await resolveEmployeePayments(1);
    expect(result?.matchedCivilIds).toEqual(['123456789']);
    expect(result?.matchedAccounts).toEqual([]);
  });

  it('falls back to bankAccount when civilId has no payments', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 2, fullName: 'محمد', civilId: '987', bankAccount: 'ACC002',
    } as any);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);
    const result = await resolveEmployeePayments(2);
    expect(result?.matchedCivilIds).toEqual([]);
    expect(result?.matchedAccounts).toEqual(['ACC002']);
  });

  it('returns empty match arrays when employee has no civilId and no bankAccount', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 3, fullName: 'سالم', civilId: null, bankAccount: null,
    } as any);
    const result = await resolveEmployeePayments(3);
    expect(result?.matchedCivilIds).toEqual([]);
    expect(result?.matchedAccounts).toEqual([]);
  });

  it('trims whitespace from civilId and bankAccount', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({
      id: 4, fullName: 'علي', civilId: '  123  ', bankAccount: '  ACC004  ',
    } as any);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(2);
    const result = await resolveEmployeePayments(4);
    expect(result?.matchedCivilIds).toEqual(['123']);
  });
});

describe('bankAnalyticsService.searchEmployees', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty array for empty query', async () => {
    const result = await bankAnalyticsService.searchEmployees('');
    expect(result).toEqual([]);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('returns empty array for whitespace-only query', async () => {
    const result = await bankAnalyticsService.searchEmployees('   ');
    expect(result).toEqual([]);
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
  });

  it('calls findMany with OR filter for non-empty query', async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([]);
    await bankAnalyticsService.searchEmployees('أحمد');
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'active' }),
      }),
    );
  });

  it('limits results to 20', async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([]);
    await bankAnalyticsService.searchEmployees('test');
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 20 }),
    );
  });
});

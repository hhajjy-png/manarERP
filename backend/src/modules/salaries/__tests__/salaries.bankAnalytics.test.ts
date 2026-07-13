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

  /**
   * كان `round3(-1.0005) === -1`: تقريب نحو موجب اللانهاية، غير متماثل — فـ`+1.0005`
   * تصعد إلى `1.001` بينما `-1.0005` تنزل إلى `-1.000`. السياسة القانونية متماثلة الإشارة
   * (نصف بعيدًا عن الصفر)، فالمقدار واحد والإشارة وحدها تختلف.
   */
  it('rounds negatives symmetrically — half away from zero', () => {
    expect(round3(-1.0005)).toBe(-1.001);
    expect(round3(1.0005)).toBe(1.001); // نفس المقدار، إشارة معاكسة
    expect(round3(-1.2344)).toBe(-1.234);
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

describe('bankAnalyticsService.getTransactions — Phase 2 filters', () => {
  beforeEach(() => vi.clearAllMocks());

  const mockPayment = {
    id: 1, transactionId: 'TXN001', sourceMonth: 'Mar-25',
    paymentDate: new Date('2025-03-15'), beneficiaryAccount: 'ACC001',
    beneficiaryName: 'أحمد علي', amount: 500, currency: 'KWD',
    status: 'PROCESSED', civilId: '111', createdAt: new Date(),
    bankName: null, paymentType: null, errorDescription: null, duplicateFlag: null,
  };

  it('sorts by amount desc by default', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([mockPayment]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(1);

    await bankAnalyticsService.getTransactions({ sortBy: 'amount', sortDir: 'desc' }, { page: '1', pageSize: '25' });

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([{ amount: 'desc' }]),
      }),
    );
  });

  it('sorts by beneficiaryName asc when specified', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);

    await bankAnalyticsService.getTransactions({ sortBy: 'beneficiaryName', sortDir: 'asc' }, { page: '1', pageSize: '25' });

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([{ beneficiaryName: 'asc' }]),
      }),
    );
  });

  it('falls back to paymentDate sort for disallowed sortBy values', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);

    await bankAnalyticsService.getTransactions({ sortBy: '__proto__', sortDir: 'asc' }, { page: '1', pageSize: '25' });

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: expect.arrayContaining([{ paymentDate: 'asc' }]),
      }),
    );
  });

  it('applies amount range filter (amountFrom and amountTo)', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);

    await bankAnalyticsService.getTransactions(
      { amountFrom: 100, amountTo: 900 },
      { page: '1', pageSize: '25' },
    );

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ amount: { gte: 100, lte: 900 } }]),
        }),
      }),
    );
  });

  it('applies date range filter (dateFrom and dateTo)', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);

    await bankAnalyticsService.getTransactions(
      { dateFrom: '2025-01-01', dateTo: '2025-03-31' },
      { page: '1', pageSize: '25' },
    );

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { paymentDate: { gte: new Date('2025-01-01'), lte: new Date('2025-03-31') } },
          ]),
        }),
      }),
    );
  });

  it('applies search text filter across beneficiaryName, transactionId, civilId', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);

    await bankAnalyticsService.getTransactions(
      { search: 'أحمد' },
      { page: '1', pageSize: '25' },
    );

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            {
              OR: expect.arrayContaining([
                { beneficiaryName: { contains: 'أحمد' } },
                { transactionId: { contains: 'أحمد' } },
                { civilId: { contains: 'أحمد' } },
              ]),
            },
          ]),
        }),
      }),
    );
  });

  it('applies month+year filter via sourceMonth exact match', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);

    await bankAnalyticsService.getTransactions(
      { payrollMonth: 3, payrollYear: 2025 },
      { page: '1', pageSize: '25' },
    );

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([{ sourceMonth: 'Mar-25' }]),
        }),
      }),
    );
  });

  it('respects pageSize via pagination', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.salaryPayment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.salaryPayment.count).mockResolvedValue(0);

    await bankAnalyticsService.getTransactions({}, { page: '2', pageSize: '50' });

    expect(prisma.salaryPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 50 }),
    );
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Date Boundary Consistency Pack v1 — regression coverage for
 * FinancialService.getStatement(). Before this pack, `toDate` was converted
 * with a bare `new Date(filters.toDate)` (midnight) before being forwarded to
 * `buildStatement()`, silently dropping any invoice/payment dated later on the
 * final day of the statement period.
 */

vi.mock('../../../shared/services/statement.service', () => ({
  buildStatement: vi.fn(),
}));

import { FinancialService } from '../financial.service';
import { buildStatement } from '../../../shared/services/statement.service';
import { endOfDay } from '../../../core/utils/dateWindows';

const mockBuildStatement = buildStatement as unknown as ReturnType<typeof vi.fn>;

describe('FinancialService.getStatement — date boundary', () => {
  let service: FinancialService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new FinancialService();
    mockBuildStatement.mockResolvedValue({
      entityType: 'CUSTOMER', entityId: 1, entityName: 'عميل تجريبي', entityCode: 'C-1',
      openingBalance: 0,
      entries: [],
      summary: { openingBalance: 0, totalDebit: 0, totalCredit: 0, closingBalance: 0, transactionCount: 0 },
    });
  });

  it('resolves toDate to end-of-day (23:59:59.999) before forwarding to buildStatement', async () => {
    await service.getStatement('customer', 1, { toDate: '2025-12-31' });

    const forwarded = mockBuildStatement.mock.calls[0][0].filters.toDate as Date;
    expect(forwarded.getHours()).toBe(23);
    expect(forwarded.getMinutes()).toBe(59);
    expect(forwarded.getSeconds()).toBe(59);
    expect(forwarded.getMilliseconds()).toBe(999);
    expect(forwarded.getTime()).toBe(endOfDay(new Date('2025-12-31')).getTime());
  });
});

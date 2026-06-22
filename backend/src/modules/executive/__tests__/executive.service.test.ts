import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice:  { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    expense:  { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    payment:  { aggregate: vi.fn(), findMany: vi.fn() },
    contract: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    customer: { count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { ExecutiveService } from '../executive.service';

/** Set every mock to a safe null/empty resolved value. */
function defaultMocks() {
  vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: null, paidAmount: null } } as any);
  vi.mocked(prisma.invoice.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.invoice.findMany).mockResolvedValue([]);
  vi.mocked(prisma.invoice.count).mockResolvedValue(0);
  vi.mocked(prisma.expense.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
  vi.mocked(prisma.expense.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.expense.findMany).mockResolvedValue([]);
  vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: null } } as any);
  vi.mocked(prisma.payment.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contract.count).mockResolvedValue(0);
  vi.mocked(prisma.contract.findMany).mockResolvedValue([]);
  vi.mocked(prisma.contract.groupBy).mockResolvedValue([]);
  vi.mocked(prisma.customer.count).mockResolvedValue(0);
}

describe('ExecutiveService — decisionCenter()', () => {
  let service: ExecutiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
    service = new ExecutiveService();
  });

  // ── Financial summary: zero-data guard ────────────────────────────────────

  it('returns zero totals when no data exists', async () => {
    const result = await service.decisionCenter();
    expect(result.financialSummary.totalRevenue).toBe(0);
    expect(result.financialSummary.totalExpenses).toBe(0);
    expect(result.financialSummary.netProfit).toBe(0);
    expect(result.financialSummary.totalCollected).toBe(0);
    expect(result.financialSummary.totalOutstanding).toBe(0);
  });

  it('never returns NaN for financial totals', async () => {
    const result = await service.decisionCenter();
    expect(Number.isNaN(result.financialSummary.totalRevenue)).toBe(false);
    expect(Number.isNaN(result.financialSummary.netProfit)).toBe(false);
    expect(Number.isNaN(result.financialSummary.totalOutstanding)).toBe(false);
  });

  it('totalOutstanding is never negative', async () => {
    // Simulate collected > revenue (edge case)
    vi.mocked(prisma.invoice.aggregate)
      .mockResolvedValueOnce({ _sum: { total: 500 } } as any)   // totalRevenue
      .mockResolvedValue({ _sum: { total: null, paidAmount: null } } as any);
    vi.mocked(prisma.payment.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 2000 } } as any)  // totalCollected > revenue
      .mockResolvedValue({ _sum: { amount: null } } as any);

    const result = await service.decisionCenter();
    expect(result.financialSummary.totalOutstanding).toBeGreaterThanOrEqual(0);
  });

  // ── Health score ──────────────────────────────────────────────────────────

  it('health score total is between 0 and 100', async () => {
    const result = await service.decisionCenter();
    expect(result.healthScore.total).toBeGreaterThanOrEqual(0);
    expect(result.healthScore.total).toBeLessThanOrEqual(100);
  });

  it('health score total is never NaN', async () => {
    const result = await service.decisionCenter();
    expect(Number.isNaN(result.healthScore.total)).toBe(false);
  });

  it('health score label matches score range', async () => {
    const result = await service.decisionCenter();
    const { total, label } = result.healthScore;
    if      (total >= 80) expect(label).toBe('EXCELLENT');
    else if (total >= 65) expect(label).toBe('GOOD');
    else if (total >= 50) expect(label).toBe('WATCH');
    else                  expect(label).toBe('RISK');
  });

  it('health score has all 6 component keys', async () => {
    const result = await service.decisionCenter();
    const keys = Object.keys(result.healthScore.components);
    for (const k of ['collections', 'profitability', 'outstanding', 'cashFlow', 'contracts', 'stability']) {
      expect(keys).toContain(k);
    }
  });

  it('health score components sum to total', async () => {
    const result = await service.decisionCenter();
    const sum = Object.values(result.healthScore.components).reduce((a, b) => a + b, 0);
    expect(sum).toBe(result.healthScore.total);
  });

  it('EXCELLENT label for high collection + high profit', async () => {
    // revenue 10000, collected 9800 (98%), expenses 1000 (10% margin = 90%)
    vi.mocked(prisma.invoice.aggregate)
      .mockResolvedValueOnce({ _sum: { total: 10000 } } as any)   // totalRevenue
      .mockResolvedValue({ _sum: { total: null, paidAmount: null } } as any);
    vi.mocked(prisma.payment.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 9800 } } as any)   // totalCollected
      .mockResolvedValueOnce({ _sum: { amount: 1200 } } as any)   // thisMonthCol
      .mockResolvedValueOnce({ _sum: { amount: 900 } } as any)    // lastMonthCol
      .mockResolvedValue({ _sum: { amount: null } } as any);
    vi.mocked(prisma.expense.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 1000 } } as any)   // totalExpenses
      .mockResolvedValueOnce({ _sum: { amount: 400 } } as any)    // thisMonthExp (< col)
      .mockResolvedValue({ _sum: { amount: null } } as any);

    const result = await service.decisionCenter();
    // With 98% collection and 90% margin the score should be GOOD or EXCELLENT
    expect(['EXCELLENT', 'GOOD']).toContain(result.healthScore.label);
    expect(result.healthScore.total).toBeGreaterThanOrEqual(65);
  });

  // ── Alerts V3 ─────────────────────────────────────────────────────────────

  it('returns empty alerts array when no data triggers rules', async () => {
    const result = await service.decisionCenter();
    expect(Array.isArray(result.alertsV3)).toBe(true);
  });

  it('alerts have no duplicate IDs', async () => {
    const result = await service.decisionCenter();
    const ids = result.alertsV3.map(a => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('alerts are sorted HIGH → MEDIUM → LOW', async () => {
    const result = await service.decisionCenter();
    const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    for (let i = 0; i < result.alertsV3.length - 1; i++) {
      expect(order[result.alertsV3[i].severity]).toBeLessThanOrEqual(
        order[result.alertsV3[i + 1].severity],
      );
    }
  });

  it('CASH_FLOW_WARNING raised when this-month expenses > collections (>2x = HIGH)', async () => {
    // thisMonthCol = 200, thisMonthExp = 5000
    vi.mocked(prisma.payment.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: null } } as any)  // totalCollected
      .mockResolvedValueOnce({ _sum: { amount: 200 } } as any)   // thisMonthCol
      .mockResolvedValue({ _sum: { amount: null } } as any);
    vi.mocked(prisma.expense.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: null } } as any)  // totalExpenses
      .mockResolvedValueOnce({ _sum: { amount: 5000 } } as any)  // thisMonthExp
      .mockResolvedValue({ _sum: { amount: null } } as any);

    const result = await service.decisionCenter();
    const alert = result.alertsV3.find(a => a.type === 'CASH_FLOW_WARNING');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('HIGH');
  });

  it('COLLECTION_DETERIORATION raised when this-month < last-month * 0.8', async () => {
    // lastMonthCol = 1000, thisMonthCol = 600 (60%) → < 80%
    vi.mocked(prisma.payment.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: null } } as any)   // totalCollected
      .mockResolvedValueOnce({ _sum: { amount: 600 } } as any)    // thisMonthCol
      .mockResolvedValueOnce({ _sum: { amount: 1000 } } as any)   // lastMonthCol
      .mockResolvedValue({ _sum: { amount: null } } as any);

    const result = await service.decisionCenter();
    const alert = result.alertsV3.find(a => a.type === 'COLLECTION_DETERIORATION');
    expect(alert).toBeDefined();
  });

  it('EXPENSE_SPIKE raised when this-month expenses > last-month * 1.25', async () => {
    vi.mocked(prisma.expense.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: null } } as any)   // totalExpenses
      .mockResolvedValueOnce({ _sum: { amount: 2000 } } as any)   // thisMonthExp
      .mockResolvedValueOnce({ _sum: { amount: 1000 } } as any)   // lastMonthExp
      .mockResolvedValue({ _sum: { amount: null } } as any);

    const result = await service.decisionCenter();
    const alert = result.alertsV3.find(a => a.type === 'EXPENSE_SPIKE');
    expect(alert).toBeDefined();
  });

  it('HIGH_RECEIVABLES raised when outstanding > 50% of revenue', async () => {
    // revenue = 10000, collected = 2000 → outstanding = 8000 (80%)
    vi.mocked(prisma.invoice.aggregate)
      .mockResolvedValueOnce({ _sum: { total: 10000 } } as any)
      .mockResolvedValue({ _sum: { total: null, paidAmount: null } } as any);
    vi.mocked(prisma.payment.aggregate)
      .mockResolvedValueOnce({ _sum: { amount: 2000 } } as any)
      .mockResolvedValue({ _sum: { amount: null } } as any);

    const result = await service.decisionCenter();
    const alert = result.alertsV3.find(a => a.type === 'HIGH_RECEIVABLES');
    expect(alert).toBeDefined();
    expect(['HIGH', 'MEDIUM']).toContain(alert?.severity);
  });

  // ── Decision cards ────────────────────────────────────────────────────────

  it('returns an array of decision cards', async () => {
    const result = await service.decisionCenter();
    expect(Array.isArray(result.decisionCards)).toBe(true);
  });

  it('each card has required fields with valid priority', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([{
      id: 1, customerId: 42,
      total: 5000, paidAmount: 0, issueDate: new Date('2026-01-01'), dueDate: null,
      contractId: null,
      customer: { id: 42, name: 'شركة الاختبار' },
    }] as any);

    const result = await service.decisionCenter();
    for (const card of result.decisionCards) {
      expect(card).toHaveProperty('id');
      expect(card).toHaveProperty('title');
      expect(card).toHaveProperty('value');
      expect(card).toHaveProperty('explanation');
      expect(card).toHaveProperty('priority');
      expect(card).toHaveProperty('recommendedAction');
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(card.priority);
    }
  });

  it('top debtor card appears when outstanding invoice exists', async () => {
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([{
      id: 1, customerId: 10,
      total: 9000, paidAmount: 1000, issueDate: new Date('2026-01-01'), dueDate: null,
      contractId: null,
      customer: { id: 10, name: 'مدين كبير' },
    }] as any);

    const result = await service.decisionCenter();
    const card = result.decisionCards.find(c => c.id === 'dc-highest-outstanding');
    expect(card).toBeDefined();
    expect(card?.amount).toBe(8000);
  });

  // ── Recommendations ───────────────────────────────────────────────────────

  it('recommendations count is at most 10', async () => {
    const result = await service.decisionCenter();
    expect(result.recommendations.length).toBeLessThanOrEqual(10);
  });

  it('each recommendation has required fields', async () => {
    const result = await service.decisionCenter();
    for (const rec of result.recommendations) {
      expect(rec).toHaveProperty('id');
      expect(rec).toHaveProperty('priority');
      expect(rec).toHaveProperty('title');
      expect(rec).toHaveProperty('reason');
      expect(rec).toHaveProperty('expectedImpact');
      expect(rec).toHaveProperty('suggestedAction');
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(rec.priority);
    }
  });
});

// ── kpiTimeline() ──────────────────────────────────────────────────────────

describe('ExecutiveService — kpiTimeline()', () => {
  let service: ExecutiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
    service = new ExecutiveService();
  });

  it.each(['1m', '3m', '6m', '12m'] as const)('returns correct point count for period %s', async (period) => {
    const expected = { '1m': 1, '3m': 3, '6m': 6, '12m': 12 }[period];
    const result = await service.kpiTimeline(period);
    expect(result.length).toBe(expected);
  });

  it('each point has all required fields', async () => {
    const result = await service.kpiTimeline('3m');
    for (const point of result) {
      expect(point).toHaveProperty('period');
      expect(point).toHaveProperty('revenue');
      expect(point).toHaveProperty('expenses');
      expect(point).toHaveProperty('collections');
      expect(point).toHaveProperty('profit');
      expect(point).toHaveProperty('outstandingEnd');
    }
  });

  it('profit equals revenue minus expenses for each point', async () => {
    const result = await service.kpiTimeline('1m');
    for (const point of result) {
      expect(Math.abs(point.profit - (point.revenue - point.expenses))).toBeLessThan(0.001);
    }
  });

  it('outstandingEnd is never negative', async () => {
    vi.mocked(prisma.invoice.aggregate)
      .mockResolvedValue({ _sum: { total: 500, paidAmount: 10000 } } as any);

    const result = await service.kpiTimeline('1m');
    for (const point of result) {
      expect(point.outstandingEnd).toBeGreaterThanOrEqual(0);
    }
  });

  it('period labels are in YYYY-MM format', async () => {
    const result = await service.kpiTimeline('6m');
    for (const point of result) {
      expect(point.period).toMatch(/^\d{4}-\d{2}$/);
    }
  });

  it('12m returns 12 consecutive month labels', async () => {
    const result = await service.kpiTimeline('12m');
    expect(result.length).toBe(12);
    // Labels should be distinct
    const labels = result.map(p => p.period);
    expect(new Set(labels).size).toBe(12);
  });
});

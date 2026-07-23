import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice:  { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    expense:  { aggregate: vi.fn(), groupBy: vi.fn(), findMany: vi.fn() },
    payment:  { aggregate: vi.fn(), findMany: vi.fn() },
    contract: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    customer: { count: vi.fn() },
    // Operational Reporting Migration — Pack 4: revenue/expenses/collections/receivables/
    // net profit now come from the Operational Financial Engine (Invoice/APPROVED
    // Expense/Payment), never GL. journalEntryLine is kept mocked solely so tests can
    // assert it is NEVER called.
    journalEntryLine: { aggregate: vi.fn() },
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
  // GL must never be touched by decisionCenter()/kpiTimeline() after Pack 4 — tests assert
  // this mock is never called rather than seeding a return value for it.
  vi.mocked(prisma.journalEntryLine.aggregate).mockResolvedValue({ _sum: { debit: null, credit: null } } as any);
}

/**
 * The Operational Financial Engine's `getExpenses()` filters `status: 'APPROVED'` (a plain
 * string). The pre-existing this/last-month expense queries in `decisionCenter()` (left
 * untouched by Pack 4 — out of scope, see the pack's summary) still filter with the older
 * `status: { notIn: [...] }` shape. This lets a test target one or the other precisely,
 * regardless of the engine's internal call ordering.
 */
function isEngineExpenseQuery(args: any): boolean {
  return args?.where?.status === 'APPROVED';
}

/**
 * The engine's `getCollections()`/`getAccountsReceivable()` always filter `invoice.status`
 * (`{ not: 'CANCELLED' }`); the pre-existing this/last-month collection queries only filter
 * `invoice.direction`, with no `status` key at all. This distinguishes them precisely.
 */
function isEnginePaymentQuery(args: any): boolean {
  return !!args?.where?.invoice && 'status' in args.where.invoice;
}

describe('ExecutiveService — decisionCenter()', () => {
  let service: ExecutiveService;

  beforeEach(() => {
    vi.clearAllMocks();
    defaultMocks();
    service = new ExecutiveService();
  });

  // ── Financial Period Awareness ────────────────────────────────────────────

  it('applies the period window to FLOW revenue/expenses/collections (issueDate/date gte-lte)', async () => {
    await service.decisionCenter({ fromDate: '2024-01-01', toDate: '2024-12-31' });

    // أول invoice.aggregate = إيراد الحركة → يحمل نافذة issueDate.
    const revWhere = (vi.mocked(prisma.invoice.aggregate).mock.calls[0][0] as any).where;
    expect(revWhere.issueDate.gte).toBeInstanceOf(Date);
    expect(revWhere.issueDate.lte).toBeInstanceOf(Date);
    // نهاية الفترة بنهاية اليوم (لا منتصف الليل).
    expect(revWhere.issueDate.lte.getHours()).toBe(23);

    // المصروفات صارت من محرك التقارير التشغيلية (Expense المعتمدة)، لا الأستاذ العام —
    // فتُفحص نافذة الفترة على جدول Expense مباشرة، ولا يُستدعى GL إطلاقًا.
    const expCalls = vi.mocked(prisma.expense.aggregate).mock.calls;
    const engineExpCall = expCalls.find((c: any) => isEngineExpenseQuery(c[0]));
    expect(engineExpCall).toBeDefined();
    const expDate = (engineExpCall![0] as any).where.date;
    expect(expDate.gte).toBeInstanceOf(Date);
    expect(expDate.lte.getHours()).toBe(23);
    expect(vi.mocked(prisma.journalEntryLine.aggregate)).not.toHaveBeenCalled();

    const colWhere = (vi.mocked(prisma.payment.aggregate).mock.calls[0][0] as any).where;
    expect(colWhere.date.gte).toBeInstanceOf(Date);
  });

  it('computes outstanding as a point-in-time balance as of toDate (issueDate<=asOf − payments<=asOf)', async () => {
    // إيراد تراكمي حتى toDate = 20000، تحصيل تراكمي = 5000 → ذمم 15000.
    // نُميّز التراكمي: هو الاستعلام الوحيد بـ issueDate.lte دون gte.
    vi.mocked(prisma.invoice.aggregate).mockImplementation((arg: any) => {
      const iss = arg?.where?.issueDate;
      if (iss?.lte && !iss?.gte) return Promise.resolve({ _sum: { total: 20000 } }) as any; // as-of
      return Promise.resolve({ _sum: { total: 3000, paidAmount: null } }) as any;           // flow/other
    });
    vi.mocked(prisma.payment.aggregate).mockImplementation((arg: any) => {
      const d = arg?.where?.date;
      if (d?.lte && !d?.gte) return Promise.resolve({ _sum: { amount: 5000 } }) as any;      // as-of collections
      return Promise.resolve({ _sum: { amount: 1000 } }) as any;
    });

    const result = await service.decisionCenter({ fromDate: '2024-01-01', toDate: '2024-12-31' });
    expect(result.financialSummary.totalOutstanding).toBeCloseTo(15000, 0);
  });

  it('no period → all-time behaviour preserved (no date bound on flow revenue)', async () => {
    await service.decisionCenter();
    const revWhere = (vi.mocked(prisma.invoice.aggregate).mock.calls[0][0] as any).where;
    expect(revWhere.issueDate).toBeUndefined();
  });

  it('Top Debtors follow the period: outstanding invoices bounded by issueDate<=asOf', async () => {
    await service.decisionCenter({ fromDate: '2024-01-01', toDate: '2024-12-31' });
    // أول invoice.findMany = استعلام الذمم المفتوحة (كبار المدينين/الأعمار).
    const where = (vi.mocked(prisma.invoice.findMany).mock.calls[0][0] as any).where;
    expect(where.issueDate.lte).toBeInstanceOf(Date);
    expect(where.issueDate.lte.getFullYear()).toBe(2024);
  });

  // ── Phase 7: query safety ─────────────────────────────────────────────────

  it('outstanding-invoices query has NO take (would truncate debtors/aging at 1000)', async () => {
    await service.decisionCenter();
    // أول invoice.findMany في decisionCenter هو استعلام الذمم المفتوحة.
    const call = vi.mocked(prisma.invoice.findMany).mock.calls[0][0] as any;
    expect(call).not.toHaveProperty('take');
    expect(call.orderBy).toEqual([{ issueDate: 'asc' }, { id: 'asc' }]);
  });

  it('active-contracts query has NO take (would truncate contract KPIs at 200)', async () => {
    await service.decisionCenter();
    const call = vi.mocked(prisma.contract.findMany).mock.calls[0][0] as any;
    expect(call).not.toHaveProperty('take');
  });

  it('sums all 1500 open invoices into the top-debtor card (no 1000-cap truncation)', async () => {
    const invoices = Array.from({ length: 1500 }, (_, i) => ({
      id: i + 1, customerId: 1, contractId: null,
      total: 10, paidAmount: 0,
      issueDate: new Date(2026, 0, 1), dueDate: new Date(2026, 0, 31),
      customer: { id: 1, name: 'عميل' },
    }));
    vi.mocked(prisma.invoice.findMany).mockResolvedValueOnce(invoices as any);

    const result = await service.decisionCenter();
    const topDebtorCard = result.decisionCards.find((c: any) => c.id === 'dc-highest-outstanding');
    // 1500 × 10 = 15,000 لعميل واحد — لو اقتُطع عند 1000 لظهر 10,000.
    expect(topDebtorCard?.amount).toBeCloseTo(15_000, 0);
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
    // revenue 10000, collected 9800 (98%), expenses 1000 (10% margin = 90%). Shape-based
    // mocks target the engine's own revenue/expense calls (both the direct and the
    // P&L-internal ones get the same value — they represent the same underlying figure)
    // and the fixed this/last-month comparison queries, regardless of call order.
    vi.mocked(prisma.invoice.aggregate).mockImplementation((async () => ({
      _sum: { total: 10000, paidAmount: null },
    })) as never);
    vi.mocked(prisma.expense.aggregate).mockImplementation((async (args: any) => {
      if (isEngineExpenseQuery(args)) return { _sum: { amount: 1000 } };
      // fixed this/last-month expense (old notIn[...] filter) — kept low, under collections
      return { _sum: { amount: 400 } };
    }) as never);
    vi.mocked(prisma.payment.aggregate).mockImplementation((async (args: any) => {
      if (isEnginePaymentQuery(args)) return { _sum: { amount: 9800 } }; // collections/AR
      if (args?.where?.date?.lte) return { _sum: { amount: 900 } };     // lastMonthCol
      return { _sum: { amount: 1200 } };                                // thisMonthCol
    }) as never);

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
    // thisMonthCol = 200, thisMonthExp = 5000. Shape-based mocks (not positional) so the
    // engine's own internal collections/expenses calls don't shadow these fixed-to-now
    // comparison queries, regardless of how many calls the engine makes internally.
    // بعد التوحيد صارت مقارنات الشهر تستدعي المحرك ذاته، فالتمييز عبر نافذة التاريخ:
    // استعلامات الفترة/الملخص بلا `date.gte`؛ استعلامات الشهر تحملها.
    vi.mocked(prisma.payment.aggregate).mockImplementation((async (args: any) => {
      if (!args?.where?.date?.gte) return { _sum: { amount: null } }; // engine period collections/AR
      return { _sum: { amount: 200 } }; // this/last-month collections
    }) as never);
    vi.mocked(prisma.expense.aggregate).mockImplementation((async (args: any) => {
      if (!args?.where?.date?.gte) return { _sum: { amount: null } }; // engine period/total expenses
      return { _sum: { amount: 5000 } }; // this/last-month expenses
    }) as never);

    const result = await service.decisionCenter();
    const alert = result.alertsV3.find(a => a.type === 'CASH_FLOW_WARNING');
    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('HIGH');
  });

  it('COLLECTION_DETERIORATION raised when this-month < last-month * 0.8', async () => {
    // lastMonthCol = 1000, thisMonthCol = 600 (60%) → < 80%. Distinguish this/last month by
    // the presence of an upper bound (`lte`) on the date filter — only lastMonthCol has one.
    vi.mocked(prisma.payment.aggregate).mockImplementation((async (args: any) => {
      if (!args?.where?.date?.gte) return { _sum: { amount: null } };  // engine period collections/AR
      if (args?.where?.date?.lte) return { _sum: { amount: 1000 } };    // lastMonthCol (gte+lte)
      return { _sum: { amount: 600 } };                                 // thisMonthCol (gte only)
    }) as never);

    const result = await service.decisionCenter();
    const alert = result.alertsV3.find(a => a.type === 'COLLECTION_DETERIORATION');
    expect(alert).toBeDefined();
  });

  it('EXPENSE_SPIKE raised when this-month expenses > last-month * 1.25', async () => {
    // thisMonthExp = 2000, lastMonthExp = 1000. Distinguished from the engine's own
    // APPROVED-only calls, and from each other via the date upper bound.
    vi.mocked(prisma.expense.aggregate).mockImplementation((async (args: any) => {
      if (!args?.where?.date?.gte) return { _sum: { amount: null } };  // engine period/total expenses
      if (args?.where?.date?.lte) return { _sum: { amount: 1000 } };     // lastMonthExp (gte+lte)
      return { _sum: { amount: 2000 } };                                 // thisMonthExp (gte only)
    }) as never);

    const result = await service.decisionCenter();
    const alert = result.alertsV3.find(a => a.type === 'EXPENSE_SPIKE');
    expect(alert).toBeDefined();
  });

  it('HIGH_RECEIVABLES raised when outstanding > 50% of revenue', async () => {
    // revenue = 10000 (flow)، والذمم اللحظية = إيراد تراكمي 10000 − تحصيل تراكمي 2000 = 8000 (80%).
    // بلا فترة، الحركة والتراكم متساويان؛ نُثبّت كل aggregate على نفس القيمة.
    vi.mocked(prisma.invoice.aggregate).mockResolvedValue({ _sum: { total: 10000 } } as any);
    vi.mocked(prisma.payment.aggregate).mockResolvedValue({ _sum: { amount: 2000 } } as any);

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
    // المستحق يُحسب من الدفعات (حتى نهاية الفترة)، لا من paidAmount: 9000 − 1000 = 8000.
    vi.mocked(prisma.invoice.findMany).mockResolvedValue([{
      id: 1, customerId: 10,
      total: 9000, issueDate: new Date('2026-01-01'), dueDate: null,
      contractId: null,
      customer: { id: 10, name: 'مدين كبير' },
      payments: [{ amount: 1000 }],
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

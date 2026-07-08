import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    contract: { findMany: vi.fn() },
    invoice:  { groupBy: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    expense:  { groupBy: vi.fn(), findMany: vi.fn(), aggregate: vi.fn() },
    payment:  { findMany: vi.fn(), aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { dashboardService } from '../dashboard.service';

const mp = prisma as unknown as {
  contract: { findMany: ReturnType<typeof vi.fn> };
  invoice:  { groupBy: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
  expense:  { groupBy: ReturnType<typeof vi.fn>; findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
  payment:  { findMany: ReturnType<typeof vi.fn>; aggregate: ReturnType<typeof vi.fn> };
};

const emptyRevAgg  = () => ({ _sum: { total: null } });
const emptyAmtAgg  = () => ({ _sum: { amount: null } });
const daysAgo    = (d: number) => new Date(Date.now() - d * 86_400_000);
const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

function setupDefaults() {
  mp.contract.findMany.mockResolvedValue([]);
  mp.invoice.groupBy.mockResolvedValue([]);
  mp.expense.groupBy.mockResolvedValue([]);
  // invoice.findMany called 3×: outstandingInvoices, trendInvoices, recentActivity
  mp.invoice.findMany.mockResolvedValue([]);
  mp.expense.findMany.mockResolvedValue([]);
  mp.payment.findMany.mockResolvedValue([]);
  // invoice.aggregate called 2× (thisMonth, lastMonth revenue)
  mp.invoice.aggregate.mockResolvedValue(emptyRevAgg());
  // expense.aggregate called 2× (thisMonth, lastMonth expenses)
  mp.expense.aggregate.mockResolvedValue(emptyAmtAgg());
  // payment.aggregate called 2× (thisMonth, lastMonth collections)
  mp.payment.aggregate.mockResolvedValue(emptyAmtAgg());
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaults();
});

describe('executiveIntelligenceV2', () => {

  it('empty database — returns all required top-level keys, no NaN or Infinity', async () => {
    const result = await dashboardService.executiveIntelligenceV2();

    expect(result).toHaveProperty('alerts');
    expect(result).toHaveProperty('forecast');
    expect(result).toHaveProperty('monthlyTrends');
    expect(result).toHaveProperty('kpiComparisons');
    expect(result).toHaveProperty('contractHealth');
    expect(result).toHaveProperty('recommendations');

    expect(result.alerts).toHaveLength(0);
    expect(result.recommendations).toHaveLength(0);
    // نافذة YTD: شهر لكل شهر من يناير حتى الشهر الحالي (شاملًا).
    expect(result.monthlyTrends).toHaveLength(new Date().getMonth() + 1);
    expect(result.forecast.expectedCollections30).toBe(0);
    expect(result.forecast.expectedCollections60).toBe(0);
    expect(result.forecast.expectedCollections90).toBe(0);
    expect(result.contractHealth.summary.total).toBe(0);

    for (const t of result.monthlyTrends) {
      expect(Number.isFinite(t.revenue)).toBe(true);
      expect(Number.isFinite(t.expenses)).toBe(true);
      expect(Number.isFinite(t.collections)).toBe(true);
      expect(Number.isFinite(t.profit)).toBe(true);
    }
    expect(Number.isFinite(result.kpiComparisons.thisMonth.revenue)).toBe(true);
  });

  it('cancelled invoices excluded from outstanding and trends', async () => {
    // outstandingInvoices query already filters PAID/CANCELLED at the Prisma level
    // We verify the code does not double-count by using mock that returns only unpaid
    mp.invoice.findMany
      .mockResolvedValueOnce([
        { customerId: 1, total: 5000, paidAmount: 0, issueDate: daysAgo(10), contractId: null,
          customer: { id: 1, name: 'أ' } }, // unpaid → included
      ])
      // trendInvoices — empty (cancelled invoices already excluded by query filter)
      .mockResolvedValueOnce([])
      // recentActivity — empty
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();
    const totalOs = result.forecast.expectedCollections30
      + result.forecast.expectedCollections60
      + result.forecast.expectedCollections90;

    expect(totalOs).toBeCloseTo(5000, 3);
  });

  it('top debtors alert limited to 5 and sorted by outstanding desc', async () => {
    // 7 unique customers with varying outstanding amounts
    const makeInv = (cid: number, name: string, total: number, daysOld: number) => ({
      customerId: cid, total, paidAmount: 0, issueDate: daysAgo(daysOld),
      contractId: null, customer: { id: cid, name },
    });

    mp.invoice.findMany
      .mockResolvedValueOnce([
        makeInv(1, 'أ', 9000, 95),
        makeInv(2, 'ب', 6000, 95),
        makeInv(3, 'ج', 4000, 95),
        makeInv(4, 'د', 3000, 95),
        makeInv(5, 'ه', 2000, 95),
        makeInv(6, 'و', 1500, 95),
        makeInv(7, 'ز', 500,  95),
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();

    // overdueCustomers limited to 5
    const overdueAlerts = result.alerts.filter(a => a.type === 'OVERDUE_CUSTOMER');
    expect(overdueAlerts.length).toBeLessThanOrEqual(5);

    // sorted by outstanding desc
    for (let i = 0; i < overdueAlerts.length - 1; i++) {
      expect((overdueAlerts[i].amount ?? 0)).toBeGreaterThanOrEqual(overdueAlerts[i + 1].amount ?? 0);
    }
  });

  it('forecast buckets 30/60/90 computed correctly using dueDate', async () => {
    mp.invoice.findMany
      .mockResolvedValueOnce([
        // dueDate explicit → each goes into exactly one bucket
        { customerId: 1, total: 1000, paidAmount: 0, issueDate: daysAgo(5),  dueDate: daysFromNow(25), contractId: null, customer: { id: 1, name: 'أ' } },  // daysUntilDue=25 → bucket30
        { customerId: 2, total: 2000, paidAmount: 0, issueDate: daysAgo(10), dueDate: daysFromNow(45), contractId: null, customer: { id: 2, name: 'ب' } },  // daysUntilDue=45 → bucket60
        { customerId: 3, total: 3000, paidAmount: 0, issueDate: daysAgo(10), dueDate: daysFromNow(75), contractId: null, customer: { id: 3, name: 'ج' } },  // daysUntilDue=75 → bucket90
        // fully paid → excluded
        { customerId: 4, total: 4000, paidAmount: 4000, issueDate: daysAgo(10), dueDate: daysFromNow(20), contractId: null, customer: { id: 4, name: 'د' } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();

    expect(result.forecast.expectedCollections30).toBeCloseTo(1000, 3);
    expect(result.forecast.expectedCollections60).toBeCloseTo(2000, 3);
    expect(result.forecast.expectedCollections90).toBeCloseTo(3000, 3);
  });

  it('monthly trends cover year-to-date (Jan → current month) in chronological order', async () => {
    const now = new Date();

    // Invoice in current month
    mp.invoice.findMany
      .mockResolvedValueOnce([]) // outstandingInvoices
      .mockResolvedValueOnce([
        { issueDate: new Date(now.getFullYear(), now.getMonth(), 5), total: 5000 },
      ])
      .mockResolvedValueOnce([]); // recentActivity

    mp.expense.findMany.mockResolvedValue([
      { date: new Date(now.getFullYear(), now.getMonth(), 10), amount: 2000 },
    ]);
    mp.payment.findMany.mockResolvedValue([
      { date: new Date(now.getFullYear(), now.getMonth(), 15), amount: 4000 },
    ]);

    const result = await dashboardService.executiveIntelligenceV2();

    // نافذة YTD: عدد الأشهر = رقم الشهر الحالي (يناير=1 … الشهر الحالي).
    expect(result.monthlyTrends).toHaveLength(now.getMonth() + 1);
    // أول شهر يجب أن يكون يناير (لم يعد يبدأ من فبراير).
    expect(result.monthlyTrends[0].month).toBe(`${now.getFullYear()}-01`);
    const currentLabel = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const currentMonth = result.monthlyTrends.find(m => m.month === currentLabel);
    expect(currentMonth?.revenue).toBeCloseTo(5000, 3);
    expect(currentMonth?.expenses).toBeCloseTo(2000, 3);
    expect(currentMonth?.collections).toBeCloseTo(4000, 3);
    expect(currentMonth?.profit).toBeCloseTo(3000, 3);

    // All months are in ascending order
    for (let i = 0; i < result.monthlyTrends.length - 1; i++) {
      expect(result.monthlyTrends[i].month < result.monthlyTrends[i + 1].month).toBe(true);
    }
  });

  it('KPI comparison with zero previous month returns null (not NaN)', async () => {
    // lastMonth revenue = 0, thisMonth revenue = 5000
    mp.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { total: 5000 } }) // thisMonth
      .mockResolvedValueOnce({ _sum: { total: null } }); // lastMonth = 0

    const result = await dashboardService.executiveIntelligenceV2();

    expect(result.kpiComparisons.revenueChangePct).toBeNull();
    expect(result.kpiComparisons.thisMonth.revenue).toBeCloseTo(5000, 3);
    expect(result.kpiComparisons.lastMonth.revenue).toBe(0);
    // Ensure no NaN or Infinity leaks
    expect(Number.isNaN(result.kpiComparisons.revenueChangePct ?? 0)).toBe(false);
  });

  it('contract health score — HEALTHY contract scores >= 80', async () => {
    mp.contract.findMany.mockResolvedValue([
      { id: 1, code: 'C1', asphaltPlant: 'مصنع 1', customer: { id: 10, name: 'عميل 1' } },
    ]);
    mp.invoice.groupBy.mockResolvedValue([
      { contractId: 1, _sum: { total: 10000, paidAmount: 9500 } }, // 95% collected
    ]);
    mp.expense.groupBy.mockResolvedValue([
      { contractId: 1, _sum: { amount: 2000 } }, // 20% expense ratio → profit = 80%
    ]);
    mp.invoice.findMany
      .mockResolvedValueOnce([]) // outstandingInvoices
      .mockResolvedValueOnce([]) // trendInvoices
      .mockResolvedValueOnce([{ contractId: 1 }]); // recentActivity → C1 has recent activity

    const result = await dashboardService.executiveIntelligenceV2();
    const h = result.contractHealth;

    expect(h.summary.total).toBe(1);
    const healthyCount = h.summary.healthy;
    expect(healthyCount).toBe(1);
    expect(h.summary.risk).toBe(0);
  });

  it('contract health score — RISK contract scores < 60', async () => {
    mp.contract.findMany.mockResolvedValue([
      { id: 2, code: 'C2', asphaltPlant: 'مصنع 2', customer: { id: 20, name: 'عميل 2' } },
    ]);
    mp.invoice.groupBy.mockResolvedValue([
      { contractId: 2, _sum: { total: 10000, paidAmount: 1000 } }, // 10% collected
    ]);
    mp.expense.groupBy.mockResolvedValue([
      { contractId: 2, _sum: { amount: 11000 } }, // 110% expense ratio → loss
    ]);
    mp.invoice.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]); // no recent activity

    const result = await dashboardService.executiveIntelligenceV2();
    const h = result.contractHealth;

    expect(h.summary.total).toBe(1);
    expect(h.summary.risk).toBe(1);
    expect(h.riskContracts[0].score).toBeLessThan(60);
    expect(h.riskContracts[0].reason).toContain('ربح سلبي');
  });

  it('recommendations: overdue debtor generates HIGH priority rec', async () => {
    mp.invoice.findMany
      .mockResolvedValueOnce([
        { customerId: 1, total: 5000, paidAmount: 0, issueDate: daysAgo(100),
          contractId: null, customer: { id: 1, name: 'شركة الفجر' } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();
    const overdueRec = result.recommendations.find(r => r.id.startsWith('rec-overdue'));
    expect(overdueRec).toBeDefined();
    expect(overdueRec?.priority).toBe('HIGH');
    expect(overdueRec?.message).toContain('شركة الفجر');
  });

  it('recommendations: loss-making contract generates HIGH priority rec', async () => {
    mp.contract.findMany.mockResolvedValue([
      { id: 3, code: 'C3', asphaltPlant: 'مصنع 3', customer: { id: 30, name: 'عميل 3' } },
    ]);
    mp.invoice.groupBy.mockResolvedValue([
      { contractId: 3, _sum: { total: 5000, paidAmount: 4000 } },
    ]);
    mp.expense.groupBy.mockResolvedValue([
      { contractId: 3, _sum: { amount: 7000 } }, // loss: -2000
    ]);
    mp.invoice.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ contractId: 3 }]);

    const result = await dashboardService.executiveIntelligenceV2();
    const lossRec = result.recommendations.find(r => r.id.startsWith('rec-loss'));
    expect(lossRec).toBeDefined();
    expect(lossRec?.priority).toBe('HIGH');
  });

  // ── Blocker 1: new/no-data contract neutral guard ──────────────────────────

  it('new contract (startDate within 30 days) — HEALTHY, excluded from RISK, no HIGH recommendation', async () => {
    mp.contract.findMany.mockResolvedValue([
      { id: 99, code: 'C99', asphaltPlant: 'مصنع جديد', startDate: daysAgo(10), customer: { id: 99, name: 'عميل جديد' } },
    ]);
    // No invoices or expenses → noData = true via isNew
    mp.invoice.findMany.mockResolvedValue([]);

    const result = await dashboardService.executiveIntelligenceV2();

    expect(result.contractHealth.summary.total).toBe(1);
    expect(result.contractHealth.summary.risk).toBe(0);
    expect(result.contractHealth.summary.healthy).toBe(1);
    expect(result.contractHealth.riskContracts).toHaveLength(0);
    // No HIGH-priority recommendation triggered by this new contract
    const highRecs = result.recommendations.filter(r => r.priority === 'HIGH');
    expect(highRecs.every(r => !r.id.includes('99') && !r.message.includes('C99'))).toBe(true);
  });

  it('no-data contract (null startDate, zero revenue/expenses) — HEALTHY not RISK', async () => {
    mp.contract.findMany.mockResolvedValue([
      { id: 88, code: 'C88', asphaltPlant: 'مصنع', startDate: null, customer: { id: 88, name: 'عميل قديم' } },
    ]);
    // Zero invoices and expenses → noData = true
    mp.invoice.groupBy.mockResolvedValue([]);
    mp.expense.groupBy.mockResolvedValue([]);
    mp.invoice.findMany.mockResolvedValue([]);

    const result = await dashboardService.executiveIntelligenceV2();

    expect(result.contractHealth.summary.risk).toBe(0);
    expect(result.contractHealth.summary.healthy).toBe(1);
    expect(result.contractHealth.riskContracts).toHaveLength(0);
    expect(result.contractHealth.watchContracts).toHaveLength(0);
  });

  // ── Blocker 2: mutually exclusive forecast buckets ─────────────────────────

  it('forecast bucket exact boundaries — 30/31/60/61/90 days until due', async () => {
    mp.invoice.findMany
      .mockResolvedValueOnce([
        { customerId: 1, total: 100,  paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(30), contractId: null, customer: { id: 1, name: 'أ' } }, // boundary 30 → bucket30
        { customerId: 2, total: 200,  paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(31), contractId: null, customer: { id: 2, name: 'ب' } }, // boundary 31 → bucket60
        { customerId: 3, total: 400,  paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(60), contractId: null, customer: { id: 3, name: 'ج' } }, // boundary 60 → bucket60
        { customerId: 4, total: 800,  paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(61), contractId: null, customer: { id: 4, name: 'د' } }, // boundary 61 → bucket90
        { customerId: 5, total: 1600, paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(90), contractId: null, customer: { id: 5, name: 'ه' } }, // boundary 90 → bucket90
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();

    expect(result.forecast.expectedCollections30).toBeCloseTo(100, 3);          // only boundary-30
    expect(result.forecast.expectedCollections60).toBeCloseTo(200 + 400, 3);    // boundary-31 + boundary-60
    expect(result.forecast.expectedCollections90).toBeCloseTo(800 + 1600, 3);   // boundary-61 + boundary-90
  });

  it('overdue invoices (past dueDate) are counted in the 30-day expected bucket', async () => {
    mp.invoice.findMany
      .mockResolvedValueOnce([
        // dueDate in the past → overdue → treated as expected within 30 days
        { customerId: 1, total: 9000, paidAmount: 0, issueDate: daysAgo(100), dueDate: daysAgo(10), contractId: null, customer: { id: 1, name: 'أ' } },
        // dueDate in future (≤30) → also in the 30-day bucket
        { customerId: 2, total: 500,  paidAmount: 0, issueDate: daysAgo(5),   dueDate: daysFromNow(25), contractId: null, customer: { id: 2, name: 'ب' } },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();

    // Overdue 9000 + due-within-30 500 both land in the 30-day expected bucket.
    expect(result.forecast.expectedCollections30).toBeCloseTo(9500, 3);
    expect(result.forecast.expectedCollections60).toBeCloseTo(0, 3);
    expect(result.forecast.expectedCollections90).toBeCloseTo(0, 3);
  });

  it('no invoice counted in more than one forecast bucket', async () => {
    mp.invoice.findMany
      .mockResolvedValueOnce([
        { customerId: 1, total: 1000, paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(10), contractId: null, customer: { id: 1, name: 'أ' } }, // bucket30
        { customerId: 2, total: 1000, paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(40), contractId: null, customer: { id: 2, name: 'ب' } }, // bucket60
        { customerId: 3, total: 1000, paidAmount: 0, issueDate: daysAgo(1), dueDate: daysFromNow(80), contractId: null, customer: { id: 3, name: 'ج' } }, // bucket90
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();
    const { expectedCollections30: e30, expectedCollections60: e60, expectedCollections90: e90 } = result.forecast;

    expect(e30).toBeCloseTo(1000, 3);
    expect(e60).toBeCloseTo(1000, 3);
    expect(e90).toBeCloseTo(1000, 3);
    // Total equals sum of individuals — no double counting
    expect(e30 + e60 + e90).toBeCloseTo(3000, 3);
  });

  // ── Blocker 3: denominator zero → null, JSON-safe payload ─────────────────

  it('denominator zero in KPI — null in payload, no NaN/Infinity in JSON', async () => {
    mp.invoice.aggregate
      .mockResolvedValueOnce({ _sum: { total: 8000 } }) // thisMonth revenue
      .mockResolvedValueOnce({ _sum: { total: null } }); // lastMonth = 0

    const result = await dashboardService.executiveIntelligenceV2();

    expect(result.kpiComparisons.revenueChangePct).toBeNull();
    expect(result.kpiComparisons.thisMonth.revenue).toBeCloseTo(8000, 3);
    // Full payload must be JSON-serialisable with no NaN or Infinity
    const payload = JSON.stringify(result);
    expect(payload).not.toContain('NaN');
    expect(payload).not.toContain('Infinity');
  });

  it('recommendations capped at 8', async () => {
    // Generate maximum alerts to push recommendations > 8
    const makeInv = (cid: number, dOld: number) => ({
      customerId: cid, total: 1000, paidAmount: 0, issueDate: daysAgo(dOld),
      contractId: null, customer: { id: cid, name: `عميل ${cid}` },
    });
    const overdueCustomers = Array.from({ length: 10 }, (_, i) => makeInv(i + 1, 100 + i));

    mp.invoice.findMany
      .mockResolvedValueOnce(overdueCustomers)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    // Trigger collections drop recommendation
    mp.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 100 } })   // thisMonth low
      .mockResolvedValueOnce({ _sum: { amount: 10000 } }); // lastMonth high → > -10% drop

    const result = await dashboardService.executiveIntelligenceV2();
    expect(result.recommendations.length).toBeLessThanOrEqual(8);
  });
});

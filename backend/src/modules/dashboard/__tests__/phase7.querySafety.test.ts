import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * المرحلة 7 — سلامة الاستعلامات والأداء.
 *
 * انحدارات تحرس ألا يعود أي مؤشر مالي يعتمد على `take` يقتطع الصفوف:
 *   1. الاتجاه الشهري (إيراد/مصروف/تحصيل) بلا اقتطاع — عبر aggregate لكل شهر.
 *   2. المدينون والأعمار (Top-N) يُحسبان من كامل مجموعة الذمم المفتوحة، بلا take.
 *   3. Top-N يُبنى بعد تجميع كل كيان، لا بأخذ أول N معاملات.
 *   4. فلترة الفترة تحدث داخل استعلام Prisma (where) لا في الذاكرة.
 *   5. ترقيم صفحات حتمي بمفتاح ثانوي عند تساوي التاريخ.
 *   6. نتائج البيانات الصغيرة لم تتغيّر.
 */

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

const mp = prisma as any;

function setup() {
  mp.contract.findMany.mockResolvedValue([]);
  mp.invoice.groupBy.mockResolvedValue([]);
  mp.expense.groupBy.mockResolvedValue([]);
  mp.invoice.findMany.mockResolvedValue([]);
  mp.expense.findMany.mockResolvedValue([]);
  mp.payment.findMany.mockResolvedValue([]);
  mp.invoice.aggregate.mockResolvedValue({ _sum: { total: null } });
  mp.expense.aggregate.mockResolvedValue({ _sum: { amount: null } });
  mp.payment.aggregate.mockResolvedValue({ _sum: { amount: null } });
}

beforeEach(() => {
  vi.resetAllMocks();
  setup();
});

/** أول استدعاء لـ invoice.findMany هو استعلام الذمم المفتوحة. */
const outstandingCall = () => mp.invoice.findMany.mock.calls[0][0];

describe('Phase 7 — no take on KPI queries', () => {
  it('outstanding-invoices query has NO take (would truncate debtors/aging)', async () => {
    await dashboardService.executiveIntelligenceV2();
    expect(outstandingCall()).not.toHaveProperty('take');
  });

  it('active-contracts query has NO take (would truncate contract KPIs)', async () => {
    await dashboardService.executiveIntelligenceV2();
    const contractCall = mp.contract.findMany.mock.calls[0][0];
    expect(contractCall).not.toHaveProperty('take');
  });

  it('monthly trend is aggregated in the DB, not fetched as capped rows', async () => {
    await dashboardService.executiveIntelligenceV2();
    // الاتجاه صار aggregate لكل شهر؛ invoice.findMany يُستدعى مرتين فقط:
    // [0] الذمم المفتوحة (بلا take) و[1] النشاط الحديث (مجموعة عضوية تزيينية، take مقبول).
    // لم يعد هناك جلب صفوف اتجاه مقتطع (take:2000 سابقًا).
    expect(mp.invoice.findMany.mock.calls.length).toBe(2);
    expect(outstandingCall()).not.toHaveProperty('take');
    // على الأقل استدعاء aggregate واحد للاتجاه (شهر واحد على الأقل في YTD).
    expect(mp.invoice.aggregate.mock.calls.length).toBeGreaterThan(0);
  });
});

describe('Phase 7 — Top-N debtors computed from the full open set (no truncation)', () => {
  it('sums all 1200 open invoices into debtor totals (would cap at 500/1000 before)', async () => {
    const invoices = Array.from({ length: 1200 }, (_, i) => ({
      customerId: (i % 3) + 1, // 3 customers
      total: 100, paidAmount: 0,
      issueDate: new Date(2026, 0, 1), dueDate: new Date(2026, 0, 31),
      contractId: null,
      customer: { id: (i % 3) + 1, name: `عميل ${(i % 3) + 1}` },
    }));
    mp.invoice.findMany.mockReset();
    mp.invoice.findMany.mockResolvedValueOnce(invoices).mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();

    // 1200 × 100 = 120,000 موزّعة على 3 عملاء (400 فاتورة لكلٍّ = 40,000).
    const totalOutstanding = result.alerts
      .filter(a => a.type === 'HIGH_OUTSTANDING')
      .reduce((s, a) => s + (a.amount ?? 0), 0);
    // كل عميل 40,000؛ التنبيهات محدودة بـ 5 لكن العملاء 3 فقط.
    expect(totalOutstanding).toBeCloseTo(120_000, 0);
  });
});

describe('Phase 7 — period filter is applied inside the Prisma query', () => {
  it('trend aggregate carries an issueDate gte/lte window (DB-side, not JS)', async () => {
    await dashboardService.executiveIntelligenceV2();
    const trendCall = mp.invoice.aggregate.mock.calls.find(
      ([arg]: any[]) => arg?.where?.issueDate?.gte && arg?.where?.issueDate?.lte,
    );
    expect(trendCall).toBeDefined();
  });
});

describe('Phase 7 — deterministic pagination', () => {
  it('outstanding query orders by issueDate then id (stable on tied dates)', async () => {
    await dashboardService.executiveIntelligenceV2();
    const orderBy = outstandingCall().orderBy;
    expect(Array.isArray(orderBy)).toBe(true);
    expect(orderBy).toEqual([{ issueDate: 'asc' }, { id: 'asc' }]);
  });
});

describe('Phase 7 — small-data results unchanged', () => {
  it('two open invoices for one customer sum correctly (behaviour preserved)', async () => {
    mp.invoice.findMany.mockReset();
    mp.invoice.findMany
      .mockResolvedValueOnce([
        { customerId: 1, total: 500, paidAmount: 100, issueDate: new Date(2026, 0, 10), dueDate: new Date(2026, 1, 10), contractId: null, customer: { id: 1, name: 'أ' } },
        { customerId: 1, total: 300, paidAmount: 0,   issueDate: new Date(2026, 0, 20), dueDate: new Date(2026, 1, 20), contractId: null, customer: { id: 1, name: 'أ' } },
      ])
      .mockResolvedValueOnce([]);

    const result = await dashboardService.executiveIntelligenceV2();
    const highOs = result.alerts.find(a => a.type === 'HIGH_OUTSTANDING');
    // (500-100) + (300-0) = 700
    expect(highOs?.amount).toBeCloseTo(700, 3);
  });
});

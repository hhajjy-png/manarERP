import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { count: vi.fn(), aggregate: vi.fn(), findMany: vi.fn() },
  },
}));

import { invoicesService } from '../invoices.service';
import { prisma } from '../../../config/database';

const db = prisma as unknown as {
  invoice: {
    count: ReturnType<typeof vi.fn>;
    aggregate: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
  };
};

/**
 * Financial Accuracy Hotfix Pack v1 — البندان 5 و6.
 *
 * مجموعة بيانات واحدة تخدم غرضين: أن «المتبقي» لا يبتلع قيمة الفواتير الملغاة،
 * وأن مجموع صفوف التقرير الشهري يطابق بطاقة الشاشة لنفس الفلاتر (تكافؤ بطاقة↔تقرير).
 */
const DATASET = [
  // مسدَّدة بالكامل — لا متبقّي
  { billingMonth: 1, billingYear: 2026, issueDate: new Date(2026, 0, 31), total: 10_000, paidAmount: 10_000, status: 'PAID',      direction: 'SALES' },
  // غير مسدَّدة — متبقٍّ 4,000
  { billingMonth: 2, billingYear: 2026, issueDate: new Date(2026, 1, 28), total:  4_000, paidAmount:      0, status: 'UNPAID',    direction: 'SALES' },
  // ملغاة — لا رصيد لها إطلاقًا (الإلغاء يشترط paidAmount = 0)
  { billingMonth: 2, billingYear: 2026, issueDate: new Date(2026, 1, 20), total:  7_500, paidAmount:      0, status: 'CANCELLED', direction: 'SALES' },
  // مستورَدة تاريخيًا بلا شهر حساب — يجب أن تُنسب إلى شهر إصدارها (مارس 2026)
  { billingMonth: null, billingYear: null, issueDate: new Date(2026, 2, 31), total: 6_000, paidAmount: 2_000, status: 'PARTIAL', direction: 'SALES' },
];

/** يحاكي `aggregate` بتطبيق الشرط المعنيّ على المجموعة أعلاه. */
function aggregateOver(rows: typeof DATASET) {
  return {
    _sum: {
      total:      rows.reduce((s, r) => s + r.total, 0),
      paidAmount: rows.reduce((s, r) => s + r.paidAmount, 0),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.invoice.findMany.mockResolvedValue(DATASET);
});

describe('invoicesService.stats — الفواتير الملغاة خارج «المتبقي»', () => {
  beforeEach(() => {
    db.invoice.count.mockResolvedValue(DATASET.length);
    // الاستدعاء الأول: مجموعة الشاشة كاملة. الثاني: مجموعة المتبقي (بلا الملغاة).
    db.invoice.aggregate
      .mockResolvedValueOnce(aggregateOver(DATASET))
      .mockResolvedValueOnce(aggregateOver(DATASET.filter((r) => r.status !== 'CANCELLED')));
  });

  it('لا يحتسب قيمة الفاتورة الملغاة ضمن المتبقي (الانحدار المُصلَح)', async () => {
    const stats = await invoicesService.stats({});

    // قبل الإصلاح: 27,500 − 12,000 = 15,500 (منها 7,500 من فاتورة ملغاة).
    // بعده: (20,000 − 12,000) = 8,000 وهو المتبقي الحقيقي.
    expect(stats.totalRemaining).toBe(8_000);
  });

  it('العدّ والإجمالي يبقيان على مجموعة الشاشة نفسها فلا تتباعد البطاقة عن الجدول', async () => {
    const stats = await invoicesService.stats({});

    expect(stats.count).toBe(DATASET.length);
    expect(stats.totalSales).toBe(27_500);   // يشمل الملغاة كما يشملها الجدول
    expect(stats.totalCollected).toBe(12_000);
  });

  it('استعلام المتبقي يستبعد الملغاة صراحةً حين لا يختار المستخدم حالة', async () => {
    await invoicesService.stats({});

    const remainingWhere = db.invoice.aggregate.mock.calls[1]![0].where;
    expect(remainingWhere.status).toEqual({ not: 'CANCELLED' });
  });
});

describe('invoicesService.stats — فلتر الحالة الصريح', () => {
  it('اختيار CANCELLED صراحةً يعطي متبقيًا صفرًا لا قيمة الفواتير', async () => {
    const cancelled = DATASET.filter((r) => r.status === 'CANCELLED');
    db.invoice.count.mockResolvedValue(cancelled.length);
    db.invoice.aggregate.mockResolvedValue(aggregateOver(cancelled));

    const stats = await invoicesService.stats({ status: 'CANCELLED' });

    expect(stats.totalSales).toBe(7_500);
    expect(stats.totalRemaining).toBe(0);
  });
});

describe('تكافؤ بطاقة ↔ تقرير — التقرير الشهري مقابل بطاقات الشاشة', () => {
  it('مجموع صفوف التقرير الشهري يطابق إجمالي البطاقة لنفس الفلاتر', async () => {
    db.invoice.count.mockResolvedValue(DATASET.length);
    db.invoice.aggregate
      .mockResolvedValueOnce(aggregateOver(DATASET))
      .mockResolvedValueOnce(aggregateOver(DATASET.filter((r) => r.status !== 'CANCELLED')));

    const stats = await invoicesService.stats({ from: '2026-01-01', to: '2026-12-31' });
    const monthly = await invoicesService.monthlyReport({ from: '2026-01-01', to: '2026-12-31' });

    const monthlySales     = monthly.reduce((s, r) => s + r.totalSales, 0);
    const monthlyCollected = monthly.reduce((s, r) => s + r.totalCollected, 0);
    const monthlyCount     = monthly.reduce((s, r) => s + r.count, 0);

    expect(monthlySales).toBe(stats.totalSales);
    expect(monthlyCollected).toBe(stats.totalCollected);
    expect(monthlyCount).toBe(stats.count);
  });

  it('لا صفّ بلا فترة — الفاتورة بلا شهر حساب تظهر في شهر إصدارها', async () => {
    const monthly = await invoicesService.monthlyReport({});

    expect(monthly.every((r) => r.year !== null && r.month !== null)).toBe(true);

    const march = monthly.find((r) => r.year === 2026 && r.month === 3);
    expect(march).toMatchObject({ count: 1, totalSales: 6_000, totalCollected: 2_000 });
  });

  it('التقرير الشهري يمرّر نطاق الفترة والبحث إلى الاستعلام', async () => {
    await invoicesService.monthlyReport({ from: '2026-02-01', to: '2026-02-28', search: 'MN-INV' });

    const where = db.invoice.findMany.mock.calls[0]![0].where;
    expect(where.issueDate).toBeDefined();
    expect(where.OR).toEqual([
      { invoiceNumber: { contains: 'MN-INV' } },
      { number:        { contains: 'MN-INV' } },
    ]);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: {
    expense:     { groupBy: vi.fn() },
    projectPrice: { findMany: vi.fn() },
    invoiceItem:  { findMany: vi.fn() },
  },
}));

import { ReportsService } from '../reports.service';
import { prisma } from '../../../config/database';

const db = prisma as unknown as {
  expense:      { groupBy: ReturnType<typeof vi.fn> };
  projectPrice: { findMany: ReturnType<typeof vi.fn> };
  invoiceItem:  { findMany: ReturnType<typeof vi.fn> };
};

const service = new ReportsService();

/**
 * Financial Accuracy Hotfix Pack v1 — البند 7.
 *
 * بطاقتان من الثلاث كان لهما مصدر بيانات وعقد واجهة واضحان فأُكمل تنفيذهما الخلفي؛
 * الثالثة (`invoices-by-customer`) بقيت بلا تنفيذ وأُخفيت بطاقتها بانتظار قرار منتج،
 * فالمسار يجب أن يظل يرفضها صراحةً لا أن يخترع لها دلالة.
 */

beforeEach(() => vi.clearAllMocks());

describe('expenses-by-company — تجميع المصروفات حسب مجموعة الشركة', () => {
  beforeEach(() => {
    db.expense.groupBy.mockResolvedValue([
      { category: 'HASSAN',    _sum: { amount: 5_000.500 }, _count: { _all: 4 } },
      { category: 'GHANEM',    _sum: { amount: 3_000.250 }, _count: { _all: 2 } },
      { category: 'FUEL',      _sum: { amount: 1_200.000 }, _count: { _all: 6 } },
      { category: 'MAINTENANCE', _sum: { amount: 800.000 }, _count: { _all: 3 } },
    ]);
  });

  it('يجمع التصنيفات غير الشخصية تحت «عمليات» ويُبقي الأشخاص منفصلين', async () => {
    const report = await service.build('expenses-by-company', {});
    const byCompany = Object.fromEntries(report.rows.map((r) => [r.company, r.amount]));

    expect(byCompany['عمليات']).toBe(2_000);          // 1,200 + 800
    expect(Object.keys(byCompany)).toHaveLength(3);   // حسن + غانم + عمليات
    expect(report.rows[0].amount).toBe(5_000.500);    // مرتّب تنازليًا بالقيمة
  });

  it('صفّ الإجمالي يطابق مجموع الصفوف والعدد', async () => {
    const report = await service.build('expenses-by-company', {});

    const rowsTotal = report.rows.reduce((s, r) => s + Number(r.amount), 0);
    const rowsCount = report.rows.reduce((s, r) => s + Number(r.count), 0);

    expect(report.totalsRow!.amount).toBeCloseTo(rowsTotal, 3);
    expect(report.totalsRow!.count).toBe(rowsCount);
    expect(report.totalsRow!.amount).toBe(10_000.750);
  });

  it('فلتر الشركة يحصر الاستعلام في تصنيف واحد', async () => {
    await service.build('expenses-by-company', { company: 'HASSAN' });
    expect(db.expense.groupBy.mock.calls[0]![0].where.category).toBe('HASSAN');
  });

  it('يمرّر فلاتر الفترة والحالة وشهر الحساب', async () => {
    await service.build('expenses-by-company', {
      from: '2026-01-01', to: '2026-01-31', status: 'APPROVED', billingMonth: '1', billingYear: '2026',
    });
    const where = db.expense.groupBy.mock.calls[0]![0].where;
    expect(where.status).toBe('APPROVED');
    expect(where.billingMonth).toBe(1);
    expect(where.billingYear).toBe(2026);
    expect(where.date).toBeDefined();
  });
});

describe('prices-usage — استخدام اتفاقيات الأسعار', () => {
  beforeEach(() => {
    db.projectPrice.findMany.mockResolvedValue([
      { id: 1, asphaltPlant: 'مصنع أ', companyName: 'المنار', contractLocation: 'الجهراء', contractUnit: 'طن',  unitPrice: 12.500, customer: { id: 7, name: 'عميل أول' } },
      { id: 2, asphaltPlant: 'مصنع ب', companyName: 'الخليج', contractLocation: 'حولي',   contractUnit: 'درب', unitPrice: 30.000, customer: { id: 8, name: 'عميل ثانٍ' } },
    ]);
    db.invoiceItem.findMany.mockResolvedValue([
      { priceId: 1, quantity: 10, total: 125.000 },
      { priceId: 1, quantity:  4, total:  50.000 },
    ]);
  });

  it('يحتسب بنود فواتير البيع غير الملغاة وحدها', async () => {
    await service.build('prices-usage', {});

    const where = db.invoiceItem.findMany.mock.calls[0]![0].where;
    expect(where.invoice).toEqual({ direction: 'SALES', status: { not: 'CANCELLED' } });
    expect(where.priceId).toEqual({ not: null });
  });

  it('يجمع الاستخدام لكل اتفاقية ويترك غير المستخدَمة بأصفار', async () => {
    const report = await service.build('prices-usage', {});

    const used   = report.rows.find((r) => r.asphaltPlant === 'مصنع أ')!;
    const unused = report.rows.find((r) => r.asphaltPlant === 'مصنع ب')!;

    expect(used).toMatchObject({ usageCount: 2, totalQuantity: 14, totalAmount: 175 });
    expect(unused).toMatchObject({ usageCount: 0, totalQuantity: 0, totalAmount: 0 });
    expect(report.totalsRow!.totalAmount).toBe(175);
  });

  it('فلتر العميل يحصر الصفوف', async () => {
    const report = await service.build('prices-usage', { customerId: '7' });
    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].customer).toBe('عميل أول');
  });

  it('فلترا الشركة ووحدة العمل يحصران الصفوف', async () => {
    expect((await service.build('prices-usage', { company: 'الخليج' })).rows).toHaveLength(1);
    expect((await service.build('prices-usage', { workType: 'طن' })).rows).toHaveLength(1);
    expect((await service.build('prices-usage', { workType: 'معالجات' })).rows).toHaveLength(0);
  });
});

describe('invoices-by-customer — بلا تنفيذ عمدًا', () => {
  it('يبقى مرفوضًا صراحةً بانتظار قرار مالك المنتج', async () => {
    await expect(service.build('invoices-by-customer', {}))
      .rejects.toThrow('نوع تقرير غير معروف');
  });
});

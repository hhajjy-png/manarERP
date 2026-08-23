import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/database', () => ({
  prisma: { expense: { create: vi.fn(), update: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), count: vi.fn() } },
}));
vi.mock('../../../core/middleware/audit', () => ({ recordAudit: vi.fn(async () => undefined) }));
vi.mock('../../../shared/services/periodLock.service', () => ({ assertPeriodOpen: vi.fn(async () => undefined) }));
vi.mock('../../../shared/validation/accountingPeriod.validation', () => ({ assertDateWithinBillingPeriod: vi.fn() }));
vi.mock('../../../shared/services/historicalEntry.service', () => ({ recordHistoricalEntry: vi.fn(async () => undefined) }));

import { expensesService } from '../expenses.service';
import { prisma } from '../../../config/database';

const db = prisma as unknown as {
  expense: {
    create: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; count: ReturnType<typeof vi.fn>;
  };
};

/**
 * Financial Precision & KPI Hardening Pack v4 — البند 4.
 *
 * الشيكات والفواتير تطبّق سياسة النقود عند الكتابة؛ المصروفات كانت تعتمد على
 * `step="0.001"` في النموذج وحده. مبلغٌ يصل من الاستيراد أو الـAPI بأربع خانات كان
 * يُخزَّن كما هو ثم يُعرض مقرَّبًا — فيختلف المعروض عن المخزَّن في التصدير والتقارير.
 */

const REQ = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.expense.create.mockImplementation(async ({ data }: { data: { amount: number } }) => ({ id: 1, ...data }));
  db.expense.update.mockImplementation(async ({ data }: { data: { amount: number } }) => ({ id: 1, ...data }));
  db.expense.count.mockResolvedValue(0);
  db.expense.findFirst.mockResolvedValue(null);
});

describe('expensesService.create — تطبيع المبلغ عند الكتابة', () => {
  it('يقرّب المبلغ الزائد عن ثلاث خانات قبل التخزين', async () => {
    await expensesService.create(
      { code: 'EXP-1', category: 'FUEL', description: 'وقود', amount: 12.34567, date: new Date(2026, 7, 1) } as never,
      REQ,
    );
    expect(db.expense.create.mock.calls[0]![0].data.amount).toBe(12.346);
  });

  it('يطبّق «نصف بعيدًا عن الصفر» لا القصّ', async () => {
    await expensesService.create(
      { code: 'EXP-2', category: 'FUEL', description: 'وقود', amount: 2.0005, date: new Date(2026, 7, 1) } as never,
      REQ,
    );
    expect(db.expense.create.mock.calls[0]![0].data.amount).toBe(2.001);
  });

  it('المبلغ المطابق للسياسة أصلًا لا يتغيّر', async () => {
    await expensesService.create(
      { code: 'EXP-3', category: 'FUEL', description: 'وقود', amount: 150.5, date: new Date(2026, 7, 1) } as never,
      REQ,
    );
    expect(db.expense.create.mock.calls[0]![0].data.amount).toBe(150.5);
  });

  it('سجلّ التدقيق يحمل المبلغ المطبَّع لا الخام', async () => {
    const { recordAudit } = await import('../../../core/middleware/audit');
    await expensesService.create(
      { code: 'EXP-4', category: 'FUEL', description: 'وقود', amount: 9.9999, date: new Date(2026, 7, 1) } as never,
      REQ,
    );
    expect(vi.mocked(recordAudit).mock.calls[0]![0].newValue).toMatchObject({ amount: 10 });
  });
});

describe('expensesService.update — نفس التطبيع، بلا مساس بالسجلات التاريخية', () => {
  beforeEach(() => {
    db.expense.findUnique.mockResolvedValue({
      id: 1, code: 'EXP-1', category: 'FUEL', description: 'وقود',
      amount: 12.34567, date: new Date(2026, 7, 1), status: 'PENDING',
      billingMonth: null, billingYear: null, notes: null, contractId: null,
      supplierId: null, supplierName: null, documentPath: null, paymentMethod: 'CASH',
    });
  });

  it('يقرّب المبلغ الجديد', async () => {
    await expensesService.update(1, { amount: 7.7777 } as never, REQ);
    expect(db.expense.update.mock.calls[0]![0].data.amount).toBe(7.778);
  });

  it('تعديل حقل آخر لا يعيد كتابة المبلغ التاريخي (لا Backfill)', async () => {
    await expensesService.update(1, { description: 'وقود ديزل' } as never, REQ);
    // القيمة القديمة تمرّ كما هي — التطبيع يخصّ المُدخل الجديد وحده.
    expect(db.expense.update.mock.calls[0]![0].data.amount).toBe(12.34567);
  });
});

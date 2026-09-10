import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ════════════════════════════════════════════════════════════════════════════
   صفحة المقبوضات — خدمة الاستعلام.

   عميل Prisma موهوم بالكامل: ما يُختبَر هنا هو **الاستعلام المبني** لا محرّك
   قاعدة البيانات. أهمّ ما تثبته هذه المجموعة أن الخدمة لا تلمس إلا جدول
   `payments`، فيستحيل بنيويًا أن تحتسب مبلغًا مرّتين.
   ════════════════════════════════════════════════════════════════════════════ */

vi.mock('../../../config/database', () => ({
  prisma: {
    payment: {
      findMany: vi.fn(),
      count: vi.fn(),
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
    // الجداول التي تحمل **انعكاس** نفس المبلغ. موجودة في الوهم كي يستطيع
    // الاختبار أن يثبت أنها لا تُستدعى أبدًا.
    invoice: { findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    journalEntry: { findMany: vi.fn(), aggregate: vi.fn() },
    journalEntryLine: { findMany: vi.fn(), aggregate: vi.fn() },
    bankStatementTransaction: { findMany: vi.fn(), aggregate: vi.fn() },
    transaction: { findMany: vi.fn(), aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { ReceiptsQueryService } from '../receipts.service';
import { receiptFiltersSchema, receiptListSchema } from '../receipts.schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;
const service = new ReceiptsQueryService();

function payment(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: new Date(2026, 8, 7),
    amount: 1000,
    method: 'CHEQUE',
    reference: '004108',
    notes: null,
    createdAt: new Date(2026, 8, 7, 11),
    invoice: {
      id: 44,
      invoiceNumber: 'MN-INV-2026-044',
      number: 'INV-044',
      issueDate: new Date(2026, 6, 1),
      total: 5000,
      paidAmount: 1000,
      status: 'PARTIAL',
      customerId: 3,
      customer: { id: 3, name: 'وزارة الأشغال' },
      contractId: null,
      contract: null,
    },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.payment.findMany.mockResolvedValue([]);
  mp.payment.count.mockResolvedValue(0);
  mp.payment.aggregate.mockResolvedValue({ _sum: { amount: 0 }, _count: { _all: 0 } });
  mp.payment.groupBy.mockResolvedValue([]);
});

/* ── القائمة ─────────────────────────────────────────────────────────────── */

describe('list — الفلاتر تصل الاستعلام كما هي', () => {
  it('يستعلم فواتير المبيعات غير الملغاة فقط', async () => {
    await service.list(receiptListSchema.parse({}));
    const where = mp.payment.findMany.mock.calls[0][0].where;
    expect(where.invoice).toMatchObject({ direction: 'SALES', status: { not: 'CANCELLED' } });
  });

  it('العدّ والصفوف يستخدمان **نفس** الشرط — لا يمكن أن يكذب عدّاد النتائج', async () => {
    await service.list(receiptListSchema.parse({ from: '2026-08-01', to: '2026-08-31', method: 'CASH' }));
    expect(mp.payment.count.mock.calls[0][0].where).toEqual(mp.payment.findMany.mock.calls[0][0].where);
  });

  it('يمرّر نطاق التاريخ وفلتر العميل والوسيلة وحالة السداد معًا (AND)', async () => {
    await service.list(
      receiptListSchema.parse({ from: '2026-08-01', to: '2026-08-31', customerId: '3', method: 'CHEQUE', invoiceStatus: 'PAID' }),
    );
    const where = mp.payment.findMany.mock.calls[0][0].where;
    expect(where.date.gte).toBeInstanceOf(Date);
    expect(where.method).toBe('CHEQUE');
    expect(where.invoice).toMatchObject({ customerId: 3, status: 'PAID' });
  });

  it('يمرّر حدّي المبلغ إلى الاستعلام', async () => {
    await service.list(receiptListSchema.parse({ minAmount: '500', maxAmount: '2000' }));
    expect(mp.payment.findMany.mock.calls[0][0].where.amount).toEqual({ gte: 500, lte: 2000 });
  });

  it('البحث النصّي يصبح OR على الحقول الموجودة فعلًا', async () => {
    await service.list(receiptListSchema.parse({ search: 'الأشغال' }));
    const where = mp.payment.findMany.mock.calls[0][0].where;
    expect(Array.isArray(where.OR)).toBe(true);
    expect(where.OR).toHaveLength(5);
  });
});

describe('list — الفرز', () => {
  it('الافتراضي: الأحدث أولًا مع كاسر تعادل ثابت', async () => {
    await service.list(receiptListSchema.parse({}));
    expect(mp.payment.findMany.mock.calls[0][0].orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('يفرز بالمبلغ تصاعديًا مع الإبقاء على كاسر التعادل', async () => {
    await service.list(receiptListSchema.parse({ sortBy: 'amount', sortDir: 'asc' }));
    expect(mp.payment.findMany.mock.calls[0][0].orderBy).toEqual([{ amount: 'asc' }, { id: 'desc' }]);
  });

  it('يفرز باسم العميل عبر العلاقة', async () => {
    await service.list(receiptListSchema.parse({ sortBy: 'customer', sortDir: 'asc' }));
    expect(mp.payment.findMany.mock.calls[0][0].orderBy[0]).toEqual({ invoice: { customer: { name: 'asc' } } });
  });

  it('عمود فرز غير مُدرج في القائمة البيضاء يعود للافتراضي بهدوء', async () => {
    // القائمة البيضاء هي حدّ الأمان — لا يمكن حقن اسم حقل عبر سلسلة الاستعلام.
    await service.list({ ...receiptListSchema.parse({}), sortBy: 'amount; DROP' } as never);
    expect(mp.payment.findMany.mock.calls[0][0].orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });
});

describe('list — الترقيم', () => {
  it('الافتراضي 15 صفًا، والصفحة الثانية تتخطّى 15', async () => {
    await service.list(receiptListSchema.parse({ page: '2' }));
    expect(mp.payment.findMany.mock.calls[0][0]).toMatchObject({ skip: 15, take: 15 });
  });

  it('يحترم `pageSize` المطلوب (يستخدمه تصدير Excel بـ200)', async () => {
    await service.list(receiptListSchema.parse({ pageSize: '200' }));
    expect(mp.payment.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 200 });
  });

  it('يُخرج `meta` قياسية يعتمد عليها ترقيم الواجهة', async () => {
    mp.payment.findMany.mockResolvedValue([payment()]);
    mp.payment.count.mockResolvedValue(31);
    const res = await service.list(receiptListSchema.parse({ page: '2' }));
    expect(res.meta).toEqual({ page: 2, pageSize: 15, total: 31, totalPages: 3 });
    expect(res.data).toHaveLength(1);
  });
});

/* ── الملخّص ─────────────────────────────────────────────────────────────── */

describe('summary — الإجماليات', () => {
  it('المتوسط من الإجمالي ÷ العدد، وصفر عند غياب العمليات (لا قسمة على صفر)', async () => {
    mp.payment.aggregate.mockResolvedValue({ _sum: { amount: 3000 }, _count: { _all: 4 } });
    const s = await service.summary(receiptFiltersSchema.parse({}));
    expect(s.totals).toEqual({ total: 3000, count: 4, average: 750 });

    mp.payment.aggregate.mockResolvedValue({ _sum: { amount: null }, _count: { _all: 0 } });
    const empty = await service.summary(receiptFiltersSchema.parse({}));
    expect(empty.totals).toEqual({ total: 0, count: 0, average: 0 });
    expect(empty.largest).toBeNull();
  });

  it('أكبر عملية تُجلب بصفٍّ واحد (`take: 1`) لا بجلب المجموعة كاملة', async () => {
    mp.payment.findMany.mockResolvedValue([payment({ amount: 20794, method: 'TRANSFER' })]);
    const s = await service.summary(receiptFiltersSchema.parse({}));
    expect(mp.payment.findMany.mock.calls[0][0].take).toBe(1);
    expect(s.largest).toMatchObject({ amount: 20794, method: 'TRANSFER', customerName: 'وزارة الأشغال' });
  });

  it('تفصيل الوسائل يُبنى على **نفس** شرط الإجمالي', async () => {
    await service.summary(receiptFiltersSchema.parse({ customerId: '3' }));
    expect(mp.payment.groupBy.mock.calls[0][0].where).toEqual(mp.payment.aggregate.mock.calls[0][0].where);
    expect(mp.payment.groupBy.mock.calls[0][0].by).toEqual(['method']);
  });
});

describe('summary — الشهر الحالي مقابل السابق', () => {
  const NOW = new Date(2026, 8, 10, 12, 0, 0);

  function mockMonths(current: number, previous: number) {
    mp.payment.aggregate
      .mockResolvedValueOnce({ _sum: { amount: 0 }, _count: { _all: 0 } })            // الإجمالي
      .mockResolvedValueOnce({ _sum: { amount: current }, _count: { _all: 3 } })       // الحالي
      .mockResolvedValueOnce({ _sum: { amount: previous }, _count: { _all: 7 } });     // السابق
  }

  it('يحسب الفرق والنسبة بين شهرين حقيقيين', async () => {
    mockMonths(31892.2, 18612.3);
    const s = await service.summary(receiptFiltersSchema.parse({}), NOW);
    expect(s.months.current).toMatchObject({ total: 31892.2, from: '2026-09-01', to: '2026-09-10' });
    expect(s.months.previous).toMatchObject({ total: 18612.3, from: '2026-08-01', to: '2026-08-31' });
    expect(s.months.delta).toBe(13279.9);
    expect(s.months.percent).toBeCloseTo(71.35, 1);
  });

  it('شهر سابق بصفر ⇒ النسبة null (لا Infinity ولا NaN في الاستجابة)', async () => {
    mockMonths(5000, 0);
    const s = await service.summary(receiptFiltersSchema.parse({}), NOW);
    expect(s.months.percent).toBeNull();
    expect(JSON.stringify(s)).not.toContain('null,"percent":null,"x');
    expect(Number.isFinite(s.months.delta)).toBe(true);
  });

  it('بطاقتا الشهرين تتجاهلان النطاق الزمني المختار وتحترمان بقيّة الفلاتر', async () => {
    await service.summary(receiptFiltersSchema.parse({ from: '2026-01-01', to: '2026-03-31', customerId: '3' }), NOW);
    const monthWhere = mp.payment.aggregate.mock.calls[1][0].where;
    // نطاق البطاقة هو الشهر التقويمي لا الربع المختار…
    expect(monthWhere.date.gte.getMonth()).toBe(8);
    // …لكن فلتر العميل يبقى ساريًا فلا تتناقض البطاقة مع الجدول.
    expect(monthWhere.invoice).toMatchObject({ customerId: 3 });
  });

  it('الحدّ الأعلى للشهر الحالي هو اليوم — فلا يدخل قبضٌ بتاريخ مستقبلي', async () => {
    await service.summary(receiptFiltersSchema.parse({}), NOW);
    const monthWhere = mp.payment.aggregate.mock.calls[1][0].where;
    expect(monthWhere.date.lte.getDate()).toBe(10);
    expect(monthWhere.date.lte.getHours()).toBe(23);
  });
});

/* ── الحماية من الاحتساب المزدوج ─────────────────────────────────────────── */

describe('لا احتساب مزدوج — الإثبات البنيوي', () => {
  it('لا تلمس الخدمة أي جدول يحمل انعكاس المبلغ نفسه', async () => {
    await service.list(receiptListSchema.parse({}));
    await service.summary(receiptFiltersSchema.parse({}));

    // القيد المزدوج (1:1 مع الدفعة)، ولقطة الفاتورة، والجانب البنكي، والدفتر
    // القديم — كلّها انعكاسات لنفس المبلغ. ضمّ أيٍّ منها يحتسبه مرّتين.
    expect(mp.journalEntry.findMany).not.toHaveBeenCalled();
    expect(mp.journalEntry.aggregate).not.toHaveBeenCalled();
    expect(mp.journalEntryLine.findMany).not.toHaveBeenCalled();
    expect(mp.journalEntryLine.aggregate).not.toHaveBeenCalled();
    expect(mp.bankStatementTransaction.findMany).not.toHaveBeenCalled();
    expect(mp.bankStatementTransaction.aggregate).not.toHaveBeenCalled();
    expect(mp.transaction.findMany).not.toHaveBeenCalled();
    expect(mp.transaction.aggregate).not.toHaveBeenCalled();
    expect(mp.invoice.aggregate).not.toHaveBeenCalled();
    expect(mp.invoice.groupBy).not.toHaveBeenCalled();
  });

  it('كل قبض يظهر صفًّا واحدًا بالضبط — لا تكرار من ضمّ العلاقات', async () => {
    // فاتورة واحدة عليها ثلاث دفعات: الضمّ على العلاقة لا يُضاعف الصفوف لأن
    // وحدة الاستعلام هي الدفعة لا الفاتورة.
    mp.payment.findMany.mockResolvedValue([
      payment({ id: 1, amount: 1000 }),
      payment({ id: 2, amount: 2000 }),
      payment({ id: 3, amount: 3000 }),
    ]);
    mp.payment.count.mockResolvedValue(3);
    const res = await service.list(receiptListSchema.parse({}));
    expect(res.data.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(new Set(res.data.map((r) => r.id)).size).toBe(3);
  });

  it('مجموع التفصيل حسب الوسيلة = الإجمالي بالضبط', async () => {
    mp.payment.aggregate.mockResolvedValue({ _sum: { amount: 946548.6 }, _count: { _all: 104 } });
    mp.payment.groupBy.mockResolvedValue([
      { method: 'CHEQUE', _sum: { amount: 880686.6 }, _count: { _all: 99 } },
      { method: 'TRANSFER', _sum: { amount: 42355 }, _count: { _all: 2 } },
      { method: 'CASH', _sum: { amount: 23507 }, _count: { _all: 3 } },
    ]);
    const s = await service.summary(receiptFiltersSchema.parse({}));
    const sum = s.byMethod.reduce((acc, r) => acc + r.total, 0);
    expect(sum).toBe(s.totals.total);
    expect(s.byMethod.reduce((acc, r) => acc + r.count, 0)).toBe(s.totals.count);
  });
});

/* ── الاستبعادات ─────────────────────────────────────────────────────────── */

describe('الاستبعادات — بما ينصّ عليه النموذج لا بما نتخيّله', () => {
  it('يستبعد الفواتير الملغاة دائمًا، حتى مع فلتر حالة سداد صريح', async () => {
    await service.list(receiptListSchema.parse({ invoiceStatus: 'PAID' }));
    const invoice = mp.payment.findMany.mock.calls[0][0].where.invoice;
    expect(invoice.status).toBe('PAID');
    expect(invoice.direction).toBe('SALES');
  });

  it('يستبعد دفعات فواتير المشتريات (سداد صادر لا قبض)', async () => {
    await service.list(receiptListSchema.parse({}));
    expect(mp.payment.findMany.mock.calls[0][0].where.invoice.direction).toBe('SALES');
  });

  it('لا يفلتر بحقل حالة على الدفعة — لأن النموذج لا يملك واحدًا', async () => {
    await service.list(receiptListSchema.parse({ invoiceStatus: 'PARTIAL' }));
    const where = mp.payment.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('status');
    expect(where).not.toHaveProperty('clearedAt');
    expect(where).not.toHaveProperty('deletedAt');
  });
});

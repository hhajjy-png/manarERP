import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ════════════════════════════════════════════════════════════════════════════
   تقرير المقبوضات — Receipts Comprehensive Report v1.

   ما تثبته هذه المجموعة، بترتيب الأهمية:

     ١) **التكافؤ**: التقرير وصفحة المقبوضات يقرآن نفس المصدر بنفس الشرط، فإجمالي
        التقرير وعدده يساويان إجمالي الصفحة وعددها لنفس الفلاتر — بنيويًا، لا
        بمصادفة رقمية.
     ٢) **لا احتساب مزدوج**: لا يُقرأ أي جدول يحمل انعكاس المبلغ نفسه.
     ٣) العرض: تسميات عربية لا رموز داخلية، والوسائل الأربع منفصلة في التوزيع،
        وBANK+TRANSFER مجموعتان في بطاقة الملخّص وحدها.
   ════════════════════════════════════════════════════════════════════════════ */

vi.mock('../../../config/database', () => ({
  prisma: {
    payment: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    customer: { findUnique: vi.fn() },
    // جداول تحمل انعكاس المبلغ نفسه — موجودة في الوهم كي يثبت الاختبار أنها لا تُقرأ.
    invoice: { findMany: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    journalEntry: { findMany: vi.fn(), aggregate: vi.fn() },
    journalEntryLine: { findMany: vi.fn(), aggregate: vi.fn() },
    bankStatementTransaction: { findMany: vi.fn(), aggregate: vi.fn() },
    transaction: { findMany: vi.fn(), aggregate: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { buildReceiptsReport, buildSubtitle, buildMethodSection, buildKpis, referenceOf, toReportRows } from '../receiptsReport';
import { ReceiptsQueryService } from '../../receipts/receipts.service';
import { reportsService } from '../reports.service';
import { receiptListSchema, receiptFiltersSchema } from '../../receipts/receipts.schema';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;
const pageService = new ReceiptsQueryService();

/* ── بيانات وهمية واقعية ────────────────────────────────────────────────── */

function payment(over: Record<string, unknown> = {}) {
  return {
    id: 1,
    date: new Date(2026, 8, 7),
    amount: 9435,
    method: 'CHEQUE',
    reference: '004108',
    notes: null,
    createdAt: new Date(2026, 8, 7, 11),
    invoice: {
      id: 44,
      invoiceNumber: 'MN-INV-2026-044',
      number: 'INV-044',
      issueDate: new Date(2026, 6, 1),
      total: 9435,
      paidAmount: 9435,
      status: 'PAID',
      customerId: 3,
      customer: { id: 3, name: 'وزارة الأشغال' },
      contractId: null,
      contract: null,
    },
    ...over,
  };
}

/** ثمانية مقبوضات بمزيج الوسائل الأربع — مجموعها 45,000.000 بالضبط. */
const ROWS = [
  payment({ id: 1, amount: 15000, method: 'CHEQUE', reference: '004212' }),
  payment({ id: 2, amount: 9000, method: 'CHEQUE', reference: 'شيك رقم 004066 التجاري' }),
  payment({ id: 3, amount: 8000, method: 'TRANSFER', reference: '0409TR8821' }),
  payment({ id: 4, amount: 5000, method: 'BANK', reference: 'IBAN-9931' }),
  payment({ id: 5, amount: 3000, method: 'CASH', reference: null, notes: 'أحمد المطيري' }),
  payment({ id: 6, amount: 2500, method: 'CHEQUE', reference: '004211' }),
  payment({ id: 7, amount: 1500, method: 'TRANSFER', reference: '2408TR1177' }),
  payment({ id: 8, amount: 1000, method: 'CASH', reference: null, notes: 'سالم العنزي' }),
];

const TOTAL = 45000;
const COUNT = 8;

const GROUP_ROWS = [
  { method: 'CASH', _sum: { amount: 4000 }, _count: { _all: 2 } },
  { method: 'BANK', _sum: { amount: 5000 }, _count: { _all: 1 } },
  { method: 'CHEQUE', _sum: { amount: 26500 }, _count: { _all: 3 } },
  { method: 'TRANSFER', _sum: { amount: 9500 }, _count: { _all: 2 } },
];

/**
 * يجهّز الوهم بحيث يعطي **نفس المجموعة** لكلا المستهلكَين:
 *   • `findMany` بلا `take` (التقرير)  ⇒ كل الصفوف
 *   • `findMany` مع `take` (الصفحة)   ⇒ الصفحة المطلوبة
 * فيصبح فرق النتيجة — إن وُجد — دليلًا على انحراف في التعريف لا في البيانات.
 */
function seed() {
  mp.payment.findMany.mockImplementation(async (args: Record<string, unknown>) => {
    const take = args.take as number | undefined;
    const skip = (args.skip as number | undefined) ?? 0;
    // مسار «أكبر عملية» في الملخّص: take=1 مع ترتيب بالمبلغ.
    if (take === 1) return [ROWS.slice().sort((a, b) => b.amount - a.amount)[0]];
    return take === undefined ? ROWS : ROWS.slice(skip, skip + take);
  });
  mp.payment.count.mockResolvedValue(COUNT);
  mp.payment.aggregate.mockResolvedValue({ _sum: { amount: TOTAL }, _count: { _all: COUNT } });
  mp.payment.groupBy.mockResolvedValue(GROUP_ROWS);
  mp.customer.findUnique.mockResolvedValue({ name: 'وزارة الأشغال' });
}

beforeEach(() => {
  vi.clearAllMocks();
  seed();
});

/* ── ١) التكافؤ مع صفحة المقبوضات ───────────────────────────────────────── */

describe('التكافؤ — تقرير المقبوضات = صفحة المقبوضات', () => {
  const FILTER_CASES: { name: string; q: Record<string, string> }[] = [
    { name: 'بلا فلاتر', q: {} },
    { name: 'نطاق تاريخ', q: { from: '2026-09-01', to: '2026-09-30' } },
    { name: 'عميل', q: { customerId: '3' } },
    { name: 'وسيلة — شيك', q: { method: 'CHEQUE' } },
    { name: 'وسيلة — نقدي', q: { method: 'CASH' } },
    { name: 'وسيلة — تحويل بنكي', q: { method: 'BANK' } },
    { name: 'وسيلة — حوالة بنكية', q: { method: 'TRANSFER' } },
    { name: 'حالة سداد — مسددة', q: { status: 'PAID' } },
    { name: 'حالة سداد — جزئية', q: { status: 'PARTIAL' } },
    { name: 'بحث نصّي', q: { search: '004108' } },
    { name: 'حدّا المبلغ', q: { minAmount: '1000', maxAmount: '20000' } },
    { name: 'مركّب', q: { from: '2026-09-01', to: '2026-09-30', customerId: '3', method: 'CHEQUE', status: 'PAID' } },
  ];

  it.each(FILTER_CASES)('نفس الشرط المُرسَل إلى قاعدة البيانات — $name', async ({ q }) => {
    // التقرير…
    await buildReceiptsReport(q);
    const reportWhere = mp.payment.findMany.mock.calls.find((c: never[]) => (c[0] as Record<string, unknown>).take === undefined)![0].where;

    vi.clearAllMocks();
    seed();

    // …والصفحة.
    await pageService.list(receiptListSchema.parse(q.status ? { ...q, invoiceStatus: q.status, status: undefined } : q));
    const pageWhere = mp.payment.findMany.mock.calls[0][0].where;

    expect(reportWhere).toEqual(pageWhere);
  });

  it('الإجمالي والعدد متطابقان لنفس الفلاتر', async () => {
    const q = { from: '2026-09-01', to: '2026-09-30', method: 'CHEQUE' };

    const report = await buildReceiptsReport(q);
    const reportTotal = report.totalsRow!.amount as number;
    const reportCount = report.rows.length;

    vi.clearAllMocks();
    seed();

    const pageSummary = await pageService.summary(receiptFiltersSchema.parse(q));

    expect(reportTotal).toBe(pageSummary.totals.total);
    expect(reportCount).toBe(pageSummary.totals.count);
  });

  it('إجمالي صفّ المجاميع = مجموع مبالغ الصفوف المعروضة بالضبط', async () => {
    const report = await buildReceiptsReport({});
    const sumOfRows = report.rows.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    expect(report.totalsRow!.amount).toBe(sumOfRows);
    expect(report.totalsRow!.amount).toBe(TOTAL);
  });

  it('التقرير يجلب **كل** النتائج لا صفحة منها', async () => {
    const report = await buildReceiptsReport({});
    const call = mp.payment.findMany.mock.calls.find((c: never[]) => (c[0] as Record<string, unknown>).take === undefined)!;
    expect(call[0].skip).toBeUndefined();
    expect(call[0].take).toBeUndefined();
    expect(report.rows).toHaveLength(COUNT);
  });
});

/* ── ٢) لا احتساب مزدوج ─────────────────────────────────────────────────── */

describe('لا احتساب مزدوج', () => {
  it('لا يُقرأ أي جدول يحمل انعكاس المبلغ نفسه', async () => {
    await buildReceiptsReport({ customerId: '3' });

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
    expect(mp.invoice.findMany).not.toHaveBeenCalled();
  });

  it('قراءة العميل الوحيدة في مركز التقارير تجلب الاسم فقط — بيان عرض لا مبلغ', async () => {
    // اسم العميل للترويسة يُقرأ في `reportsService.receipts` لا في بانِي التقرير،
    // فالاختبار يمرّ بمركز التقارير نفسه ليغطّي المسار الحقيقي.
    await reportsService.build('receipts', { customerId: '3' });
    expect(mp.customer.findUnique).toHaveBeenCalledWith({ where: { id: 3 }, select: { name: true } });
    expect(mp.invoice.findMany).not.toHaveBeenCalled();
  });

  it('مركز التقارير يمرّر الفلاتر كما هي ويُخرج نفس العنوان', async () => {
    const report = await reportsService.build('receipts', { from: '2026-09-01', to: '2026-09-30', method: 'CHEQUE', customerId: '3' });
    expect(report.title).toBe('تقرير المقبوضات');
    expect(report.subtitle).toContain('وسيلة القبض: شيك');
    expect(report.subtitle).toContain('العميل: وزارة الأشغال');
  });

  it('كل قبض يظهر صفًّا واحدًا بالضبط', async () => {
    const report = await buildReceiptsReport({});
    const seqs = report.rows.map((r) => r.seq);
    expect(new Set(seqs).size).toBe(report.rows.length);
  });

  it('مجموع التوزيع حسب الوسيلة = الإجمالي، ولا يُضاف إليه', async () => {
    const report = await buildReceiptsReport({});
    const section = report.sections![0];
    const sum = section.rows.reduce((s, r) => s + Number(r.total ?? 0), 0);
    expect(sum).toBe(TOTAL);
    expect(section.totalsRow!.total).toBe(TOTAL);
  });
});

/* ── ٣) المصدر والاستبعادات ─────────────────────────────────────────────── */

describe('المصدر والاستبعادات', () => {
  it('يقرأ فواتير المبيعات غير الملغاة فقط', async () => {
    await buildReceiptsReport({});
    const where = mp.payment.findMany.mock.calls[0][0].where;
    expect(where.invoice).toMatchObject({ direction: 'SALES', status: { not: 'CANCELLED' } });
  });

  it('لا يفلتر بحقل حالة على الدفعة — النموذج لا يملك واحدًا', async () => {
    await buildReceiptsReport({ status: 'PAID' });
    const where = mp.payment.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('status');
    expect(where).not.toHaveProperty('clearedAt');
    expect(where.invoice.status).toBe('PAID');
  });

  it('الفرز الافتراضي الأحدث أولًا مع كاسر تعادل ثابت', async () => {
    await buildReceiptsReport({});
    expect(mp.payment.findMany.mock.calls[0][0].orderBy).toEqual([{ date: 'desc' }, { id: 'desc' }]);
  });

  it('يقبل فرزًا صريحًا ويرفض عمودًا خارج القائمة البيضاء', async () => {
    await buildReceiptsReport({ sortBy: 'amount', sortDir: 'asc' });
    expect(mp.payment.findMany.mock.calls[0][0].orderBy).toEqual([{ amount: 'asc' }, { id: 'desc' }]);
  });
});

/* ── ٤) العرض ───────────────────────────────────────────────────────────── */

describe('العرض — تسميات لا رموز', () => {
  it('يُصدِّر التسمية العربية للوسيلة ولحالة السداد', async () => {
    const report = await buildReceiptsReport({});
    const methods = report.rows.map((r) => r.method);
    expect(methods).toContain('شيك');
    expect(methods).toContain('نقدي');
    expect(methods).toContain('تحويل بنكي');
    expect(methods).toContain('حوالة بنكية');
    expect(methods).not.toContain('CHEQUE');
    expect(report.rows[0].invoiceStatus).toBe('مسددة بالكامل');
  });

  it('أعمدة الجدول بالترتيب المطلوب، وبلا بنك ولا تاريخ شيك', async () => {
    const report = await buildReceiptsReport({});
    expect(report.columns.map((c) => c.key)).toEqual([
      'seq', 'date', 'customer', 'invoiceNumber', 'method', 'reference', 'invoiceStatus', 'amount',
    ]);
    const headers = report.columns.map((c) => c.header);
    expect(headers.some((h) => h.includes('البنك'))).toBe(false);
    expect(headers.some((h) => h.includes('تاريخ الشيك'))).toBe(false);
    expect(headers.some((h) => h.includes('حالة الشيك'))).toBe(false);
  });

  it('المرجع يتبع الوسيلة: رقم الشيك · رقم العملية · اسم المستلم نقدًا', () => {
    expect(referenceOf({ method: 'CHEQUE', reference: '004108', notes: null })).toBe('004108');
    expect(referenceOf({ method: 'TRANSFER', reference: '0409TR8821', notes: null })).toBe('0409TR8821');
    expect(referenceOf({ method: 'CASH', reference: null, notes: 'أحمد المطيري' })).toBe('أحمد المطيري');
    expect(referenceOf({ method: 'CASH', reference: null, notes: null })).toBe('—');
  });

  it('عمود تسلسلي متّصل يبدأ من 1', () => {
    const rows = toReportRows([
      { id: 9, date: new Date(2026, 8, 1), amount: 10, method: 'CASH', reference: null, notes: 'س', createdAt: new Date(), invoiceId: 1, invoiceNumber: 'A', invoiceIssueDate: new Date(), invoiceTotal: 10, invoiceRemaining: 0, invoiceStatus: 'PAID', customerId: 1, customerName: 'ع', contractId: null, contractCode: null },
      { id: 8, date: new Date(2026, 8, 2), amount: 20, method: 'CASH', reference: null, notes: 'س', createdAt: new Date(), invoiceId: 1, invoiceNumber: 'A', invoiceIssueDate: new Date(), invoiceTotal: 20, invoiceRemaining: 0, invoiceStatus: 'PAID', customerId: 1, customerName: 'ع', contractId: null, contractCode: null },
    ]);
    expect(rows.map((r) => r.seq)).toEqual([1, 2]);
  });
});

describe('التوزيع حسب وسيلة القبض', () => {
  it('الوسائل الأربع منفصلة دائمًا — بما فيها ذات الصفر', () => {
    const section = buildMethodSection({
      totals: { total: 1000, count: 1, average: 1000 },
      largest: null,
      byMethod: [
        { method: 'CASH' as const, total: 0, count: 0, percent: 0 },
        { method: 'BANK' as const, total: 0, count: 0, percent: 0 },
        { method: 'CHEQUE' as const, total: 1000, count: 1, percent: 100 },
        { method: 'TRANSFER' as const, total: 0, count: 0, percent: 0 },
      ],
      months: { current: { total: 0, count: 0, from: '', to: '' }, previous: { total: 0, count: 0, from: '', to: '' }, delta: 0, percent: null },
    });
    expect(section.rows).toHaveLength(4);
    expect(section.rows.map((r) => r.method)).toEqual(['نقدي', 'تحويل بنكي', 'شيك', 'حوالة بنكية']);
  });

  it('BANK و TRANSFER تبقيان صفّين متمايزين في التفصيل', async () => {
    const report = await buildReceiptsReport({});
    const section = report.sections![0];
    const bank = section.rows.find((r) => r.method === 'تحويل بنكي')!;
    const transfer = section.rows.find((r) => r.method === 'حوالة بنكية')!;
    expect(bank.total).toBe(5000);
    expect(transfer.total).toBe(9500);
  });
});

describe('بطاقات المؤشرات', () => {
  const summary = {
    totals: { total: 45000, count: 8, average: 5625 },
    largest: null,
    byMethod: [
      { method: 'CASH' as const, total: 4000, count: 2, percent: 8.889 },
      { method: 'BANK' as const, total: 5000, count: 1, percent: 11.111 },
      { method: 'CHEQUE' as const, total: 26500, count: 3, percent: 58.889 },
      { method: 'TRANSFER' as const, total: 9500, count: 2, percent: 21.111 },
    ],
    months: { current: { total: 0, count: 0, from: '', to: '' }, previous: { total: 0, count: 0, from: '', to: '' }, delta: 0, percent: null },
  };

  it('«التحويلات البنكية» = BANK + TRANSFER في الملخّص', () => {
    const kpis = buildKpis(summary);
    const bankish = kpis.find((k) => k.label === 'التحويلات البنكية')!;
    expect(bankish.value).toBe(14500);
    expect(bankish.hint).toBe('3 عملية');
  });

  it('تعرض الإجمالي والعدد والنقدي والشيكات', () => {
    const labels = buildKpis(summary).map((k) => k.label);
    expect(labels).toEqual([
      'إجمالي المقبوضات', 'عدد عمليات القبض', 'النقدي', 'الشيكات', 'التحويلات البنكية', 'متوسط قيمة العملية',
    ]);
  });
});

/* ── ٥) الترويسة ────────────────────────────────────────────────────────── */

describe('ترويسة التقرير', () => {
  const summary = {
    totals: { total: 45000, count: 8, average: 5625 },
    largest: null,
    byMethod: [],
    months: { current: { total: 0, count: 0, from: '', to: '' }, previous: { total: 0, count: 0, from: '', to: '' }, delta: 0, percent: null },
  };

  it('يعرض النطاق الزمني بصيغة DD/MM/YYYY', () => {
    const sub = buildSubtitle({ from: '2026-09-01', to: '2026-09-30' }, summary);
    expect(sub).toContain('من 01/09/2026 إلى 30/09/2026');
  });

  it('يعرض الفلاتر النشطة وحدها — لا يذكر غير المُفعَّل', () => {
    const sub = buildSubtitle({ from: '2026-09-01', to: '2026-09-30', customerName: 'وزارة الأشغال', method: 'CHEQUE' }, summary);
    expect(sub).toContain('العميل: وزارة الأشغال');
    expect(sub).toContain('وسيلة القبض: شيك');
    expect(sub).not.toContain('حالة سداد الفاتورة');
  });

  it('بلا نطاق ⇒ «كل الفترات» صراحةً', () => {
    expect(buildSubtitle({}, summary)).toContain('كل الفترات');
  });

  it('يحمل العدد والإجمالي دائمًا', () => {
    const sub = buildSubtitle({}, summary);
    expect(sub).toContain('عدد العمليات: 8');
    expect(sub).toContain('إجمالي المقبوضات');
  });

  it('العنوان ثابت: «تقرير المقبوضات»', async () => {
    const report = await buildReceiptsReport({});
    expect(report.title).toBe('تقرير المقبوضات');
  });

  it('يحمل إفصاح الشيكات في تذييل البيانات الوصفية', async () => {
    const report = await buildReceiptsReport({});
    const footer = (report.metaFooter ?? []).join(' ');
    expect(footer).toContain('دورة حياة الشيك الوارد');
    expect(footer).toContain('حالة سداد الفاتورة');
  });
});

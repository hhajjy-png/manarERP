import { describe, it, expect } from 'vitest';
import {
  buildMethodBreakdown,
  buildMonthComparison,
  buildReceiptWhere,
  buildReceiptWhereIgnoringDates,
  changePercent,
  mapReceiptRow,
  monthComparisonRanges,
  RECEIPT_INVOICE_STATUSES,
  RECEIPT_METHODS,
  type MethodGroupRow,
  type RawReceipt,
} from '../receipts.calc';

/* ════════════════════════════════════════════════════════════════════════════
   صفحة المقبوضات — الطبقة النقيّة.

   كل ما هنا دوالّ خالصة، فتُختبر بلا Prisma وبلا تهيئة. اللحظة تُمرَّر دائمًا
   كوسيط، فلا اختبار يعتمد على ساعة الجهاز ولا يفشل عند منتصف الليل.
   ════════════════════════════════════════════════════════════════════════════ */

const toDateString = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ── مفردات النظام الحقيقية ─────────────────────────────────────────────── */

describe('مفردات المقبوضات — من النظام لا مخترَعة', () => {
  it('وسائل القبض هي الأربع المخزَّنة فعلًا، بلا زيادة ولا نقصان', () => {
    expect([...RECEIPT_METHODS]).toEqual(['CASH', 'BANK', 'CHEQUE', 'TRANSFER']);
  });

  it('لا حالة قبض في النظام — الحالة المتاحة هي حالة سداد الفاتورة وحدها', () => {
    // صفٌّ عليه دفعة لا يكون UNPAID (paid > 0) ولا CANCELLED (الإلغاء مرفوض
    // بنيويًا على فاتورة عليها تحصيلات)، فالقيمتان العمليتان هاتان.
    expect([...RECEIPT_INVOICE_STATUSES]).toEqual(['PAID', 'PARTIAL']);
  });
});

/* ── شرط الاستعلام ───────────────────────────────────────────────────────── */

describe('buildReceiptWhere', () => {
  it('يحصر المقبوضات في فواتير مبيعات غير ملغاة — دائمًا وبلا فلاتر', () => {
    const where = buildReceiptWhere({});
    expect(where.invoice).toMatchObject({ direction: 'SALES', status: { not: 'CANCELLED' } });
    // بلا نطاق ⇒ بلا قيد زمني (كل الفترات) — لا افتراض خفيّ لشهر أو سنة.
    expect(where.date).toBeUndefined();
  });

  it('يترجم النطاق إلى حدود اليوم المحلي شاملة الطرفين', () => {
    const where = buildReceiptWhere({ from: '2026-08-01', to: '2026-08-31' });
    const range = where.date as { gte: Date; lte: Date };
    expect(range.gte.getFullYear()).toBe(2026);
    expect(range.gte.getMonth()).toBe(7);
    expect(range.gte.getDate()).toBe(1);
    expect(range.gte.getHours()).toBe(0);
    expect(range.lte.getDate()).toBe(31);
    expect(range.lte.getHours()).toBe(23);
    expect(range.lte.getMilliseconds()).toBe(999);
  });

  it('يضع فلتر العميل وحالة السداد على الفاتورة، والوسيلة على الدفعة', () => {
    const where = buildReceiptWhere({ customerId: 7, invoiceStatus: 'PARTIAL', method: 'CHEQUE' });
    expect(where.invoice).toMatchObject({ customerId: 7, status: 'PARTIAL' });
    expect(where.method).toBe('CHEQUE');
  });

  it('يبني حدّي المبلغ مستقلَّين، ويُسقط الحدّ غير الرقمي بدل إنتاج استعلام مستحيل', () => {
    expect(buildReceiptWhere({ minAmount: 100 }).amount).toEqual({ gte: 100 });
    expect(buildReceiptWhere({ maxAmount: 500 }).amount).toEqual({ lte: 500 });
    expect(buildReceiptWhere({ minAmount: 100, maxAmount: 500 }).amount).toEqual({ gte: 100, lte: 500 });
    expect(buildReceiptWhere({ minAmount: Number.NaN }).amount).toBeUndefined();
  });

  it('يبحث في الحقول النصّية الموجودة فعلًا فقط', () => {
    const where = buildReceiptWhere({ search: '004108' });
    const or = where.OR as Record<string, unknown>[];
    expect(or).toHaveLength(5);
    expect(JSON.stringify(or)).toContain('reference');
    expect(JSON.stringify(or)).toContain('notes');
    expect(JSON.stringify(or)).toContain('invoiceNumber');
    expect(JSON.stringify(or)).toContain('customer');
  });

  it('بحث فارغ أو مسافات لا يضيف شرطًا إطلاقًا', () => {
    expect(buildReceiptWhere({ search: '   ' }).OR).toBeUndefined();
    expect(buildReceiptWhere({}).OR).toBeUndefined();
  });

  it('نسخة تجاهُل التواريخ تُسقط النطاق وتُبقي كل ما عداه', () => {
    const filters = { from: '2026-01-01', to: '2026-03-31', customerId: 7, method: 'CASH' as const };
    const where = buildReceiptWhereIgnoringDates(filters);
    expect(where.date).toBeUndefined();
    expect(where.method).toBe('CASH');
    expect(where.invoice).toMatchObject({ customerId: 7, direction: 'SALES' });
  });
});

/* ── حدود الشهر ──────────────────────────────────────────────────────────── */

describe('monthComparisonRanges', () => {
  it('الشهر الحالي يبدأ من أول الشهر وينتهي بنهاية **اليوم** لا بنهاية الشهر', () => {
    // الحدّ الأعلى الصريح يمنع دفعة بتاريخ قبض مستقبلي (شيك آجل) من تضخيم
    // «هذا الشهر» بمبلغ لم يُقبض بعد.
    const { current } = monthComparisonRanges(new Date(2026, 8, 10, 14, 30));
    expect(toDateString(current.from)).toBe('2026-09-01');
    expect(toDateString(current.to)).toBe('2026-09-10');
    expect(current.to.getHours()).toBe(23);
    expect(current.to.getMilliseconds()).toBe(999);
  });

  it('الشهر السابق شهر تقويمي كامل', () => {
    const { previous } = monthComparisonRanges(new Date(2026, 8, 10));
    expect(toDateString(previous.from)).toBe('2026-08-01');
    expect(toDateString(previous.to)).toBe('2026-08-31');
  });

  it('يناير يتدحرج إلى ديسمبر من السنة السابقة بلا حالة خاصة', () => {
    const { previous } = monthComparisonRanges(new Date(2026, 0, 5));
    expect(toDateString(previous.from)).toBe('2025-12-01');
    expect(toDateString(previous.to)).toBe('2025-12-31');
  });

  it('مارس يعطي فبراير بطوله الحقيقي (سنة كبيسة وغير كبيسة)', () => {
    expect(toDateString(monthComparisonRanges(new Date(2024, 2, 15)).previous.to)).toBe('2024-02-29');
    expect(toDateString(monthComparisonRanges(new Date(2026, 2, 15)).previous.to)).toBe('2026-02-28');
  });

  it('الحدود محلية لا UTC — منتصف ليل محلي لا 03:00', () => {
    const { current } = monthComparisonRanges(new Date(2026, 8, 10));
    expect(current.from.getHours()).toBe(0);
    expect(current.from.getMinutes()).toBe(0);
  });
});

/* ── المقارنة ────────────────────────────────────────────────────────────── */

describe('changePercent — لا Infinity ولا NaN أبدًا', () => {
  it('يحسب النسبة على أساس موجب', () => {
    expect(changePercent(150, 100)).toBe(50);
    expect(changePercent(50, 100)).toBe(-50);
  });

  it('يُعيد null حين يكون الشهر السابق صفرًا (لا 100% ولا ∞)', () => {
    expect(changePercent(1000, 0)).toBeNull();
  });

  it('يُعيد null على أساس سالب أو قيمة غير محدودة', () => {
    expect(changePercent(10, -5)).toBeNull();
    expect(changePercent(Number.POSITIVE_INFINITY, 100)).toBeNull();
    expect(changePercent(10, Number.NaN)).toBeNull();
  });

  it('صفر مقابل صفر يبقى null لا صفرًا مضلِّلًا', () => {
    expect(changePercent(0, 0)).toBeNull();
  });
});

describe('buildMonthComparison', () => {
  const ranges = monthComparisonRanges(new Date(2026, 8, 10));

  it('يُخرج الطرفين والفرق والنسبة بتقريب الدينار', () => {
    const c = buildMonthComparison(ranges, { total: 31892.2, count: 3 }, { total: 18612.3, count: 7 }, toDateString);
    expect(c.current).toMatchObject({ total: 31892.2, count: 3, from: '2026-09-01', to: '2026-09-10' });
    expect(c.previous).toMatchObject({ total: 18612.3, count: 7, from: '2026-08-01', to: '2026-08-31' });
    expect(c.delta).toBe(13279.9);
    expect(c.percent).toBeCloseTo(71.35, 1);
  });

  it('شهر سابق صفر ⇒ نسبة null وفرق يساوي الشهر الحالي', () => {
    const c = buildMonthComparison(ranges, { total: 500, count: 1 }, { total: 0, count: 0 }, toDateString);
    expect(c.percent).toBeNull();
    expect(c.delta).toBe(500);
  });

  it('الفرق يُقرَّب بسياسة الدينار لا بطرح ثنائي خام', () => {
    const c = buildMonthComparison(ranges, { total: 0.3, count: 1 }, { total: 0.1, count: 1 }, toDateString);
    expect(c.delta).toBe(0.2); // لا 0.19999999999999998
  });
});

/* ── تفصيل الوسائل ───────────────────────────────────────────────────────── */

describe('buildMethodBreakdown', () => {
  const rows: MethodGroupRow[] = [
    { method: 'CHEQUE', _sum: { amount: 18612.3 }, _count: { _all: 7 } },
    { method: 'CASH', _sum: { amount: 1387.7 }, _count: { _all: 2 } },
  ];

  it('يُخرج الوسائل الأربع دائمًا — الغائبة بصفر لا محذوفة', () => {
    const out = buildMethodBreakdown(rows, 20000);
    expect(out).toHaveLength(4);
    expect(out.map((r) => r.method)).toEqual(['CASH', 'BANK', 'CHEQUE', 'TRANSFER']);
    expect(out.find((r) => r.method === 'BANK')).toMatchObject({ total: 0, count: 0 });
  });

  it('مجموع التفصيل يساوي الإجمالي بالضبط — لا مبلغ يسقط ولا يتكرّر', () => {
    const out = buildMethodBreakdown(rows, 20000);
    const sum = out.reduce((s, r) => s + r.total, 0);
    expect(sum).toBe(20000);
  });

  it('النِسَب تُحسب من الإجمالي، وتصير null حين يكون الإجمالي صفرًا', () => {
    const out = buildMethodBreakdown(rows, 20000);
    expect(out.find((r) => r.method === 'CHEQUE')!.percent).toBeCloseTo(93.062, 2);
    const empty = buildMethodBreakdown([], 0);
    expect(empty.every((r) => r.percent === null && r.total === 0)).toBe(true);
  });

  it('يعالج `_sum.amount = null` (مجموعة فارغة في Prisma) كصفر لا NaN', () => {
    const out = buildMethodBreakdown([{ method: 'CASH', _sum: { amount: null }, _count: { _all: 0 } }], 0);
    expect(out.find((r) => r.method === 'CASH')!.total).toBe(0);
  });
});

/* ── تشكيل الصفّ ─────────────────────────────────────────────────────────── */

describe('mapReceiptRow', () => {
  const raw: RawReceipt = {
    id: 105,
    date: new Date(2026, 8, 7),
    amount: 1663.2,
    method: 'CHEQUE',
    reference: 'شيك رقم 004066 التجاري',
    notes: null,
    createdAt: new Date(2026, 8, 7, 11, 22),
    invoice: {
      id: 44,
      invoiceNumber: 'MN-INV-2026-044',
      number: 'INV-044',
      issueDate: new Date(2026, 6, 1),
      total: 5000,
      paidAmount: 1663.2,
      status: 'PARTIAL',
      customerId: 3,
      customer: { id: 3, name: 'وزارة الأشغال' },
      contractId: 9,
      contract: { id: 9, code: 'C-009' },
    },
  };

  it('يُسطّح الفاتورة والعميل والعقد في صفّ عرض واحد', () => {
    const row = mapReceiptRow(raw);
    expect(row).toMatchObject({
      id: 105,
      amount: 1663.2,
      method: 'CHEQUE',
      invoiceNumber: 'MN-INV-2026-044',
      customerName: 'وزارة الأشغال',
      contractCode: 'C-009',
      invoiceStatus: 'PARTIAL',
    });
  });

  it('يشتقّ متبقّي الفاتورة من الإجمالي ناقص المسدَّد', () => {
    expect(mapReceiptRow(raw).invoiceRemaining).toBe(3336.8);
  });

  it('يحتمل فاتورة/عميل/عقد غائبًا بلا انهيار', () => {
    const orphan = mapReceiptRow({ ...raw, invoice: null });
    expect(orphan.invoiceNumber).toBeNull();
    expect(orphan.customerName).toBeNull();
    expect(orphan.invoiceRemaining).toBeNull();
    expect(orphan.amount).toBe(1663.2);
  });

  it('يُقرِّب المبلغ بسياسة الدينار عند حدود العرض', () => {
    expect(mapReceiptRow({ ...raw, amount: 1663.2004 }).amount).toBe(1663.2);
  });
});

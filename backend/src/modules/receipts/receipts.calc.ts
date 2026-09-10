/* ════════════════════════════════════════════════════════════════════════════
   صفحة المقبوضات — الطبقة النقيّة.

   كل ما في هذا الملف دوالّ خالصة: لا Prisma، لا I/O، لا `new Date()` مخفيّة
   (اللحظة تُمرَّر دائمًا كوسيط). لذلك تُختبَر مباشرةً بلا أي تهيئة.

   ═══ ما هو «المقبوض» في هذا النظام ═══
   قبضٌ واحد = صفّ واحد في جدول `payments` مرتبط بفاتورة **مبيعات فعّالة**.
   هذا ليس تعريفًا جديدًا: إنه حرفيًا شرط `getCollections` في
   `shared/services/operational.reporting.ts` — المحرّك التشغيلي الوحيد المعتمد
   في المشروع (لوحة التحكم، مركز القرار، التقارير، ملخص المحاسبة، تحليل
   التحصيلات). الشرط يُستورَد من هناك ولا يُعاد كتابته هنا، فتبقى أرقام هذه
   الصفحة مطابقة بالتعريف لكل شاشة أخرى في النظام.

   ═══ لماذا `payments` وحدها، ولا جدول آخر معها أبدًا ═══
   المبلغ المقبوض نفسه ينعكس في أربعة مواضع:
     • `payments`                    ← الحدث المالي الأصلي (مسار كتابة واحد فقط:
                                        `invoicesService.addPayment`)
     • `invoices.paidAmount`         ← لقطة مخزَّنة تُكتب في نفس المعاملة
     • `journal_entries` (PAYMENT)   ← القيد المزدوج، 1:1 مع الدفعة
     • `bank_statement_transactions` ← الجانب البنكي حين يُستورَد كشف البنك
   ثلاثتها الأخيرة **مرايا** لا مصادر. ضمّ أيٍّ منها إلى المجموع يحتسب المبلغ
   مرّتين. لذلك لا يلمس هذا الملف — ولا الخدمة التي تستهلكه — أي جدول سواها.
   ════════════════════════════════════════════════════════════════════════════ */

import { Prisma } from '@prisma/client';
import { ENUMS } from '../../config/constants';
import { localDateRange } from '../../core/utils/dateWindows';
import { roundMoney } from '../../shared/utils/money';
import { SALES_INVOICE_ACTIVE } from '../../shared/services/operational.reporting';

/* ── وسائل القبض ─────────────────────────────────────────────────────────── */

/**
 * وسائل القبض **الحقيقية** في النظام — نفس `ENUMS.paymentMethod` حرفيًا، وهو
 * الـ`z.enum` الذي يحرس `POST /invoices/:id/payments`. لا قيمة أخرى يمكن أن
 * تُخزَّن، ولا قيمة تُخترَع هنا.
 *
 * ملاحظة تشغيلية موثَّقة: `BANK` و`TRANSFER` كلتاهما تحويل بنكي دلاليًا، ويعاملهما
 * الترحيل المحاسبي بالتساوي (كلتاهما تُدين حساب البنك 1010 — انظر
 * `invoices.accounting.ts`). أُبقيتا **منفصلتين** هنا لأنهما قيمتان مخزَّنتان
 * متمايزتان: دمجهما قرار عمل لا قرار عرض، ودمجه في طبقة التقرير يُخفي بيانات
 * موجودة فعلًا. الواجهة تعرضهما ضمن مجموعة «تحويلات بنكية» في البطاقة الموحَّدة
 * وتُبقي الصفّين متمايزين في التفصيل.
 */
export const RECEIPT_METHODS = ENUMS.paymentMethod;
export type ReceiptMethod = (typeof RECEIPT_METHODS)[number];

export function isReceiptMethod(value: unknown): value is ReceiptMethod {
  return typeof value === 'string' && (RECEIPT_METHODS as readonly string[]).includes(value);
}

/**
 * حالات سداد الفاتورة المقبوض ضدّها — قيم `Invoice.status` المخزَّنة فعلًا،
 * كما تشتقّها `invoices.calc.nextStatus`.
 *
 * ═══ لماذا لا توجد «حالة قبض» ═══
 * نموذج `Payment` **لا يحمل أي حقل حالة**: لا `status`، لا `clearedDate`، لا
 * `depositDate`، ولا حذف ناعم. وشيك العميل الوارد ليس له كيان مستقل في النظام
 * (جدول `cheques` صادر بالكامل: مستفيد + طباعة + سند صرف). فأي «مستلم / مودع /
 * محصَّل / مرتجع» على مستوى القبض سيكون **اختراعًا** لا استخراجًا.
 *
 * الحالة الحقيقية الوحيدة المرتبطة بصفّ القبض هي حالة سداد فاتورته. وهي مفيدة
 * تشغيليًا: «قبضتُ ضدّ فاتورة أُقفلت» تختلف عن «قبضتُ ضدّ فاتورة ما زال عليها
 * رصيد». صفٌّ عليه دفعة لا يكون UNPAID أبدًا (`paid > 0` ⇒ PARTIAL أو PAID)،
 * ولا CANCELLED أبدًا (إلغاء فاتورة عليها تحصيلات مرفوض بنيويًا)، فالقيمتان
 * العمليتان هما PAID و PARTIAL — وتُدرَجان كلتاهما صراحةً.
 */
export const RECEIPT_INVOICE_STATUSES = ['PAID', 'PARTIAL'] as const;
export type ReceiptInvoiceStatus = (typeof RECEIPT_INVOICE_STATUSES)[number];

export function isReceiptInvoiceStatus(value: unknown): value is ReceiptInvoiceStatus {
  return typeof value === 'string' && (RECEIPT_INVOICE_STATUSES as readonly string[]).includes(value);
}

/* ── الفلاتر ─────────────────────────────────────────────────────────────── */

export interface ReceiptFilters {
  /** نطاق **تاريخ القبض** (`Payment.date`) بصيغة `YYYY-MM-DD`. */
  from?: string;
  to?: string;
  customerId?: number;
  method?: ReceiptMethod;
  /** حالة سداد الفاتورة المقبوض ضدّها. */
  invoiceStatus?: ReceiptInvoiceStatus;
  /** بحث نصّي: رقم الفاتورة · اسم العميل · المرجع · الملاحظة. */
  search?: string;
  minAmount?: number;
  maxAmount?: number;
}

/**
 * شرط Prisma الوحيد لمجموعة المقبوضات.
 *
 * `SALES_INVOICE_ACTIVE` مستورَد لا منسوخ — تغييره في المحرّك التشغيلي يسري هنا
 * تلقائيًا، ولا يمكن لهذه الصفحة أن تنحرف عن بقيّة النظام.
 *
 * كل الفلاتر تُطبَّق في SQL: الصفحة تشغيلية ومُرقَّمة خادميًا، فأي فلتر يُطبَّق في
 * الذاكرة كان سيجعل `total` و`meta.total` يكذبان على المستخدم.
 */
export function buildReceiptWhere(filters: ReceiptFilters): Prisma.PaymentWhereInput {
  const range = localDateRange(filters.from, filters.to);

  const invoice: Prisma.InvoiceWhereInput = {
    ...SALES_INVOICE_ACTIVE,
    ...(filters.customerId != null ? { customerId: filters.customerId } : {}),
    ...(filters.invoiceStatus ? { status: filters.invoiceStatus } : {}),
  };

  const amount = buildAmountFilter(filters.minAmount, filters.maxAmount);

  return {
    ...(range ? { date: range } : {}),
    ...(amount ? { amount } : {}),
    ...(filters.method ? { method: filters.method } : {}),
    invoice,
    ...buildSearchClause(filters.search),
  };
}

/**
 * حدّا المبلغ. كلاهما اختياري ومستقل، ويُتجاهَل الحدّ غير الرقمي بصمت (فلتر غائب)
 * بدل أن يُنتج استعلامًا مستحيلًا — نفس تسامح `localDateRange` مع تاريخ مشوَّه.
 */
function buildAmountFilter(min?: number, max?: number): Prisma.FloatFilter | undefined {
  const gte = Number.isFinite(min) ? (min as number) : undefined;
  const lte = Number.isFinite(max) ? (max as number) : undefined;
  if (gte === undefined && lte === undefined) return undefined;
  return { ...(gte !== undefined ? { gte } : {}), ...(lte !== undefined ? { lte } : {}) };
}

/**
 * البحث النصّي الحرّ.
 *
 * الحقول الأربعة هي **كل** ما يحمل نصًّا قابلًا للتعرّف في مسار القبض:
 *   • `reference` — رقم الشيك (إلزامي عند CHEQUE) أو رقم التحويل (إلزامي عند
 *     TRANSFER). هو حقل «المرجع/رقم العملية» الوحيد في النموذج.
 *   • `notes`     — اسم المستلم (إلزامي عند CASH) أو ملاحظة حرّة.
 *   • رقم الفاتورة واسم العميل عبر العلاقة.
 *
 * لا يوجد حقل «رقم سند قبض» على `Payment`: سند القبض في هذا النظام نموذج طباعة
 * لا يُخزَّن (يستهلك عدّادًا في `Setting` فحسب)، فلا رقم له في قاعدة البيانات
 * يمكن البحث فيه. البحث عن رقم سند سيُخفق دائمًا لو أُدرج — فلا يُدرَج.
 *
 * `contains` بلا `mode: 'insensitive'`: SQLite لا يدعمه في Prisma، والبحث العربي
 * لا يحتاجه. هذا نفس سلوك كل بحث نصّي قائم في الـbackend.
 */
function buildSearchClause(search?: string): Prisma.PaymentWhereInput {
  const q = search?.trim();
  if (!q) return {};
  return {
    OR: [
      { reference: { contains: q } },
      { notes: { contains: q } },
      { invoice: { invoiceNumber: { contains: q } } },
      { invoice: { number: { contains: q } } },
      { invoice: { customer: { name: { contains: q } } } },
    ],
  };
}

/**
 * `buildReceiptWhere` بلا أي قيد زمني — أساس بطاقتَي «الشهر الحالي/السابق».
 *
 * البطاقتان تعنيان الشهر التقويمي **دائمًا**، لا الشهر المتقاطع مع النطاق
 * المختار: مستخدم يفلتر على الربع الأول ثم يقرأ «مقبوضات الشهر الحالي» يتوقّع
 * رقم هذا الشهر، لا صفرًا. لكنهما تحترمان بقيّة الفلاتر (عميل، وسيلة، حالة،
 * بحث، مبلغ) فتبقيان متّسقتين مع ما تُظهره الصفحة.
 */
export function buildReceiptWhereIgnoringDates(filters: ReceiptFilters): Prisma.PaymentWhereInput {
  return buildReceiptWhere({ ...filters, from: undefined, to: undefined });
}

/* ── الفرز ───────────────────────────────────────────────────────────────── */

/**
 * أعمدة الفرز المسموح بها. القائمة البيضاء هي حدّ الأمان — أي `sortBy` آخر يعود
 * بهدوء إلى الترتيب الافتراضي (`buildOrderBy` في `core/utils/sort.ts`).
 *
 * `customer` يمرّ عبر علاقة to-one مزدوجة؛ Prisma تدعمها في `orderBy`. لا تُستخدم
 * `nulls` على حقول العلاقات (خطأ P2009).
 */
export const RECEIPT_SORT_WHITELIST = {
  date: 'date',
  amount: 'amount',
  method: 'method',
  customer: (dir: 'asc' | 'desc') => ({ invoice: { customer: { name: dir } } }),
} as const;

/** الأحدث أولًا، وكاسر تعادل ثابت كي لا يتكرّر صفّ بين الصفحات أو يسقط. */
export const RECEIPT_DEFAULT_ORDER: Record<string, unknown>[] = [{ date: 'desc' }, { id: 'desc' }];
export const RECEIPT_TIEBREAKER: Record<string, unknown>[] = [{ id: 'desc' }];

/* ── حدود الشهر ──────────────────────────────────────────────────────────── */

export interface DateRange {
  from: Date;
  to: Date;
}

export interface MonthComparisonRanges {
  current: DateRange;
  previous: DateRange;
}

/**
 * حدود الشهر الحالي والسابق من لحظة مُعطاة — **بالتقويم المحلي صراحةً**.
 *
 * ═══ ثلاث نقاط دقيقة، كلٌّ منها عيب واقعي أُغلق ═══
 *
 * ١) البناء من مكوّنات (`new Date(y, m, d, …)`) لا من نصّ ISO. نصّ `YYYY-MM-DD`
 *    يُفسَّر بنص المواصفة كمنتصف ليل **UTC**، فيصبح في الكويت 03:00 محليًا —
 *    وتختفي أول ثلاث ساعات من أول يوم في الشهر. هذا نفس عقد
 *    `dateWindows.startOfLocalDay` المعتمد في كل الـbackend.
 *
 * ٢) `new Date(y, m, 0)` يعطي **آخر يوم في الشهر السابق** تلقائيًا، و
 *    `new Date(y, m - 1, 1)` يتدحرج إلى ديسمبر من السنة الماضية حين يكون
 *    الشهر الحالي يناير. لا حساب يدوي للسنة، ولا حالة خاصة ليناير.
 *
 * ٣) **للشهر الحالي حدٌّ أعلى صريح** = نهاية اليوم الحالي محليًا. لوحة التحكم
 *    اليوم تحسبه بـ`{ from: thisMonthStart }` بلا حدّ أعلى، فأي دفعة بتاريخ
 *    قبض مستقبلي (شيك آجل يُسجَّل بتاريخه) تُضخّم «هذا الشهر» بمبلغ لم يُقبض
 *    بعد. الحدّ الأعلى هنا يجعل ذلك مستحيلًا.
 */
export function monthComparisonRanges(now: Date): MonthComparisonRanges {
  const y = now.getFullYear();
  const m = now.getMonth();
  return {
    current: {
      from: new Date(y, m, 1, 0, 0, 0, 0),
      to: new Date(y, m, now.getDate(), 23, 59, 59, 999),
    },
    previous: {
      from: new Date(y, m - 1, 1, 0, 0, 0, 0),
      to: new Date(y, m, 0, 23, 59, 59, 999),
    },
  };
}

/* ── المقارنة ────────────────────────────────────────────────────────────── */

export interface PeriodTotals {
  total: number;
  count: number;
}

export interface MonthComparison {
  current: PeriodTotals & { from: string; to: string };
  previous: PeriodTotals & { from: string; to: string };
  /** الفرق بالقيمة (حالي − سابق)، مقرَّبًا بسياسة الدينار. */
  delta: number;
  /**
   * الفرق نسبةً من الشهر السابق.
   *
   * `null` حين يكون الأساس صفرًا — لا `Infinity` ولا `NaN` ولا 100% مضلِّلة.
   * الواجهة تعرض «—» ونصًّا يشرح («لا مقبوضات في الشهر السابق»)، فالمستخدم يرى
   * غياب الأساس لا رقمًا مخترَعًا.
   */
  percent: number | null;
}

/** نسبة تغيّر آمنة: `null` عند أساس غير موجب أو غير محدود. */
export function changePercent(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100 * 1000) / 1000;
}

export function buildMonthComparison(
  ranges: MonthComparisonRanges,
  current: PeriodTotals,
  previous: PeriodTotals,
  toDateString: (d: Date) => string,
): MonthComparison {
  const cur = roundMoney(current.total);
  const prev = roundMoney(previous.total);
  return {
    current: {
      total: cur,
      count: current.count,
      from: toDateString(ranges.current.from),
      to: toDateString(ranges.current.to),
    },
    previous: {
      total: prev,
      count: previous.count,
      from: toDateString(ranges.previous.from),
      to: toDateString(ranges.previous.to),
    },
    delta: roundMoney(cur - prev),
    percent: changePercent(cur, prev),
  };
}

/* ── تفصيل وسائل القبض ───────────────────────────────────────────────────── */

export interface MethodBreakdownRow {
  method: ReceiptMethod;
  total: number;
  count: number;
  /** نسبة الوسيلة من الإجمالي، أو `null` حين يكون الإجمالي غير موجب. */
  percent: number | null;
}

/** صفّ `groupBy` كما تُعيده Prisma — مُصغَّر إلى ما نحتاجه فقط. */
export interface MethodGroupRow {
  method: string;
  _sum: { amount: number | null };
  _count: { _all: number };
}

/**
 * تفصيل الوسائل — **الوسائل الأربع دائمًا**، حتى ذات الصفر.
 *
 * إسقاط الوسائل الصفرية كان سيجعل بطاقة «النقدي» تختفي من الصفحة كلّما لم يُقبض
 * نقدًا في الفترة، فيقرأ المستخدم غيابها كعطل لا كصفر. ويجعل مقارنة شهرٍ بشهر
 * تقارن صفّين مختلفَي الطول.
 *
 * النِسَب ليست نقودًا فلا تمرّ بـ`roundMoney`؛ تُقرَّب إلى ثلاث خانات عشرية
 * كنسبة (نفس دقّة `changePercent`).
 */
export function buildMethodBreakdown(rows: MethodGroupRow[], total: number): MethodBreakdownRow[] {
  const byMethod = new Map<string, MethodGroupRow>(rows.map((r) => [r.method, r]));
  const base = roundMoney(total);
  return RECEIPT_METHODS.map((method) => {
    const row = byMethod.get(method);
    const value = roundMoney(row?._sum.amount ?? 0);
    return {
      method,
      total: value,
      count: row?._count._all ?? 0,
      percent: base > 0 ? Math.round((value / base) * 100 * 1000) / 1000 : null,
    };
  });
}

/* ── تشكيل الصفّ ─────────────────────────────────────────────────────────── */

/** الشكل الذي تُحمَّل به الدفعة من Prisma — يطابق `RECEIPT_ROW_SELECT` في الخدمة. */
export interface RawReceipt {
  id: number;
  date: Date;
  amount: number;
  method: string;
  reference: string | null;
  notes: string | null;
  createdAt: Date;
  invoice: {
    id: number;
    invoiceNumber: string;
    number: string;
    issueDate: Date;
    total: number;
    paidAmount: number;
    status: string;
    customerId: number | null;
    customer: { id: number; name: string } | null;
    contractId: number | null;
    contract: { id: number; code: string } | null;
  } | null;
}

export interface ReceiptRow {
  id: number;
  /** تاريخ القبض الرسمي (`Payment.date`) — المحور الزمني الوحيد لهذه الصفحة. */
  date: Date;
  amount: number;
  method: string;
  /** رقم الشيك أو رقم التحويل — الحقل نفسه بدلالة تتبع الوسيلة. */
  reference: string | null;
  /** اسم المستلم (نقدًا) أو ملاحظة حرّة. */
  notes: string | null;
  /** ختم إدخال النظام — لا يُفلتَر به ولا يُجمَّع عليه؛ للعرض التشغيلي وحده. */
  createdAt: Date;
  invoiceId: number | null;
  invoiceNumber: string | null;
  invoiceIssueDate: Date | null;
  invoiceTotal: number | null;
  invoiceRemaining: number | null;
  invoiceStatus: string | null;
  customerId: number | null;
  customerName: string | null;
  contractId: number | null;
  contractCode: string | null;
}

export function mapReceiptRow(raw: RawReceipt): ReceiptRow {
  const invoice = raw.invoice;
  return {
    id: raw.id,
    date: raw.date,
    amount: roundMoney(raw.amount ?? 0),
    method: raw.method,
    reference: raw.reference,
    notes: raw.notes,
    createdAt: raw.createdAt,
    invoiceId: invoice?.id ?? null,
    invoiceNumber: invoice?.invoiceNumber ?? null,
    invoiceIssueDate: invoice?.issueDate ?? null,
    invoiceTotal: invoice ? roundMoney(invoice.total ?? 0) : null,
    invoiceRemaining: invoice ? roundMoney((invoice.total ?? 0) - (invoice.paidAmount ?? 0)) : null,
    invoiceStatus: invoice?.status ?? null,
    customerId: invoice?.customer?.id ?? invoice?.customerId ?? null,
    customerName: invoice?.customer?.name ?? null,
    contractId: invoice?.contract?.id ?? invoice?.contractId ?? null,
    contractCode: invoice?.contract?.code ?? null,
  };
}

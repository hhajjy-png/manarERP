import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { roundMoney } from '../utils/money';

/**
 * محرّك التقارير التشغيلية — **المصدر التشغيلي الوحيد** لأرقام الإدارة (لوحة التحكم،
 * مركز القرار التنفيذي، التقارير، ملخص المحاسبة، مركز الشؤون المالية).
 *
 * السياسة المعتمدة (Operational Reporting Migration — الحزمة 1):
 *   الإيراد          = Invoice   (مبيعات، غير ملغاة، بتاريخ الإصدار issueDate)
 *   المصروف          = Expense   (الحالة الرسمية الوحيدة: APPROVED — انظر EXPENSE_OPERATIONAL_STATUS)
 *   التحصيل          = Payment   (بتاريخ التحصيل date)
 *   الذمم المدينة    = Invoice − Payment (رصيد لحظي كما في تاريخ معيّن)
 *   الربح التشغيلي   = الإيراد − المصروف
 *
 * هذا المحرك **لا** يمسّ الأستاذ العام (GL) بأي شكل. يبقى GL حصريًا لقيود اليومية،
 * دليل الحسابات، ميزان المراجعة، والمراجعة المحاسبية — انظر {@link ../gl.reporting.ts}
 * الذي يبقى دون تغيير ويخدم تلك الشاشات فقط.
 *
 * أي خدمة تحتاج هذه الأرقام (Dashboard/Executive/Reports/Accounting Summary/Financial
 * Center) **يجب** أن تستدعي هذا المحرك بدل تكرار الاستعلام — هذا مصدر الحقيقة الوحيد
 * لمنع تكرار قواعد العمل وضمان تطابق الأرقام عبر كل الشاشات. هذه الحزمة تُنشئ المحرك
 * فقط؛ لا تُستدعى دواله بعد من أي خدمة قائمة (الترحيل يأتي في حزم لاحقة).
 *
 * ملاحظة على المدى الزمني: الدوال هنا تستقبل كائنات `Date` جاهزة، لا نصوصًا خامًا —
 * تمامًا كعقد `glProfitAndLoss`. تحويل معاملات الاستعلام (`fromDate`/`toDate` بصيغة
 * `YYYY-MM-DD`) إلى تواريخ محلية صحيحة يبقى مسؤولية `resolvePeriod` (periodFilter.ts)
 * عند الاستهلاك — لا تُكرَّر منطق التحليل الزمني هنا.
 */

type Client = Prisma.TransactionClient | typeof prisma;

/**
 * فواتير المبيعات الفعّالة تشغيليًا — غير الملغاة فقط.
 *
 * مُصدَّر ليكون **التعريف الوحيد** لـ«فاتورة مبيعات فعّالة» عبر كل مستهلكي التقارير
 * التشغيلية (لوحة التحكم، مركز القرار، مركز الشؤون المالية). أي استعلام مجمَّع
 * (groupBy) يحتاج نفس القاعدة — للإيراد أو لفلترة فواتير التحصيل — يستورد هذا الثابت
 * بدل تكرار `{ direction, status: { not: 'CANCELLED' } }` حرفيًا. الدوال القياسية أدناه
 * تبقى الواجهة المفضَّلة للقيم المفردة؛ هذا الثابت لِما لا تعبِّر عنه (التجميع حسب عقد/عميل).
 */
export const SALES_INVOICE_ACTIVE: Prisma.InvoiceWhereInput = {
  direction: 'SALES',
  status: { not: 'CANCELLED' },
};

/**
 * الحالة الرسمية الوحيدة لمصروف تشغيلي حقيقي.
 *
 * كانت ثلاث تعريفات متزامنة في المشروع: `APPROVED` فقط، أو `notIn [REJECTED, CANCELLED]`،
 * أو `notIn [REJECTED, CANCELLED, REVERSED]`. القرار الرسمي الآن: **`APPROVED` فقط**.
 *
 * السبب: `PENDING` لم يُعتمد بعد (قابل للرفض/التعديل قبل أن يصبح تكلفة فعلية مؤكَّدة)،
 * و`REJECTED`/`CANCELLED`/`REVERSED` لم تتحقق فعليًا أو أُلغيت. هذا يطابق تمامًا الشرط
 * الذي يُرحِّل المصروف إلى الأستاذ العام (`repostExpenseToGL` لا يُستدعى إلا عند الاعتماد) —
 * فالمصروف «الحقيقي» تشغيليًا هو نفسه المصروف الجاهز للترحيل محاسبيًا، ولو بقي الترحيلان
 * منفصلين تمامًا بعد هذه الحزمة.
 *
 * الرواتب تُحسب هنا تلقائيًا دون أي معالجة خاصة: تدخل شهريًا كمصروف بفئة `SALARIES`
 * (لا ترحيل GL لها بعد إزالته)، فتُحتسب ضمن «المصروفات» التشغيلية بمجرّد اعتمادها —
 * هذا ما تعنيه ملاحظة السياسة أن الرواتب تدخل عبر وحدة المصروفات.
 */
export const EXPENSE_OPERATIONAL_STATUS = 'APPROVED' as const;

export interface OperationalRange {
  from?: Date;
  to?: Date;
}

export interface RevenueFilter extends OperationalRange {
  customerId?: number;
  contractId?: number;
}

export interface ExpenseFilter extends OperationalRange {
  contractId?: number;
  supplierId?: number;
}

export type PaymentDirection = 'SALES' | 'PURCHASE';

export interface CollectionsFilter extends OperationalRange {
  customerId?: number;
  contractId?: number;
  /** اتجاه الفاتورة المرتبطة — افتراضيًا SALES (تحصيل من العملاء). */
  direction?: PaymentDirection;
}

export interface ReceivablesFilter {
  /** تاريخ الرصيد اللحظي — افتراضيًا الآن. */
  asOfDate?: Date;
  customerId?: number;
  contractId?: number;
}

export interface ProfitAndLossFilter extends OperationalRange {
  contractId?: number;
}

export interface OperationalProfitAndLoss {
  revenue: number;
  expenses: number;
  netProfit: number;
}

function dateFilter(range?: OperationalRange): Prisma.DateTimeFilter | undefined {
  if (!range || (!range.from && !range.to)) return undefined;
  const f: Prisma.DateTimeFilter = {};
  if (range.from) f.gte = range.from;
  if (range.to) f.lte = range.to;
  return f;
}

/**
 * الإيراد التشغيلي — Σ `Invoice.total` (مبيعات، غير ملغاة) بتاريخ الإصدار ضمن المدى.
 * يقبل تضييقًا اختياريًا بعميل أو عقد.
 */
export async function getRevenue(filter: RevenueFilter = {}, client: Client = prisma): Promise<number> {
  const issueDate = dateFilter(filter);
  const agg = await client.invoice.aggregate({
    where: {
      ...SALES_INVOICE_ACTIVE,
      ...(issueDate ? { issueDate } : {}),
      ...(filter.customerId != null ? { customerId: filter.customerId } : {}),
      ...(filter.contractId != null ? { contractId: filter.contractId } : {}),
    },
    _sum: { total: true },
  });
  return roundMoney(agg._sum.total ?? 0);
}

/**
 * المصروف التشغيلي — Σ `Expense.amount` (المعتمدة فقط) بتاريخ المصروف ضمن المدى.
 * يقبل تضييقًا اختياريًا بعقد أو مورّد.
 */
export async function getExpenses(filter: ExpenseFilter = {}, client: Client = prisma): Promise<number> {
  const date = dateFilter(filter);
  const agg = await client.expense.aggregate({
    where: {
      status: EXPENSE_OPERATIONAL_STATUS,
      ...(date ? { date } : {}),
      ...(filter.contractId != null ? { contractId: filter.contractId } : {}),
      ...(filter.supplierId != null ? { supplierId: filter.supplierId } : {}),
    },
    _sum: { amount: true },
  });
  return roundMoney(agg._sum.amount ?? 0);
}

/**
 * التحصيل التشغيلي — Σ `Payment.amount` بتاريخ التحصيل ضمن المدى، لفواتير باتجاه معيّن
 * (افتراضيًا SALES: تحصيل من العملاء؛ PURCHASE: مدفوعات للموردين).
 */
export async function getCollections(filter: CollectionsFilter = {}, client: Client = prisma): Promise<number> {
  const date = dateFilter(filter);
  const direction = filter.direction ?? 'SALES';
  const agg = await client.payment.aggregate({
    where: {
      ...(date ? { date } : {}),
      invoice: {
        direction,
        status: { not: 'CANCELLED' },
        ...(filter.customerId != null ? { customerId: filter.customerId } : {}),
        ...(filter.contractId != null ? { contractId: filter.contractId } : {}),
      },
    },
    _sum: { amount: true },
  });
  return roundMoney(agg._sum.amount ?? 0);
}

/**
 * رصيد الذمم المدينة كما في تاريخ (افتراضيًا الآن) — Σ `Invoice.total` ناقص
 * Σ `Payment.amount`، كلاهما حتى `asOfDate` شاملًا (مبيعات فقط).
 *
 * لا تُستخدم `Invoice.paidAmount` المخزَّنة عمدًا: الحساب من `Payment` مباشرة يطابق
 * نص السياسة حرفيًا (الذمم = Invoice + Payment) ويتفادى أي احتمال تعارض بين اللقطة
 * المخزَّنة ومجموع الدفعات الفعلي.
 */
export async function getAccountsReceivable(
  filter: ReceivablesFilter = {},
  client: Client = prisma,
): Promise<number> {
  const asOf = filter.asOfDate ?? new Date();
  const scope = {
    ...(filter.customerId != null ? { customerId: filter.customerId } : {}),
    ...(filter.contractId != null ? { contractId: filter.contractId } : {}),
  };
  const [invoiced, collected] = await Promise.all([
    client.invoice.aggregate({
      where: { ...SALES_INVOICE_ACTIVE, issueDate: { lte: asOf }, ...scope },
      _sum: { total: true },
    }),
    client.payment.aggregate({
      where: {
        date: { lte: asOf },
        invoice: { direction: 'SALES', status: { not: 'CANCELLED' }, ...scope },
      },
      _sum: { amount: true },
    }),
  ]);
  return roundMoney((invoiced._sum.total ?? 0) - (collected._sum.amount ?? 0));
}

/**
 * الربح التشغيلي لفترة (أو عقد) — الإيراد ناقص المصروف، من المصدرين التشغيليين أعلاه.
 */
export async function getOperationalProfitAndLoss(
  filter: ProfitAndLossFilter = {},
  client: Client = prisma,
): Promise<OperationalProfitAndLoss> {
  const [revenue, expenses] = await Promise.all([
    getRevenue({ from: filter.from, to: filter.to, contractId: filter.contractId }, client),
    getExpenses({ from: filter.from, to: filter.to, contractId: filter.contractId }, client),
  ]);
  return { revenue, expenses, netProfit: roundMoney(revenue - expenses) };
}

/**
 * الربح التشغيلي لكل شهر ضمن نوافذ مُعطاة (للاتجاه الشهري وتقرير الأرباح ولوحة التحكم
 * ومركز القرار التنفيذي).
 */
export async function getMonthlyOperationalProfitAndLoss(
  months: { label: string; start: Date; end: Date }[],
  filter: { contractId?: number } = {},
  client: Client = prisma,
): Promise<{ label: string; revenue: number; expense: number; net: number }[]> {
  return Promise.all(
    months.map(async (m) => {
      const pl = await getOperationalProfitAndLoss(
        { from: m.start, to: m.end, contractId: filter.contractId },
        client,
      );
      return { label: m.label, revenue: pl.revenue, expense: pl.expenses, net: pl.netProfit };
    }),
  );
}

export interface OperationalSummaryFilter {
  from?: Date;
  to?: Date;
  customerId?: number;
  contractId?: number;
  supplierId?: number;
  /** الذمم كما في تاريخ. افتراضيًا: `to` إن وُجدت (ذمم نهاية الفترة)، وإلا سلوك `getAccountsReceivable` الافتراضي (الآن). */
  asOfDate?: Date;
}

export interface OperationalSummary {
  revenue: number;
  expenses: number;
  collections: number;
  accountsReceivable: number;
  netProfit: number;
}

/**
 * نقطة التجميع عالية المستوى — الواجهة الأساسية لأي مستهلك مستقبلي يحتاج الأرقام
 * التشغيلية الخمسة معًا. **منسِّق بحت**: لا يكتب أي استعلام Prisma جديد ولا يعيد
 * حساب أي قاعدة عمل — كل رقم مصدره أحد الدوال الخمس أعلاه حرفيًا.
 *
 * ملاحظتان معماريتان مهمتان:
 *
 * 1) **نطاق صافي الربح لا يشمل `customerId`/`supplierId`.** `netProfit` يأتي من
 *    {@link getOperationalProfitAndLoss}، وتوقيعها (`ProfitAndLossFilter`) يقبل
 *    `contractId` فقط — لأن جدول `Expense` لا يحمل عمود عميل أصلًا، فـ«ربح عميل
 *    معيّن» ليس مفهومًا محدَّدًا في نموذج البيانات الحالي. لذلك عند تمرير `customerId`:
 *    `revenue`/`collections`/`accountsReceivable` تُطبَّق عليها التصفية الصحيحة،
 *    بينما `netProfit` يبقى للفترة/العقد كاملة (غير مخصَّص بعميل). هذا سلوك مقصود
 *    وأمين لبنية البيانات، لا خطأ.
 *
 * 2) **ازدواجية استعلام مقصودة ومُوثَّقة.** `getRevenue`/`getExpenses` يُستدعيان هنا
 *    مباشرة (لدعم `customerId`/`supplierId`)، ثم يُستدعيان مجددًا داخليًا عبر
 *    `getOperationalProfitAndLoss` (لضمان أن `netProfit` مصدره حرفيًا تلك الدالة، لا
 *    طرحًا محليًا مكرَّرًا). حين لا يُمرَّر `customerId`/`supplierId` هذا يعني استعلامَي
 *    قاعدة بيانات إضافيَّين لكل من الإيراد والمصروف. هذا تنسيق بسيط ومقصود لهذه
 *    الحزمة الخفيفة؛ حزمة لاحقة قد تُحسِّن الأداء إن استدعى الأمر (مثلًا بتوسعة
 *    `ProfitAndLossFilter` لدعم النطاق نفسه الذي يدعمه `getRevenue`/`getExpenses`).
 */
export async function getOperationalSummary(
  filter: OperationalSummaryFilter = {},
  client: Client = prisma,
): Promise<OperationalSummary> {
  const range: OperationalRange = { from: filter.from, to: filter.to };
  const receivablesAsOf = filter.asOfDate ?? filter.to;

  const [revenue, expenses, collections, accountsReceivable, profitAndLoss] = await Promise.all([
    getRevenue({ ...range, customerId: filter.customerId, contractId: filter.contractId }, client),
    getExpenses({ ...range, contractId: filter.contractId, supplierId: filter.supplierId }, client),
    getCollections({ ...range, customerId: filter.customerId, contractId: filter.contractId }, client),
    getAccountsReceivable(
      { asOfDate: receivablesAsOf, customerId: filter.customerId, contractId: filter.contractId },
      client,
    ),
    getOperationalProfitAndLoss({ ...range, contractId: filter.contractId }, client),
  ]);

  return {
    revenue,
    expenses,
    collections,
    accountsReceivable,
    netProfit: profitAndLoss.netProfit,
  };
}

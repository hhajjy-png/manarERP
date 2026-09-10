/* ════════════════════════════════════════════════════════════════════════════
   تقرير المقبوضات — Receipts Comprehensive Report v1.

   يسكن داخل مركز التقارير القائم فيرث منه العرض والطباعة وتصدير PDF وتصدير Excel
   بلا محرّك جديد: كل ما يفعله هذا الملف تحويل مجموعة المقبوضات إلى عقد
   `ReportInput` القياسي.

   ═══ لا تعريف مالي ثانٍ ═══
   الصفوف والإجماليات تأتيان من **نفس** `receiptsQueryService` الذي تقرأ منه صفحة
   `#/receipts` — `listAll()` و`summary()`، وكلتاهما تبني شرطها بـ
   `buildReceiptWhere` نفسها، التي تبني بدورها على `SALES_INVOICE_ACTIVE` المستورَد
   من المحرّك التشغيلي (`operational.reporting.ts`) وهو نفسه شرط `getCollections()`.

   النتيجة أن التطابق **بنيويّ لا اتفاقيّ**: لا يوجد في هذا الملف استعلام Prisma
   واحد، ولا شرط فلترة، ولا جمع مبالغ — فيستحيل أن ينحرف إجمالي التقرير عن إجمالي
   الصفحة لنفس الفلاتر. يحرس ذلك اختبار تكافؤ صريح.

   ═══ لا احتساب مزدوج ═══
   المصدر جدول `payments` وحده. الجداول التي تحمل انعكاس المبلغ نفسه —
   `journal_entries` (1:1 مع الدفعة)، و`invoices.paidAmount` (لقطة تُكتب في نفس
   المعاملة)، و`bank_statement_transactions`، والدفتر القديم `transactions` —
   لا يُقرأ أيٌّ منها هنا ولا في الخدمة المشتركة.
   ════════════════════════════════════════════════════════════════════════════ */

import type { ReportInput, ReportKpi } from '../../shared/services/reportEngine/excel.service';
import { formatCurrency } from '../../shared/utils/currency';
import { formatDisplayDate } from '../../shared/utils/dateDisplay';
import { roundMoney, sumMoney } from '../../shared/utils/money';
import type { ReceiptRow } from '../receipts/receipts.calc';
import { receiptsQueryService, type ReceiptsSummary } from '../receipts/receipts.service';
import { receiptListSchema } from '../receipts/receipts.schema';
import { loadChequeTotals, originalChequeAmountOf, type ChequeTotals } from './receiptsChequeAmounts';

/* ── مفردات العرض ────────────────────────────────────────────────────────── */

/**
 * التسميات العربية لوسائل القبض — مطابقة حرفيًا لما تعرضه صفحة المقبوضات
 * (`frontend/src/config/receiptPresentation.ts`). التقرير يُصدِّر **التسمية** لا
 * الرمز الداخلي، كبقيّة تقارير المركز.
 */
export const RECEIPT_METHOD_AR: Record<string, string> = {
  CASH: 'نقدي',
  BANK: 'تحويل بنكي',
  CHEQUE: 'شيك',
  TRANSFER: 'حوالة بنكية',
};

/** حالة سداد الفاتورة المقبوض ضدّها — **ليست** حالة شيك (لا وجود لها في النموذج). */
export const RECEIPT_INVOICE_STATUS_AR: Record<string, string> = {
  PAID: 'مسددة بالكامل',
  PARTIAL: 'عليها رصيد',
};

export function methodAr(method: string | null | undefined): string {
  return (method && RECEIPT_METHOD_AR[method]) || method || '—';
}

export function invoiceStatusAr(status: string | null | undefined): string {
  return (status && RECEIPT_INVOICE_STATUS_AR[status]) || status || '—';
}

/**
 * دلالة حقل المرجع تتبع الوسيلة: رقم الشيك · رقم العملية · اسم المستلم (نقدًا،
 * ويُخزَّن في `notes`). عمود واحد بدل ثلاثة تبقى فارغة لأغلب الصفوف — وهو ما يمنع
 * الصفّ النقدي من أن يبدو جدولًا مكسورًا في الطباعة.
 */
export function referenceOf(row: Pick<ReceiptRow, 'method' | 'reference' | 'notes'>): string {
  const value = row.method === 'CASH' ? row.notes : row.reference;
  return value?.trim() || '—';
}

/* ── ترويسة التقرير ──────────────────────────────────────────────────────── */

export interface ReceiptsReportContext {
  from?: string;
  to?: string;
  customerName?: string | null;
  method?: string;
  invoiceStatus?: string;
}

/**
 * السطر الوصفي تحت العنوان: النطاق الزمني ثم **الفلاتر النشطة وحدها**.
 * فلتر غير مُفعَّل لا يُذكر إطلاقًا — لا «كل العملاء» ولا «كل الوسائل».
 */
export function buildSubtitle(ctx: ReceiptsReportContext, summary: ReceiptsSummary): string {
  const parts: string[] = [];

  if (ctx.from && ctx.to) parts.push(`من ${formatDisplayDate(ctx.from)} إلى ${formatDisplayDate(ctx.to)}`);
  else if (ctx.from) parts.push(`من ${formatDisplayDate(ctx.from)}`);
  else if (ctx.to) parts.push(`حتى ${formatDisplayDate(ctx.to)}`);
  else parts.push('كل الفترات');

  if (ctx.customerName) parts.push(`العميل: ${ctx.customerName}`);
  if (ctx.method) parts.push(`وسيلة القبض: ${methodAr(ctx.method)}`);
  if (ctx.invoiceStatus) parts.push(`حالة سداد الفاتورة: ${invoiceStatusAr(ctx.invoiceStatus)}`);

  parts.push(`عدد العمليات: ${summary.totals.count}`);
  parts.push(`إجمالي المقبوضات: ${formatCurrency(summary.totals.total)}`);

  return parts.join(' · ');
}

/* ── المؤشرات ────────────────────────────────────────────────────────────── */

/** مجموع وسيلتين أو أكثر من تفصيل الملخّص. */
function methodTotal(summary: ReceiptsSummary, methods: readonly string[]): { total: number; count: number } {
  const rows = summary.byMethod.filter((r) => methods.includes(r.method));
  return {
    total: sumMoney(rows.map((r) => r.total)),
    count: rows.reduce((s, r) => s + r.count, 0),
  };
}

/**
 * بطاقات المؤشرات.
 *
 * «التحويلات البنكية» = `BANK + TRANSFER` — نفس تجميعة صفحة المقبوضات، لأن
 * الوسيلتين تحويل بنكي دلاليًا ويُدينان حساب البنك نفسه في الترحيل المحاسبي.
 * التفصيل الأصلي **لا يضيع**: عمود «وسيلة القبض» في الجدول يحمل قيمة كل صفّ كما هي.
 */
export function buildKpis(summary: ReceiptsSummary): ReportKpi[] {
  const cash = methodTotal(summary, ['CASH']);
  const cheque = methodTotal(summary, ['CHEQUE']);
  const bankish = methodTotal(summary, ['BANK', 'TRANSFER']);

  return [
    { label: 'إجمالي المقبوضات', value: summary.totals.total, format: 'currency', color: 'blue', icon: 'account_balance_wallet' },
    { label: 'عدد عمليات القبض', value: summary.totals.count, icon: 'tag' },
    { label: 'النقدي', value: cash.total, format: 'currency', hint: `${cash.count} عملية`, color: 'green', icon: 'payments' },
    { label: 'الشيكات', value: cheque.total, format: 'currency', hint: `${cheque.count} عملية`, color: 'default', icon: 'receipt_long' },
    { label: 'التحويلات البنكية', value: bankish.total, format: 'currency', hint: `${bankish.count} عملية`, color: 'blue', icon: 'account_balance' },
  ];
}

/* ── التقرير ─────────────────────────────────────────────────────────────── */

/** معطيات الاستعلام كما يمرّرها مركز التقارير (كلها نصوص من سلسلة الاستعلام). */
export interface ReceiptsReportQuery {
  from?: string;
  to?: string;
  customerId?: string;
  /** حالة سداد الفاتورة — مركز التقارير يسمّي الفلتر `status` لكل التقارير. */
  status?: string;
  /** وسيلة القبض. */
  method?: string;
  search?: string;
  minAmount?: string;
  maxAmount?: string;
  sortBy?: string;
  sortDir?: string;
}

/**
 * يترجم معطيات مركز التقارير إلى عقد استعلام المقبوضات، ثم **يتحقّق منه بنفس
 * مخطّط Zod** الذي تمرّ به الصفحة — فقيمة غير صالحة تُرفض هنا كما تُرفض هناك،
 * ولا يصل إلى الخدمة شكلٌ لم يمرّ بالعقد.
 *
 * `pageSize` غير مُمرَّر: `listAll` لا تُرقّم أصلًا.
 */
export function toReceiptQuery(q: ReceiptsReportQuery) {
  return receiptListSchema.parse({
    from: q.from || undefined,
    to: q.to || undefined,
    customerId: q.customerId || undefined,
    method: q.method || undefined,
    invoiceStatus: q.status || undefined,
    search: q.search || undefined,
    minAmount: q.minAmount || undefined,
    maxAmount: q.maxAmount || undefined,
    sortBy: q.sortBy || undefined,
    sortDir: q.sortDir || undefined,
  });
}

/**
 * صفوف الجدول المطبوع/المصدَّر — تسميات عربية، لا رموز داخلية.
 *
 * «قيمة الشيك الأصلية» تُكرَّر على كل سطر من أسطر الشيك نفسه، و«—» لغير الشيك.
 */
export function toReportRows(rows: ReceiptRow[], chequeTotals: ChequeTotals = new Map()): Record<string, unknown>[] {
  return rows.map((r, i) => ({
    seq: i + 1,
    date: formatDisplayDate(r.date),
    customer: r.customerName ?? '—',
    invoiceNumber: r.invoiceNumber ?? '—',
    method: methodAr(r.method),
    reference: referenceOf(r),
    invoiceStatus: invoiceStatusAr(r.invoiceStatus),
    amount: r.amount,
    originalChequeAmount: originalChequeAmountOf(r, chequeTotals) ?? '—',
  }));
}

export async function buildReceiptsReport(
  query: ReceiptsReportQuery,
  customerName?: string | null,
): Promise<ReportInput> {
  const parsed = toReceiptQuery(query);

  // مصدر واحد لكلا الرقمين: الصفوف والملخّص يبنيان شرطهما من نفس الفلاتر.
  const [rows, summary] = await Promise.all([
    receiptsQueryService.listAll(parsed),
    receiptsQueryService.summary(parsed),
  ]);

  /**
   * الإجمالي يُشتقّ من **صفوف التقرير نفسها** لا من تجميعة مستقلة.
   *
   * `summary.totals.total` يأتي من `_sum` في قاعدة البيانات، وهذا من جمع الصفوف
   * المعروضة. تطابقهما مضمون لأنهما على نفس الشرط، لكن اشتقاق صفّ المجاميع من
   * المعروض يجعل «ما تراه = ما يُجمع» صحيحًا حرفيًا حتى لو تغيّر شيء لاحقًا.
   */
  const displayedTotal = sumMoney(rows.map((r) => r.amount));

  // قيمة الشيك الأصلية من كامل تحصيلاته في قاعدة البيانات — لا من الصفوف المفلترة.
  const chequeTotals = await loadChequeTotals(rows);

  return {
    title: 'تقرير المقبوضات',
    subtitle: buildSubtitle(
      { from: query.from, to: query.to, customerName, method: query.method, invoiceStatus: query.status },
      summary,
    ),
    sheetName: 'المقبوضات',
    kpis: buildKpis(summary),
    columns: [
      { header: 'م', key: 'seq', width: 6, type: 'number', align: 'center' },
      { header: 'تاريخ القبض', key: 'date', width: 14, align: 'center' },
      { header: 'العميل', key: 'customer', width: 34 },
      { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 20 },
      { header: 'وسيلة القبض', key: 'method', width: 16, align: 'center' },
      { header: 'المرجع', key: 'reference', width: 24 },
      { header: 'حالة سداد الفاتورة', key: 'invoiceStatus', width: 18, align: 'center' },
      { header: 'المبلغ', key: 'amount', width: 18, format: 'currency', type: 'currency' },
      { header: 'قيمة الشيك الأصلية', key: 'originalChequeAmount', width: 18, format: 'currency', type: 'currency' },
    ],
    rows: toReportRows(rows, chequeTotals),
    // لا مجموع لـ«قيمة الشيك الأصلية»: تتكرّر على أسطر الشيك الواحد، فجمعها احتساب مزدوج.
    totalsRow: { date: 'الإجمالي', amount: roundMoney(displayedTotal) },
    metaFooter: [
      'يُحتسب المبلغ مقبوضًا بتاريخ القبض المسجَّل على الدفعة (Payment.date).',
      'لا يتتبّع النظام دورة حياة الشيك الوارد (مستلم / مودع / محصَّل / مرتجع)، فكل قبض مسجَّل هو قبض مؤكَّد بتاريخه.',
      '«حالة سداد الفاتورة» هي حالة الفاتورة المقبوض ضدّها، لا حالة الشيك.',
    ],
  };
}

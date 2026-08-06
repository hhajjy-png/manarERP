/* ════════════════════════════════════════════════════════════════════════════
   Collection Analysis Engine — طبقة البيانات.

   المسؤولية الوحيدة: تحميل **مجموعة بيانات واحدة** لكل طلب. لا حساب ولا تنسيق
   هنا — كل الاشتقاق في `collectionAnalysis.engine.ts` النقيّ.

   ═══ أربعة استعلامات، لا أكثر — ولا استعلام لكل جدول ولا لكل صفّ ═══
     1) الفواتير            (مفهرَس على issueDate/customerId/contractId)
     2) الدفعات             (مرشَّحة بعلاقتها بنفس الفواتير — لا `IN (…)` بآلاف المعرّفات)
     3) بنود الفواتير       (نفس الأسلوب — لاشتقاق حصص المشاريع)
     4) اتفاقيات الأسعار    (جدول صغير — أسماء المشاريع)

   ═══ ما هي «فاتورة» و«تحصيل»؟ ═══
   لا يُعاد تعريفهما هنا: `SALES_INVOICE_ACTIVE` و`Payment.date` يأتيان من
   `shared/services/operational.reporting` — المصدر التشغيلي الوحيد المعتمد في
   المشروع. لذلك تطابق أرقام هذه الصفحة لوحة التحكم ومركز التحليل المالي
   بالتعريف، بلا نسخ منطق ولا تعديل عليهما.
   ════════════════════════════════════════════════════════════════════════════ */

import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { localDateRange } from '../../core/utils/dateWindows';
import { roundMoney } from '../../shared/utils/money';
import { SALES_INVOICE_ACTIVE } from '../../shared/services/operational.reporting';
import { UNASSIGNED_LABEL } from './collectionAnalysis.engine';
import type {
  CollectionDataset,
  CollectionFilters,
  DatasetInvoice,
  DatasetPayment,
  ProjectShare,
} from './collectionAnalysis.types';

/** معرّف «مشروع غير محدّد» — بند بلا اتفاقية سعر. صفر لا `null` كي يبقى المفتاح رقميًا. */
export const UNASSIGNED_PROJECT_ID = 0;

/**
 * شرط الفواتير المحمَّلة.
 *
 * يطبّق **فقط** ما هو مفهرَس ورخيص في SQL (المدى الزمني، العميل، العقد). بقيّة
 * الفلاتر تحليلية وتُطبَّق في المحرّك النقيّ مرّة واحدة — لا ازدواج ولا احتمال
 * أن تفسّر الطبقتان نفس الفلتر على نحوين.
 */
export function buildInvoiceWhere(filters: CollectionFilters): Prisma.InvoiceWhereInput {
  const range = localDateRange(filters.invoiceFrom, filters.invoiceTo);
  return {
    ...SALES_INVOICE_ACTIVE,
    ...(range ? { issueDate: range } : {}),
    ...(filters.customerId != null ? { customerId: filters.customerId } : {}),
    ...(filters.contractId != null ? { contractId: filters.contractId } : {}),
  };
}

/** اسم المشروع المعروض: «المصنع — موقع العقد»، وهو ما يميّز اتفاقية عن أخرى. */
export function projectDisplayName(price: {
  asphaltPlant: string;
  contractLocation: string;
}): string {
  const location = price.contractLocation.trim();
  const plant = price.asphaltPlant.trim();
  if (plant && location) return `${plant} — ${location}`;
  return plant || location || UNASSIGNED_LABEL;
}

export async function loadCollectionDataset(filters: CollectionFilters): Promise<CollectionDataset> {
  const where = buildInvoiceWhere(filters);

  const [invoiceRows, paymentRows, itemRows, priceRows] = await Promise.all([
    prisma.invoice.findMany({
      where,
      select: {
        id: true,
        invoiceNumber: true,
        issueDate: true,
        dueDate: true,
        total: true,
        customerId: true,
        customer: { select: { name: true } },
        contractId: true,
        contract: { select: { code: true } },
      },
      orderBy: { issueDate: 'asc' },
    }),
    prisma.payment.findMany({
      where: { invoice: where },
      select: { id: true, invoiceId: true, date: true, amount: true, method: true, reference: true },
      orderBy: { date: 'asc' },
    }),
    prisma.invoiceItem.findMany({
      where: { invoice: where },
      select: { invoiceId: true, total: true, priceId: true },
    }),
    prisma.projectPrice.findMany({
      select: { id: true, asphaltPlant: true, contractLocation: true },
    }),
  ]);

  const priceNames = new Map(priceRows.map((p) => [p.id, projectDisplayName(p)]));

  /* ── الدفعات مفهرَسة على الفاتورة ── */
  const paymentsByInvoice = new Map<number, DatasetPayment[]>();
  let latestActivity: Date | null = null;
  for (const p of paymentRows) {
    const list = paymentsByInvoice.get(p.invoiceId);
    const entry: DatasetPayment = {
      id: p.id,
      invoiceId: p.invoiceId,
      date: p.date,
      amount: roundMoney(p.amount ?? 0),
      method: p.method,
      reference: p.reference,
    };
    if (list) list.push(entry);
    else paymentsByInvoice.set(p.invoiceId, [entry]);
    if (latestActivity == null || p.date > latestActivity) latestActivity = p.date;
  }

  /* ── حصص المشاريع: قيمة البنود لكل (فاتورة، اتفاقية سعر) ── */
  const itemTotalsByInvoice = new Map<number, Map<number, number>>();
  for (const item of itemRows) {
    const projectId = item.priceId ?? UNASSIGNED_PROJECT_ID;
    let byProject = itemTotalsByInvoice.get(item.invoiceId);
    if (!byProject) {
      byProject = new Map();
      itemTotalsByInvoice.set(item.invoiceId, byProject);
    }
    // القيم السالبة (بند خصم) تُطرح من حصّة مشروعها كما هي؛ التطبيع أدناه يتولّى
    // الحالة الشاذّة التي يصبح فيها المجموع غير موجب.
    byProject.set(projectId, (byProject.get(projectId) ?? 0) + (item.total ?? 0));
  }

  const invoices: DatasetInvoice[] = invoiceRows.map((invoice) => {
    if (latestActivity == null || invoice.issueDate > latestActivity) latestActivity = invoice.issueDate;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      total: roundMoney(invoice.total ?? 0),
      customerId: invoice.customerId ?? null,
      customerName: invoice.customer?.name ?? null,
      contractId: invoice.contractId ?? null,
      contractCode: invoice.contract?.code ?? null,
      projectShares: buildProjectShares(itemTotalsByInvoice.get(invoice.id), priceNames),
      payments: paymentsByInvoice.get(invoice.id) ?? [],
    };
  });

  return { invoices, latestActivity };
}

/**
 * حصص المشاريع لفاتورة واحدة — مجموع النسب = 1 بالضبط.
 *
 * فاتورة بلا بنود، أو بنود مجموع قيمها غير موجب (خصومات تفوق البنود)، تذهب
 * كاملةً إلى «غير محدّد»: توزيع نسبة على مقام غير موجب لا معنى له، وإخفاء
 * الفاتورة أسوأ من إسنادها إلى مجموعة معلَنة.
 */
export function buildProjectShares(
  itemTotals: Map<number, number> | undefined,
  priceNames: Map<number, string>,
): ProjectShare[] {
  const unassigned: ProjectShare[] = [
    { projectId: UNASSIGNED_PROJECT_ID, projectName: UNASSIGNED_LABEL, ratio: 1 },
  ];
  if (!itemTotals || itemTotals.size === 0) return unassigned;

  const entries = Array.from(itemTotals.entries()).filter(([, total]) => total > 0);
  const sum = entries.reduce((s, [, total]) => s + total, 0);
  if (!(sum > 0)) return unassigned;

  const shares = entries.map(([projectId, total]) => ({
    projectId,
    projectName:
      projectId === UNASSIGNED_PROJECT_ID ? UNASSIGNED_LABEL : priceNames.get(projectId) ?? UNASSIGNED_LABEL,
    ratio: total / sum,
  }));

  // تصحيح الباقي على أكبر حصّة: الجمع العشري قد يترك 1e-16، وهو ما يُسرّب فلسًا
  // في فواتير كبيرة. الحصّة الأكبر تبتلع الفارق فيبقى المجموع 1 بالضبط.
  const drift = 1 - shares.reduce((s, share) => s + share.ratio, 0);
  if (drift !== 0) {
    let largest = 0;
    for (let i = 1; i < shares.length; i += 1) if (shares[i].ratio > shares[largest].ratio) largest = i;
    shares[largest].ratio += drift;
  }
  return shares;
}

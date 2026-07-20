// ─────────────────────────────────────────────────────────────────────────
//  منطق «إدخال فواتير سريع» (Invoice Fast Entry) — دوال صافية قابلة للاختبار.
//
//  ⚠️ ليس نظام دفعات ولا استيراد: كل صف يُحفظ كفاتورة فردية عادية عبر POST /invoices
//     (نفس مسار الإنشاء). لا سجل أب، لا حالة دفعة، لا تجميع خفي، لا كيان جلسة.
//
//  PD-1 (تعادل صارم): buildInvoiceCreatePayload يُنتج نفس مجموعة الحقول التي
//  يرسلها نموذج «فاتورة جديدة» الحالي بالضبط — بلا notes/taxRate/paymentMethod/
//  dueDate/contractId. v1 مبيعات فقط (SALES).
// ─────────────────────────────────────────────────────────────────────────

import { toInvoiceItemPayload } from '../utils/invoicePayload';
import { DEFAULT_WORK_TYPE } from '../utils/invoiceDescription';
import { todayDateOnly } from '../lib/date';

export type InvoiceEntryMode = 'SINGLE' | 'MULTI';

/** يطابق بنيويًا نوع Item في محرّر البنود (أرقام)، مع إبقاء هذه الوحدة صافية. */
export interface InvoiceFastItem {
  uid: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  workType?: string;
  location?: string;
  priceTouched?: boolean;
}

/** الحقول المشتركة الثابتة للجلسة. customerId/contractId تُستخدم في وضع «عميل واحد» فقط. */
export interface InvoiceSharedFields {
  entryMode: InvoiceEntryMode;
  direction: string; // 'SALES' في v1
  invoiceType: string;
  issueDate: string; // YYYY-MM-DD
  billingMonth: number;
  billingYear: number;
  numberYear: number; // MN-INV-<numberYear>
  customerId: string;
  contractId: string;
}

/** الحقول الخاصة بالفاتورة الواحدة. customerId/contractId تُستخدم في وضع «عملاء متعددون» فقط. */
export interface InvoiceRowFields {
  invoiceNumber: string; // MN-INV-YYYY-suffix — مقترح تلقائيًا وقابل للتعديل
  items: InvoiceFastItem[];
  discount: number | string;
  deliveryDate: string;
  customerId: string;
  contractId: string;
}

/** ملخص الجلسة (للعرض فقط — لا يُخزَّن ككيان). */
export interface InvoiceSessionSummary {
  count: number;
  total: number;
  lastNumber: string | null;
  lastCustomer: string | null;
  lastAmount: number | null;
  nextNumber: string | null;
}

export const EMPTY_INVOICE_SUMMARY: InvoiceSessionSummary = {
  count: 0, total: 0, lastNumber: null, lastCustomer: null, lastAmount: null, nextNumber: null,
};

const INVOICE_NUMBER_RE = /^MN-INV-\d{4}-[A-Za-z0-9]+$/;

/** بند فارغ جديد — مطابق للبند الابتدائي في النموذج العادي (نوع العمل الافتراضي، الوحدة «درب»). */
export function makeEmptyItem(): InvoiceFastItem {
  return { uid: crypto.randomUUID(), description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' };
}

/** صف فاتورة فارغ يحمل الرقم المقترح وبندًا واحدًا فارغًا. */
export function makeEmptyRow(nextNumber: string): InvoiceRowFields {
  return { invoiceNumber: nextNumber, items: [makeEmptyItem()], discount: 0, deliveryDate: '', customerId: '', contractId: '' };
}

/** يحدّد العميل الفعّال حسب الوضع (v1: SALES → customerId فقط). */
export function resolveInvoiceParty(shared: InvoiceSharedFields, row: InvoiceRowFields): { customerId?: number; supplierId?: number } {
  const raw = shared.entryMode === 'MULTI' ? row.customerId : shared.customerId;
  return { customerId: raw ? Number(raw) : undefined, supplierId: undefined };
}

/**
 * يبني حمولة الإنشاء — مطابقة تمامًا لحمولة نموذج «فاتورة جديدة» الحالي (PD-1).
 * لا يرسل taxRate/paymentMethod/dueDate/contractId/notes.
 */
export function buildInvoiceCreatePayload(shared: InvoiceSharedFields, row: InvoiceRowFields): Record<string, unknown> {
  const party = resolveInvoiceParty(shared, row);
  return {
    invoiceNumber: row.invoiceNumber.trim(),
    direction: shared.direction,
    invoiceType: shared.invoiceType,
    customerId: party.customerId,
    supplierId: party.supplierId,
    issueDate: shared.issueDate || undefined,
    deliveryDate: row.deliveryDate || null,
    billingMonth: shared.billingMonth,
    billingYear: shared.billingYear,
    discount: Number(row.discount),
    items: row.items.map((it) =>
      toInvoiceItemPayload({ description: it.description, quantity: Number(it.quantity), unit: it.unit, unitPrice: Number(it.unitPrice) }),
    ),
  };
}

/** يتحقق من الصف بنفس قواعد الإنشاء العادي. يعيد رسالة الخطأ أو null. */
export function validateInvoiceRow(shared: InvoiceSharedFields, row: InvoiceRowFields): string | null {
  if (!INVOICE_NUMBER_RE.test(row.invoiceNumber.trim())) return 'رقم الفاتورة غير صالح — الصيغة MN-INV-YYYY-...';
  if (!resolveInvoiceParty(shared, row).customerId) return 'يجب اختيار العميل';
  // فاتورة مستقبلية التاريخ ممنوعة — الخادم يتحقق أيضًا؛ هذا فحص واجهة مبكر فقط.
  if (shared.issueDate && shared.issueDate > todayDateOnly()) return 'تاريخ الفاتورة لا يمكن أن يكون في المستقبل';
  if (!row.items.length) return 'يجب إضافة بند واحد على الأقل';
  for (const it of row.items) {
    if (!String(it.description).trim()) return 'وصف البند مطلوب';
    if (!String(it.unit).trim()) return 'الوحدة مطلوبة';
    if (!(Number(it.quantity) > 0)) return 'الكمية يجب أن تكون موجبة';
    if (Number(it.unitPrice) < 0) return 'السعر يجب ألا يكون سالبًا';
  }
  return null;
}

/** رقم احتياطي على العميل: يزيد اللاحقة الرقمية الأخيرة بمقدار 1 (مسار احتياطي فقط). */
export function clientNextInvoiceNumber(current: string): string {
  const m = current.match(/^(.*-)(\d+)$/);
  if (!m) return current;
  const width = Math.max(5, m[2].length);
  return `${m[1]}${String(parseInt(m[2], 10) + 1).padStart(width, '0')}`;
}

/** يُحدّث ملخص الجلسة بعد حفظ ناجح. لا يُخزَّن — للعرض فقط. */
export function addToInvoiceSummary(
  prev: InvoiceSessionSummary,
  amount: number,
  savedNumber: string | null,
  customerName: string | null,
  nextNumber: string | null,
): InvoiceSessionSummary {
  const amt = isFinite(amount) ? amount : 0;
  return {
    count: prev.count + 1,
    total: prev.total + amt,
    lastNumber: savedNumber ?? prev.lastNumber,
    lastCustomer: customerName ?? prev.lastCustomer,
    lastAmount: isFinite(amount) ? amount : prev.lastAmount,
    nextNumber: nextNumber ?? prev.nextNumber,
  };
}

/**
 * هل يوجد إدخال غير محفوظ ذو معنى في الصف الحالي؟ (لتأكيد الإغلاق).
 * الصف الافتراضي (بند واحد بنوع العمل الافتراضي دون موقع/سعر) يُعدّ «نظيفًا».
 */
export function isInvoiceRowDirty(row: InvoiceRowFields): boolean {
  const dirtyItems =
    row.items.length > 1 ||
    row.items.some((it) => Number(it.unitPrice) > 0 || String(it.location ?? '').trim() !== '');
  return !!(dirtyItems || Number(row.discount) > 0 || row.deliveryDate || row.customerId);
}

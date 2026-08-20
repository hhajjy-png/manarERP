// Pure financial calculation functions for invoices — no Prisma, no side-effects.
import { roundMoney } from '../../shared/utils/money';

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  priceId?: number | null;
};

/** مُعاد تصديرها من وحدة النقود القانونية (`shared/utils/money`) — سياسة واحدة، لا تعريف ثانٍ. */
export const round3 = roundMoney;

/** Compute subtotal, tax amount, and total from line items, tax rate, and discount. */
export function computeTotals(items: InvoiceItemInput[], taxRate: number, discount: number) {
  const lines = items.map((it) => ({ ...it, total: round3(it.quantity * it.unitPrice) }));
  const subtotal = round3(lines.reduce((s, l) => s + l.total, 0));
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = round3((taxable * taxRate) / 100);
  const total = round3(taxable + taxAmount);
  return { lines, subtotal, taxAmount, total };
}

/** Derive payment status from invoice total and amount already paid. */
export function nextStatus(total: number, paid: number): string {
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

/**
 * A PURCHASE invoice whose paymentMethod is CASH or BANK is settled at creation time:
 * its GL entry credits Cash/Bank directly (Dr Purchases / Cr Cash·Bank), so there is no
 * outstanding payable. Such an invoice must therefore be recorded as fully PAID
 * (paidAmount = total). Leaving it UNPAID invites a second settling payment that would
 * debit AP and credit Cash again — double-crediting Cash and driving AP negative (bug C1).
 *
 * ACCOUNTS_PAYABLE (or an unset method) posts to AP and stays UNPAID until a payment
 * settles it — the normal deferred-purchase flow, which is unaffected.
 */
export function isImmediatelySettledPurchase(direction: string, paymentMethod?: string | null): boolean {
  return direction === 'PURCHASE' && (paymentMethod === 'CASH' || paymentMethod === 'BANK');
}

/**
 * طريقة الدفع **الفعّالة** التي يُشتقّ منها حساب الدائن في قيد فاتورة المشتريات.
 *
 * `null`/`undefined` مرادفة تمامًا لـ`ACCOUNTS_PAYABLE`: هذا هو الافتراضي الذي يطبّقه
 * بانِي القيد نفسه (`invoices.accounting.ts` → `buildInvoiceGLPosting`، حيث
 * `paymentMethod ?? 'ACCOUNTS_PAYABLE'`). توحيد التطبيع هنا يجعل سؤال «هل تتغيّر
 * المعالجة المحاسبية؟» يُقاس على **الحساب الناتج** لا على النص الخام — فلا يُرفض تعديل
 * مكافئ (`null` → `ACCOUNTS_PAYABLE`) ولا يمرّ تعديل مؤثّر.
 */
export function effectivePurchaseGlMethod(paymentMethod?: string | null): string {
  return paymentMethod ?? 'ACCOUNTS_PAYABLE';
}

/**
 * هل يُغيّر التعديل المعالجة المحاسبية لفاتورة مشتريات؟ (خطأ C1 — مسار التعديل)
 *
 * `paymentMethod` يقود مُخرجَين: حساب الدائن في القيد (يُعاد اشتقاقه عند **كل** إعادة
 * ترحيل)، وحالة السداد `paidAmount`/`status` (تُشتقّ **مرة واحدة عند الإنشاء** عبر
 * `isImmediatelySettledPurchase` ولا يُعاد اشتقاقها في التعديل). تغييره بعد الترحيل
 * يفصل المُخرجَين: الأستاذ يقول «سُدِّد نقدًا» بينما الفاتورة تبقى غير مسدَّدة — فتُقبل
 * دفعة تسوية ثانية تُدائن النقد مرتين وتترك الذمم الدائنة برصيد مدين (التزام سالب).
 *
 * فروع `SALES` لا تقرأ `paymentMethod` إطلاقًا، فلا يُقيَّد التعديل خارج المشتريات.
 */
export function purchaseGlTreatmentWouldChange(
  finalDirection: string,
  currentPaymentMethod?: string | null,
  nextPaymentMethod?: string | null,
): boolean {
  if (finalDirection !== 'PURCHASE') return false;
  return effectivePurchaseGlMethod(currentPaymentMethod) !== effectivePurchaseGlMethod(nextPaymentMethod);
}

/**
 * Returns true if a new payment would exceed the invoice total beyond the 0.001 KWD tolerance.
 * The +0.001 tolerance absorbs floating-point drift at 3dp precision.
 */
export function overpaymentExceeds(total: number, newPaid: number): boolean {
  return newPaid > total + 0.001;
}

/**
 * Resolves the effective collection date of a payment for read-side use (display,
 * ad-hoc grouping over an in-memory payment list).
 *
 * `date` is the official, user-editable collection date (تاريخ التحصيل); it carries a
 * DB default of now() and is non-null on every current row, so the `date` branch wins
 * in practice. `createdAt` is a pure system-entry audit stamp kept only as a defensive
 * fallback for a legacy or externally-inserted row whose `date` is somehow null.
 *
 * Collection reports and GL posting key on the `date` column directly (via Prisma
 * where-clauses) rather than through this helper — they do not need the fallback
 * because `date` is non-null. This helper exists to express and test that fallback
 * contract for any future read-side consumer.
 */
export function effectiveCollectionDate(payment: {
  date?: Date | null;
  createdAt?: Date | null;
}): Date | null {
  return payment.date ?? payment.createdAt ?? null;
}

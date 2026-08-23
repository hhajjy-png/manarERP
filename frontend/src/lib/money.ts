// Canonical monetary rounding for the frontend — mirrors backend's
// `shared/utils/money.ts` (`roundMoney`). Half-away-from-zero, 3 decimals, with an
// EPSILON correction so `1.0005` rounds up to `1.001` instead of falling short due to
// binary floating-point representation (`1.0005 * 1000 === 1000.4999999999999`).
//
// The frontend and backend are separate TypeScript projects with no shared package
// boundary, so this is a deliberate, minimal mirror — not a duplicate invented
// independently.
//
// Financial Precision & KPI Hardening Pack v4 — لماذا اتّسع هذا الملف:
// تدقيق 2026-08-22 وجد أن الواجهة، رغم وجود هذه الوحدة، كانت تحمل **خمس عائلات
// تقريب** متوازية لنفس الغرض في مسارات مالية حقيقية:
//
//   1. `Math.round((n + Number.EPSILON) * 1000) / 1000`  — ثلاث نسخ محلية متطابقة
//   2. `Math.round(n * 1000) / 1000`                     — بلا تصحيح EPSILON
//   3. `Number(n.toFixed(3))` / `parseFloat(n.toFixed(3))` — قاعدة تقريب مختلفة كليًا
//
// الفروق تظهر عند نصف الفلس وعند القيم السالبة، فيختلف رقمٌ تعرضه الشاشة عن الرقم
// الذي كتبته الخلفية للسجل نفسه. أُضيفت `sumMoney` و`moneyEquals` وأخواتها هنا
// ليكون لكل تلك المواضع مقصدٌ واحد بدل تعريف سادس.
//
// تُستعمل للمبالغ وحدها: الساعات والكميات والنسب لها قواعدها الخاصة ولا تمرّ من هنا.

/** خانات الدينار الكويتي. */
export const MONEY_DECIMALS = 3;

/** أصغر وحدة قابلة للتمثيل: فلس واحد. */
export const MONEY_SMALLEST_UNIT = 0.001;

const SCALE = 10 ** MONEY_DECIMALS;

/**
 * تسامح تنفيذي لضجيج الحساب الثنائي — لا تسامح محاسبي.
 * أصغر من الفلس بألف مرة: يبتلع `0.1 + 0.2 = 0.30000000000000004` ولا يبتلع فارقًا حقيقيًا.
 */
export const MONEY_EPSILON = 1e-6;

/** Rounds a KWD amount to 3 decimals, half away from zero. `-0` normalizes to `0`. */
export function roundMoney(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const rounded = (sign * Math.round((Math.abs(value) + Number.EPSILON) * SCALE)) / SCALE;
  return rounded === 0 ? 0 : rounded;
}

/** مرادف `roundMoney` حين تكون النيّة تطبيع قيمة قادمة من حساب لا تقريبها قبل التخزين. */
export const normalizeMoney = roundMoney;

/**
 * تقريب آمن لمسارات العرض: المدخل الغائب أو غير الرقمي يعود صفرًا بدل نشر `NaN`
 * في الواجهة. الخلفية ترمي استثناءً في هذه الحالة لأن مسارها مسار كتابة لا عرض.
 */
export function roundMoneySafe(value: number | null | undefined): number {
  if (value == null || typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return roundMoney(value);
}

/** الفارق النقدي بين مبلغين — يُقرَّب الطرفان أولًا فتُقارَن القيم المعروضة فعلًا. */
export function moneyDifference(a: number, b: number): number {
  return roundMoney(roundMoney(a) - roundMoney(b));
}

/** تساوي مبلغين بدقّة الدينار: ضجيج ثنائي = تساوٍ، فارق فلس = اختلاف. */
export function moneyEquals(a: number, b: number): boolean {
  return Math.abs(moneyDifference(a, b)) < MONEY_EPSILON;
}

/** مجموع مبالغ، مقرَّبًا **مرة واحدة في النهاية** — لا تقريبًا تراكميًا عند كل خطوة. */
export function sumMoney(values: readonly (number | null | undefined)[]): number {
  return roundMoney(
    values.reduce<number>((total, v) => total + (typeof v === 'number' && Number.isFinite(v) ? v : 0), 0),
  );
}

/**
 * إجماليات الفاتورة — مرآة حرفية لـ`backend/src/modules/invoices/invoices.calc.ts`
 * (`computeTotals`)، بنفس ترتيب التقريب: تقريب كل بند، ثم المجموع الفرعي، ثم الضريبة،
 * ثم الإجمالي.
 *
 * كانت شاشات الفاتورة تحسب `Σ(الكمية × السعر) − الخصم` مباشرة: **بلا تقريب لكل بند**
 * و**بلا حدّ الضريبة**. فثلاثة بنود بـ`3 × 0.3335` تعرض 3.002 بينما يخزّن الخادم 3.003،
 * وأي فاتورة ضريبتها > 0 (تُنشأ عبر الاستيراد أو الـAPI) تعرض إجماليًا يخالف المخزَّن
 * وكل التقارير. المعادلة الآن مصدر واحد على الجانبين.
 */
export function computeInvoiceTotals(
  items: Array<{ quantity: number | string; unitPrice: number | string }>,
  taxRate: number,
  discount: number,
) {
  const subtotal = roundMoney(
    items.reduce((s, it) => s + roundMoney(Number(it.quantity) * Number(it.unitPrice)), 0),
  );
  const taxable = Math.max(0, subtotal - Number(discount || 0));
  const taxAmount = roundMoney((taxable * Number(taxRate || 0)) / 100);
  const total = roundMoney(taxable + taxAmount);
  return { subtotal, taxAmount, total };
}

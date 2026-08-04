/* ════════════════════════════════════════════════════════════════════════════
   Bank Transaction Direction — single source of truth for the «النوع» column
   --------------------------------------------------------------------------
   القاعدة الوحيدة: نوع الحركة المعروض في مستعرض الحسابات البنكية يُشتق من الأثر
   المالي الحقيقي على الحساب فقط:

       صافي الحركة = دائن − مدين
         • موجب  ⇒ إيداع   (يزيد رصيد الحساب)
         • سالب  ⇒ سحب     (ينقص رصيد الحساب)
         • صفر   ⇒ بدون حركة

   تصنيف المستند (شيك، حوالة، سند قبض/صرف، قيد، رسوم…) لا يحدد الاتجاه إطلاقًا،
   ويعيش بالكامل في وحدة مستقلة: `bankTransactionCategory.ts`. هذه الوحدة
   مسؤولة عن الاتجاه وحده ولا تستورد وحدة التصنيف ولا تقرأ أي إشارة مستند.

   ملاحظة: الاعتماد على «صافي الحركة» بدل فرق الرصيد بين سطرين مقصود — الرصيد
   المعروض قد يكون مفقودًا (null) أو غير متسلسل بعد الفلترة/الترقيم، بينما
   دائن/مدين حقلان بنيويان يصلان من الخادم لكل حركة.

   PURE PRESENTATION. لا منطق محاسبي، ولا ترحيل، ولا كتابة لقاعدة البيانات.
   ════════════════════════════════════════════════════════════════════════════ */
import { safeNum } from './bankTimelineFilters';

/** الاتجاه المالي الحقيقي للحركة على الحساب البنكي. */
export type TxDirection = 'deposit' | 'withdrawal' | 'neutral';

type TranslateFn = (key: string) => string;

function tr(key: string, fallback: string, translate?: TranslateFn): string {
  return translate ? translate(key) : fallback;
}

/** الحد الأدنى المطلوب لاشتقاق الاتجاه — يجعل الدالة قابلة للاختبار مباشرةً. */
export interface DirectionalMovement {
  debit:  number | null | undefined;
  credit: number | null | undefined;
}

/**
 * الاتجاه المالي الحقيقي: (دائن − مدين).
 * موجب ⇒ إيداع، سالب ⇒ سحب، صفر ⇒ بدون حركة.
 * يتعامل بأمان مع القيم السالبة (حركات عكسية/تصحيحية): إشارة الصافي هي الحكم.
 */
export function txDirection(t: DirectionalMovement): TxDirection {
  const net = safeNum(t.credit) - safeNum(t.debit);
  if (net > 0) return 'deposit';
  if (net < 0) return 'withdrawal';
  return 'neutral';
}

/** صافي الأثر المالي بالإشارة — يُستخدم للعرض ولاختبار الاتساق. */
export function txSignedImpact(t: DirectionalMovement): number {
  return safeNum(t.credit) - safeNum(t.debit);
}

const DIRECTION_LABELS: Record<TxDirection, { key: string; label: string }> = {
  deposit:    { key: 'bank.explorer.badge_deposit',    label: 'إيداع' },
  withdrawal: { key: 'bank.explorer.badge_withdrawal', label: 'سحب' },
  neutral:    { key: 'bank.explorer.badge_neutral',    label: 'بدون حركة' },
};

/** أيقونة الاتجاه (السهم) — الافتراضي حين لا يقدّم التصنيف رمزًا خاصًّا. */
const DIRECTION_ICONS: Record<TxDirection, string> = {
  deposit:    'south_west',
  withdrawal: 'north_east',
  neutral:    'remove',
};

/** رمز سهم الاتجاه — يُمرَّر كـ fallback لأيقونة التصنيف عند الحاجة. */
export function txDirectionIcon(direction: TxDirection): string {
  return DIRECTION_ICONS[direction];
}

/** تسمية الاتجاه المعروضة في عمود «النوع» وفي التصدير. */
export function txDirectionLabel(direction: TxDirection, translate?: TranslateFn): string {
  const entry = DIRECTION_LABELS[direction];
  return tr(entry.key, entry.label, translate);
}

export interface TxDirectionView {
  /** الاتجاه المالي الحقيقي — مصدر نص عمود «النوع» ولونه وإشارة المبلغ. */
  direction: TxDirection;
  /** نص عمود «النوع» — مشتق من الاتجاه حصرًا. */
  label:     string;
  /** سهم الاتجاه — يُستخدم كأيقونة افتراضية. */
  icon:      string;
}

/** العرض الموحّد لاتجاه الحركة — المصدر الوحيد لعمود «النوع» في كل الشاشات. */
export function txDirectionView(t: DirectionalMovement, translate?: TranslateFn): TxDirectionView {
  const direction = txDirection(t);
  return {
    direction,
    label: txDirectionLabel(direction, translate),
    icon:  DIRECTION_ICONS[direction],
  };
}

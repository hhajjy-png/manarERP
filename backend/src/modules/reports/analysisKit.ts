/* ════════════════════════════════════════════════════════════════════════════
   أدوات التحليل المشتركة لتقارير «الحزم التحليلية».

   استُخرجت حرفيًا من `expenseAnalysis.ts` (Expense Analysis Report Enhancement
   Pack v1) عند إضافة الحزمة التحليلية الثانية (التحصيلات)، كي يبقى **إطار تحليلي
   واحد** لا إطاران: محور الأشهر، وتسمية الشهر، وتوزيع النسب إلى 100% بالضبط
   تتصرّف بالطريقة نفسها في كل تقرير يستخدمها — لا نسخة ثانية يمكن أن تنحرف.

   الوحدة **نقيّة تمامًا** (لا Prisma، لا I/O) — لذلك تُختبر مباشرة.
   ════════════════════════════════════════════════════════════════════════════ */

import { ARABIC_MONTHS } from '../../core/utils/arabicMonths';
import { monthWindowsBetween } from '../../core/utils/dateWindows';

/** أكبر عدد أعمدة شهرية تُرسم متّصلة قبل الاكتفاء بالأشهر ذات البيانات فقط. */
export const MAX_MATRIX_MONTHS = 36;

/** تسمية صفّ/خليّة المجاميع — موحّدة عبر كل الأقسام التحليلية. */
export const TOTAL_LABEL = 'الإجمالي';

/** وسم شهر `YYYY-MM` من مكوّنات التاريخ **المحلية** (نفس عقد `monthWindowsBetween`). */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** `2025-03` → `مارس` أو `مارس 2025` عندما يمتد التقرير على أكثر من سنة. */
export function monthLabel(key: string, withYear: boolean): string {
  const [y, m] = key.split('-');
  const name = ARABIC_MONTHS[Number(m) - 1] ?? m;
  return withYear ? `${name} ${y}` : name;
}

/**
 * توزيع النسب المئوية بطريقة **أكبر البواقي** (Hamilton) على منزلة عشرية واحدة.
 *
 * التقريب المستقل لكل نسبة لا يجمع إلى 100% بالضرورة (33.3×3 = 99.9). هذه الطريقة
 * تُوزّع الوحدات المتبقية على أصحاب أكبر كسر، فيصبح المجموع **100.0% بالضبط** —
 * وهو شرط صريح في مواصفات الحزم التحليلية.
 *
 * إجمالي صفري (أو سالب) ⇒ أصفار، ولا تُفرض 100% على لا شيء.
 */
export function apportionPercents(values: number[], total: number, decimals = 1): number[] {
  if (values.length === 0) return [];
  if (!(total > 0)) return values.map(() => 0);

  const scale = 10 ** decimals;
  const targetUnits = 100 * scale;
  const raw = values.map((v) => (v / total) * targetUnits);
  const units = raw.map((r) => Math.floor(r));
  let remainder = Math.max(0, targetUnits - units.reduce((a, b) => a + b, 0));

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; remainder > 0; k++, remainder--) {
    units[order[k % order.length].i] += 1;
  }
  return units.map((u) => u / scale);
}

/**
 * محور الأشهر: متّصل بين أقدم وأحدث تاريخ، ما لم يتجاوز الحدّ فيقتصر على أشهر البيانات.
 *
 * يتكيّف تلقائيًا مع الفترة المختارة: شهر واحد ⇒ عمود واحد، وعدّة سنوات ⇒ أعمدة
 * متّصلة عبرها (والأشهر الفارغة تبقى أصفارًا لا فجوات، فالمجاميع لا تتأثر).
 */
export function buildMonthAxis(dates: Date[]): { keys: string[]; truncated: boolean } {
  const present = Array.from(new Set(dates.map(monthKey))).sort();
  if (dates.length === 0) return { keys: present, truncated: false };

  let min = dates[0];
  let max = dates[0];
  for (const d of dates) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  const contiguous = monthWindowsBetween(min, max).map((w) => w.label);
  if (contiguous.length > MAX_MATRIX_MONTHS) return { keys: present, truncated: true };
  return { keys: contiguous, truncated: false };
}

/** هل يمتد المحور على أكثر من سنة؟ (يحدّد إظهار السنة في رؤوس الأشهر). */
export function axisSpansYears(monthKeys: string[]): boolean {
  return new Set(monthKeys.map((k) => k.slice(0, 4))).size > 1;
}

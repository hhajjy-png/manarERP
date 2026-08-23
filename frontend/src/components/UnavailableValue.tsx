import { useT } from '../lib/i18n';

/**
 * علامة «قيمة غير متاحة» الموحَّدة للبطاقات المالية.
 *
 * القاعدة التي يفرضها هذا المكوّن: **فشل الطلب ليس صفرًا**. بطاقة تعرض `0.000 د.ك`
 * لأن الخادم لم يُجب تُخبر المستخدم كذبةً ماليةً لا يمكنه تمييزها عن الحقيقة —
 * وهي الحالة التي كشفها تدقيق 2026-08-22 في لوحة الذكاء المالي وبطاقة صافي النقد.
 *
 * الشكل «—» هو نفس العُرف المتّبع أصلًا في `formatMoneyCell` وبطاقات مركز التحليل
 * المالي عند غياب البيانات، فلا نُدخل لغةً بصرية جديدة. السبب يظهر في `title`
 * ولقارئات الشاشة، فلا يبقى الشرطة مبهمًا.
 */
export default function UnavailableValue({ reasonKey = 'lbl.value_unavailable' }: { reasonKey?: string }) {
  const { t } = useT();
  const reason = t(reasonKey);
  return (
    <span className="xpl-unavailable" title={reason} aria-label={reason}>
      —
    </span>
  );
}

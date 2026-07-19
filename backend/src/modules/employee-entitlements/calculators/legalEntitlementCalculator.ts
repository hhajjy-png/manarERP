/**
 * سطح الحاسبة القانونية العام لنطاق Employee Entitlements (Part 4 — الترحيل التدريجي).
 * إعادة تصدير للحاسبة الأصلية (backend/src/modules/employees/entitlements.calc.ts)
 * بلا نقل فعلي للملف الآن — الملف الأصلي يبقى المصدر الوحيد للحقيقة ولمنطق الاحتساب
 * القانوني الحسّاس (المواد 51/53/55/62/70/73/74)، ولا شيء هنا يُعيد تعريفه أو يُغيّره.
 * الهدف: يبدأ أي كود جديد ضمن هذا النطاق باستيراد الحاسبة من هنا (المسار العام الجديد)
 * بدل معرفة مسارها الداخلي القديم — خطوة أولى آمنة من «Move code progressively»؛ نقل
 * المحتوى الفعلي لاحقًا (إن قُرِّر) يبقى خلف هذا السطح العام نفسه بلا كسر أي مستهلك.
 */
export {
  calculateEntitlements,
  computeEffectiveAnnualLeaveDays,
  type EntitlementInput,
  type EntitlementResult,
  type GratuityBreakdown,
  type WageBaseComposition,
  type DateInterval,
} from '../../employees/entitlements.calc';

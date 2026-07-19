import type { EntitlementResult, GratuityBreakdown, WageBaseComposition } from '../../employees/entitlements.calc';

/**
 * ملخّص الاستحقاقات العام لنطاق Employee Entitlements — اسم عام نظيف (Public Model)
 * لنفس EntitlementResult الصادر من محرك الاحتساب القانوني الوحيد (entitlements.calc.ts).
 * إعادة تصدير كنوع مستعار (type alias) عمدًا وليس إعادة تعريف — القيم القانونية مصدرها
 * الوحيد يبقى الحاسبة الأصلية؛ هذا فقط اسم عام يستهلكه كود النطاق الجديد بلا أي تكرار
 * أو احتمال انحراف عن الحساب الحقيقي.
 */
export type EntitlementSummary = EntitlementResult;

export type { GratuityBreakdown, WageBaseComposition };

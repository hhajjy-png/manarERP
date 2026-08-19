/**
 * تأمين المركبات — منطق حالة الوثيقة (Vehicle Insurance Management v1).
 *
 * منطق صافٍ بلا Prisma ولا Express: يُختبر وحدةً، ويستدعيه الخادم والتقرير معًا فلا
 * يمكن أن تتباعد شارة الشاشة عن عمود التقرير.
 */

/** نطاق التنبيه المطلوب في الحزمة: منتهية | 7 أيام | 15 يومًا | 30 يومًا | سارية. */
export type InsuranceUrgency = 'EXPIRED' | 'DUE_7' | 'DUE_15' | 'DUE_30' | 'VALID';

/** الحالة المختصرة المعروضة في الجدول الرئيسي وفلترته. */
export type InsuranceStatus = 'EXPIRED' | 'EXPIRING_SOON' | 'VALID';

/** حدود نطاقات التنبيه بالأيام — مصدر واحد للأرقام بدل نشرها في الشروط. */
export const INSURANCE_ALERT_DAYS = { critical: 7, warning: 15, notice: 30 } as const;

/**
 * منتصف ليل UTC لليوم التقويمي **المحلي** الحالي.
 *
 * تواريخ الوثائق تُخزَّن عند منتصف ليل UTC (عقد `dateOnlySchema`)، فلا يصحّ طرح طابع
 * زمني حيّ منها: وثيقة تنتهي اليوم كانت ستُحسَب «منتهية منذ يوم» بعد الساعة 00:00.
 * نطبّع «اليوم» إلى نفس التمثيل أولًا، فيصبح الفرق عددًا صحيحًا من الأيام دائمًا.
 */
export function todayUtcMidnight(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/**
 * عدد الأيام المتبقية حتى تاريخ الانتهاء. صفر = تنتهي اليوم (لا تزال سارية اليوم)،
 * وسالب = منتهية منذ ذلك العدد من الأيام.
 */
export function daysUntilExpiry(endDate: Date, now: Date = new Date()): number {
  const end = Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate());
  return Math.round((end - todayUtcMidnight(now).getTime()) / 86_400_000);
}

/** النطاق التنبيهي المشتقّ من الأيام المتبقية. */
export function insuranceUrgency(daysRemaining: number): InsuranceUrgency {
  if (daysRemaining < 0) return 'EXPIRED';
  if (daysRemaining <= INSURANCE_ALERT_DAYS.critical) return 'DUE_7';
  if (daysRemaining <= INSURANCE_ALERT_DAYS.warning) return 'DUE_15';
  if (daysRemaining <= INSURANCE_ALERT_DAYS.notice) return 'DUE_30';
  return 'VALID';
}

/** الحالة المختصرة: أي نطاق تنبيهي غير «سارية» ولا «منتهية» يُعرض كـ «ينتهي قريبًا». */
export function insuranceStatusOf(urgency: InsuranceUrgency): InsuranceStatus {
  if (urgency === 'EXPIRED') return 'EXPIRED';
  if (urgency === 'VALID') return 'VALID';
  return 'EXPIRING_SOON';
}

/** التسميات العربية — تُستخدم في تصدير Excel وتقرير مركز التقارير. */
export const COVERAGE_TYPE_AR: Record<string, string> = {
  COMPREHENSIVE: 'شامل',
  THIRD_PARTY: 'ضد الغير',
  OTHER: 'آخر',
};

export const INSURANCE_STATUS_AR: Record<InsuranceStatus, string> = {
  VALID: 'ساري',
  EXPIRING_SOON: 'ينتهي قريبًا',
  EXPIRED: 'منتهي',
};

export const INSURANCE_URGENCY_AR: Record<InsuranceUrgency, string> = {
  EXPIRED: 'منتهية',
  DUE_7: 'تنتهي خلال 7 أيام',
  DUE_15: 'تنتهي خلال 15 يومًا',
  DUE_30: 'تنتهي خلال 30 يومًا',
  VALID: 'سارية',
};

export function coverageTypeAr(value: string): string {
  return COVERAGE_TYPE_AR[value] ?? value;
}

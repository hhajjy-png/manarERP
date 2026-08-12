/**
 * تسميات الوحدة العربية — مصدر واحد للنصوص المتكرّرة في الشاشات والمستندات المطبوعة.
 *
 * مفاتيح `i18n` تخدم عناوين الواجهة، لكن تسميات **بنود المستند المطبوع** تبقى عربية
 * دائمًا: الكشف الرسمي وثيقة يوقّعها الموظف، ولا تتبع مبدّل لغة الواجهة.
 */
import type { DebtPaymentSource, DebtStatus, DebtType, DeductionType, EarningType, OvertimeType } from './types';

export const OVERTIME_LABEL_AR: Record<OvertimeType, string> = {
  REGULAR: 'عمل إضافي',
  WEEKLY_REST: 'عمل في يوم الراحة الأسبوعية',
  OFFICIAL_HOLIDAY: 'عمل في عطلة رسمية',
};

/**
 * الاسم المطوَّل — لقوائم الاختيار والتقرير التفصيلي.
 *
 * رقم المادة مذكور هنا **للعرض وحده**؛ المرجع القانوني المخزَّن مع كل سطر يأتي من
 * محرّك الخادم (`legalReference`)، فلا نصّ مرجعٍ ثانٍ يتفرّع عن المصدر المركزي.
 * كل نوع ومادّته: ٦٦ يوم العمل العادي · ٦٧ الراحة الأسبوعية · ٦٨ العطلات الرسمية.
 */
export const OVERTIME_LABEL_LONG_AR: Record<OvertimeType, string> = {
  REGULAR: 'عمل إضافي في يوم عمل عادي (+٢٥٪ — م ٦٦)',
  WEEKLY_REST: 'عمل في يوم الراحة الأسبوعية (+٥٠٪ — م ٦٧)',
  OFFICIAL_HOLIDAY: 'عمل في عطلة رسمية (أجر مضاعف — م ٦٨)',
};

export const EARNING_LABEL_AR: Record<EarningType, string> = {
  BONUS: 'مكافأة',
  GRANT: 'منحة',
  INCENTIVE: 'حافز',
  ALLOWANCE: 'بدل',
  EXPENSE_REIMBURSEMENT: 'تعويض مصروف',
  CUSTOM: 'بند مخصص',
};

export const DEDUCTION_LABEL_AR: Record<DeductionType, string> = {
  ABSENCE: 'غياب',
  ADVANCE: 'سلفة',
  PENALTY: 'جزاء',
  DISCOUNT: 'خصم',
  CUSTOM: 'استقطاع مخصص',
  DEBT_REPAYMENT: 'سداد مديونية',
};

/**
 * الأنواع التي يختارها المستخدم يدويًا لسطر استقطاع.
 * `DEBT_REPAYMENT` **مستثنى**: لا يُنشأ إلا عبر حوار «استقطاع من مديونية»، لأنه يلزمه
 * مرجع إلى سجل المديونية — واختياره من قائمة عادية كان سينتج سطرًا يرفضه الخادم.
 */
export const SELECTABLE_DEDUCTION_TYPES: DeductionType[] = ['ABSENCE', 'ADVANCE', 'PENALTY', 'DISCOUNT', 'CUSTOM'];

export const DEBT_TYPE_LABEL_AR: Record<DebtType, string> = {
  ADVANCE: 'سلفة',
  DEBT: 'مديونية',
  CUSTOM: 'سجل مخصص',
};

export const DEBT_STATUS_LABEL_AR: Record<DebtStatus, string> = {
  OPEN: 'قائمة',
  SETTLED: 'مسددة',
};

export const DEBT_SOURCE_LABEL_AR: Record<DebtPaymentSource, string> = {
  MONTHLY_COMPENSATION: 'حسبة شهرية',
  MANUAL_PAYMENT: 'سداد يدوي',
};

export const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/** اسم الشهر من رقمه (١..١٢). يرمي على رقم خارج المدى بدل إعادة `undefined` بصمت. */
export function monthNameAr(month: number): string {
  const name = MONTH_NAMES_AR[month - 1];
  if (!name) throw new Error(`رقم شهر غير صالح: ${month}`);
  return name;
}

/**
 * السنوات المعروضة في مبدّل السنة: من ٢٠٢٠ حتى السنة القادمة.
 * الحدّ العلوي «السنة القادمة» لا «السنة الحالية»، لأن حسبة ديسمبر قد تُحضَّر في يناير.
 */
export function selectableYears(now: Date = new Date()): number[] {
  const current = now.getFullYear();
  const years: number[] = [];
  for (let y = current + 1; y >= 2020; y--) years.push(y);
  return years;
}

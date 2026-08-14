/**
 * المصدر الواحد للقيم **ثنائية اللغة** في كشف مستحقات الموظف الشهرية.
 *
 * لماذا ملف مستقل: القيمة نفسها تظهر في مكانين — الكشف المطبوع (`StatementTemplate`)
 * ومحتوى رمز الاستجابة السريعة (`EmployeeCompensationStatement`). اشتقاقها مرّتين كان
 * سيسمح لهما بالاختلاف بصمت (اسم في الورقة، اسم آخر في الرمز). هنا تُشتقّ مرّة واحدة.
 *
 * ═══ قاعدة مغلقة: لا ترجمة مُخترعة ═══
 * الشقّ الإنجليزي يأتي حصرًا من مصدر معتمد في النظام:
 *   · اسم الموظف   → `Employee.fullNameEn` المخزَّن (وحده).
 *   · المسمى الوظيفي → جدول الترجمات المعتمد + تجاوزات الإعدادات (`lookupJobTitleEn`).
 *   · الشهر/الفترة  → `MONTH_NAMES_EN` مقابل رقم الشهر **الموجود في سجل الحسبة**.
 * غياب المصدر ⇒ يُعاد النصّ العربي وحده. لا تخمين ولا ترجمة حرفية ولا تكرار العربي
 * في هيئة إنجليزية.
 *
 * ولا حساب هنا: `netEntitlementQrValue` تُنسّق الرقم الواصل من المحرّك ولا تشتقّه.
 */
import { formatNumber } from '../lib/format';
import { lookupJobTitleEn } from '../forms/shared/contractTranslations';
import { monthNameAr, monthNameEn } from './labels';
import type { StatementData } from './types';

/** زوج عربي/إنجليزي. `en === null` ⇒ لا مصدر معتمد، فيُعرض العربي وحده. */
export interface BilingualValue {
  ar: string;
  en: string | null;
}

/** `عربي / English` — أو العربي وحده حين لا مصدر إنجليزي. صيغة النصّ الواحد. */
export function joinBilingual(value: BilingualValue): string {
  return value.en ? `${value.ar} / ${value.en}` : value.ar;
}

/** اسم الموظف — الإنجليزي من `fullNameEn` المخزَّن وحده. فارغ/مسافات ⇒ لا مصدر. */
export function employeeNameBilingual(
  fullName: string,
  fullNameEn?: string | null,
): BilingualValue {
  const en = fullNameEn?.trim();
  return { ar: fullName, en: en ? en : null };
}

/** المسمى الوظيفي — الإنجليزي من الترجمة المعتمدة وحدها (تجاوزات الإعدادات أولًا). */
export function jobTitleBilingual(jobTitle: string | null | undefined): BilingualValue {
  if (!jobTitle?.trim()) return { ar: '—', en: null };
  return { ar: jobTitle, en: lookupJobTitleEn(jobTitle) };
}

/**
 * الشهر/الفترة — اللغتان مشتقّتان من **نفس** `year`/`month` القادمَين من سجل الحسبة.
 * لا `new Date()` هنا ولا في أي مستهلك: تاريخ اليوم لا يحدّد فترة كشف تاريخي.
 */
export function periodBilingual(year: number, month: number): BilingualValue {
  return { ar: `${monthNameAr(month)} ${year}`, en: `${monthNameEn(month)} ${year}` };
}

/** صافي المستحق كما يدخل الرمز — نفس رقم الكشف بنفس المُنسّق، بلا إعادة حساب. */
export function netEntitlementQrValue(netAmount: number): string {
  return `${formatNumber(netAmount)} KWD`;
}

/**
 * محتوى رمز الاستجابة السريعة لهذا الكشف — **ثلاثة أسطر لا رابع لها**:
 * اسم الموظف · صافي المستحق · الشهر/الفترة.
 *
 * كل ما عداه (الرقم الوظيفي، الرقم المدني، المسمى، الراتب الأساسي، البنود،
 * الإجماليات الأخرى، تاريخ الإعداد أو الطباعة، حالة الاعتماد، اسم المعدّ، بيانات
 * الشركة) مستبعَد عمدًا. الدالة تبني القائمة من الصفر بدل تنقيح قائمة قائمة، فلا
 * يستطيع حقلٌ جديد في `StatementData` أن يتسلّل إلى الرمز بمرور الوقت.
 */
export function buildStatementQrLines(data: StatementData): string[] {
  const name = employeeNameBilingual(data.employee.fullName, data.employee.fullNameEn);
  const period = periodBilingual(data.year, data.month);
  return [
    `اسم الموظف / Employee Name: ${joinBilingual(name)}`,
    `صافي المستحق / Net Entitlement: ${netEntitlementQrValue(data.totals.netAmount)}`,
    `الشهر / الفترة / Month / Period: ${joinBilingual(period)}`,
  ];
}

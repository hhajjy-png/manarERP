/**
 * إقرار دين موظف — حساب الأقساط وجدول السداد.
 *
 * ═══ دوالّ خالصة، ومصدر واحد ═══
 * لا شيء هنا يعرف React ولا الترجمة ولا القوالب. القوالب الثلاثة (العربي والإنجليزي
 * والهندي) تُصيّر **نفس** المصفوفة التي تعيدها `buildInstallmentSchedule` — فلا ثلاثة
 * حاسبات، ولا احتمال أن يعرض قالبٌ رقمًا يخالف قالبًا آخر لنفس المستند.
 *
 * ═══ النقود ═══
 * كل مبلغ يمرّ من `roundMoney`/`sumMoney` في `lib/money` — نفس وحدة التقريب التي
 * تستعملها الفواتير والشيكات والسندات (نصف بعيدًا عن الصفر، 3 خانات، تصحيح EPSILON).
 * لا `toFixed` ولا `Math.round` محليّ: قاعدة تقريب ثانية تعني رقمين مختلفين للمستند
 * نفسه في شاشتين.
 *
 * ═══ التواريخ ═══
 * حساب تقويمي على الأعداد مباشرةً (سنة/شهر/يوم) بلا كائن `Date`، فلا أثر لمنطقة زمنية
 * ولا لتوقيت صيفي على تاريخ استحقاق. أيام الشهر من `lib/dateInput.daysInMonth`
 * (وهي بدورها تستعمل `isLeapYear`) — لا جدول أيام ثانٍ.
 */
import { daysInMonth, isRealYmd } from '../../lib/dateInput';
import { roundMoney, sumMoney, moneyEquals } from '../../lib/money';

/** صفّ واحد في جدول السداد. */
export interface InstallmentRow {
  /** رقم القسط، يبدأ من 1. */
  no: number;
  /** تاريخ الاستحقاق بصيغة `YYYY-MM-DD`، أو `''` إن تعذّر حسابه. */
  dueDate: string;
  /** قيمة القسط بالدينار الكويتي. */
  amount: number;
  /** الرصيد المتبقّي **بعد** سداد هذا القسط. */
  remainingBalance: number;
}

/** مدخلات توليد الجدول. */
export interface ScheduleInput {
  /** أصل الدين بالدينار الكويتي. */
  debtAmount: number;
  /** عدد الأقساط. */
  count: number;
  /** تاريخ أول قسط بصيغة `YYYY-MM-DD`. */
  firstDate: string;
}

/**
 * قيم الأقساط: كلها متساوية عدا الأخير، الذي يحمل **فارق التقريب** كاملًا.
 *
 * الثابت الذي تحفظه هذه الدالة: `sum(amounts) === roundMoney(debtAmount)` بالضبط بعد
 * التقريب إلى ثلاث خانات — لا فلس يضيع ولا فلس يُخترع. مثال 1000 ÷ 3:
 * `333.333 · 333.333 · 333.334`.
 *
 * يُحمَّل الفارق على القسط الأخير عمدًا: هو الأبعد زمنيًا، وتعديله لا يغيّر أي قسط
 * وقّع عليه المدين ودفعه فعلًا.
 */
export function calculateInstallmentAmounts(debtAmount: number, count: number): number[] {
  if (!Number.isFinite(debtAmount) || !Number.isInteger(count) || count < 1) return [];
  const total = roundMoney(debtAmount);
  if (count === 1) return [total];

  const base = roundMoney(total / count);
  const head = Array.from({ length: count - 1 }, () => base);
  const last = roundMoney(total - sumMoney(head));
  return [...head, last];
}

/**
 * تواريخ الأقساط شهريًا، مع **الاحتفاظ باليوم الأصلي** لا بآخر يوم استُعمل.
 *
 * القاعدة: يوم الاستحقاق المفضَّل هو يوم أول قسط. في كل شهر يُستعمل ذلك اليوم نفسه،
 * وإن كان الشهر أقصر منه يُستعمل آخر يوم فيه — **دون أن يصبح ذلك اليوم القصير هو
 * المفضَّل الجديد**. فالبدء في 31/01/2027 يعطي 28/02/2027 ثم يعود إلى 31/03/2027،
 * ولا يعلق على 28. وفي سنة كبيسة (2028) يعطي فبراير 29 ثم يعود إلى 31 مارس.
 */
export function buildInstallmentDates(firstDate: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1) return [];
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstDate);
  if (!parts) return Array.from({ length: count }, () => '');

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const preferredDay = Number(parts[3]);
  if (!isRealYmd(year, month, preferredDay)) return Array.from({ length: count }, () => '');

  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: count }, (_unused, k) => {
    const monthsFromStart = month - 1 + k;
    const y = year + Math.floor(monthsFromStart / 12);
    const m = (monthsFromStart % 12) + 1;
    const day = Math.min(preferredDay, daysInMonth(y, m));
    return `${y}-${pad(m)}-${pad(day)}`;
  });
}

/**
 * جدول السداد الكامل — **المصدر الوحيد** الذي تُصيّره القوالب الثلاثة.
 *
 * الرصيد المتبقّي محسوب لا مُدخَل: `الرصيد بعد القسط = الرصيد قبله − قيمة القسط`،
 * والصفّ الأخير ينتهي عند `0` بالضبط لأن مجموع الأقساط يساوي أصل الدين تمامًا.
 */
export function buildInstallmentSchedule({ debtAmount, count, firstDate }: ScheduleInput): InstallmentRow[] {
  const amounts = calculateInstallmentAmounts(debtAmount, count);
  if (amounts.length === 0) return [];
  const dates = buildInstallmentDates(firstDate, count);

  let remaining = roundMoney(debtAmount);
  return amounts.map((amount, i) => {
    remaining = roundMoney(remaining - amount);
    return { no: i + 1, dueDate: dates[i] ?? '', amount, remainingBalance: remaining };
  });
}

/**
 * إعادة حساب أرصدة جدول **عُدِّل يدويًا**: التواريخ والقيم كما تركها المستخدم، والأرصدة
 * مشتقّة منها. يبقى «الرصيد المتبقّي» حقلًا محسوبًا لا يُدخله أحد، حتى في الوضع اليدوي.
 */
export function recalculateBalances(rows: readonly InstallmentRow[], debtAmount: number): InstallmentRow[] {
  let remaining = roundMoney(debtAmount);
  return rows.map((row, i) => {
    remaining = roundMoney(remaining - roundMoney(row.amount));
    return { ...row, no: i + 1, amount: roundMoney(row.amount), remainingBalance: remaining };
  });
}

/**
 * تقسيم الجدول على صفحات الملحق — **للعرض وحده**.
 *
 * ═══ جدول واحد، وصفحات كثيرة ═══
 * لا يوجد في المستند إلا جدول سداد **واحد** (`DebtAckData.schedule`). هذه الدالة لا
 * تُنشئ جداول، ولا تحسب شيئًا، ولا تلمس قيمة: تقطع المصفوفة القائمة إلى قطع متتابعة
 * بطول ثابت. فما يُحرَّر في الشاشة وما يُطبع في الملحق شيء واحد، مهما بلغ عدد الصفحات.
 *
 * ═══ لماذا تعيد قطعة واحدة فارغة حين لا جدول ═══
 * المستند يحمل صفحة ملحق **دائمًا**، حتى قبل إدخال أي قسط: صفحةً بصفوفها الاثني عشر
 * فارغةً بنقاط الأصل، تمامًا كما في ملف Word قبل أن يُملأ. فلو أعادت `[]` لاختفت
 * صفحة الملحق من مستند لم يُملأ بعد.
 *
 * `[1..12], [13..24], [25]` لخمسة وعشرين قسطًا — بالترتيب، بلا إعادة ترقيم، وبلا
 * فقدان صفّ.
 */
export function paginateInstallmentSchedule(
  rows: readonly InstallmentRow[],
  rowsPerPage: number,
): InstallmentRow[][] {
  if (!Number.isInteger(rowsPerPage) || rowsPerPage < 1) return [[]];
  if (rows.length === 0) return [[]];
  const pages: InstallmentRow[][] = [];
  for (let start = 0; start < rows.length; start += rowsPerPage) {
    pages.push(rows.slice(start, start + rowsPerPage));
  }
  return pages;
}

/** عدد صفحات الملحق التي يحتاجها عددٌ من الأقساط — نسخةً واحدة. */
export function annexPageCount(installmentCount: number, rowsPerPage: number): number {
  if (!Number.isInteger(rowsPerPage) || rowsPerPage < 1) return 1;
  if (!Number.isFinite(installmentCount) || installmentCount < 1) return 1;
  return Math.ceil(installmentCount / rowsPerPage);
}

/** مجموع أقساط الجدول، مقرَّبًا مرة واحدة. */
export function scheduleTotal(rows: readonly InstallmentRow[]): number {
  return sumMoney(rows.map((r) => r.amount));
}

/** رمز خلل واحد في المدخلات أو في الجدول — تترجمه الواجهة، ولا يحمل نصًّا معروضًا. */
export type ScheduleIssue =
  | 'amountNotPositive'
  | 'countNotPositive'
  | 'countNotInteger'
  | 'countAboveMax'
  | 'missingFirstDate'
  | 'invalidFirstDate'
  | 'totalMismatch'
  | 'negativeBalance';

export interface ValidateScheduleInput extends ScheduleInput {
  rows: readonly InstallmentRow[];
  maxInstallments: number;
}

/**
 * كل ما يمنع طباعة جدول سداد صحيح، مرة واحدة وبترتيب ثابت.
 *
 * `totalMismatch` هو الحارس الحقيقي للوضع اليدوي: حين يعدّل المستخدم الجدول ثم يغيّر
 * أصل الدين ويرفض إعادة الحساب، يبقى الجدول كما تركه — ويظهر الخلل صراحةً بدل أن
 * يُصحَّح في الخفاء أو يُطبع دَينٌ لا تجمعه أقساطه.
 */
export function validateSchedule({
  debtAmount,
  count,
  firstDate,
  rows,
  maxInstallments,
}: ValidateScheduleInput): ScheduleIssue[] {
  const issues: ScheduleIssue[] = [];

  if (!Number.isFinite(debtAmount) || debtAmount <= 0) issues.push('amountNotPositive');
  if (!Number.isFinite(count) || count <= 0) issues.push('countNotPositive');
  else if (!Number.isInteger(count)) issues.push('countNotInteger');
  else if (count > maxInstallments) issues.push('countAboveMax');

  if (!firstDate) issues.push('missingFirstDate');
  else if (buildInstallmentDates(firstDate, 1)[0] === '') issues.push('invalidFirstDate');

  if (rows.length > 0) {
    if (!moneyEquals(scheduleTotal(rows), debtAmount)) issues.push('totalMismatch');
    if (rows.some((r) => r.remainingBalance < 0)) issues.push('negativeBalance');
  }

  return issues;
}

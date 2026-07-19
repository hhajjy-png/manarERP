/**
 * حاسبة استحقاقات الموظف — قانون العمل الكويتي في القطاع الأهلي رقم 6 لسنة 2010.
 *
 * دالة نقيّة (Pure) بلا وصول لقاعدة البيانات ولا حالة خارجية — كل المدخلات تُمرَّر صراحةً
 * وكل المخرجات مُشتقّة منها فقط، لتكون قابلة للاختبار بالكامل. الصيغ ثابتة في الشيفرة
 * (لا إعدادات، لا قواعد قابلة للتحرير) وفق المواد المرجعية أدناه.
 *
 * ── المواد المرجعية (قانون 6/2010) ──────────────────────────────────────────────
 *  • المادة 70: الإجازة السنوية = 30 يومًا بأجر كامل عن كل سنة خدمة.
 *  • المادة 70 (فقرة الصرف): يُصرف للعامل نقدًا مقابل رصيد إجازاته التي لم يحصل عليها.
 *  • المادة 51: مكافأة نهاية الخدمة للعامل بأجر شهري =
 *        - أجر 15 يومًا عن كل سنة من الخمس سنوات الأولى، و
 *        - أجر شهر كامل عن كل سنة بعد ذلك،
 *        بحيث لا يتجاوز الإجمالي أجر سنة ونصف (18 شهرًا).
 *        وتُحسب كسور السنة بنسبتها (Pro-rata).
 *
 * ── الافتراضات (لعدم وجود البيانات في النظام — لا تُخمَّن ولا تُختلق) ───────────────
 *  1) الأجر: يُعتمد الراتب الشهري المسجّل (Employee.salary) كأجرٍ شاملٍ للاحتساب،
 *     إذ لا يفصل النظام حاليًا بين الأجر الأساسي والبدلات لكل موظف.
 *  2) الأجر اليومي = الراتب الشهري ÷ 30 (اعتماد الشهر الميلادي حتى يساوي «أجر الشهر»
 *     في الشريحة الثانية 30 يومًا بالضبط، فيبقى مصدر الأجر اليومي واحدًا في كل الحسابات).
 *  3) مكافأة نهاية الخدمة تُحتسب على أساس «إنهاء الخدمة من صاحب العمل / انتهاء العقد»،
 *     أي الاستحقاق الكامل دون تطبيق أي تخفيض استقالة (المادة 51)، لأن النظام لا يسجّل
 *     سبب انتهاء الخدمة ولا نوع العقد (محدّد/غير محدّد) — وهذا هو الاحتساب الأقرب قانونًا
 *     والأعلى استحقاقًا، ويُعرض معه إشعار قانوني.
 *  4) تُحتسب الإجازة السنوية تناسبيًا من تاريخ التعيين (30 × أيام الخدمة ÷ 365).
 */

// ── ثوابت قانونية ثابتة (المادتان 70 و51) ────────────────────────────────────────
const ANNUAL_LEAVE_DAYS_PER_YEAR = 30; // المادة 70
const GRATUITY_FIRST_TIER_DAYS = 15; // المادة 51 — أجر 15 يومًا/سنة للخمس الأولى
const GRATUITY_FIRST_TIER_YEARS = 5;
const GRATUITY_SECOND_TIER_DAYS = 30; // المادة 51 — أجر شهر (30 يومًا)/سنة بعد الخمس
const GRATUITY_CAP_MONTHS = 18; // المادة 51 — الحد الأقصى = أجر سنة ونصف
const DAYS_PER_MONTH = 30; // أساس الأجر اليومي (افتراض 2)
const DAYS_PER_YEAR = 365; // أساس التناسب السنوي

const MS_PER_DAY = 86_400_000;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface EntitlementInput {
  /** تاريخ التعيين — قد يكون غير مُدخل (null) فتُعرض البطاقات المعتمدة عليه كـ«بيانات غير مكتملة». */
  hireDate: Date | null;
  /** الراتب الشهري المسجّل (Employee.salary). */
  monthlySalary: number;
  /** لحظة الاحتساب — عادةً «اليوم». */
  asOf: Date;
  /** مجموع أيام الإجازات السنوية المعتمدة المستخدمة (مصدر واحد: Leave.days المخزّن). */
  usedAnnualLeaveDays: number;
}

export interface GratuityBreakdown {
  serviceYears: number; // سنوات الخدمة (كسريّة)
  approvedWage: number; // الأجر المعتمد (الراتب الشهري)
  dailyWage: number; // الأجر اليومي
  firstTierYears: number; // min(serviceYears, 5)
  firstTierAmount: number; // استحقاق أول مدة
  secondTierYears: number; // max(0, serviceYears - 5)
  secondTierAmount: number; // استحقاق المدة الإضافية
  rawTotal: number; // الإجمالي قبل الحد الأقصى
  capAmount: number; // الحد الأقصى (18 شهرًا)
  capApplied: boolean; // هل طُبّق الحد الأقصى؟
  total: number; // إجمالي المكافأة النهائي
}

export interface EntitlementResult {
  hasHireDate: boolean;
  hasSalary: boolean;

  duration: { years: number; months: number; days: number; totalDays: number } | null;

  annualEntitlementDays: number; // 30 دائمًا (نسبة الاستحقاق القانونية)
  accruedLeaveDays: number | null; // الرصيد المستحق حتى اليوم (يحتاج تاريخ التعيين)
  usedLeaveDays: number; // الأيام المستخدمة (معروف دائمًا)
  remainingLeaveDays: number | null; // الأيام المتبقية = المستحق − المستخدم

  dailyWage: number | null; // يحتاج الراتب
  leaveAllowanceDays: number | null; // الأيام المستحقة للصرف = المتبقية
  leaveAllowanceValue: number | null; // القيمة النقدية لبدل الإجازة

  gratuity: GratuityBreakdown | null; // يحتاج تاريخ التعيين + الراتب

  /** true عندما أثّر افتراضٌ قانوني في قيمة محتسَبة فعليًا (لعرض الإشعار القانوني). */
  assumptionsApplied: boolean;
}

/**
 * تفكيك مدة الخدمة إلى سنوات/أشهر/أيام تقويمية دقيقة + إجمالي الأيام.
 * يُقصّ إجمالي الأيام السالب (تاريخ تعيين مستقبلي/بيانات غير سليمة) إلى صفر.
 */
function serviceDuration(hire: Date, asOf: Date): { years: number; months: number; days: number; totalDays: number } {
  const totalDays = Math.max(0, Math.floor((asOf.getTime() - hire.getTime()) / MS_PER_DAY));

  let years = asOf.getFullYear() - hire.getFullYear();
  let months = asOf.getMonth() - hire.getMonth();
  let days = asOf.getDate() - hire.getDate();

  if (days < 0) {
    months -= 1;
    // عدد أيام الشهر السابق للحظة الاحتساب (اليوم 0 من الشهر الحالي).
    const prevMonthDays = new Date(asOf.getFullYear(), asOf.getMonth(), 0).getDate();
    days += prevMonthDays;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) {
    // تاريخ تعيين مستقبلي → مدة صفرية.
    return { years: 0, months: 0, days: 0, totalDays: 0 };
  }
  return { years, months, days, totalDays };
}

/** يحسب مكافأة نهاية الخدمة وفق المادة 51 (عامل بأجر شهري) مع سقف 18 شهرًا. */
function computeGratuity(serviceYears: number, monthlySalary: number): GratuityBreakdown {
  const dailyWage = monthlySalary / DAYS_PER_MONTH;

  const firstTierYears = Math.min(serviceYears, GRATUITY_FIRST_TIER_YEARS);
  const secondTierYears = Math.max(0, serviceYears - GRATUITY_FIRST_TIER_YEARS);

  const firstTierAmount = GRATUITY_FIRST_TIER_DAYS * dailyWage * firstTierYears;
  const secondTierAmount = GRATUITY_SECOND_TIER_DAYS * dailyWage * secondTierYears;

  const rawTotal = firstTierAmount + secondTierAmount;
  const capAmount = GRATUITY_CAP_MONTHS * monthlySalary;
  const capApplied = rawTotal > capAmount;
  const total = capApplied ? capAmount : rawTotal;

  return {
    serviceYears: round2(serviceYears),
    approvedWage: round3(monthlySalary),
    dailyWage: round3(dailyWage),
    firstTierYears: round2(firstTierYears),
    firstTierAmount: round3(firstTierAmount),
    secondTierYears: round2(secondTierYears),
    secondTierAmount: round3(secondTierAmount),
    rawTotal: round3(rawTotal),
    capAmount: round3(capAmount),
    capApplied,
    total: round3(total),
  };
}

/**
 * الحاسبة الرئيسية النقيّة. تُرجع كل القيم المطلوبة للتبويب أو null للقيمة التي تعتمد
 * على بيانات غير مكتملة (بلا تخمين) — والواجهة تعرض حينها «—» + سبب النقص.
 */
export function calculateEntitlements(input: EntitlementInput): EntitlementResult {
  const hasHireDate = input.hireDate instanceof Date && !Number.isNaN(input.hireDate.getTime());
  const hasSalary = Number.isFinite(input.monthlySalary) && input.monthlySalary > 0;
  const usedLeaveDays = round2(Math.max(0, input.usedAnnualLeaveDays || 0));

  const duration = hasHireDate ? serviceDuration(input.hireDate as Date, input.asOf) : null;
  const serviceYears = duration ? duration.totalDays / DAYS_PER_YEAR : null;

  const accruedLeaveDays =
    duration !== null ? round2(ANNUAL_LEAVE_DAYS_PER_YEAR * (duration.totalDays / DAYS_PER_YEAR)) : null;
  const remainingLeaveDays = accruedLeaveDays !== null ? round2(Math.max(0, accruedLeaveDays - usedLeaveDays)) : null;

  const dailyWage = hasSalary ? round3(input.monthlySalary / DAYS_PER_MONTH) : null;

  const leaveAllowanceDays = remainingLeaveDays;
  const leaveAllowanceValue =
    remainingLeaveDays !== null && hasSalary ? round3(remainingLeaveDays * (input.monthlySalary / DAYS_PER_MONTH)) : null;

  const gratuity =
    serviceYears !== null && hasSalary ? computeGratuity(serviceYears, input.monthlySalary) : null;

  // أثّر افتراضٌ قانوني (الأجر الشامل / الأجر اليومي / عدم تطبيق تخفيض الاستقالة)
  // في قيمة محتسَبة فعليًا متى ما احتُسبت المكافأة أو بدل الإجازة النقدي.
  const assumptionsApplied = gratuity !== null || leaveAllowanceValue !== null;

  return {
    hasHireDate,
    hasSalary,
    duration,
    annualEntitlementDays: ANNUAL_LEAVE_DAYS_PER_YEAR,
    accruedLeaveDays,
    usedLeaveDays,
    remainingLeaveDays,
    dailyWage,
    leaveAllowanceDays,
    leaveAllowanceValue,
    gratuity,
    assumptionsApplied,
  };
}

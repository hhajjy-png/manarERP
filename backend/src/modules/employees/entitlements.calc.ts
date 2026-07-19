/**
 * حاسبة استحقاقات الموظف — قانون العمل الكويتي في القطاع الأهلي رقم 6 لسنة 2010.
 *
 * دالة نقيّة (Pure) بلا وصول لقاعدة البيانات ولا حالة خارجية — كل المدخلات تُمرَّر صراحةً
 * وكل المخرجات مُشتقّة منها فقط، لتكون قابلة للاختبار بالكامل. الصيغ ثابتة في الشيفرة
 * (لا إعدادات، لا قواعد قابلة للتحرير) وفق المواد المرجعية أدناه.
 *
 * ── المواد المرجعية (قانون 6/2010) ──────────────────────────────────────────────
 *  • المادة 70: الإجازة السنوية = 30 يومًا بأجر كامل عن كل سنة خدمة، تُحتسب تناسبيًا
 *    من تاريخ التعيين — لا يُعيد أي تسجيل «تسوية» لاحق ضبط نقطة البداية (انظر أدناه).
 *  • المادتان 73/74: لا يجوز إسقاط استحقاق الإجازة السنوية بتنازل العامل عنه بمقابل أو
 *    بدونه (المادة 74)؛ الصرف النقدي لرصيد الإجازة يكون فقط عند انتهاء العقد (المادة 73).
 *    لذلك: أي دفعة مقدَّمة أثناء الخدمة (Leave Settlement) هي سجل تاريخي/دفعة مقدّمة فقط،
 *    ولا تُنشئ أي مدخل في هذه الحاسبة — رصيد الإجازة يتراكم دومًا من تاريخ التعيين.
 *  • المادة 51: مكافأة نهاية الخدمة للعامل بأجر شهري (أساس إنهاء الخدمة من صاحب العمل) =
 *        - أجر 15 يومًا عن كل سنة من الخمس سنوات الأولى، و
 *        - أجر شهر كامل عن كل سنة بعد ذلك،
 *        بحيث لا يتجاوز الإجمالي أجر سنة ونصف (18 شهرًا). كسور السنة تُحسب بنسبتها.
 *  • المادة 53: عند استقالة العامل (عقد غير محدد المدة) تُطبَّق نسبة من المكافأة الكاملة:
 *        - أقل من 3 سنوات خدمة: لا يستحق شيئًا.
 *        - 3 إلى أقل من 5 سنوات: نصف المكافأة.
 *        - 5 إلى أقل من 10 سنوات: ثلثا المكافأة.
 *        - 10 سنوات فأكثر: كامل المكافأة (كإنهاء الخدمة من صاحب العمل).
 *  • المادة 55/62: تُحتسب المستحقات على أساس «الأجر المعتمد» — الأجر الأساسي مضافًا إليه
 *    العناصر الدورية المنتظمة (بدلات، مكافآت دورية، إلخ). القاعدة القانونية الحاكمة على
 *    قاسم الأجر اليومي معتمَدة كخط أساس ثابت للمشروع (انظر DAILY_WAGE_DIVISOR أدناه).
 *
 * ── الافتراضات المتبقية (لعدم وجود بيانات إضافية في النظام — لا تُخمَّن ولا تُختلق) ──
 *  1) الأجر المعتمد = الراتب الشهري المسجّل + البدلات الدورية النشطة للموظف حاليًا
 *     (EmployeeAllowance.isActive ضمن نافذة التاريخ)، وفق المادتين 55/62. تُجمَّع هذه
 *     القيمة مرة واحدة في طبقة الخدمة (employees.service.ts) وتُمرَّر هنا كرقم واحد
 *     (monthlyWageBase) — هذه الدالة لا تعرف مصدر الرقم، فتبقى نقيّة.
 *  2) قاسم الأجر اليومي = 26 — خط أساس قانوني معتمَد للمشروع (غير قابل لإعادة التقييم
 *     هنا)؛ ثابت واحد مركزي (DAILY_WAGE_DIVISOR) تشتق منه كل القيم اليومية دون تكرار.
 *  3) مكافأة نهاية الخدمة تُعرض بسيناريوهَين معًا (لا افتراض بأحدهما): الأساس الكامل
 *     (إنهاء من صاحب العمل / انتهاء العقد) والأساس المخفَّض وفق نسبة الاستقالة (المادة 53)
 *     — تُحسَب النسبتان دائمًا؛ اختيار الأساس المعروض متروك للواجهة، والقيمتان معًا
 *     تُنقلان صراحةً بدل افتراض أحدهما ضمنيًا.
 */

// ── ثوابت قانونية ثابتة (المواد 70 و51 و53) ───────────────────────────────────────
const ANNUAL_LEAVE_DAYS_PER_YEAR = 30; // المادة 70
const GRATUITY_FIRST_TIER_DAYS = 15; // المادة 51 — أجر 15 يومًا/سنة للخمس الأولى
const GRATUITY_FIRST_TIER_YEARS = 5;
const GRATUITY_CAP_MONTHS = 18; // المادة 51 — الحد الأقصى = أجر سنة ونصف
// قاسم الأجر اليومي — ثابت مركزي واحد (خط الأساس القانوني المعتمد للمشروع). كل قيمة
// «يومية» في هذه الحاسبة تُشتق من هذا الثابت فقط — لا قاسم مكرر في أي مكان آخر.
const DAILY_WAGE_DIVISOR = 26;
const DAYS_PER_YEAR = 365; // أساس التناسب السنوي

// المادة 53 — كسور مكافأة الاستقالة (عقد غير محدد المدة).
const RESIGNATION_FRACTION_UNDER_3_YEARS = 0;
const RESIGNATION_FRACTION_3_TO_5_YEARS = 0.5;
const RESIGNATION_FRACTION_5_TO_10_YEARS = 2 / 3;
const RESIGNATION_FRACTION_10_PLUS_YEARS = 1;

const MS_PER_DAY = 86_400_000;

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;

export interface EntitlementInput {
  /** تاريخ التعيين — قد يكون غير مُدخل (null) فتُعرض البطاقات المعتمدة عليه كـ«بيانات غير مكتملة». */
  hireDate: Date | null;
  /**
   * الأجر الشهري المعتمد = الراتب الأساسي + البدلات الدورية النشطة (المادتان 55/62).
   * يُجمَّع في طبقة الخدمة (مصدر واحد للحقيقة) ويُمرَّر هنا جاهزًا.
   */
  monthlyWageBase: number;
  /** لحظة الاحتساب — عادةً «اليوم». */
  asOf: Date;
  /**
   * مجموع أيام الإجازات السنوية المعتمدة المستخدمة منذ تاريخ التعيين (Leave.days).
   * لا يُستثنى منها أي فترة سابقة لأي «تسوية» — فالتسويات لا تُنشئ خط أساس جديدًا
   * (المادتان 73/74)؛ رصيد الإجازة يتراكم من تاريخ التعيين دون انقطاع دائمًا.
   */
  usedAnnualLeaveDays: number;
}

export interface GratuityBreakdown {
  serviceYears: number; // سنوات الخدمة (كسريّة) من تاريخ التعيين
  approvedWage: number; // الأجر الشهري المعتمد (راتب + بدلات دورية نشطة)
  dailyWage: number; // الأجر اليومي = الأجر المعتمد ÷ 26
  firstTierYears: number; // min(serviceYears, 5)
  firstTierAmount: number; // استحقاق أول مدة (15 يومًا × الأجر اليومي × السنوات)
  secondTierYears: number; // max(0, serviceYears - 5)
  secondTierAmount: number; // استحقاق المدة الإضافية (أجر شهر كامل × السنوات — وليس 30 يومًا يوميًا)
  rawTotal: number; // الإجمالي قبل الحد الأقصى
  capAmount: number; // الحد الأقصى (18 شهرًا)
  capApplied: boolean; // هل طُبّق الحد الأقصى؟
  total: number; // إجمالي المكافأة على أساس إنهاء الخدمة من صاحب العمل (كامل، المادة 51)
  resignationFraction: number; // نسبة الاستقالة المطبَّقة وفق سنوات الخدمة (المادة 53)
  resignationAmount: number; // إجمالي المكافأة على أساس الاستقالة = total × resignationFraction
}

export interface WageBaseComposition {
  baseSalary: number; // الراتب الأساسي المسجّل (Employee.salary)
  allowancesTotal: number; // إجمالي البدلات الدورية النشطة وقت الاحتساب
  total: number; // الأجر المعتمد = baseSalary + allowancesTotal (المادتان 55/62)
}

export interface EntitlementResult {
  hasHireDate: boolean;
  hasWageBase: boolean;

  duration: { years: number; months: number; days: number; totalDays: number } | null;

  annualEntitlementDays: number; // 30 دائمًا (نسبة الاستحقاق القانونية)
  accruedLeaveDays: number | null; // الرصيد المستحق حتى اليوم من تاريخ التعيين (يحتاج تاريخ التعيين)
  usedLeaveDays: number; // الأيام المستخدمة (معروف دائمًا)
  remainingLeaveDays: number | null; // الأيام المتبقية = المستحق − المستخدم

  dailyWage: number | null; // يحتاج الأجر المعتمد
  leaveAllowanceDays: number | null; // الأيام المستحقة للصرف = المتبقية
  leaveAllowanceValue: number | null; // القيمة النقدية لبدل الإجازة

  gratuity: GratuityBreakdown | null; // يحتاج تاريخ التعيين + الأجر المعتمد

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

/** نسبة مكافأة الاستقالة وفق سنوات الخدمة (المادة 53، عقد غير محدد المدة). */
function resolveResignationFraction(serviceYears: number): number {
  if (serviceYears < 3) return RESIGNATION_FRACTION_UNDER_3_YEARS;
  if (serviceYears < 5) return RESIGNATION_FRACTION_3_TO_5_YEARS;
  if (serviceYears < 10) return RESIGNATION_FRACTION_5_TO_10_YEARS;
  return RESIGNATION_FRACTION_10_PLUS_YEARS;
}

/**
 * يحسب مكافأة نهاية الخدمة وفق المادة 51 (عامل بأجر شهري) مع سقف 18 شهرًا، ويُرفق
 * معه مباشرةً السيناريو المخفَّض وفق نسبة الاستقالة (المادة 53) — كلاهما من نفس المدخلات
 * دون افتراض أحدهما ضمنيًا (انظر ملاحظة الرأس أعلاه).
 */
function computeGratuity(serviceYears: number, monthlyWageBase: number): GratuityBreakdown {
  const dailyWage = monthlyWageBase / DAILY_WAGE_DIVISOR;

  const firstTierYears = Math.min(serviceYears, GRATUITY_FIRST_TIER_YEARS);
  const secondTierYears = Math.max(0, serviceYears - GRATUITY_FIRST_TIER_YEARS);

  const firstTierAmount = GRATUITY_FIRST_TIER_DAYS * dailyWage * firstTierYears;
  // الشريحة الثانية «أجر شهر كامل» عن كل سنة (المادة 51) — تُحسب من الأجر الشهري
  // مباشرةً لتبقى شهرًا كاملًا بالضبط، بمعزل عن قاسم الأجر اليومي (26) في الشريحة الأولى.
  const secondTierAmount = monthlyWageBase * secondTierYears;

  const rawTotal = firstTierAmount + secondTierAmount;
  const capAmount = GRATUITY_CAP_MONTHS * monthlyWageBase;
  const capApplied = rawTotal > capAmount;
  const total = capApplied ? capAmount : rawTotal;

  const resignationFraction = resolveResignationFraction(serviceYears);
  const resignationAmount = total * resignationFraction;

  return {
    serviceYears: round2(serviceYears),
    approvedWage: round3(monthlyWageBase),
    dailyWage: round3(dailyWage),
    firstTierYears: round2(firstTierYears),
    firstTierAmount: round3(firstTierAmount),
    secondTierYears: round2(secondTierYears),
    secondTierAmount: round3(secondTierAmount),
    rawTotal: round3(rawTotal),
    capAmount: round3(capAmount),
    capApplied,
    total: round3(total),
    resignationFraction,
    resignationAmount: round3(resignationAmount),
  };
}

/**
 * الحاسبة الرئيسية النقيّة. تُرجع كل القيم المطلوبة للتبويب أو null للقيمة التي تعتمد
 * على بيانات غير مكتملة (بلا تخمين) — والواجهة تعرض حينها «—» + سبب النقص.
 */
export function calculateEntitlements(input: EntitlementInput): EntitlementResult {
  const hasHireDate = input.hireDate instanceof Date && !Number.isNaN(input.hireDate.getTime());
  const hasWageBase = Number.isFinite(input.monthlyWageBase) && input.monthlyWageBase > 0;
  const usedLeaveDays = round2(Math.max(0, input.usedAnnualLeaveDays || 0));

  const duration = hasHireDate ? serviceDuration(input.hireDate as Date, input.asOf) : null;
  const serviceYears = duration ? duration.totalDays / DAYS_PER_YEAR : null;

  // رصيد الإجازة يتراكم دومًا من تاريخ التعيين — لا خط أساس بديل (المادتان 73/74).
  const accruedLeaveDays =
    duration !== null ? round2(ANNUAL_LEAVE_DAYS_PER_YEAR * (duration.totalDays / DAYS_PER_YEAR)) : null;
  const remainingLeaveDays = accruedLeaveDays !== null ? round2(Math.max(0, accruedLeaveDays - usedLeaveDays)) : null;

  // قيمة يومية خام واحدة (غير مقرَّبة) يُشتق منها كل من dailyWage المعروض وبدل الإجازة —
  // لا حساب مكرر للقاسم (DAILY_WAGE_DIVISOR) في أكثر من موضع.
  const rawDailyWage = hasWageBase ? input.monthlyWageBase / DAILY_WAGE_DIVISOR : null;
  const dailyWage = rawDailyWage !== null ? round3(rawDailyWage) : null;

  const leaveAllowanceDays = remainingLeaveDays;
  const leaveAllowanceValue =
    remainingLeaveDays !== null && rawDailyWage !== null ? round3(remainingLeaveDays * rawDailyWage) : null;

  const gratuity =
    serviceYears !== null && hasWageBase ? computeGratuity(serviceYears, input.monthlyWageBase) : null;

  // أثّر افتراضٌ قانوني (الأجر المعتمد/قاسم الأجر اليومي) في قيمة محتسَبة فعليًا متى
  // ما احتُسبت المكافأة أو بدل الإجازة النقدي.
  const assumptionsApplied = gratuity !== null || leaveAllowanceValue !== null;

  return {
    hasHireDate,
    hasWageBase,
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

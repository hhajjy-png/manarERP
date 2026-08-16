/**
 * احتساب سطور العمل الإضافي + فحص الحدود القانونية.
 *
 * دوال خالصة (pure): لا Prisma، ولا تاريخ نظام، ولا حالة. كل مدخلاتها معطاة، ونتيجتها
 * تُشتقّ من `legal/kuwaitLabourLaw.ts` وحده.
 *
 * ═══ الحدود: تنبيه لا حجب ═══
 * تجاوز الحد القانوني **يُعرض ولا يُخفى ولا يُقصّ** (المتطلب ٨): الساعات تبقى كما أدخلها
 * المستخدم، والمبلغ يُحتسب عليها كاملة، ويرافقها تحذير يذكر الحد المسموح والفرق. قصّ
 * الساعات صامتًا كان سيسرق أجرًا فعليًا؛ وإخفاء التجاوز كان سيطمس مخالفة قانونية
 * ارتكبها التشغيل لا النظام.
 */
import {
  DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING,
  OVERTIME_LIMITS,
  overtimeRule,
  type OvertimeType,
} from '../legal/kuwaitLabourLaw';
import {
  amountFromEffectiveRate,
  resolveEffectiveOvertimeRate,
  type OvertimeRateSource,
} from './effectiveOvertimeRate';
import { normalizeHours, sumMoney } from './rounding';

/** طريقة الوصول إلى عدد الساعات — بيانات تدقيق داخلية، لا تظهر في الكشف الرسمي. */
export type OvertimeCalculationMethod = 'MANUAL_HOURS' | 'REVERSE_FROM_AMOUNT';

/** مدخل سطر عمل إضافي واحد كما يصل من الواجهة. */
export interface OvertimeLineInput {
  overtimeType: OvertimeType;
  hours: number;
  calculationMethod?: OvertimeCalculationMethod;
  /** المبلغ المستهدف الذي اشتُقّت منه الساعات (الحسبة العكسية فقط). */
  reverseTargetAmount?: number | null;
  /** الساعات الخام قبل التقريب لأعلى (الحسبة العكسية فقط). */
  rawHoursBeforeCeiling?: number | null;
  notes?: string | null;
}

/** سطر عمل إضافي محتسَب بالكامل. */
export interface ComputedOvertimeLine {
  overtimeType: OvertimeType;
  labelAr: string;
  hours: number;
  /** أجر الساعة العادي القانوني — يبقى كما كان، ولم يعد وحده مَن يحدّد المبلغ. */
  hourlyRate: number;
  /** المعامل القانوني للنوع. */
  multiplier: number;
  /** الحد الأدنى القانوني لساعة هذا النوع = `hourlyRate × multiplier`. */
  statutoryMinimumRate: number;
  /** سعر الشركة الأساسي المعتمد لهذا الشهر. `null` = حسبة ما قبل سياسة الشركة. */
  companyBaseRate: number | null;
  /** سعر الشركة المشتقّ لهذا النوع. `null` = لا سياسة شركة. */
  companyDerivedRate: number | null;
  /** السعر المستخدم فعلًا = `max(الحد القانوني، سعر الشركة)`. */
  effectiveRate: number;
  /** `COMPANY_POLICY` أو `STATUTORY_FLOOR` — يُطبع في التقرير التفصيلي وحده. */
  rateSource: OvertimeRateSource;
  amount: number;
  calculationMethod: OvertimeCalculationMethod;
  reverseTargetAmount: number | null;
  rawHoursBeforeCeiling: number | null;
  legalReference: string;
  /** هل يستحق يوم راحة بديلًا (المادة ٦٦)؟ التزام غير نقدي يُذكر في التقرير التفصيلي. */
  compensatoryRestDay: boolean;
  notes: string | null;
  sortOrder: number;
}

export type CompensationWarningCode =
  | 'OVERTIME_ANNUAL_LIMIT_EXCEEDED'
  | 'OVERTIME_MONTHLY_DERIVED_CEILING_EXCEEDED'
  | 'COMPENSATORY_REST_DAY_DUE'
  | 'OVERTIME_DAILY_LIMITS_NOT_VERIFIABLE'
  /** سعر الشركة المختار دون الحد القانوني — استُعمل القانون بدله. */
  | 'COMPANY_OVERTIME_RATE_BELOW_STATUTORY';

export interface CompensationWarning {
  code: CompensationWarningCode;
  /** نصّ عربي جاهز للعرض — الواجهة لا تركّب نصوص تحذير بنفسها. */
  messageAr: string;
  /**
   * أساس التنبيه — تمييز صريح بين ثلاث حالات لا يجوز خلطها:
   *   `STATUTORY` — حدّ منصوص عليه في القانون **وفحصه النظام فعلًا**.
   *   `DERIVED`   — سقف مُشتَقّ حسابيًا لا نصّ له، إرشادي بحت.
   *   `DISCLOSURE`— إفصاح عن حدٍّ منصوص عليه **لم يفحصه النظام** ولا يستطيع.
   */
  basis: 'STATUTORY' | 'DERIVED' | 'DISCLOSURE';
  limit?: number;
  actual?: number;
  excess?: number;
}

/** خيارات حساب السطر — بديل عن معاملات موضعية تتكاثر مع كل حقل جديد. */
export interface OvertimeLineOptions {
  /** سعر الشركة الأساسي للشهر. غيابه أو `null` = حسبة بالحد القانوني وحده. */
  companyOvertimeBaseRate?: number | null;
  sortOrder?: number;
}

/**
 * حساب سطر واحد. `hourlyRate` يأتي مقرَّبًا من `computeHourlyRate`.
 *
 * السعر الفعلي يُحسم في `resolveEffectiveOvertimeRate` — وهي الجهة الوحيدة التي تفرض
 * `max(القانون، سعر الشركة)`. هذا الملف لا يقارن سعرين بنفسه ولا يعرف أيّهما أعلى.
 */
export function computeOvertimeLine(
  input: OvertimeLineInput,
  hourlyRate: number,
  options: OvertimeLineOptions = {},
): ComputedOvertimeLine {
  const rule = overtimeRule(input.overtimeType);
  const hours = normalizeHours(input.hours);
  if (hours < 0) throw new Error('عدد ساعات العمل الإضافي لا يمكن أن يكون سالبًا');

  const rate = resolveEffectiveOvertimeRate(rule.type, hourlyRate, options.companyOvertimeBaseRate ?? null);

  return {
    overtimeType: rule.type,
    labelAr: rule.labelAr,
    hours,
    hourlyRate,
    multiplier: rule.multiplier,
    statutoryMinimumRate: rate.statutoryMinimumRate,
    companyBaseRate: rate.companyBaseRate,
    companyDerivedRate: rate.companyDerivedRate,
    effectiveRate: rate.effectiveRate,
    rateSource: rate.source,
    // تقريب **واحد** في النهاية. صيغة الضرب نفسها تختلف بين سجلّ ما قبل الحزمة وسجلّ
    // يحمل سعر شركة — والسبب موثَّق في `effectiveOvertimeRate.ts`.
    amount: amountFromEffectiveRate(hours, rate),
    calculationMethod: input.calculationMethod ?? 'MANUAL_HOURS',
    reverseTargetAmount: input.reverseTargetAmount ?? null,
    rawHoursBeforeCeiling: input.rawHoursBeforeCeiling ?? null,
    legalReference: rule.legalReference,
    compensatoryRestDay: rule.compensatoryRestDay,
    notes: input.notes ?? null,
    sortOrder: options.sortOrder ?? 0,
  };
}

/** حساب كل السطور مرتَّبة، بسعر شركة واحد يسري على الشهر كله. */
export function computeOvertimeLines(
  inputs: readonly OvertimeLineInput[],
  hourlyRate: number,
  companyOvertimeBaseRate: number | null = null,
): ComputedOvertimeLine[] {
  return inputs.map((line, index) =>
    computeOvertimeLine(line, hourlyRate, { companyOvertimeBaseRate, sortOrder: index }),
  );
}

/** إجمالي مبالغ العمل الإضافي — مجموع واحد مقرَّب مرة واحدة. */
export function totalOvertimeAmount(lines: readonly ComputedOvertimeLine[]): number {
  return sumMoney(lines.map((l) => l.amount));
}

/** مجموع ساعات نوع بعينه. */
export function totalHoursOfType(lines: readonly ComputedOvertimeLine[], type: OvertimeType): number {
  return normalizeHours(lines.filter((l) => l.overtimeType === type).reduce((s, l) => s + l.hours, 0));
}

/**
 * فحص الحدود القانونية.
 *
 * @param lines سطور الشهر الجاري بعد الاحتساب.
 * @param priorRegularHoursThisYear مجموع ساعات العمل الإضافي **العادي** المسجّلة في
 *        أشهر السنة نفسها **عدا** هذا الشهر. تمريرها هو ما يجعل فحص «١٨٠ ساعة سنويًا»
 *        فحصًا حقيقيًا لا شهريًا مقنّعًا.
 *
 * ملاحظة عن نطاق الفحص — **يُقال صراحةً ولا يُلمَّح**: الحدّ الوحيد المفحوص فعلًا هو
 * «١٨٠ ساعة سنويًا». أما «ساعتان في اليوم» و«٣ أيام أسبوعيًا» و«٩٠ يومًا سنويًا» فلا
 * سبيل إلى فحصها هنا (لا سجل حضور يومي)، فتُفصح عنها الوحدة بوسم `DISCLOSURE` بدل أن
 * تصمت عنها أو تدّعي التحقّق منها. ويُصدَر إضافةً تنبيهٌ على سقف شهري **مُشتَقّ**
 * موسوم `DERIVED` — لا يمنع الحفظ ولا يُقدَّم بوصفه نصًّا قانونيًا.
 */
export function checkOvertimeLimits(
  lines: readonly ComputedOvertimeLine[],
  priorRegularHoursThisYear = 0,
): CompensationWarning[] {
  const warnings: CompensationWarning[] = [];
  const monthRegular = totalHoursOfType(lines, 'REGULAR');
  const annualLimit = OVERTIME_LIMITS.maxHoursPerYear.value;

  const yearRegular = normalizeHours(monthRegular + Math.max(0, priorRegularHoursThisYear));
  if (yearRegular > annualLimit) {
    const excess = normalizeHours(yearRegular - annualLimit);
    warnings.push({
      code: 'OVERTIME_ANNUAL_LIMIT_EXCEEDED',
      basis: 'STATUTORY',
      limit: annualLimit,
      actual: yearRegular,
      excess,
      messageAr:
        `تجاوز الحد السنوي للعمل الإضافي: الحد القانوني ${annualLimit} ساعة في السنة ` +
        `(المادة ٦٦)، والمسجَّل لهذه السنة ${yearRegular} ساعة — بزيادة ${excess} ساعة.`,
    });
  }

  if (monthRegular > DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING) {
    const excess = normalizeHours(monthRegular - DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING);
    warnings.push({
      code: 'OVERTIME_MONTHLY_DERIVED_CEILING_EXCEEDED',
      basis: 'DERIVED',
      limit: DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING,
      actual: monthRegular,
      excess,
      messageAr:
        `ساعات العمل الإضافي العادي هذا الشهر (${monthRegular} ساعة) تتجاوز السقف الشهري ` +
        `المُشتَقّ حسابيًا من حدَّي المادة ٦٦ (ساعتان يوميًا × ٣ أيام أسبوعيًا ≈ ` +
        `${DERIVED_MONTHLY_REGULAR_OVERTIME_CEILING} ساعة) بمقدار ${excess} ساعة. ` +
        '**هذا سقف مُشتَقّ استرشادي لا نصّ قانوني**، ولا يمنع الحفظ — يلزم التحقّق من ' +
        'التوزيع اليومي الفعلي خارج النظام.',
    });
  }

  const restDayHours = totalHoursOfType(lines, 'WEEKLY_REST');
  const holidayHours = totalHoursOfType(lines, 'OFFICIAL_HOLIDAY');
  if (restDayHours > 0 || holidayHours > 0) {
    // المادة تُذكر بحسب النوع المسجَّل فعلًا: ٦٧ للراحة الأسبوعية، ٦٨ للعطلة الرسمية.
    const articles = [restDayHours > 0 ? 'المادة ٦٧' : null, holidayHours > 0 ? 'المادة ٦٨' : null]
      .filter(Boolean)
      .join(' و');
    warnings.push({
      code: 'COMPENSATORY_REST_DAY_DUE',
      basis: 'STATUTORY',
      messageAr:
        'العمل في يوم الراحة الأسبوعية أو في عطلة رسمية يستوجب — إضافةً إلى الأجر — ' +
        `منح العامل يوم راحة بديلًا (${articles}). هذا التزام غير نقدي لا تعالجه هذه الوحدة.`,
    });
  }

  // إفصاح دائم عند وجود أي عمل إضافي: النظام لا يفحص الحدود اليومية/الأسبوعية، ولا
  // يجوز أن يُفهم صمتُه عنها على أنها مستوفاة. يُعرض مرة واحدة، لا لكل سطر.
  if (lines.some((l) => l.hours > 0)) {
    const { maxHoursPerDay, maxDaysPerWeek, maxDaysPerYear } = OVERTIME_LIMITS;
    warnings.push({
      code: 'OVERTIME_DAILY_LIMITS_NOT_VERIFIABLE',
      basis: 'DISCLOSURE',
      messageAr:
        `تنصّ المادة ٦٦ أيضًا على حدود لا يفحصها هذا النظام لعدم وجود سجل حضور يومي: ` +
        `${maxHoursPerDay.value} ساعة في اليوم الواحد، و${maxDaysPerWeek.value} أيام في الأسبوع، ` +
        `و${maxDaysPerYear.value} يومًا في السنة. التحقّق منها مسؤولية تشغيلية خارج هذه الوحدة.`,
    });
  }

  return warnings;
}

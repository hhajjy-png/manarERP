/**
 * تجميع حسبة الشهر كاملة — **المصدر الوحيد** لكل رقم في الوحدة.
 *
 * دالة واحدة خالصة تأخذ كل مدخلات الشهر وتُعيد كل مخرجاته. لا الخدمة ولا الواجهة ولا
 * قالب الطباعة يعيد جمع أي إجمالي بنفسه (المتطلب ١٥): كلٌّ منها يقرأ من هذه النتيجة.
 * تكرار المعادلة في مكوّن React كان سيسمح بأن يُظهر الكشف رقمًا ويُخزّن الجدول آخر.
 *
 * المعادلة النهائية:
 *   الراتب الأساسي + الإضافي + الاستحقاقات الأخرى − الاستقطاعات = صافي المستحق
 */
import { LEGAL_RULES_VERSION, OVERTIME_TYPES, type OvertimeType } from '../legal/kuwaitLabourLaw';
import { normalizeCompanyOvertimeBaseRate } from '../policy/companyOvertimePolicy';
import { resolveEffectiveOvertimeRate, type EffectiveOvertimeRate } from './effectiveOvertimeRate';
import { computeHourlyRate } from './hourlyRate';
import {
  checkOvertimeLimits,
  computeOvertimeLines,
  totalOvertimeAmount,
  type CompensationWarning,
  type ComputedOvertimeLine,
  type OvertimeLineInput,
} from './overtimeCalculator';
import { roundMoney, sumMoney } from './rounding';

/** أنواع الاستحقاقات الأخرى — تصنيف داخلي لهذه الوحدة، لا علاقة له ببدلات الرواتب. */
export const EARNING_TYPES = [
  'BONUS',
  'GRANT',
  'INCENTIVE',
  'ALLOWANCE',
  'EXPENSE_REIMBURSEMENT',
  'CUSTOM',
] as const;
export type EarningType = (typeof EARNING_TYPES)[number];

/**
 * أنواع الاستقطاعات — تصنيف داخلي لهذه الوحدة، لا علاقة له بخصومات الرواتب.
 *
 * `DEBT_REPAYMENT` نوع خاص: سطرٌ من هذا النوع **يجب** أن يحمل `debtId`، وهو ما يربطه
 * بسجل المديونيات ويولّد حركة الدفتر المقابلة. الربط بالمعرّف لا بنصّ `label`، فتغيير
 * بيان المديونية لا يقطع الصلة (المتطلب ٧).
 */
export const DEDUCTION_TYPES = ['ABSENCE', 'ADVANCE', 'PENALTY', 'DISCOUNT', 'CUSTOM', 'DEBT_REPAYMENT'] as const;
export type DeductionType = (typeof DEDUCTION_TYPES)[number];

export interface EarningLineInput {
  type: EarningType;
  label: string;
  amount: number;
  entryDate?: Date | string | null;
  reason?: string | null;
  notes?: string | null;
  recurring?: boolean;
  /**
   * تفصيل الساعة — **شرحٌ لمبلغ سطر مالي، لا واقعة عمل**.
   *
   * `hours × rate = amount` بدقّة الدينار الثلاثية، ويُفحص هنا لا في الواجهة فيسري
   * على أي مستدعٍ. كلاهما معًا أو لا أحدهما: بندٌ مالي بحت (مصروف، مكافأة) لا ساعة له،
   * وساعةٌ بلا سعر لا تفسّر مبلغًا.
   *
   * هذان الرقمان **لا يدخلان محرّك الالتزام القانوني إطلاقًا**. مصدر الحقيقة لساعات
   * العمل الإضافي يبقى `OvertimeDayEntry` بتواريخه وحده؛ وسطرٌ هنا بلا تاريخ لا يُحتسب
   * في حدود المادة ٦٦ ولا يصنع «التزامًا» من أرقام لا يُعرف متى وقعت.
   */
  hours?: number | null;
  rate?: number | null;
}

export interface DeductionLineInput {
  type: DeductionType;
  label: string;
  amount: number;
  notes?: string | null;
  /** سجل المديونية الذي يسدّده هذا السطر — إلزامي لنوع `DEBT_REPAYMENT` وحده. */
  debtId?: number | null;
}

export interface ComputedEarningLine extends Omit<EarningLineInput, 'entryDate' | 'hours' | 'rate'> {
  amount: number;
  entryDate: Date | null;
  reason: string | null;
  notes: string | null;
  recurring: boolean;
  sortOrder: number;
  hours: number | null;
  rate: number | null;
}

export interface ComputedDeductionLine extends DeductionLineInput {
  amount: number;
  notes: string | null;
  debtId: number | null;
  sortOrder: number;
}

export interface CompensationInput {
  /** الراتب الأساسي **من اللقطة** — لا من ملف الموظف الحيّ. */
  basicSalary: number;
  overtime: readonly OvertimeLineInput[];
  earnings: readonly EarningLineInput[];
  deductions: readonly DeductionLineInput[];
  /**
   * ساعات الإضافي العادي المسجّلة في بقية أشهر السنة — تجعل فحص الحد السنوي حقيقيًا.
   * تُمرَّر من الخدمة بعد استعلام واحد؛ المحرّك نفسه لا يلمس قاعدة البيانات.
   */
  priorRegularOvertimeHoursThisYear?: number;
  /**
   * أجر الساعة المحفوظ في اللقطة. يُمرَّر عند **إعادة** احتساب سجل قائم كي يبقى الكشف
   * التاريخي مشتقًّا من نفس الرقم حتى لو تغيّر القاسم القانوني في إصدار لاحق للمحرّك.
   * يُغفَل عند الإنشاء فيُشتقّ من الراتب.
   */
  hourlyRateOverride?: number | null;
  /**
   * سعر ساعة الإضافي المعتمد من الشركة لهذا الشهر — **لقطة الشهر لا الافتراضي الحيّ**.
   *
   * الخدمة هي من تحسم أي رقم يصل هنا (لقطة السجل المحفوظ، أو اختيار المستخدم، أو
   * افتراضي الشركة عند الإنشاء)؛ والمحرّك لا يقرأ إعدادًا ولا يعرف أن هناك «افتراضيًا»
   * أصلًا. `null` أو الغياب = حسبة بالحد القانوني وحده (سجلّ ما قبل الحزمة).
   */
  companyOvertimeBaseRate?: number | null;
}

export interface CompensationResult {
  legalRulesVersion: string;
  /** إصدار سياسة الشركة المطبَّقة، أو `null` إن لم يكن للشهر سعر شركة. */
  companyOvertimePolicyVersion: string | null;
  basicSalary: number;
  hourlyRate: number;
  /** السعر الأساسي المعتمد للشهر — `null` = بالحد القانوني وحده. */
  companyOvertimeBaseRate: number | null;
  /**
   * جدول الأسعار الثلاثة كاملًا (قانوني · شركة · فعلي) — يُحتسب حتى لو لم يوجد سطر
   * إضافي واحد، فتستطيع الواجهة أن تعرض أثر السعر المختار قبل إدخال أي ساعة، بلا أن
   * تكرّر معادلة `max` في React.
   */
  overtimeRates: Record<OvertimeType, EffectiveOvertimeRate>;
  overtimeLines: ComputedOvertimeLine[];
  earningLines: ComputedEarningLine[];
  deductionLines: ComputedDeductionLine[];
  totalOvertimeAmount: number;
  totalOtherEarnings: number;
  /** الراتب الأساسي + الإضافي + الاستحقاقات الأخرى. */
  grossEntitlements: number;
  totalDeductions: number;
  /** إجمالي الاستحقاقات − إجمالي الاستقطاعات. قد يكون سالبًا إذا فاقت الاستقطاعات. */
  netAmount: number;
  warnings: CompensationWarning[];
}

/** يرفض المبالغ غير الصالحة صراحةً بدل تحويلها بصمت إلى صفر. */
function assertAmount(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} ليس قيمة نقدية صالحة`);
  if (value < 0) throw new Error(`${label} لا يمكن أن يكون سالبًا`);
  return roundMoney(value);
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * تفصيل الساعة لسطر استحقاق — يُفحص هنا فيسري على كل مستدعٍ (واجهة · API · سكربت).
 *
 * ثلاث قواعد لا رابعة لها:
 *   · كلاهما معًا أو لا أحدهما. ساعةٌ بلا سعر لا تفسّر مبلغًا، وسعرٌ بلا ساعة لا يُضرب
 *     في شيء — وأيّهما وحده كان سيُعرض في الجدول عمودًا نصفَ ممتلئ لا يُقرأ.
 *   · موجبان. صفر ساعة ليس تفصيلًا بل غيابه، وتخزينه كان سيُظهر «٠ × ٤٫٠٠٠ = ٢٨».
 *   · `hours × rate = amount` بدقّة الدينار الثلاثية. بدون هذا القيد يستطيع السطر أن
 *     يعرض حسبةً لا تُنتج مبلغه، وهي أسوأ من ألّا يعرض شيئًا: رقمان يكذّبان الثالث في
 *     مستند يُطبع ويُوقَّع.
 *
 * التقريب على الطرفين لا على أحدهما: `roundMoney` هي سياسة النقود الوحيدة في الوحدة،
 * فمقارنة حاصل الضرب الخام بمبلغٍ مقرَّب كانت سترفض `٣ × ٤٫٣٣٥` رفضًا كاذبًا.
 */
function resolveHourlyDetail(e: EarningLineInput): { hours: number | null; rate: number | null } {
  const hasHours = e.hours !== null && e.hours !== undefined;
  const hasRate = e.rate !== null && e.rate !== undefined;
  if (!hasHours && !hasRate) return { hours: null, rate: null };
  if (hasHours !== hasRate) {
    throw new Error(`البند «${e.label}»: الساعات وسعر الساعة يُدخَلان معًا أو يُتركان معًا فارغين`);
  }

  const hours = e.hours as number;
  const rate = e.rate as number;
  if (!Number.isFinite(hours) || hours <= 0) throw new Error(`البند «${e.label}»: عدد الساعات يجب أن يكون أكبر من صفر`);
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`البند «${e.label}»: سعر الساعة يجب أن يكون أكبر من صفر`);

  const expected = roundMoney(hours * rate);
  if (expected !== roundMoney(e.amount)) {
    throw new Error(
      `البند «${e.label}»: ${hours} × ${rate.toFixed(3)} = ${expected.toFixed(3)} ولا يساوي المبلغ ${roundMoney(e.amount).toFixed(3)}`,
    );
  }
  return { hours, rate };
}

/** الحسبة الكاملة. خالصة، حتمية، وقابلة للاختبار بلا واجهة ولا قاعدة بيانات. */
export function computeCompensation(input: CompensationInput): CompensationResult {
  const basicSalary = assertAmount(input.basicSalary, 'الراتب الأساسي');
  if (basicSalary <= 0) throw new Error('الراتب الأساسي يجب أن يكون أكبر من صفر');

  const hourlyRate =
    input.hourlyRateOverride != null && Number.isFinite(input.hourlyRateOverride) && input.hourlyRateOverride > 0
      ? roundMoney(input.hourlyRateOverride)
      : computeHourlyRate(basicSalary);

  // التحقّق من سعر الشركة يقع **هنا** لا في الواجهة ولا في Zod وحده: أي مستدعٍ (واجهة،
  // نسخ شهر، استدعاء API مباشر) يمرّ من هذه النقطة، فلا يدخل سعر تالف إلى أي حسبة.
  const companyOvertimeBaseRate =
    input.companyOvertimeBaseRate == null ? null : normalizeCompanyOvertimeBaseRate(input.companyOvertimeBaseRate);

  const overtimeRates = {} as Record<OvertimeType, EffectiveOvertimeRate>;
  for (const type of OVERTIME_TYPES) {
    overtimeRates[type] = resolveEffectiveOvertimeRate(type, hourlyRate, companyOvertimeBaseRate);
  }

  const overtimeLines = computeOvertimeLines(input.overtime, hourlyRate, companyOvertimeBaseRate);

  const earningLines: ComputedEarningLine[] = input.earnings.map((e, index) => ({
    type: e.type,
    label: e.label,
    amount: assertAmount(e.amount, `مبلغ البند «${e.label}»`),
    entryDate: toDate(e.entryDate),
    reason: e.reason ?? null,
    notes: e.notes ?? null,
    recurring: e.recurring ?? false,
    sortOrder: index,
    ...resolveHourlyDetail(e),
  }));

  const deductionLines: ComputedDeductionLine[] = input.deductions.map((d, index) => {
    // سطر سداد مديونية بلا مرجع = استقطاع لا يعرف ممّاذا يُسدَّد. يُرفض هنا لا في
    // الواجهة، فلا يستطيع أي مستدعٍ (واجهة أو API مباشر) أن يُنشئ سطرًا معلّقًا.
    if (d.type === 'DEBT_REPAYMENT' && (d.debtId == null || !Number.isInteger(d.debtId))) {
      throw new Error(`سطر «${d.label}» من نوع سداد مديونية بلا مرجع إلى سجل المديونية`);
    }
    if (d.type !== 'DEBT_REPAYMENT' && d.debtId != null) {
      throw new Error(`سطر «${d.label}» يشير إلى مديونية لكنّ نوعه ليس سداد مديونية`);
    }
    return {
      type: d.type,
      label: d.label,
      amount: assertAmount(d.amount, `مبلغ الاستقطاع «${d.label}»`),
      notes: d.notes ?? null,
      debtId: d.debtId ?? null,
      sortOrder: index,
    };
  });

  const overtimeTotal = totalOvertimeAmount(overtimeLines);
  const otherEarnings = sumMoney(earningLines.map((l) => l.amount));
  const deductionsTotal = sumMoney(deductionLines.map((l) => l.amount));
  const gross = sumMoney([basicSalary, overtimeTotal, otherEarnings]);

  return {
    legalRulesVersion: LEGAL_RULES_VERSION,
    companyOvertimePolicyVersion: overtimeRates.REGULAR.policyVersion,
    basicSalary,
    hourlyRate,
    companyOvertimeBaseRate,
    overtimeRates,
    overtimeLines,
    earningLines,
    deductionLines,
    totalOvertimeAmount: overtimeTotal,
    totalOtherEarnings: otherEarnings,
    grossEntitlements: gross,
    totalDeductions: deductionsTotal,
    netAmount: roundMoney(gross - deductionsTotal),
    warnings: [
      ...statutoryFloorWarnings(overtimeRates),
      ...checkOvertimeLimits(overtimeLines, input.priorRegularOvertimeHoursThisYear ?? 0),
    ],
  };
}

/**
 * تحذير «سعر الشركة دون الحد القانوني» — واحد لكل نوع متأثّر.
 *
 * يُصدَر من **جدول الأسعار** لا من السطور، فيظهر للمستخدم لحظة اختياره سعرًا منخفضًا
 * وقبل أن يُدخل ساعة واحدة. الصياغة تقول ما جرى فعلًا لا ما «قد» يجري: النظام **استعمل**
 * السعر القانوني الأعلى بالفعل، ولا يوجد أي مسار يدفع أقل منه.
 */
function statutoryFloorWarnings(
  rates: Readonly<Record<OvertimeType, EffectiveOvertimeRate>>,
): CompensationWarning[] {
  return OVERTIME_TYPES.filter((type) => rates[type].companyBelowStatutory).map((type) => {
    const r = rates[type];
    return {
      code: 'COMPANY_OVERTIME_RATE_BELOW_STATUTORY' as const,
      basis: 'STATUTORY' as const,
      limit: r.statutoryMinimumRate,
      actual: r.companyDerivedRate ?? 0,
      messageAr:
        `سعر الشركة المحدَّد لـ«${OVERTIME_TYPE_LABELS[type]}» (${r.companyDerivedRate?.toFixed(3)} د.ك للساعة) ` +
        `أقل من الحد الأدنى القانوني (${r.statutoryMinimumRate.toFixed(3)} د.ك للساعة)، ` +
        `لذلك استخدم النظام السعر القانوني الأعلى. لا يُصرف للموظف أقلّ من استحقاقه القانوني في أي حال.`,
    };
  });
}

/** تسميات مختصرة للأنواع داخل نصّ التحذير — لا مرجع قانوني هنا، فذلك شأن `legal/`. */
const OVERTIME_TYPE_LABELS: Readonly<Record<OvertimeType, string>> = {
  REGULAR: 'العمل الإضافي العادي',
  WEEKLY_REST: 'العمل في يوم الراحة الأسبوعية',
  OFFICIAL_HOLIDAY: 'العمل في عطلة رسمية',
};

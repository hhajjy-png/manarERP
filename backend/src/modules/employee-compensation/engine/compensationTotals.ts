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
import { LEGAL_RULES_VERSION } from '../legal/kuwaitLabourLaw';
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
}

export interface DeductionLineInput {
  type: DeductionType;
  label: string;
  amount: number;
  notes?: string | null;
  /** سجل المديونية الذي يسدّده هذا السطر — إلزامي لنوع `DEBT_REPAYMENT` وحده. */
  debtId?: number | null;
}

export interface ComputedEarningLine extends Omit<EarningLineInput, 'entryDate'> {
  amount: number;
  entryDate: Date | null;
  reason: string | null;
  notes: string | null;
  recurring: boolean;
  sortOrder: number;
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
}

export interface CompensationResult {
  legalRulesVersion: string;
  basicSalary: number;
  hourlyRate: number;
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

/** الحسبة الكاملة. خالصة، حتمية، وقابلة للاختبار بلا واجهة ولا قاعدة بيانات. */
export function computeCompensation(input: CompensationInput): CompensationResult {
  const basicSalary = assertAmount(input.basicSalary, 'الراتب الأساسي');
  if (basicSalary <= 0) throw new Error('الراتب الأساسي يجب أن يكون أكبر من صفر');

  const hourlyRate =
    input.hourlyRateOverride != null && Number.isFinite(input.hourlyRateOverride) && input.hourlyRateOverride > 0
      ? roundMoney(input.hourlyRateOverride)
      : computeHourlyRate(basicSalary);

  const overtimeLines = computeOvertimeLines(input.overtime, hourlyRate);

  const earningLines: ComputedEarningLine[] = input.earnings.map((e, index) => ({
    type: e.type,
    label: e.label,
    amount: assertAmount(e.amount, `مبلغ البند «${e.label}»`),
    entryDate: toDate(e.entryDate),
    reason: e.reason ?? null,
    notes: e.notes ?? null,
    recurring: e.recurring ?? false,
    sortOrder: index,
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
    basicSalary,
    hourlyRate,
    overtimeLines,
    earningLines,
    deductionLines,
    totalOvertimeAmount: overtimeTotal,
    totalOtherEarnings: otherEarnings,
    grossEntitlements: gross,
    totalDeductions: deductionsTotal,
    netAmount: roundMoney(gross - deductionsTotal),
    warnings: checkOvertimeLimits(overtimeLines, input.priorRegularOvertimeHoursThisYear ?? 0),
  };
}

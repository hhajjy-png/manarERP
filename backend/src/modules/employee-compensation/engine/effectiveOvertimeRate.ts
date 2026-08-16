/**
 * السعر الفعلي لساعة العمل الإضافي — **حيث يلتقي القانون بسياسة الشركة**.
 *
 * ═══ المعادلة ═══
 *   الراتب الأساسي → أجر الساعة القانوني → الحد الأدنى القانوني لكل نوع
 *   سعر الشركة الأساسي                   → سعر الشركة المشتقّ لكل نوع
 *   السعر الفعلي = max(الحد الأدنى القانوني، سعر الشركة المشتقّ)
 *
 * ═══ لماذا `max` وليس أيًّا كان اختيار المستخدم ═══
 * سعر الشركة **ميزة إضافية**، والقانون **أرضية**. لو سُمح لاختيار المستخدم أن ينزل تحت
 * الحد القانوني لصار النظام أداةَ صرفٍ ناقص بضغطة زر — وهو بالضبط ما يمنعه هذا الملف
 * بنيويًا لا بتحذير في الواجهة: لا يوجد مسار واحد ينتج سعرًا أقلّ من `statutoryMinimumRate`.
 *
 * ═══ الحسبات السابقة للحزمة ═══
 * `companyBaseRate === null` يعني حسبةً محفوظة **قبل** وجود سياسة الشركة. في هذه الحالة
 * وحدها يبقى الحساب على صيغته الأصلية `hours × hourlyRate × multiplier` بتقريب واحد في
 * النهاية — لا `hours × سعر مقرَّب`. الفرق بين الصيغتين أقلّ من نصف فلس في الساعة، لكنه
 * فرقٌ فعليّ في مبلغ محفوظ، وإعادةُ حفظ شهر قديم لا يجوز أن تحرّك مبلغه ولو فلسًا واحدًا
 * (المتطلب ٢٢). أما الحسبات التي تحمل سعر شركة فتُحسب كلها بالصيغة الواحدة
 * `hours × effectiveRate` — وهي الصيغة التي يطبعها التقرير ويستطيع القارئ إعادة اشتقاقها.
 */
import {
  companyOvertimeFactor,
  companyRateForType,
  COMPANY_OVERTIME_POLICY_VERSION,
} from '../policy/companyOvertimePolicy';
import { overtimeRule, type OvertimeType } from '../legal/kuwaitLabourLaw';
import { roundMoney } from './rounding';

/** من أين جاء السعر الفعلي — يُخزَّن ويُطبع في التقرير التفصيلي وحده. */
export type OvertimeRateSource =
  /** سعر الشركة كان أعلى من الحد القانوني (أو مساويًا له) فاعتُمد. */
  | 'COMPANY_POLICY'
  /** الحد القانوني كان أعلى — أو لا سياسة شركة أصلًا — فاعتُمد القانون. */
  | 'STATUTORY_FLOOR';

export interface EffectiveOvertimeRate {
  overtimeType: OvertimeType;
  /** أجر الساعة العادي القانوني (الراتب ÷ ساعات الشهر) — أساس كل ما تحته. */
  statutoryHourlyRate: number;
  /** المعامل القانوني للنوع (١٫٢٥ / ١٫٥٠ / ٢٫٠٠). */
  statutoryMultiplier: number;
  /** الحد الأدنى القانوني لساعة هذا النوع — لا يجوز النزول عنه. */
  statutoryMinimumRate: number;
  /** السعر الأساسي الذي اختارته الشركة لهذا الشهر. `null` = لا سياسة شركة. */
  companyBaseRate: number | null;
  companyFactor: number | null;
  /** سعر الشركة المشتقّ لهذا النوع. `null` = لا سياسة شركة. */
  companyDerivedRate: number | null;
  /** السعر المستخدم فعلًا في ضرب الساعات. */
  effectiveRate: number;
  source: OvertimeRateSource;
  /** هل اضطرّ النظام إلى تجاهل سعر الشركة لأنه دون القانون؟ يغذّي التحذير الظاهر. */
  companyBelowStatutory: boolean;
  /** إصدار سياسة الشركة المطبَّقة. `null` = لا سياسة شركة. */
  policyVersion: string | null;
}

/**
 * يحسم السعر الفعلي لنوع واحد.
 *
 * @param hourlyRate أجر الساعة القانوني **المقرَّب** (`computeHourlyRate`).
 * @param companyBaseRate سعر الشركة الأساسي، أو `null` لحسبة ما قبل الحزمة.
 */
export function resolveEffectiveOvertimeRate(
  overtimeType: OvertimeType,
  hourlyRate: number,
  companyBaseRate: number | null,
): EffectiveOvertimeRate {
  const rule = overtimeRule(overtimeType);

  // يُرفض ما ليس عددًا وما كان سالبًا. أما الصفر فيُقبل عمدًا: راتبٌ ضئيل جدًّا يعطي أجر
  // ساعة يقرَّب إلى صفر، وحارسُ ذلك يعيش في `computeHourlyRate` (يرفض الراتب غير الموجب)
  // لا هنا. رميٌ إضافي هنا كان سيُسقط حسبةً بلا عمل إضافي أصلًا لمجرّد ضآلة الراتب.
  if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
    throw new Error(`أجر الساعة القانوني ليس قيمة صالحة: ${String(hourlyRate)}`);
  }

  const statutoryMinimumRate = roundMoney(hourlyRate * rule.multiplier);

  if (companyBaseRate == null) {
    return {
      overtimeType,
      statutoryHourlyRate: hourlyRate,
      statutoryMultiplier: rule.multiplier,
      statutoryMinimumRate,
      companyBaseRate: null,
      companyFactor: null,
      companyDerivedRate: null,
      effectiveRate: statutoryMinimumRate,
      source: 'STATUTORY_FLOOR',
      companyBelowStatutory: false,
      policyVersion: null,
    };
  }

  const companyDerivedRate = companyRateForType(companyBaseRate, overtimeType);
  const companyWins = companyDerivedRate >= statutoryMinimumRate;

  return {
    overtimeType,
    statutoryHourlyRate: hourlyRate,
    statutoryMultiplier: rule.multiplier,
    statutoryMinimumRate,
    companyBaseRate: roundMoney(companyBaseRate),
    companyFactor: companyOvertimeFactor(overtimeType),
    companyDerivedRate,
    // الأرضية القانونية تُفرض هنا — ولا مسار آخر يتجاوز هذا السطر.
    effectiveRate: companyWins ? companyDerivedRate : statutoryMinimumRate,
    source: companyWins ? 'COMPANY_POLICY' : 'STATUTORY_FLOOR',
    companyBelowStatutory: !companyWins,
    policyVersion: COMPANY_OVERTIME_POLICY_VERSION,
  };
}

/**
 * مبلغ السطر من الساعات والسعر المحسوم.
 *
 * فرعان لا ثالث لهما، وسبب انقسامهما موثَّق في رأس هذا الملف:
 *   · لا سياسة شركة (سجل ما قبل الحزمة) ⇒ الصيغة الأصلية بتقريب واحد نهائي.
 *   · سياسة شركة قائمة                  ⇒ `hours × effectiveRate` — نفس ما يطبعه التقرير.
 */
export function amountFromEffectiveRate(hours: number, rate: EffectiveOvertimeRate): number {
  return rate.companyBaseRate == null
    ? roundMoney(hours * rate.statutoryHourlyRate * rate.statutoryMultiplier)
    : roundMoney(hours * rate.effectiveRate);
}

/**
 * السعر الذي تُقسَم عليه الحسبة العكسية — **نظير `amountFromEffectiveRate` بالمقلوب**.
 *
 * لا بدّ أن يكون المقسوم عليه هو نفس ما سيُضرب لاحقًا، وإلا لأنتجت الحسبة العكسية عدد
 * ساعات لا يعطي المبلغ الذي وعدت به. لذلك ينقسم هنا الفرعان نفسهما لا فرعان آخران.
 */
export function rateForHoursDerivation(rate: EffectiveOvertimeRate): number {
  return rate.companyBaseRate == null
    ? rate.statutoryHourlyRate * rate.statutoryMultiplier
    : rate.effectiveRate;
}

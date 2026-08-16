/**
 * الحسبة العكسية — «احسب الساعات من مبلغ».
 *
 * ═══ الفكرة ═══
 * بدل إدخال الساعات، يُدخل المستخدم **مبلغًا مستهدفًا**، فيشتقّ المحرّك عدد الساعات
 * الإضافية المكافئة له وفق راتب الموظف ونوع الإضافي ومعامله القانوني، ثم **يرفع الناتج
 * إلى ساعة كاملة لصالح الموظف** (المتطلب ١٠).
 *
 * ═══ نتيجتها ليست نوعًا خاصًا من الأجر ═══
 * بعد التقريب تُعامَل الساعات **كأي ساعات مدخلة يدويًا حرفيًا**: نفس المعادلة، نفس
 * المعامل، نفس السطر. الحسبة العكسية **وسيلة إدخال** لا نوع احتساب. لذلك يُعاد حساب
 * المبلغ النهائي من الساعات المقرَّبة — ولا يُخزَّن المبلغ المستهدف بوصفه القيمة.
 *
 * ═══ وهي غير مرئية في الكشف الرسمي (المتطلب ١١) ═══
 * `targetAmount` و`rawHours` و`difference` بيانات **تدقيق داخلية**: يحملها التقرير
 * التفصيلي الداخلي وحده. الكشف الرسمي المختصر يعرض «عمل إضافي: ١١ ساعة — XX.XXX د.ك»
 * ولا شيء غير ذلك. فرض ذلك ليس مسؤولية هذا الملف بل مسؤولية بنّاء الكشف، لكنه مذكور
 * هنا لأن أي مستدعٍ جديد يجب أن يعرفه قبل أن يمرّر هذه الحقول إلى واجهة عرض.
 */
import { type OvertimeType } from '../legal/kuwaitLabourLaw';
import {
  amountFromEffectiveRate,
  rateForHoursDerivation,
  resolveEffectiveOvertimeRate,
  type OvertimeRateSource,
} from './effectiveOvertimeRate';
import { ceilHoursInFavourOfEmployee, normalizeHours, roundMoney } from './rounding';

export interface ReverseOvertimeInput {
  /** المبلغ المستهدف بالدينار الكويتي. */
  targetAmount: number;
  overtimeType: OvertimeType;
  /** أجر الساعة العادي المقرَّب (`computeHourlyRate`). */
  hourlyRate: number;
  /**
   * سعر الشركة الأساسي — الحسبة العكسية تشتقّ الساعات من **السعر الفعلي** للنوع
   * المختار (المتطلب ١٤)، لا من سعر واحد يسري على الأنواع كلها.
   */
  companyOvertimeBaseRate?: number | null;
}

export interface ReverseOvertimeResult {
  overtimeType: OvertimeType;
  targetAmount: number;
  hourlyRate: number;
  multiplier: number;
  /** الحد الأدنى القانوني لساعة هذا النوع. */
  statutoryMinimumRate: number;
  /** سعر الشركة المشتقّ للنوع، أو `null` إن لم تُمرَّر سياسة شركة. */
  companyDerivedRate: number | null;
  /** السعر المستخدم فعلًا في الاشتقاق وفي إعادة حساب المبلغ. */
  effectiveRate: number;
  rateSource: OvertimeRateSource;
  /** الساعات الخام قبل التقريب — للتقرير الداخلي وحده. */
  rawHours: number;
  /** الساعات النهائية المعتمدة (عدد صحيح، مرفوعة لصالح الموظف). */
  hours: number;
  /** المبلغ النهائي المُعاد حسابه من `hours`. */
  amount: number;
  /**
   * `amount − targetAmount`. موجب دائمًا أو صفر — أثر الرفع لصالح الموظف.
   * يُعرض داخل النظام (المتطلب ١٠) ولا يُطبع في الكشف الرسمي (المتطلب ١١).
   */
  difference: number;
}

/**
 * يشتقّ الساعات من مبلغ مستهدف ثم يعيد حساب المبلغ من الساعات المقرَّبة.
 *
 * أمثلة القاعدة (المتطلب ١٠): `10.0 → 10` · `10.01 → 11` · `10.1 → 11` · `10.9 → 11`.
 */
export function reverseOvertimeFromAmount(input: ReverseOvertimeInput): ReverseOvertimeResult {
  const { targetAmount, overtimeType, hourlyRate } = input;

  if (!Number.isFinite(targetAmount)) {
    throw new Error(`المبلغ المستهدف ليس قيمة صالحة: ${String(targetAmount)}`);
  }
  if (targetAmount < 0) throw new Error('المبلغ المستهدف لا يمكن أن يكون سالبًا');
  if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
    throw new Error('أجر الساعة يجب أن يكون أكبر من صفر لتنفيذ الحسبة العكسية');
  }

  const rate = resolveEffectiveOvertimeRate(overtimeType, hourlyRate, input.companyOvertimeBaseRate ?? null);
  const divisor = rateForHoursDerivation(rate);

  const rawHours = normalizeHours(targetAmount / divisor);
  const hours = ceilHoursInFavourOfEmployee(targetAmount / divisor);
  // المبلغ يُعاد حسابه من الساعات المقرَّبة بنفس الدالة التي يستعملها سطر الإضافي —
  // فما يعد به هذا الحوار هو حرفيًا ما سيُخزَّن بعد إضافة السطر.
  const amount = amountFromEffectiveRate(hours, rate);

  return {
    overtimeType,
    targetAmount: roundMoney(targetAmount),
    hourlyRate,
    multiplier: rate.statutoryMultiplier,
    statutoryMinimumRate: rate.statutoryMinimumRate,
    companyDerivedRate: rate.companyDerivedRate,
    effectiveRate: rate.effectiveRate,
    rateSource: rate.source,
    rawHours,
    hours,
    amount,
    // الفرق يُحسب من المبلغ المستهدف **المقرَّب** — وهو ما يُخزَّن ويُعرض، لا تمثيله الخام.
    difference: roundMoney(amount - roundMoney(targetAmount)),
  };
}

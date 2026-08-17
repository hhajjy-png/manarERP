/**
 * صافي المستحق **نقدًا** — قيمة عرض مشتقّة، لا حقل مخزَّن.
 *
 * ═══ لماذا وُجد هذا الملف ═══
 * السداد الفعلي في الشركة مساران لا مسار واحد: الراتب الأساسي **يُحوَّل إلى البنك**،
 * والمستحقات الإضافية **تُسلَّم نقدًا**. الكشف الذي يوقّعه الموظف بالاستلام يجب أن يحمل
 * الرقم الذي سيستلمه فعلًا في يده؛ وطباعة `netAmount` المخزَّن عليه كانت تجعله يوقّع
 * باستلام مبلغ يشمل راتبًا وصل حسابه البنكي قبل أيام — إقرارُ استلامٍ مزدوج لنفس المال.
 *
 * ═══ اشتقاق لا تخزين ═══
 * `netAmount` و`grossEntitlements` و`basicSalarySnapshot` تبقى في قاعدة البيانات كما
 * هي حرفيًا، ويبقى المحرّك مصدرها الوحيد. ما يتغيّر هو **ما يُعرض** وحده. لذلك الصيغة
 * هنا في دالة واحدة يستدعيها الكشف والتقرير ورمز التحقق معًا: نسخةٌ ثانية منها في قالب
 * ثانٍ كانت ستنحرف عند أول تعديل، فيُظهر الكشف رقمًا ويُظهر الرمز فوقه رقمًا آخر.
 *
 * ═══ الطرح مرة واحدة ═══
 * `cashNet = netAmount − basicSalarySnapshot` و`additional = gross − basicSalarySnapshot`.
 * الأساسي يُطرح من الطرفين مرة واحدة لا مرتين: الاستقطاعات محسومة أصلًا داخل
 * `netAmount`، فطرحها ثانيةً كان سينقص المبلغ النقدي بمقدارها مرتين.
 */

export interface CashEntitlement {
  /** الراتب الأساسي — يُعرض للمعلومية، ولا يدخل المبلغ النقدي. */
  basicSalary: number;
  /** إجمالي المستحقات الإضافية = العمل الإضافي + الاستحقاقات الأخرى. */
  additionalEntitlements: number;
  /** إجمالي الاستقطاعات كما هو — لا يُعاد احتسابه هنا. */
  totalDeductions: number;
  /** ما يُسلَّم للموظف نقدًا = `netAmount − basicSalarySnapshot`. */
  cashNet: number;
}

/** تقريب الدينار الثلاثي — يُطبَّق على الفرق لا على أطرافه، فلا يتراكم خطأ الكسر. */
const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function deriveCashEntitlement(input: {
  basicSalary: number;
  totals: { grossEntitlements: number; totalDeductions: number; netAmount: number };
}): CashEntitlement {
  const { basicSalary, totals } = input;
  return {
    basicSalary: round3(basicSalary),
    additionalEntitlements: round3(totals.grossEntitlements - basicSalary),
    totalDeductions: round3(totals.totalDeductions),
    cashNet: round3(totals.netAmount - basicSalary),
  };
}

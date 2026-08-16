/**
 * سياسة الشركة لسعر ساعة العمل الإضافي — **مفهوم منفصل تمامًا عن قانون العمل**.
 *
 * ═══ لماذا ملف مستقل عن `legal/kuwaitLabourLaw.ts` ═══
 * ما في `legal/` **نصّ قانون**: نِسَبٌ فرضها المشرّع (٢٥٪ · ٥٠٪ · أجر مضاعف) لا يملك
 * أحد تعديلها من شاشة إعدادات. وما في هذا الملف **قرار إداري**: سعرٌ نقدي تختاره الشركة
 * لساعة الإضافي، وتغييره حقّ مشروع لصاحب القرار لا تلاعبٌ بالقانون.
 *
 * خلط المفهومين في ملف واحد كان سيجعل تعديل سعر الشركة يبدو كأنه تعديل للقانون، ويجعل
 * إصدارًا واحدًا (`LEGAL_RULES_VERSION`) يحمل معنيين متناقضين. لذلك:
 *
 *   · `LEGAL_RULES_VERSION`            ← يرتفع عند تغيير **نصّ القانون** المطبَّق.
 *   · `COMPANY_OVERTIME_POLICY_VERSION` ← يرتفع عند تغيير **طريقة اشتقاق** سعر الشركة.
 *
 * والاثنان يُخزَّنان معًا في كل حسبة، فيبقى كل شهر قابلًا لإعادة الشرح بمرجعيه.
 *
 * ═══ القانون يبقى الأرضية التي لا يُنزل تحتها ═══
 * لا شيء هنا يستطيع أن يُنقص استحقاق الموظف: السعر الفعلي المستخدم يُحسم في
 * `engine/effectiveOvertimeRate.ts` بالمعادلة `max(سعر الشركة، الحد الأدنى القانوني)`.
 * فحتى لو اختار المستخدم سعرًا زهيدًا، يدفع النظام الحدّ القانوني الأعلى.
 *
 * ═══ ما هذا الملف وما ليس هو ═══
 * خالص وحتمي: لا Prisma، ولا قراءة إعدادات، ولا حالة. قراءةُ الإعداد المخزَّن وكتابته
 * مسؤولية الخدمة؛ وهذا الملف يعرف كيف **يُفسَّر** الرقم بعد وصوله، لا من أين يأتي.
 */
import { roundMoney } from '../../../shared/utils/money';
import { OVERTIME_TYPES, type OvertimeType } from '../legal/kuwaitLabourLaw';

/**
 * إصدار سياسة الشركة. يُخزَّن مع كل حسبة تحمل سعر شركة. **ارفعه عند أي تغيير في
 * معاملات الاشتقاق أدناه** — لا عند تغيير قيمة السعر نفسها (تلك بيانات لا سياسة).
 *
 * v1 — الحزمة الأولى: سعر أساسي واحد يختاره المستخدم، ومنه تُشتقّ أسعار الأنواع الثلاثة
 *      بمعاملات ١٫٠٠ / ١٫٥٠ / ٢٫٠٠، مع الحد الأدنى القانوني أرضيةً لكل نوع.
 */
export const COMPANY_OVERTIME_POLICY_VERSION = 'MANAR-COP-v1';

/**
 * مفتاح الإعداد في جدول `Setting` القائم — **لا نظام إعدادات ثانٍ**.
 *
 * المفتاح مُنَمَّط باسم الوحدة فلا يتصادم مع `company.*` ولا `backup.*`، ومجموعته
 * مستقلة فلا يظهر ضمن إعدادات الشركة العامة. وكونه داخل `manar.db` يعني أنه يدخل
 * النسخ الاحتياطي والاستعادة تلقائيًا كبقية بيانات النظام.
 */
export const COMPANY_OVERTIME_RATE_SETTING_KEY = 'employeeCompensation.companyOvertimeBaseRate';
export const COMPANY_OVERTIME_SETTING_GROUP = 'employeeCompensation';

/**
 * السعر الأساسي المستعمل حين لا يوجد إعداد محفوظ بعد (أول تشغيل بعد هذه الحزمة).
 * ليس قاعدة قانونية ولا رقمًا مقدَّسًا — مجرّد نقطة بدء معقولة يغيّرها المستخدم من
 * الواجهة في أول دقيقة. لا يُكتب في قاعدة البيانات تلقائيًا: غياب الإعداد يعني «لم
 * يُحدَّد بعد»، ولا يجوز أن يتحوّل بصمت إلى «اختاره المستخدم».
 */
export const FALLBACK_COMPANY_OVERTIME_BASE_RATE = 4;

/** أصغر سعر قابل للتمثيل بالدينار الكويتي — فلس واحد. صفرٌ أو سالبٌ مرفوض. */
export const MIN_COMPANY_OVERTIME_BASE_RATE = 0.001;

/**
 * سقف تشغيلي للسعر الأساسي — **حارس إدخال لا قاعدة عمل**.
 * ٥٠٠ د.ك للساعة تفوق أي سعر واقعي بأضعاف؛ وجود السقف يمنع خانة زائدة مطبوعة سهوًا
 * (٤٠٠٠ بدل ٤٫٠٠٠) من أن تمرّ صامتة إلى كشف موظف.
 */
export const MAX_COMPANY_OVERTIME_BASE_RATE = 500;

/**
 * معاملات اشتقاق سعر الشركة لكل نوع من السعر الأساسي الواحد.
 *
 * **ليست نسبًا قانونية ولا تدّعي أنها كذلك.** هي تدرّج إداري اختاره صاحب القرار ليعكس
 * التفاوت نفسه الذي يعكسه القانون في الأهمية: ساعة الراحة الأسبوعية أثمن من ساعة يوم
 * العمل، وساعة العطلة الرسمية أثمنهما. مقارنة النتيجة بالحدّ القانوني تتم بعد الاشتقاق،
 * لكل نوع على حدة، في `engine/effectiveOvertimeRate.ts`.
 *
 * سُمّي الحقل `factor` لا `multiplier` عمدًا: `multiplier` مصطلح محجوز في هذه الوحدة
 * للمعامل **القانوني** وحده، ولا يجوز أن يلتبس الاثنان في قراءة سريعة ولا في بحث نصّي.
 */
export const COMPANY_OVERTIME_FACTORS: Readonly<Record<OvertimeType, number>> = {
  REGULAR: 1,
  WEEKLY_REST: 1.5,
  OFFICIAL_HOLIDAY: 2,
};

/** معامل نوع بعينه — يرمي عند نوع غير معروف بدل إعادة معامل صامت. */
export function companyOvertimeFactor(type: OvertimeType): number {
  const factor = COMPANY_OVERTIME_FACTORS[type];
  if (factor === undefined) throw new Error(`نوع عمل إضافي غير معروف: ${String(type)}`);
  return factor;
}

/**
 * يتحقّق من السعر الأساسي ويُعيده مطبَّعًا إلى دقّة الدينار (ثلاث خانات).
 *
 * التطبيع لا يقلّ أهمية عن التحقّق: سعرٌ بدقّة `3.33333` كان سيُضرب في المعاملات
 * فيُنتج أسعارًا لا يستطيع قارئ التقرير أن يعيد اشتقاقها من الرقم المطبوع. بعد
 * التطبيع، كل سعر معروض هو السعر المستعمل حرفيًا.
 */
export function normalizeCompanyOvertimeBaseRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`سعر ساعة الإضافي المعتمد من الشركة ليس قيمة صالحة: ${String(value)}`);
  }
  const rate = roundMoney(value);
  if (rate < MIN_COMPANY_OVERTIME_BASE_RATE) {
    throw new Error('سعر ساعة الإضافي المعتمد من الشركة يجب أن يكون أكبر من صفر');
  }
  if (rate > MAX_COMPANY_OVERTIME_BASE_RATE) {
    throw new Error(
      `سعر ساعة الإضافي المعتمد من الشركة يتجاوز الحد التشغيلي (${MAX_COMPANY_OVERTIME_BASE_RATE} د.ك للساعة)`,
    );
  }
  return rate;
}

/**
 * سعر الشركة المشتقّ لنوع بعينه = السعر الأساسي × معامل النوع، مقرَّبًا مرة واحدة.
 *
 * التقريب هنا مقصود ونهائي: هذا هو الرقم الذي يظهر في التقرير التفصيلي، وهو نفسه الذي
 * يُضرب في الساعات. لا نسخة خام منه تُستعمل في الحساب بينما تُطبع نسخة مقرَّبة.
 */
export function companyRateForType(baseRate: number, type: OvertimeType): number {
  return roundMoney(normalizeCompanyOvertimeBaseRate(baseRate) * companyOvertimeFactor(type));
}

/** جدول أسعار الشركة للأنواع الثلاثة — يغذّي معاينة الواجهة والتقرير بمصدر واحد. */
export function companyOvertimeRateTable(baseRate: number): Record<OvertimeType, number> {
  const table = {} as Record<OvertimeType, number>;
  for (const type of OVERTIME_TYPES) table[type] = companyRateForType(baseRate, type);
  return table;
}

/**
 * يفكّ قيمة الإعداد المخزَّنة نصًّا. يعيد `null` عند الغياب أو الفساد بدل أن يرمي:
 * إعدادٌ تالفٌ يجب أن يُظهر «لم يُحدَّد بعد» فيصحّحه المستخدم، لا أن يُعطّل فتح الوحدة.
 */
export function parseStoredCompanyOvertimeBaseRate(raw: string | null | undefined): number | null {
  if (raw == null || raw.trim() === '') return null;
  const parsed = Number(raw);
  try {
    return normalizeCompanyOvertimeBaseRate(parsed);
  } catch {
    return null;
  }
}

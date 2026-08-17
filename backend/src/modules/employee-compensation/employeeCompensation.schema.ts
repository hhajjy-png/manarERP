/**
 * مخططات التحقق (Zod) لوحدة مستحقات الموظف الشهرية.
 *
 * التحقق هنا يحرس **الحدود** (شكل الطلب): أنواع مغلقة، أرقام محدودة غير سالبة، شهر
 * ١..١٢، سنة معقولة. القواعد **القانونية** ليست من شأنه — تلك يملكها المحرّك وحده
 * (`legal/kuwaitLabourLaw.ts`)، ولا يجوز أن تُعاد صياغتها هنا.
 */
import { z } from 'zod';
import { OVERTIME_TYPES } from '../employee-compensation/legal/kuwaitLabourLaw';
import {
  COMPENSATORY_REST_STATUSES,
  DEBT_TYPES,
  DEDUCTION_TYPES,
  EARNING_TYPES,
  MAX_COMPANY_OVERTIME_BASE_RATE,
  MIN_COMPANY_OVERTIME_BASE_RATE,
} from './engine';

/** أضيق سنة معقولة لسجل تشغيلي — تمنع `year=0` و`year=99999` من الوصول إلى الفهرس. */
const yearField = z.coerce.number().int().min(2000).max(2100);
const monthField = z.coerce.number().int().min(1).max(12);
const idField = z.coerce.number().int().positive();

/**
 * مبلغ نقدي: محدود، غير سالب، وبسقف تشغيلي.
 * السقف ليس قاعدة محاسبية بل حارس ضد الإدخال الخاطئ (خانة زائدة) الذي يمرّ صامتًا.
 */
const moneyField = z.number().finite().nonnegative().max(10_000_000);

/** عدد ساعات: محدود، غير سالب، وبسقف يفوق أي شهر ممكن (٢٤ × ٣١ = ٧٤٤). */
const hoursField = z.number().finite().nonnegative().max(744);

const overtimeLineSchema = z.object({
  overtimeType: z.enum(OVERTIME_TYPES),
  hours: hoursField,
  calculationMethod: z.enum(['MANUAL_HOURS', 'REVERSE_FROM_AMOUNT']).optional(),
  reverseTargetAmount: moneyField.nullable().optional(),
  rawHoursBeforeCeiling: hoursField.nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

/**
 * ساعات **يوم واحد**: لا تتجاوز اليوم التقويمي. الحدود القانونية ليست من شأن هذه
 * الطبقة — ٣ ساعات إضافي عادي تمرّ من هنا صحيحةً شكلًا، ثم يصنّفها محرّك الالتزام
 * مخالفةً قانونية فتُحفظ مسودةً ويُمنع اعتمادها. الحفظ ليس الاعتماد.
 */
const dayHoursField = z.number().finite().nonnegative().max(24);

/** تاريخ يوم عمل — `YYYY-MM-DD` حصرًا. الصحّة التقويمية تُفحص في المحرّك والخدمة. */
const isoDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'صيغة التاريخ يجب أن تكون YYYY-MM-DD');

/**
 * يوم عمل إضافي واحد. `hours` موجبة صراحةً: صفّ بصفر ساعات ليس يوم عمل، وتخزينه كان
 * سيضخّم عدّاد «أيام الإضافي السنوية» بأيام لم يُعمل فيها شيء.
 */
const overtimeDaySchema = z.object({
  date: isoDateField,
  overtimeType: z.enum(OVERTIME_TYPES),
  hours: dayHoursField.refine((v) => v > 0, 'عدد ساعات اليوم يجب أن يكون أكبر من صفر'),
  notes: z.string().max(500).nullable().optional(),
  compensatoryRestStatus: z.enum(COMPENSATORY_REST_STATUSES).nullable().optional(),
  compensatoryRestDate: isoDateField.nullable().optional(),
});

const earningLineSchema = z.object({
  type: z.enum(EARNING_TYPES),
  label: z.string().trim().min(1, 'اسم البند مطلوب').max(200),
  amount: moneyField,
  entryDate: z.string().datetime().or(z.string().min(1)).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  recurring: z.boolean().optional(),
  /**
   * تفصيل الساعة — **حدّ الطلب لا القاعدة**. الشكل وحده يُفحص هنا (رقم محدود ضمن
   * سقف الشهر)؛ أما «معًا أو لا أحدهما» و«الساعات × السعر = المبلغ» فيملكهما المحرّك
   * (`compensationTotals`) وحده، فيسريان على أي مستدعٍ لا على هذا المسار فقط.
   */
  hours: hoursField.nullable().optional(),
  rate: moneyField.nullable().optional(),
});

const deductionLineSchema = z.object({
  type: z.enum(DEDUCTION_TYPES),
  label: z.string().trim().min(1, 'اسم الاستقطاع مطلوب').max(200),
  amount: moneyField,
  notes: z.string().max(500).nullable().optional(),
  /**
   * سجل المديونية الذي يسدّده هذا السطر. إلزامي لنوع `DEBT_REPAYMENT` وممنوع لغيره —
   * والقاعدتان تُفرضان في المحرّك (`compensationTotals`) لا هنا، فيسريان على أي مستدعٍ.
   */
  debtId: idField.nullable().optional(),
});

/**
 * سعر ساعة الإضافي المعتمد من الشركة — **حدّ الطلب لا القاعدة**.
 *
 * الحدّان الأدنى والأعلى مستورَدان من وحدة السياسة لا مكتوبين رقمين هنا: قيمة واحدة
 * تحكم Zod والمحرّك والواجهة معًا، فلا يقبل أحدهما ما يرفضه الآخر. أما فرض «لا يقلّ عن
 * القانون» فليس من شأن هذه الطبقة إطلاقًا — ذلك قرار يملكه `effectiveOvertimeRate.ts`
 * وحده، ويسري حتى لو مرّ سعر منخفض من هنا (وهو ممرّ مسموح عمدًا: النظام يقبل الاختيار
 * ثم يرفعه إلى الحد القانوني ويُظهر تحذيرًا، بدل أن يرفض الطلب ويترك المستخدم يخمّن).
 */
const companyOvertimeBaseRateField = z
  .number()
  .finite()
  .min(MIN_COMPANY_OVERTIME_BASE_RATE, 'سعر ساعة الإضافي يجب أن يكون أكبر من صفر')
  .max(MAX_COMPANY_OVERTIME_BASE_RATE, 'سعر ساعة الإضافي يتجاوز الحد التشغيلي');

/** جسم الحسبة المشترك بين الإنشاء والتحديث والمعاينة. */
export const calculationBodySchema = z.object({
  /**
   * السطور الشهرية المجمّعة **لكل نوع**.
   *
   * ═══ مكانتها تغيّرت مع السجل اليومي ═══
   * حين تصل `overtimeDays` غير فارغة، تُشتقّ هذه السطور من الأيام اشتقاقًا كاملًا
   * وتُتجاهَل ساعاتُها الواردة هنا. تبقى في الجسم لسببين: الأشهر القديمة (Legacy) التي
   * لا تملك أيامًا تُحفظ بها كما كانت، وحقولُ التدقيق (طريقة الإدخال، المبلغ المستهدف
   * للحسبة العكسية) ما زالت تخصّ النوع لا اليوم.
   */
  overtime: z.array(overtimeLineSchema).max(50).default([]),
  /**
   * أيام العمل الإضافي — **مصدر الحقيقة للساعات** حين تُرسَل.
   * السقف ٢٠٠ يتّسع لثلاثة أنواع في كل يوم من الشهر (٣١ × ٣ = ٩٣) بهامش واسع، ويمنع
   * في الوقت نفسه طلبًا ضخمًا من إغراق المعاملة.
   */
  overtimeDays: z.array(overtimeDaySchema).max(200).default([]),
  earnings: z.array(earningLineSchema).max(50).default([]),
  deductions: z.array(deductionLineSchema).max(50).default([]),
  notes: z.string().max(2000).nullable().optional(),
  /**
   * ثلاث حالات لا حالتان، وكلٌّ منها لها معنى مختلف في الخدمة:
   *   · غياب الحقل (`undefined`) ⇒ عند الإنشاء: خذ افتراضي الشركة. عند التحديث: أبقِ
   *     ما هو محفوظ كما هو (فلا يمحو مستدعٍ قديم لا يعرف الحقل سعرَ شهرٍ محفوظ).
   *   · رقم                      ⇒ سعر هذا الشهر وحده. لا يمسّ الافتراضي العام.
   *   · `null`                   ⇒ لا سياسة شركة لهذا الشهر: بالحد القانوني وحده.
   */
  companyOvertimeBaseRate: companyOvertimeBaseRateField.nullable().optional(),
});

/**
 * تعديل **الافتراضي العام للشركة** — إعداد إداري واحد لكل الوحدة.
 * لا مفتاح صلاحية جديد له: يُحرَس بـ`employeeCompensation.update` (المتطلب ١٩).
 */
export const updateCompanyOvertimeRateSchema = z.object({
  body: z.object({ baseRate: companyOvertimeBaseRateField }),
});

export const createCalculationSchema = z.object({
  params: z.object({ employeeId: idField, year: yearField, month: monthField }),
  body: calculationBodySchema,
});

export const updateCalculationSchema = z.object({
  params: z.object({ id: idField }),
  body: calculationBodySchema,
});

/**
 * معاينة حسبة **بلا كتابة** — تُستدعى أثناء التحرير فيبقى المحرّك مصدرًا واحدًا للأرقام
 * بدل نسخة ثانية منه داخل الواجهة.
 */
export const previewCalculationSchema = z.object({
  body: calculationBodySchema.extend({
    basicSalary: z.number().finite().positive(),
    hourlyRateOverride: z.number().finite().positive().nullable().optional(),
    priorRegularOvertimeHoursThisYear: hoursField.optional(),
    /**
     * سياق الشهر المحرَّر — **اختياري، ولازم لتقييم الالتزام أثناء التحرير**.
     *
     * بدونه تبقى المعاينة حسابية بحتة كما كانت. بوجوده تُقيَّم المخالفات القانونية
     * **قبل الحفظ**، فيرى المستخدم تجاوز اليوم أو الأسبوع لحظة إدخاله لا بعد الحفظ —
     * وعدّادات السنة تُقرأ من بقية أشهر الموظف. `excludeCalculationId` يمنع احتساب
     * الشهر الجاري تحريره مرّتين (مرّة من المحفوظ ومرّة من المسودة).
     */
    employeeId: idField.optional(),
    year: yearField.optional(),
    month: monthField.optional(),
    excludeCalculationId: idField.optional(),
  }),
});

/** الحسبة العكسية — أداة مساعدة بلا أثر تخزيني. */
export const reverseOvertimeSchema = z.object({
  body: z.object({
    targetAmount: moneyField,
    overtimeType: z.enum(OVERTIME_TYPES),
    basicSalary: z.number().finite().positive().optional(),
    hourlyRate: z.number().finite().positive().optional(),
    /** سعر الشركة المعمول به في الشهر الجاري تحريره — يشتقّ منه السعر الفعلي للنوع. */
    companyOvertimeBaseRate: companyOvertimeBaseRateField.nullable().optional(),
  }),
});

export const listSummariesSchema = z.object({
  query: z.object({
    year: yearField,
    search: z.string().max(100).optional(),
    status: z.enum(['ACTIVE', 'ON_LEAVE', 'TERMINATED', 'ALL']).optional(),
  }),
});

export const annualFileSchema = z.object({
  params: z.object({ employeeId: idField, year: yearField }),
});

export const monthParamsSchema = z.object({
  params: z.object({ employeeId: idField, year: yearField, month: monthField }),
});

export const idParamsSchema = z.object({ params: z.object({ id: idField }) });

/**
 * جسم الحسبة كما تراه الخدمة.
 *
 * `overtimeDays` **اختياري في النوع** رغم أن Zod يملؤه بمصفوفة فارغة عند التحقّق: كل
 * مستدعٍ سابق لهذه الحزمة (وكل اختبار كُتب قبلها) لا يعرف الحقل أصلًا، وغيابه له معنى
 * صريح ومقصود — «سجل شهري قديم بلا تفاصيل يومية» — لا حالة ناقصة يجب سدّها. الخدمة
 * تتعامل معه بـ`?? []` في كل مسار، فالغياب مسار مدعوم لا ثغرة.
 */
export type CalculationBody = Omit<z.infer<typeof calculationBodySchema>, 'overtimeDays'> & {
  overtimeDays?: z.infer<typeof calculationBodySchema>['overtimeDays'];
};

// ─── سجل المديونيات والسلف ────────────────────────────────────────────────────

const debtLabelField = z.string().trim().min(1, 'بيان المديونية مطلوب').max(200);
const dateField = z.string().min(1, 'التاريخ مطلوب');

export const createDebtSchema = z.object({
  params: z.object({ employeeId: idField }),
  body: z.object({
    type: z.enum(DEBT_TYPES),
    label: debtLabelField,
    // المبلغ **موجب صراحةً**: مديونية بصفر ليست مديونية، وبالسالب ليست مديونية أصلًا.
    originalAmount: moneyField.refine((v) => v > 0, 'مبلغ المديونية يجب أن يكون أكبر من صفر'),
    debtDate: dateField,
    notes: z.string().max(1000).nullable().optional(),
  }),
});

export const updateDebtSchema = z.object({
  params: z.object({ id: idField }),
  body: z
    .object({
      type: z.enum(DEBT_TYPES).optional(),
      label: debtLabelField.optional(),
      originalAmount: moneyField.refine((v) => v > 0, 'مبلغ المديونية يجب أن يكون أكبر من صفر').optional(),
      debtDate: dateField.optional(),
      notes: z.string().max(1000).nullable().optional(),
    })
    // طلب تعديل فارغ ليس خطأً صامتًا بل نيّة غامضة — يُرفض بدل أن يُنفَّذ بلا أثر.
    .refine((b) => Object.keys(b).length > 0, 'لا يوجد حقل للتعديل'),
});

export const createManualPaymentSchema = z.object({
  params: z.object({ id: idField }),
  body: z.object({
    amount: moneyField.refine((v) => v > 0, 'مبلغ السداد يجب أن يكون أكبر من صفر'),
    paymentDate: dateField,
    notes: z.string().max(500).nullable().optional(),
  }),
});

export const updateManualPaymentSchema = z.object({
  params: z.object({ id: idField }),
  body: z
    .object({
      amount: moneyField.refine((v) => v > 0, 'مبلغ السداد يجب أن يكون أكبر من صفر').optional(),
      paymentDate: dateField.optional(),
      notes: z.string().max(500).nullable().optional(),
    })
    .refine((b) => Object.keys(b).length > 0, 'لا يوجد حقل للتعديل'),
});

export const employeeParamsSchema = z.object({ params: z.object({ employeeId: idField }) });

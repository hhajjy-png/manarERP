/**
 * مخططات التحقق (Zod) لوحدة مستحقات الموظف الشهرية.
 *
 * التحقق هنا يحرس **الحدود** (شكل الطلب): أنواع مغلقة، أرقام محدودة غير سالبة، شهر
 * ١..١٢، سنة معقولة. القواعد **القانونية** ليست من شأنه — تلك يملكها المحرّك وحده
 * (`legal/kuwaitLabourLaw.ts`)، ولا يجوز أن تُعاد صياغتها هنا.
 */
import { z } from 'zod';
import { OVERTIME_TYPES } from '../employee-compensation/legal/kuwaitLabourLaw';
import { DEBT_TYPES, DEDUCTION_TYPES, EARNING_TYPES } from './engine';

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

const earningLineSchema = z.object({
  type: z.enum(EARNING_TYPES),
  label: z.string().trim().min(1, 'اسم البند مطلوب').max(200),
  amount: moneyField,
  entryDate: z.string().datetime().or(z.string().min(1)).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  recurring: z.boolean().optional(),
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

/** جسم الحسبة المشترك بين الإنشاء والتحديث والمعاينة. */
export const calculationBodySchema = z.object({
  overtime: z.array(overtimeLineSchema).max(50).default([]),
  earnings: z.array(earningLineSchema).max(50).default([]),
  deductions: z.array(deductionLineSchema).max(50).default([]),
  notes: z.string().max(2000).nullable().optional(),
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
  }),
});

/** الحسبة العكسية — أداة مساعدة بلا أثر تخزيني. */
export const reverseOvertimeSchema = z.object({
  body: z.object({
    targetAmount: moneyField,
    overtimeType: z.enum(OVERTIME_TYPES),
    basicSalary: z.number().finite().positive().optional(),
    hourlyRate: z.number().finite().positive().optional(),
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

export type CalculationBody = z.infer<typeof calculationBodySchema>;

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

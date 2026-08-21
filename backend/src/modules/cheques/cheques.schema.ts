import { z } from 'zod';
import { dateOnlySchema } from '../../core/utils/dateOnly';

/**
 * رقم الشيك — يُدخله المستخدم يدويًا دائمًا.
 *
 * هو الرقم الحقيقي المطبوع مسبقًا على ورقة الشيك الصادرة من البنك، فلا ترقيم
 * تلقائي ولا اقتراح «الرقم التالي» ولا زيادة تلقائية في أي مسار من مسارات
 * النظام. تفرّده يُفرض **ضمن الحساب البنكي الواحد** (انظر الخدمة).
 */
const chequeNumberSchema = z
  .string()
  .trim()
  .min(3, 'رقم الشيك يجب أن يكون 3 أحرف على الأقل')
  .regex(/^\S+$/, 'رقم الشيك لا يجب أن يحتوي على مسافات');

const chequeDateSchema = dateOnlySchema.refine(
  (d) => d.getUTCFullYear() >= 2020 && d.getUTCFullYear() <= 2035,
  { message: 'تاريخ الشيك غير صالح' },
);

/**
 * لا `bankName` في مخططات الإنشاء/التعديل بعد الآن.
 *
 * هوية البنك صارت `bankAccountId`، و`Cheque.bankName` يُشتق داخليًا في الخدمة
 * من `Bank.nameAr` للحساب المختار. قبول نص بنك من العميل كان يعني أن الواجهة
 * تستطيع كتابة اسم بنك لا يطابق الحساب المرتبط — وهو تناقض لا يمكن للخادم
 * كشفه بعد وقوعه.
 */
export const createChequeSchema = z.object({
  body: z.object({
    chequeNumber: chequeNumberSchema,
    chequeDate: chequeDateSchema,
    beneficiaryName: z.string().min(1, 'اسم المستفيد مطلوب'),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    currency: z.enum(['KWD', 'USD', 'SAR', 'AED']).default('KWD'),
    description: z.string().nullable().optional(),
    bankAccountId: z.coerce.number().int().positive('الحساب البنكي مطلوب'),
    notes: z.string().nullable().optional(),
  }),
});

export const updateChequeSchema = z.object({
  body: z.object({
    chequeNumber: chequeNumberSchema.optional(),
    chequeDate: chequeDateSchema.optional(),
    beneficiaryName: z.string().min(1).optional(),
    amount: z.coerce.number().positive().optional(),
    currency: z.enum(['KWD', 'USD', 'SAR', 'AED']).optional(),
    description: z.string().nullable().optional(),
    bankAccountId: z.coerce.number().int().positive().optional(),
    notes: z.string().nullable().optional(),
  }),
});

export const forceDeleteChequeSchema = z.object({
  body: z.object({
    confirmation: z.string().min(1, 'التأكيد مطلوب'),
  }),
});

// ── Cheque calibration template versioning ─────────────────────────────────────
// A template is 4 field configs (beneficiary/date/tafqeet/numeric). We validate
// the coordinate/typography shape server-side before snapshotting a version so a
// corrupt payload can never be persisted as an active template or a version.

const fieldConfigSchema = z.object({
  top: z.number().min(0).max(100),
  left: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  fontSize: z.number().min(4).max(72),
  fontFamily: z.string().min(1),
  fontWeight: z.string().min(1),
  fontStyle: z.string().min(1),
  textAlign: z.enum(['left', 'center', 'right']),
  color: z.string().regex(/^#[0-9a-fA-F]{3,8}$/, 'لون غير صالح'),
});

export const chequeTemplateSchema = z.object({
  beneficiary: fieldConfigSchema,
  date: fieldConfigSchema,
  tafqeet: fieldConfigSchema,
  numeric: fieldConfigSchema,
});

export const saveTemplateVersionSchema = z.object({
  body: z.object({
    bankName: z.string().min(1, 'اسم البنك مطلوب'),
    template: chequeTemplateSchema,
    note: z.string().max(300).nullable().optional(),
  }),
});

// ── Reprint reasons ────────────────────────────────────────────────────────────
// Reprints must be justified. Stored as a stable key; the note is free text used
// mainly with OTHER. First prints are logged automatically with no reason.
export const REPRINT_REASONS = [
  'PAPER_JAM',
  'PRINTER_ISSUE',
  'CALIBRATION',
  'MISALIGNMENT',
  'USER_REQUEST',
  'OTHER',
] as const;

export const reprintChequeSchema = z.object({
  body: z.object({
    reason: z.enum(REPRINT_REASONS, {
      errorMap: () => ({ message: 'سبب إعادة الطباعة مطلوب' }),
    }),
    note: z.string().max(300).nullable().optional(),
  }),
});

// ── Calibration geometry (Studio) ──────────────────────────────────────────────
// Physical page/cheque dimensions + print offsets used by the Calibration Studio's
// test sheet and Measurement Assistant. Stored as a single additive Setting
// (cheque.calibration.geometry). Does NOT affect the real print engine — it only
// parameterises the test sheet and mm↔% conversion. Write is SYSTEM_ADMIN-only (route).

export const calibrationGeometrySchema = z.object({
  pageWidthMm: z.number().min(100).max(500),
  pageHeightMm: z.number().min(100).max(500),
  chequeWidthMm: z.number().min(50).max(400),
  chequeHeightMm: z.number().min(30).max(300),
  offsetXMm: z.number().min(-100).max(300),
  offsetYMm: z.number().min(-100).max(300),
});

export const saveCalibrationGeometrySchema = z.object({
  body: calibrationGeometrySchema,
});

export type CreateChequeInput = z.infer<typeof createChequeSchema>['body'];
export type UpdateChequeInput = z.infer<typeof updateChequeSchema>['body'];
export type ForceDeleteChequeInput = z.infer<typeof forceDeleteChequeSchema>['body'];
export type ChequeTemplateInput = z.infer<typeof chequeTemplateSchema>;
export type SaveTemplateVersionInput = z.infer<typeof saveTemplateVersionSchema>['body'];
export type ReprintChequeInput = z.infer<typeof reprintChequeSchema>['body'];
export type CalibrationGeometryInput = z.infer<typeof calibrationGeometrySchema>;

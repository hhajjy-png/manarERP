import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { dateOnlySchema } from '../../core/utils/dateOnly';

export const createEmployeeSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'الرقم الوظيفي مطلوب'),
    fullName: z.string().min(1, 'اسم الموظف بالعربي مطلوب'),
    fullNameEn: z.string().optional(), // الاسم بالإنجليزي
    civilId: z.string().optional(), // الرقم المدني
    jobTitle: z.string().optional(), // المهنة
    nationality: z.string().optional(), // الجنسية
    passportNumber: z.string().optional(), // رقم جواز السفر
    passportExpiry: dateOnlySchema.optional(), // انتهاء الجواز
    residencyExpiry: dateOnlySchema.optional(), // انتهاء الإقامة
    licenseExpiry: dateOnlySchema.optional(), // انتهاء رخصة القيادة
    vehiclePlate: z.string().optional(), // رقم لوحة المركبة
    vehicleLicenseExpiry: dateOnlySchema.optional(), // انتهاء رخصة المركبة
    birthDate: dateOnlySchema.optional(), // تاريخ الميلاد
    company: z.string().optional(), // الشركة
    department: z.string().optional(),
    salary: z.coerce.number().nonnegative().default(0), // الراتب الشهري
    hireDate: dateOnlySchema.optional(),
    phone: z.string().optional(),
    email: z.string().email('بريد غير صحيح').optional().or(z.literal('')),
    address: z.string().optional(), // العنوان
    bankAccount: z.string().optional(), // رقم الحساب البنكي
    photoPath: z.string().optional(),
    status: z.enum(ENUMS.employeeStatus).default('ACTIVE'),
    notes: z.string().optional(),
  }),
});

export const updateEmployeeSchema = z.object({
  body: createEmployeeSchema.shape.body.partial(),
});

// ===== الموارد البشرية =====
export const attendanceSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive(),
    date: dateOnlySchema,
    // checkIn/checkOut يحملان وقتًا فعليًا (HH:MM مدموجًا مع تاريخ اليوم) — DATETIME
    // حقيقي لا DATE-ONLY، فيبقيان على z.coerce.date() عمدًا (خارج نطاق هذا التشديد).
    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']).default('PRESENT'),
    notes: z.string().optional(),
  }),
});

export const leaveSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive(),
    type: z.enum(['ANNUAL', 'SICK', 'UNPAID', 'EMERGENCY']),
    startDate: dateOnlySchema,
    endDate: dateOnlySchema,
    reason: z.string().optional(),
    /**
     * تاريخ العودة المتوقَّع — بيانات طلب الإجازة المطبوع، اختياري.
     * `days` و`status` غائبان عمدًا: الأول يشتقّه `requestLeave` عبر `diffDays`،
     * والثاني يفرضه `PENDING`. قبولهما من العميل يفتح بابًا لتجاوز كليهما.
     */
    expectedReturnDate: dateOnlySchema.optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: z.object({
    // انظر ملاحظة DATETIME أعلاه في attendanceSchema — نفس السبب.
    checkIn: z.coerce.date().optional(),
    checkOut: z.coerce.date().optional(),
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'LEAVE']).optional(),
    notes: z.string().optional(),
  }),
});

export const adjustmentSchema = z.object({
  body: z.object({
    employeeId: z.coerce.number().int().positive(),
    amount: z.coerce.number().positive('المبلغ يجب أن يكون موجبًا'),
    reason: z.string().optional(),
    date: dateOnlySchema.optional(),
  }),
});

export const createLeaveSettlementSchema = z.object({
  body: z.object({
    settlementDate: dateOnlySchema,
    leaveDaysSettled: z.coerce.number().nonnegative('عدد الأيام لا يمكن أن يكون سالبًا'),
    settlementAmount: z.coerce.number().nonnegative('المبلغ لا يمكن أن يكون سالبًا'),
    paymentMethod: z.enum(ENUMS.leaveSettlementPaymentMethod),
    notes: z.string().optional(),
  }),
});

// ملاحظة: مخطط تسجيل دفعة المستحق انتقل إلى نطاق الاستحقاقات المستقل
// (modules/employee-entitlements/entitlements.schema.ts) — مصدر واحد لقواعد الدفع.

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>['body'];
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>['body'];
export type AttendanceInput = z.infer<typeof attendanceSchema>['body'];
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>['body'];
export type LeaveInput = z.infer<typeof leaveSchema>['body'];
export type AdjustmentInput = z.infer<typeof adjustmentSchema>['body'];
export type CreateLeaveSettlementInput = z.infer<typeof createLeaveSettlementSchema>['body'];

import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createEmployeeSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'الرقم الوظيفي مطلوب'),
    fullName: z.string().min(1, 'اسم الموظف بالعربي مطلوب'),
    fullNameEn: z.string().optional(), // الاسم بالإنجليزي
    civilId: z.string().optional(), // الرقم المدني
    jobTitle: z.string().optional(), // المهنة
    nationality: z.string().optional(), // الجنسية
    passportNumber: z.string().optional(), // رقم جواز السفر
    passportExpiry: z.coerce.date().optional(), // انتهاء الجواز
    residencyExpiry: z.coerce.date().optional(), // انتهاء الإقامة
    licenseExpiry: z.coerce.date().optional(), // انتهاء رخصة القيادة
    vehiclePlate: z.string().optional(), // رقم لوحة المركبة
    vehicleLicenseExpiry: z.coerce.date().optional(), // انتهاء رخصة المركبة
    birthDate: z.coerce.date().optional(), // تاريخ الميلاد
    company: z.string().optional(), // الشركة
    department: z.string().optional(),
    salary: z.coerce.number().nonnegative().default(0), // الراتب الشهري
    hireDate: z.coerce.date().optional(),
    phone: z.string().optional(),
    email: z.string().email('بريد غير صحيح').optional().or(z.literal('')),
    address: z.string().optional(), // العنوان
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
    date: z.coerce.date(),
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
    startDate: z.coerce.date(),
    endDate: z.coerce.date(),
    reason: z.string().optional(),
  }),
});

export const updateAttendanceSchema = z.object({
  body: z.object({
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
    date: z.coerce.date().optional(),
  }),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>['body'];
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>['body'];
export type AttendanceInput = z.infer<typeof attendanceSchema>['body'];
export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>['body'];
export type LeaveInput = z.infer<typeof leaveSchema>['body'];
export type AdjustmentInput = z.infer<typeof adjustmentSchema>['body'];

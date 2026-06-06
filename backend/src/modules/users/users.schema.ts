import { z } from 'zod';

export const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3, 'اسم المستخدم 3 أحرف على الأقل'),
    password: z.string().min(6, 'كلمة المرور 6 أحرف على الأقل'),
    fullName: z.string().min(1, 'الاسم الكامل مطلوب'),
    email: z.string().email('بريد غير صحيح').optional().or(z.literal('')),
    phone: z.string().optional(),
    roleId: z.coerce.number().int().positive('الدور مطلوب'),
    employeeId: z.coerce.number().int().positive().optional(),
    isActive: z.boolean().default(true),
  }),
});

export const updateUserSchema = z.object({
  body: z.object({
    fullName: z.string().min(1).optional(),
    email: z.string().email().optional().or(z.literal('')),
    phone: z.string().optional(),
    roleId: z.coerce.number().int().positive().optional(),
    employeeId: z.coerce.number().int().positive().nullable().optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(6).optional(),
  }),
});

export type CreateUserInput = z.infer<typeof createUserSchema>['body'];
export type UpdateUserInput = z.infer<typeof updateUserSchema>['body'];

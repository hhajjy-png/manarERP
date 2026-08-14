/**
 * مخططات التحقق (Zod) لكشف المستحقات الشهرية البنكي.
 * تحرس **شكل الطلب** فقط. قواعد الأهلية المالية تعيش في الخدمة، وقواعد صيغة البنك
 * في المحرّك المشترك — لا تُعاد صياغة أيٍّ منهما هنا.
 */
import { z } from 'zod';

const yearField = z.coerce.number().int().min(2020).max(2100);
const monthField = z.coerce.number().int().min(1).max(12);
const idField = z.coerce.number().int().positive();

export const periodQuerySchema = z.object({
  query: z.object({
    month: monthField,
    year: yearField,
  }),
});

export const previewQuerySchema = z.object({
  query: z.object({
    profile: z.string().trim().min(1).max(64).optional(),
    month: monthField,
    year: yearField,
  }),
});

export const approveStatementSchema = z.object({
  body: z.object({
    month: monthField,
    year: yearField,
    profileId: z.string().trim().min(1).max(64).optional(),
    /** سقف تشغيلي — حارس ضد طلب ضخم عرضي، لا قاعدة عمل. */
    employeeIds: z.array(idField).min(1, 'اختر موظفًا واحدًا على الأقل').max(2000),
  }),
});

export const unapproveStatementSchema = z.object({
  body: z.object({
    month: monthField,
    year: yearField,
  }),
});

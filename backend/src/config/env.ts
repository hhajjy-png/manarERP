import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * مخطط التحقق من متغيرات البيئة.
 * يضمن وجود القيم المطلوبة قبل تشغيل الخدمة، ويعطي قيمًا افتراضية آمنة.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(48211),
  HOST: z.string().default('127.0.0.1'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL مطلوب'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET يجب أن يكون 32 حرفًا على الأقل'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  BACKUP_DIR: z.string().default('./data/backups'),
  ATTACHMENTS_DIR: z.string().default('./data/attachments'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  INTERNAL_SECRET: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // فشل التحقق من البيئة خطأ قاتل — نوقف التشغيل برسالة واضحة.
  // eslint-disable-next-line no-console
  console.error('✖ خطأ في متغيرات البيئة:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

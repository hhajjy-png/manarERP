import { PrismaClient } from '@prisma/client';
import { env } from './env';

/**
 * تهيئة Prisma Client كنسخة وحيدة (Singleton).
 * في وضع التطوير نحفظها على global لتفادي إنشاء اتصالات متعددة مع إعادة التحميل.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

/** إغلاق الاتصال بأمان عند إيقاف الخدمة (مهم قبل الاستعادة/النسخ). */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}

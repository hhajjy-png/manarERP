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

/**
 * يضبط busy_timeout عند الاتصال بقاعدة SQLite — إن كان الملف مقفلًا لحظيًا (فحص
 * مكافح فيروسات، مقبض متبقٍّ من عملية سابقة)، ينتظر SQLite ويُعيد المحاولة بدل رفض
 * الطلب فورًا بخطأ SQLITE_BUSY. لا يغيّر أي سلوك على مستوى البيانات — توقيت اتصال فقط.
 */
export async function initDatabase(): Promise<void> {
  // PRAGMA busy_timeout = N يُعيد صفًا بالقيمة الجديدة — $executeRawUnsafe يرفض أي
  // نتيجة صفوف (مخصّصة لعبارات الكتابة بلا نتائج)؛ $queryRawUnsafe يتعامل معها بشكل صحيح.
  await prisma.$queryRawUnsafe('PRAGMA busy_timeout = 5000;');
}

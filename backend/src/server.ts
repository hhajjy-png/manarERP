import { createApp } from './app';
import { env } from './config/env';
import { logger } from './core/utils/logger';
import { disconnectDatabase, initDatabase } from './config/database';
import { runPendingMigrations } from './core/utils/migrate';

/**
 * يسجّل خطأ قاتل ثم يُنهي العملية بأمان (قطع اتصال قاعدة البيانات أولًا إن أمكن).
 * مسار موحّد لكل أعطال ما بعد بدء التشغيل التي لا يمكن إكمال العمل بعدها بأمان
 * (استثناء غير مُلتقَط، رفض وعد غير مُعالَج، خطأ استماع الخادم).
 */
function crashSafely(context: string, err: unknown): void {
  logger.error(`[Backend] خطأ قاتل غير متوقع (${context}) — إيقاف الخدمة:`, err);
  // نفس نمط مهلة الإغلاق القسري في shutdown() أدناه — يمنع تعليق العملية إن عَلِق
  // قطع اتصال قاعدة البيانات نفسه بسبب الخطأ الذي تسبَّب بالانهيار أصلًا.
  const timer = setTimeout(() => process.exit(1), 5_000);
  disconnectDatabase()
    .catch((dbErr) => logger.error('[Backend] خطأ أثناء قطع الاتصال بقاعدة البيانات أثناء الإغلاق القسري:', dbErr))
    .finally(() => {
      clearTimeout(timer);
      process.exit(1);
    });
}

// شِباك أمان على مستوى العملية — بلا هذا، أي استثناء غير مُلتقَط أو رفض وعد غير
// مُعالَج يُسقط العملية فورًا برسالة خام قد لا تصل لأي سجل قابل للتشخيص (stdout/stderr
// في التطبيق المُعبَّأ لا يصلان لأي طرفية). الآن يُسجَّلان في ملفات winston قبل الإغلاق.
process.on('uncaughtException', (err) => crashSafely('uncaughtException', err));
process.on('unhandledRejection', (reason) => crashSafely('unhandledRejection', reason));

/**
 * نقطة تشغيل الخدمة الخلفية.
 * تستمع على 127.0.0.1 فقط (لا تُفتح للشبكة الخارجية).
 */
async function startServer() {
  try {
    runPendingMigrations();
    await initDatabase();
  } catch (err) {
    crashSafely('startup', err);
    return;
  }

  const app = createApp();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`✔ الخدمة الخلفية تعمل على http://${env.HOST}:${env.PORT}`);
  });

  // خطأ بدء الاستماع (مثل EADDRINUSE عند بقاء عملية سابقة ممسكة بالمنفذ) كان يُسقط
  // العملية بلا معالج — استثناء غير مُلتقَط برسالة عامة. الآن يُسجَّل بوضوح مع تمييز
  // EADDRINUSE تحديدًا، ثم إغلاق نظيف بدل الانهيار الصامت.
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      crashSafely(`EADDRINUSE — المنفذ ${env.PORT} مستخدم مسبقًا`, err);
    } else {
      crashSafely('server.listen', err);
    }
  });

  const shutdown = (signal: string) => {
    logger.info(`[Backend] استلام ${signal} — جارٍ الإغلاق النظيف...`);

    // يمنع EADDRINUSE عند إعادة التشغيل السريعة في --watch mode
    const timer = setTimeout(() => {
      logger.warn('[Backend] انتهى وقت الإغلاق — خروج قسري');
      process.exit(1);
    }, 5_000);

    server.close(async (err) => {
      clearTimeout(timer);
      if (err) {
        logger.error('[Backend] خطأ أثناء إغلاق الخادم:', err);
        process.exit(1);
      }
      try {
        await disconnectDatabase();
      } catch (dbErr) {
        logger.error('[Backend] خطأ أثناء قطع الاتصال بقاعدة البيانات:', dbErr);
      }
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

startServer().catch((err) => crashSafely('startServer', err));

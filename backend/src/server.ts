import { createApp } from './app';
import { env } from './config/env';
import { logger } from './core/utils/logger';
import { disconnectDatabase } from './config/database';

/**
 * نقطة تشغيل الخدمة الخلفية.
 * تستمع على 127.0.0.1 فقط (لا تُفتح للشبكة الخارجية).
 */
function startServer() {
  const app = createApp();

  const server = app.listen(env.PORT, env.HOST, () => {
    logger.info(`✔ الخدمة الخلفية تعمل على http://${env.HOST}:${env.PORT}`);
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

startServer();

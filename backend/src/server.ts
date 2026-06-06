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

  // إيقاف نظيف
  const shutdown = async (signal: string) => {
    logger.info(`استلام ${signal} — إيقاف الخدمة...`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  return server;
}

startServer();

import { createLogger, format, transports } from 'winston';
import path from 'path';
import fs from 'fs';
import { env } from '../../config/env';

// عند التشغيل داخل Electron يُمرَّر DATA_DIR لمجلد قابل للكتابة (userData)
const baseDir = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.resolve(process.cwd(), 'data');
const logsDir = path.join(baseDir, 'logs');
fs.mkdirSync(logsDir, { recursive: true });

/**
 * نظام تسجيل مركزي (Winston).
 * يكتب الأخطاء والعمليات في ملفات .log + المخرجات في وضع التطوير.
 */
export const logger = createLogger({
  level: env.LOG_LEVEL,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json(),
  ),
  transports: [
    new transports.File({ filename: path.join(logsDir, 'error.log'), level: 'error' }),
    new transports.File({ filename: path.join(logsDir, 'combined.log') }),
  ],
});

if (env.NODE_ENV !== 'production') {
  logger.add(
    new transports.Console({
      format: format.combine(format.colorize(), format.simple()),
    }),
  );
}

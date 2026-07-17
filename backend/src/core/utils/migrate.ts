import path from 'path';
import { execFileSync } from 'child_process';
import { env, isProd } from '../../config/env';
import { logger } from './logger';

/**
 * يطبّق ترحيلات Prisma المعلَّقة على قاعدة بيانات المستخدم عند بدء تشغيل الخدمة —
 * يضمن ترقية التثبيتات القائمة بأمان عند تحديث التطبيق (بلا هذا، تبقى قواعد
 * البيانات المُثبَّتة مجمَّدة على مخطط وقت التثبيت للأبد).
 *
 * إنتاج فقط: في التطوير تُطبَّق الترحيلات يدويًا عبر `npm run db:migrate`
 * (prisma migrate dev)، وتشغيل `migrate deploy` تلقائيًا هناك يُغيّر سير عمل
 * المطوّر المعتاد بلا داعٍ. `migrate deploy` غير مُدمِّر: يطبّق فقط الترحيلات
 * المُعلَّقة (بلا تغيير عند تحديث قاعدة البيانات) ولا يمسّ البيانات الموجودة.
 */
export function runPendingMigrations(): void {
  if (!isProd) return;

  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  const prismaCli = require.resolve('prisma');

  logger.info('[Migrate] فحص ترحيلات قاعدة البيانات المعلَّقة...');
  try {
    execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: env.DATABASE_URL },
    });
    logger.info('[Migrate] قاعدة البيانات محدَّثة — لا ترحيلات معلَّقة.');
  } catch (err) {
    logger.error('[Migrate] فشل تطبيق ترحيلات قاعدة البيانات — إيقاف الخدمة لمنع التشغيل على مخطط غير متسق.', err);
    throw err;
  }
}

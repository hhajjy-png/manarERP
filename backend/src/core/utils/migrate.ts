import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { prisma } from '../../config/database';
import { env, isProd } from '../../config/env';
import { logger } from './logger';

/**
 * ترحيلات Prisma عند بدء الخدمة — **مشروطة بوجود ترحيل معلَّق فعلًا**.
 *
 * ── لماذا أُعيدت كتابة هذا الملف ───────────────────────────────────────────────
 *
 * كان `runPendingMigrations()` يُطلق واجهة Prisma السطرية في **عملية مستقلة كاملة**
 * عند كل إقلاع إنتاجي، بلا أي فحص مسبق لوجود ترحيل معلَّق. الكلفة تُدفع دائمًا حتى
 * حين لا يوجد شيء ليُرحَّل — وهي الحالة الطبيعية في %99.9 من عمليات التشغيل:
 *
 *   • تحميل عشرات الميغابايتات من شيفرة الـCLI + محرّك المخطط (schema engine) الأصلي.
 *   • فحص إصدار عبر الشبكة (checkpoint) يُصدره الـCLI تلقائيًا — في تطبيق سطح مكتب
 *     يعمل دون اتصال أصلًا.
 *   • قراءة باردة لآلاف الملفات يفحصها مكافح الفيروسات عند أول تشغيل بعد التثبيت.
 *
 * القياس على جهاز حقيقي: أول تشغيل بعد التثبيت تجاوز **15 ثانية**، فتجاوز مهلة
 * `waitForHealth` في `electron/services/backendLauncher.ts` ⇒ أُغلق التطبيق قبل أن
 * تُنشأ أي نافذة. لم يكن العطل في الترحيلات نفسها بل في **دفع كلفتها بلا سبب**.
 *
 * ── العقد الجديد ───────────────────────────────────────────────────────────────
 *
 * المصدر الوحيد للحقيقة هو جدول `_prisma_migrations` الذي يديره Prisma نفسه — نفس
 * الجدول الذي يقرأه `migrate deploy`. نقارنه بمجلد `prisma/migrations` بقراءة SQL
 * واحدة رخيصة، فإن لم يوجد فرق **لا تُطلق أي عملية**.
 *
 * لا يُضعِّف هذا ضمانة سلامة المخطط إطلاقًا:
 *   • وجود ترحيل معلَّق  ⇒ يُشغَّل `migrate deploy` كما كان حرفيًا.
 *   • تعذّر تحديد الحالة ⇒ يُشغَّل `migrate deploy` (fail-safe: عند الشك، رحِّل).
 *   • فشل الترحيل        ⇒ تُوقَف الخدمة كما كان — لا تشغيل على مخطط غير متسق.
 */

/** اسم جدول سجلّ الترحيلات الذي يديره Prisma. */
const MIGRATIONS_TABLE = '_prisma_migrations';

interface AppliedRow {
  migration_name: string;
}

/** مجلد الترحيلات المشحون بجوار المخطط. */
function migrationsDir(): string {
  return path.resolve(process.cwd(), 'prisma', 'migrations');
}

/**
 * أسماء الترحيلات الموجودة على القرص — مجلد لكل ترحيل يحوي `migration.sql`.
 * مجلد بلا `migration.sql` ليس ترحيلًا (مخلّفات، `migration_lock.toml`، ...).
 */
export function listMigrationsOnDisk(dir: string = migrationsDir()): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return []; // لا مجلد ترحيلات ⇒ لا شيء ليُرحَّل
  }
  return entries
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(dir, e.name, 'migration.sql')))
    .map((e) => e.name)
    .sort();
}

/**
 * أسماء الترحيلات **المطبَّقة بنجاح** حسب سجلّ Prisma، أو `null` إن تعذّر تحديدها.
 *
 * `null` ليست «لا شيء مطبَّق» — بل «لا نعرف»، وهي الحالة التي تفرض تشغيل الـCLI:
 * قاعدة جديدة تمامًا (لا جدول سجلّ بعد)، أو قاعدة تالفة، أو صيغة سجلّ غير متوقعة.
 * الخلط بين الحالتين كان سيتخطّى ترحيلات مطلوبة على قاعدة فارغة.
 *
 * `rolled_back_at IS NULL` شرط ضروري: ترحيل تراجَع عنه Prisma ليس مطبَّقًا،
 * وعدّه مطبَّقًا يعني تخطّيه إلى الأبد على مخطط ناقص.
 */
export async function listAppliedMigrations(): Promise<string[] | null> {
  try {
    const rows = await prisma.$queryRawUnsafe<AppliedRow[]>(
      `SELECT migration_name FROM ${MIGRATIONS_TABLE} WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
    );
    if (!Array.isArray(rows)) return null;
    return rows.map((r) => r.migration_name).filter((n): n is string => typeof n === 'string');
  } catch {
    return null;
  }
}

/** نتيجة فحص الحالة — صريحة بدل قائمة فارغة ملتبسة المعنى. */
export type MigrationCheck =
  | { decision: 'UP_TO_DATE'; onDisk: number }
  | { decision: 'PENDING'; pending: string[]; onDisk: number }
  | { decision: 'UNKNOWN'; reason: string };

/** يقارن ما على القرص بما هو مسجَّل مطبَّقًا، ويقرّر ما إذا كان تشغيل الـCLI ضروريًا. */
export async function checkMigrationState(): Promise<MigrationCheck> {
  const onDisk = listMigrationsOnDisk();
  if (onDisk.length === 0) {
    // لا ترحيلات مشحونة إطلاقًا — حالة غير متوقعة في حزمة إنتاج سليمة.
    return { decision: 'UNKNOWN', reason: 'لم يُعثر على أي ترحيل في مجلد prisma/migrations' };
  }

  const applied = await listAppliedMigrations();
  if (applied === null) {
    return { decision: 'UNKNOWN', reason: `تعذّرت قراءة جدول ${MIGRATIONS_TABLE} (قاعدة جديدة أو سجلّ غير متاح)` };
  }

  const appliedSet = new Set(applied);
  const pending = onDisk.filter((name) => !appliedSet.has(name));
  return pending.length === 0
    ? { decision: 'UP_TO_DATE', onDisk: onDisk.length }
    : { decision: 'PENDING', pending, onDisk: onDisk.length };
}

/** يُشغّل `prisma migrate deploy` فعليًا. يرمي عند الفشل — لا تشغيل على مخطط غير متسق. */
function deployMigrations(): void {
  const schemaPath = path.resolve(process.cwd(), 'prisma', 'schema.prisma');
  const prismaCli = require.resolve('prisma');

  execFileSync(process.execPath, [prismaCli, 'migrate', 'deploy', '--schema', schemaPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      DATABASE_URL: env.DATABASE_URL,
      /**
       * يُعطّل فحص الإصدار الشبكي الذي يُجريه Prisma CLI تلقائيًا.
       *
       * هذا تطبيق سطح مكتب يعمل دون اتصال؛ نداء شبكي عند بدء التشغيل يضيف زمنًا
       * غير محدود سلفًا (ينتظر مهلته الخاصة على شبكة بطيئة أو محجوبة) مقابل صفر
       * فائدة للمستخدم — ويُظهر بانر «ترقية إصدار» في سجلّ الإنتاج.
       */
      CHECKPOINT_DISABLE: '1',
    },
  });
}

/**
 * يطبّق ترحيلات Prisma المعلَّقة — **إن وُجدت فقط**.
 *
 * إنتاج فقط: في التطوير تُطبَّق يدويًا عبر `npm run db:migrate` (`prisma migrate dev`).
 */
export async function runPendingMigrations(): Promise<void> {
  if (!isProd) return;

  const check = await checkMigrationState();

  if (check.decision === 'UP_TO_DATE') {
    logger.info(`[Migrate] المخطط محدَّث — ${check.onDisk} ترحيلًا مطبَّقًا، لا شيء معلَّق (لم تُشغَّل أداة الترحيل).`);
    return;
  }

  const why =
    check.decision === 'PENDING'
      ? `${check.pending.length} ترحيلًا معلَّقًا: ${check.pending.slice(0, 3).join(', ')}${check.pending.length > 3 ? '…' : ''}`
      : `تعذّر تحديد حالة الترحيلات (${check.reason}) — يُشغَّل الترحيل احتياطًا`;

  logger.info(`[Migrate] ${why}`);
  try {
    deployMigrations();
    // فحص الحالة أعلاه فتح اتصالًا بقاعدة البيانات، ثم غيّر الترحيلُ مخططها من
    // عملية أخرى. قطع الاتصال هنا يضمن أن أول استعلام حقيقي يفتح اتصالًا جديدًا
    // على المخطط بعد الترحيل، بلا أي حالة اتصال سابقة له.
    await prisma.$disconnect();
    logger.info('[Migrate] اكتمل تطبيق الترحيلات.');
  } catch (err) {
    logger.error('[Migrate] فشل تطبيق ترحيلات قاعدة البيانات — إيقاف الخدمة لمنع التشغيل على مخطط غير متسق.', err);
    throw err;
  }
}

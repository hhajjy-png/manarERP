import fs from 'fs';
import crypto from 'crypto';
import { getUserDataPaths } from './backendLauncher';

export interface IntegrityResult {
  valid: boolean;
  reason?: string;
}

/**
 * فحص أولي سريع وبلا اعتماديات: الترويسة السحرية + تناسق حجم الملف مع
 * (حجم الصفحة × عدد الصفحات) من الترويسة. مُرشِّح سريع الفشل فقط — يمنع
 * إهدار وقت تشغيل محرّك SQLite الحقيقي على ملف فارغ أو غير صالح بوضوح.
 * الفحص الحقيقي والموثوق هو `PRAGMA integrity_check` أدناه.
 */
function checkHeaderSanity(filePath: string): IntegrityResult {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return { valid: false, reason: 'الملف فارغ' };
    if (stat.size < 100) return { valid: false, reason: 'الملف أصغر من ترويسة SQLite الدنيا' };

    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(100);
    fs.readSync(fd, header, 0, 100, 0);
    fs.closeSync(fd);

    if (header.toString('binary', 0, 16) !== 'SQLite format 3\0') {
      return { valid: false, reason: 'ترويسة SQLite غير صالحة' };
    }

    let pageSize = header.readUInt16BE(16);
    if (pageSize === 1) pageSize = 65536; // القيمة الخاصة لحجم صفحة 64K
    const pageCountFromHeader = header.readUInt32BE(28);

    if (pageSize >= 512 && pageCountFromHeader > 0) {
      const expectedMinSize = pageSize * pageCountFromHeader;
      if (stat.size < expectedMinSize * 0.9) {
        return { valid: false, reason: 'حجم الملف لا يتطابق مع بيانات الترويسة — قد يكون تالفًا' };
      }
    }

    return { valid: true };
  } catch (err) {
    return { valid: false, reason: `تعذّر فحص الملف: ${String(err)}` };
  }
}

interface MinimalPrismaClient {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
  /** لعبارات لا تُعيد صفوفًا (SQLite يرفض إعادة نتائج من مسار execute). */
  $executeRawUnsafe(query: string): Promise<number>;
  $disconnect(): Promise<void>;
}

interface PrismaClientModule {
  PrismaClient: new (options: { datasources: { db: { url: string } } }) => MinimalPrismaClient;
}

/**
 * يحمّل مُنشئ PrismaClient من اعتماديات الخادم الخلفي (backend/node_modules)
 * بدلًا من إضافة اعتمادية native جديدة (مثل better-sqlite3) تتطلّب إعادة بناء
 * لمطابقة إصدار Electron ABI. محرّك Prisma الأصلي (native) مبني ومُختبر مسبقًا
 * كجزء من خط أنابيب البناء الحالي — إعادة استخدامه هنا صفر تكلفة تعبئة إضافية.
 *
 * `require.resolve` بمسار البحث `backendCwd` يُحاكي دقة تحليل وحدات Node:
 * في التطوير يجد الحزمة المُرفَّعة (hoisted) إلى node_modules الجذر عبر
 * npm workspaces؛ وفي الإنتاج يجدها داخل backend/node_modules التي تُجهَّز
 * عبر scripts/prepare-backend-deps.js لتكون مستقلة قبل التعبئة.
 */
function loadPrismaClientCtor(): PrismaClientModule['PrismaClient'] {
  const { backendCwd } = getUserDataPaths();
  const resolvedPath = require.resolve('@prisma/client', { paths: [backendCwd] });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require(resolvedPath) as PrismaClientModule;
  return mod.PrismaClient;
}

function toFileUrl(absPath: string): string {
  return 'file:' + absPath.replace(/\\/g, '/');
}

/**
 * يُشغّل استعلامًا خامًا على ملف SQLite عبر اتصال Prisma مؤقّت مستقل، ثم يُغلقه فورًا.
 * الاتصال لا يعرف شيئًا عن مخطط قاعدة البيانات — يُستخدم فقط كقناة SQLite خام.
 */
async function withAdHocConnection<T>(filePath: string, fn: (client: MinimalPrismaClient) => Promise<T>): Promise<T> {
  const PrismaClient = loadPrismaClientCtor();
  const client = new PrismaClient({ datasources: { db: { url: toFileUrl(filePath) } } });
  try {
    return await fn(client);
  } finally {
    await client.$disconnect().catch(() => { /* أفضل جهد فقط */ });
  }
}

/**
 * يُفرّغ ملف WAL في ملف قاعدة البيانات الرئيسي — يضمن أن أي نسخة لاحقة من الملف
 * (نسخ مباشر عبر fs) تعكس كل المعاملات المُلتزَمة (committed)، لا حالة جزئية.
 * أفضل جهد: إن لم تكن القاعدة في وضع WAL أصلًا فالـ PRAGMA لا تفعل شيئًا ضارًا.
 */
/**
 * يُنتج **لقطة متسقة معاملاتيًا** من قاعدة حيّة عبر `VACUUM INTO` — بديل آمن عن
 * `fs.copyFileSync` عند الرفع بينما الخادم الخلفي ما زال يكتب.
 *
 * لماذا لا يكفي النسخ المباشر: قاعدة هذا النظام تعمل بوضع الـjournal الافتراضي
 * (rollback journal) لا WAL — لا شيء في `initDatabase` يضبط `journal_mode=WAL`،
 * ولذلك `wal_checkpoint` عمليًا بلا أثر. في هذا الوضع تُكتب المعاملات **داخل
 * الملف الرئيسي نفسه**، فنسخُه أثناء معاملة جارية قد يلتقط حالة ممزّقة. و
 * `PRAGMA integrity_check` فحص **بنيوي**: قد يمرّ على ملف سليم البنية لكنه غير
 * متسق منطقيًا.
 *
 * `VACUUM INTO` يفتح معاملة قراءة ويكتب قاعدة جديدة كاملة ومتسقة، ولا يحجب
 * الكُتّاب المتزامنين — فيمنح مسار الرفع اليدوي ضمانة مسار الإغلاق (الذي يوقف
 * الخادم أولًا) **دون إيقاف الخادم ولا تعطيل تجربة المستخدم**.
 *
 * المسار يُقتبَس بمضاعفة علامة الاقتباس المفردة — `VACUUM INTO` لا يقبل معاملات
 * مربوطة (bound parameters)، والمسار هنا مُولَّد داخليًا لا من إدخال مستخدم.
 */
export async function snapshotDatabase(sourcePath: string, targetPath: string): Promise<void> {
  const quoted = targetPath.replace(/'/g, "''");
  await withAdHocConnection(sourcePath, async (client) => {
    await client.$executeRawUnsafe(`VACUUM INTO '${quoted}'`);
  });
}

export async function checkpointWal(filePath: string): Promise<void> {
  await withAdHocConnection(filePath, async (client) => {
    try {
      await client.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)');
    } catch {
      // أفضل جهد — لا يوقف تدفّق الرفع إن فشل التفريغ لسبب ما
    }
  });
}

/**
 * التحقق الحقيقي والموثوق من سلامة قاعدة البيانات عبر محرّك SQLite نفسه
 * (`PRAGMA integrity_check`)، وليس تخمينًا من الترويسة فقط. يُستخدم إلزاميًا
 * قبل كل رفع وبعد كل تنزيل. المرشّح السريع أعلاه يمنع تشغيل محرّك كامل على
 * ملف واضح البطلان.
 */
export async function checkSqliteIntegrity(filePath: string): Promise<IntegrityResult> {
  const headerCheck = checkHeaderSanity(filePath);
  if (!headerCheck.valid) return headerCheck;

  try {
    return await withAdHocConnection(filePath, async (client) => {
      const rows = await client.$queryRawUnsafe<Array<Record<string, string>>>('PRAGMA integrity_check');
      const result = rows?.[0] ? Object.values(rows[0])[0] : undefined;
      if (result === 'ok') return { valid: true };
      return { valid: false, reason: `فشل PRAGMA integrity_check: ${result ?? 'نتيجة غير متوقعة'}` };
    });
  } catch (err) {
    return { valid: false, reason: `تعذّر تنفيذ فحص السلامة الحقيقي: ${String(err)}` };
  }
}

/** بصمة SHA-256 لمحتوى الملف — تُستخدم للمقارنة بين النسخة المحلية والسحابية. */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

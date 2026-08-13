import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import {
  getUserDataPaths,
  stopBackend,
  stopBackendForRestart,
  startBackend,
  isBackendRunning,
  getInternalSecret,
} from '../services/backendLauncher';
import { reconfigureBackupScheduler } from '../services/backupScheduler';
import { hasSessionPermission } from './session.ipc';
import { withRetry } from '../services/retry';
import { markPendingReview } from '../services/pendingReview';

/** أخطاء قفل الملف على ويندوز — الوحيدة القابلة لإعادة المحاولة عند الاستبدال. */
function isFileLockError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException)?.code;
  return code === 'EPERM' || code === 'EBUSY';
}

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
}

/** تحقق من أن الملف قاعدة بيانات SQLite صالحة بفحص أول 16 بايت (magic header). */
function validateSqliteDbFile(filePath: string): boolean {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(16);
    fs.readSync(fd, buf, 0, 16, 0);
    fs.closeSync(fd);
    // SQLite magic: "SQLite format 3" + null byte (0x00)
    return buf.toString('binary') === 'SQLite format 3\0';
  } catch {
    return false;
  }
}

/**
 * تسجيل معالجات IPC للنسخ الاحتياطي والاستعادة المباشرة على مستوى Electron.
 * تعمل مستقلة عن الخادم الخلفي لضمان الأمان حتى بعد قطع اتصال Prisma.
 */
export function registerBackupIpc() {
  // ─── backup:getDatabasePath ─────────────────────────────────────────────────
  ipcMain.handle('backup:getDatabasePath', () => {
    const { dbPath, isDev, backupDir } = getUserDataPaths();
    const exists = fs.existsSync(dbPath);
    const sizeBytes = exists ? fs.statSync(dbPath).size : 0;
    return {
      dir: path.dirname(dbPath),
      backupDir,
      exists,
      sizeBytes,
      isDev,
    };
  });

  // ─── backup:create ──────────────────────────────────────────────────────────
  // يفتح حوار الحفظ هنا في العملية الرئيسية — لا يقبل مسارًا من الواجهة
  ipcMain.handle('backup:create', async () => {
    if (!hasSessionPermission('backups.create')) {
      return { success: false, error: 'ليست لديك صلاحية لإنشاء النسخ الاحتياطية' };
    }

    const { dbPath } = getUserDataPaths();

    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'ملف قاعدة البيانات غير موجود' };
    }

    const defaultName = `manar-backup-${timestamp()}.db`;
    const win = BrowserWindow.getFocusedWindow();
    const saveResult = await dialog.showSaveDialog(win!, {
      title: 'حفظ نسخة احتياطية',
      defaultPath: defaultName,
      filters: [{ name: 'قاعدة بيانات', extensions: ['db'] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const targetPath = saveResult.filePath;

    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(dbPath, targetPath);

      const { size } = fs.statSync(targetPath);
      if (size === 0) {
        fs.unlinkSync(targetPath);
        return { success: false, error: 'فشل النسخ: الملف الناتج فارغ' };
      }

      // eslint-disable-next-line no-console
      console.log(`[backup:create] تم الحفظ: ${targetPath} (${size} بايت)`);
      return { success: true, path: targetPath, sizeBytes: size };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[backup:create] خطأ:', err);
      return { success: false, error: `فشل النسخ: ${String(err)}` };
    }
  });

  // ─── backup:restore ─────────────────────────────────────────────────────────
  ipcMain.handle('backup:restore', async (_e, sourcePath: string) => {
    if (!hasSessionPermission('backups.update')) {
      return { success: false, error: 'ليست لديك صلاحية لتنفيذ استعادة قاعدة البيانات' };
    }

    if (!sourcePath) return { success: false, error: 'لم يُحدَّد ملف الاستعادة' };

    // التحقق من الامتداد .db فقط
    if (!sourcePath.toLowerCase().endsWith('.db')) {
      return { success: false, error: 'يجب اختيار ملف بصيغة .db فقط' };
    }

    // التحقق من وجود الملف
    if (!fs.existsSync(sourcePath)) {
      return { success: false, error: 'ملف النسخة الاحتياطية المختار غير موجود' };
    }

    // التحقق من أن الملف ليس فارغًا
    const sourceSize = fs.statSync(sourcePath).size;
    if (sourceSize === 0) {
      return { success: false, error: 'ملف النسخة الاحتياطية فارغ — لا يمكن الاستعادة منه' };
    }

    // التحقق من أن الملف قاعدة بيانات SQLite صالحة (magic header)
    if (!validateSqliteDbFile(sourcePath)) {
      return { success: false, error: 'الملف المختار ليس قاعدة بيانات SQLite صالحة' };
    }

    const { dbPath, backupDir, dataDir } = getUserDataPaths();

    // ── خطوة 1: نسخة أمان تلقائية إجبارية قبل الاستعادة ──────────────────────
    const autoBackupDir = path.join(backupDir, 'pre-restore');
    fs.mkdirSync(autoBackupDir, { recursive: true });
    const autoName = `manar-auto-before-restore-${timestamp()}.db`;
    const autoBackupPath = path.join(autoBackupDir, autoName);

    if (fs.existsSync(dbPath)) {
      try {
        fs.copyFileSync(dbPath, autoBackupPath);
        const autoSize = fs.statSync(autoBackupPath).size;
        if (autoSize === 0) throw new Error('النسخة التلقائية فارغة');
        // eslint-disable-next-line no-console
        console.log(`[backup:restore] نسخة أمان تلقائية: ${autoBackupPath} (${autoSize} بايت)`);
      } catch (err) {
        return { success: false, error: `فشل إنشاء نسخة الأمان التلقائية قبل الاستعادة: ${String(err)}` };
      }
    }

    // ── خطوة 2: إيقاف الخادم الخلفي والتأكّد من خروجه فعليًا ──────────────────
    // كان هذا المسار يستدعي `stopBackend()` (إرسال إشارة بلا انتظار) ثم ينام 800ms
    // ثابتة ويأمل أن يكون قفل الملف قد تحرّر. على ويندوز هذا رهان لا ضمانة. الآن
    // نستخدم نفس آلية مسار استعادة Google Drive: `stopBackendForRestart()` تنتظر
    // حدث `exit` الفعلي للعملية (بمهلة قصوى)، ولا تُثير معالج «توقّف غير متوقع».
    const backendWasRunning = isBackendRunning();
    let backendStopped = false;
    try {
      await stopBackendForRestart();
      backendStopped = backendWasRunning;
      // eslint-disable-next-line no-console
      console.log('[backup:restore] تم إيقاف الخادم الخلفي والتأكّد من خروجه');
    } catch {
      // قد يكون متوقفًا مسبقًا — نُكمل؛ إعادة المحاولة أدناه تغطّي أي قفل متبقٍّ.
    }

    // ── خطوة 3: استبدال قاعدة البيانات ────────────────────────────────────────
    try {
      // إعادة محاولة على أخطاء القفل فقط (EPERM/EBUSY) — نفس سياسة مسار Drive:
      // ويندوز قد يتأخّر لحظة في تحرير المقبض حتى بعد خروج العملية المؤكَّد.
      await withRetry(
        async () => { fs.copyFileSync(sourcePath, dbPath); },
        { maxAttempts: 6, baseDelayMs: 500, maxDelayMs: 4000, isRetryable: isFileLockError },
      );

      const { size } = fs.statSync(dbPath);
      if (size === 0) {
        // تراجع تلقائي إلى نسخة الأمان
        if (fs.existsSync(autoBackupPath)) fs.copyFileSync(autoBackupPath, dbPath);
        return { success: false, error: 'فشل الاستعادة: قاعدة البيانات الناتجة فارغة — تم التراجع تلقائيًا' };
      }

      // eslint-disable-next-line no-console
      console.log(`[backup:restore] تمت الاستعادة من: ${sourcePath} — الحجم: ${size} بايت`);

      /**
       * Data Safety Pack v2 — F-05 · وسم «قيد المراجعة».
       *
       * الاستعادة تجعل `localChanged = true` بينما `remoteChanged = false`، فقرار
       * المزامنة التالي كان `UPLOAD` ⇒ مزامنة الإغلاق ترفع النسخة المستعادة (وقد
       * تكون عمرها أسابيع) فوق النسخة السحابية الحالية بلا حوار ولا تحذير. الوسم
       * يوقف المزامنة التلقائية في الاتجاهين حتى يقرّر المستخدم صراحةً.
       *
       * فشل الوسم **لا يُفشل الاستعادة**: القاعدة استُبدلت بنجاح فعلًا، والتراجع عنها
       * أضرّ من المتابعة. يُسجَّل التحذير ليظهر في التشخيص.
       */
      if (!markPendingReview(dataDir, { source: 'RESTORE', detail: path.basename(sourcePath) })) {
        // eslint-disable-next-line no-console
        console.warn('[backup:restore] تعذّر وسم القاعدة «قيد المراجعة» — قد تُستأنف المزامنة التلقائية.');
      }

      return {
        success: true,
        requiresRestart: true,
        autoBackupPath,
        sizeBytes: size,
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[backup:restore] خطأ أثناء الاستعادة:', err);
      // تراجع تلقائي
      try {
        if (fs.existsSync(autoBackupPath)) fs.copyFileSync(autoBackupPath, dbPath);
        // eslint-disable-next-line no-console
        console.log('[backup:restore] تم التراجع إلى قاعدة البيانات الأصلية');
      } catch (rollbackErr) {
        // eslint-disable-next-line no-console
        console.error('[backup:restore] فشل التراجع:', rollbackErr);
      }
      return { success: false, error: `فشل استبدال قاعدة البيانات: ${String(err)}` };
    } finally {
      // لا يُترك التطبيق بلا خادم خلفي مهما كانت النتيجة — نفس ضمانة `finally`
      // في مسار استعادة Drive. `requiresRestart: true` يبقى كما هو في الاستجابة:
      // الواجهة ما زالت تطلب إعادة تشغيل نظيفة، لكن التطبيق يبقى صالحًا للعمل
      // بدل أن يبقى معلّقًا بلا خادم إن تجاهل المستخدم الطلب.
      if (backendStopped) {
        try {
          await startBackend(getInternalSecret());
          // eslint-disable-next-line no-console
          console.log('[backup:restore] أُعيد تشغيل الخادم الخلفي');
        } catch (restartErr) {
          // eslint-disable-next-line no-console
          console.error('[backup:restore] تعذّر إعادة تشغيل الخادم الخلفي — يلزم إعادة تشغيل التطبيق:', restartErr);
        }
      }
    }
  });

  // ─── backup:reconfigure ─────────────────────────────────────────────────────
  // تُستدعى من الواجهة بعد تغيير إعدادات النسخ التلقائي لإعادة تشغيل الجدولة.
  ipcMain.handle('backup:reconfigure', async () => {
    try {
      await reconfigureBackupScheduler();
      return { ok: true };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[backup:reconfigure] خطأ:', err);
      return { ok: false };
    }
  });
}

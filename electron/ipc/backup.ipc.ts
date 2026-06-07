import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { getUserDataPaths, stopBackend } from '../services/backendLauncher';

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`
  );
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
  ipcMain.handle('backup:create', async (_e, targetPath: string) => {
    if (!targetPath) return { success: false, error: 'لم يُحدَّد مسار الحفظ' };
    if (!targetPath.endsWith('.db')) return { success: false, error: 'يجب أن يكون الملف بصيغة .db' };

    const { dbPath } = getUserDataPaths();

    if (!fs.existsSync(dbPath)) {
      return { success: false, error: 'ملف قاعدة البيانات غير موجود' };
    }

    if (fs.existsSync(targetPath)) {
      return { success: false, error: 'يوجد ملف بهذا الاسم بالفعل — اختر اسمًا مختلفًا' };
    }

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

    const { dbPath, backupDir } = getUserDataPaths();

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

    // ── خطوة 2: إيقاف الخادم الخلفي لقطع اتصالات Prisma ──────────────────────
    try {
      stopBackend();
      // eslint-disable-next-line no-console
      console.log('[backup:restore] تم إيقاف الخادم الخلفي');
    } catch {
      // قد يكون متوقفًا مسبقًا
    }

    // انتظار 800ms لإغلاق الاتصالات
    await new Promise((r) => setTimeout(r, 800));

    // ── خطوة 3: استبدال قاعدة البيانات ────────────────────────────────────────
    try {
      fs.copyFileSync(sourcePath, dbPath);

      const { size } = fs.statSync(dbPath);
      if (size === 0) {
        // تراجع تلقائي إلى نسخة الأمان
        if (fs.existsSync(autoBackupPath)) fs.copyFileSync(autoBackupPath, dbPath);
        return { success: false, error: 'فشل الاستعادة: قاعدة البيانات الناتجة فارغة — تم التراجع تلقائيًا' };
      }

      // eslint-disable-next-line no-console
      console.log(`[backup:restore] تمت الاستعادة من: ${sourcePath} — الحجم: ${size} بايت`);
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
    }
  });
}

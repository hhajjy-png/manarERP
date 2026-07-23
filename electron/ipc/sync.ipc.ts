import { ipcMain } from 'electron';
import { getUserDataPaths } from '../services/backendLauncher';
import { hasSessionPermission } from './session.ipc';
import {
  getSyncStatus,
  getSyncLog,
  authenticate,
  disconnect,
  performSyncNow,
  performUpload,
  performDownload,
  checkForConflict,
  resolveConflict,
} from '../services/syncEngine.service';

/**
 * تسجيل معالجات IPC لمزامنة Google Drive. تُعيد استخدام صلاحيات النسخ الاحتياطي
 * الموجودة (backups.create / backups.update) بدل تعريف صلاحيات جديدة — المزامنة
 * مفهوميًا امتداد لعملية النسخ الاحتياطي/الاستعادة على نفس ملف قاعدة البيانات.
 */
export function registerSyncIpc() {
  ipcMain.handle('sync:getStatus', async () => {
    const { dbPath, dataDir } = getUserDataPaths();
    return getSyncStatus(dbPath, dataDir);
  });

  ipcMain.handle('sync:getLog', () => {
    const { dataDir } = getUserDataPaths();
    return getSyncLog(dataDir);
  });

  ipcMain.handle('sync:authenticate', async () => {
    if (!hasSessionPermission('backups.update')) {
      return { ok: false, error: 'ليست لديك صلاحية لإعداد المزامنة السحابية' };
    }
    const { dataDir } = getUserDataPaths();
    return authenticate(dataDir);
  });

  ipcMain.handle('sync:disconnect', async () => {
    if (!hasSessionPermission('backups.update')) {
      return { ok: false, error: 'ليست لديك صلاحية لفصل المزامنة السحابية' };
    }
    const { dataDir } = getUserDataPaths();
    return disconnect(dataDir);
  });

  ipcMain.handle('sync:now', async () => {
    if (!hasSessionPermission('backups.update')) {
      return { ok: false, action: 'NONE', error: 'ليست لديك صلاحية لتنفيذ المزامنة' };
    }
    const { dbPath, dataDir } = getUserDataPaths();
    return performSyncNow(dbPath, dataDir);
  });

  ipcMain.handle('sync:upload', async () => {
    if (!hasSessionPermission('backups.create')) {
      return { ok: false, error: 'ليست لديك صلاحية لرفع قاعدة البيانات' };
    }
    const { dbPath, dataDir } = getUserDataPaths();
    return performUpload(dbPath, dataDir);
  });

  ipcMain.handle('sync:download', async () => {
    if (!hasSessionPermission('backups.update')) {
      return { ok: false, error: 'ليست لديك صلاحية لتنزيل قاعدة البيانات' };
    }
    const { dbPath, dataDir } = getUserDataPaths();
    return performDownload(dbPath, dataDir);
  });

  // ─── Google Drive Conflict Resolution Pack v1 ────────────────────────────────

  // فحص سلبي — بلا صلاحية إضافية، بنفس مستوى sync:getStatus/getLog للقراءة فقط.
  ipcMain.handle('sync:getConflict', async () => {
    const { dbPath, dataDir } = getUserDataPaths();
    return checkForConflict(dbPath, dataDir);
  });

  ipcMain.handle('sync:resolveConflict', async (_e, choice: 'LOCAL' | 'REMOTE') => {
    if (!hasSessionPermission('backups.update')) {
      return { ok: false, error: 'ليست لديك صلاحية لحلّ تعارض المزامنة' };
    }
    if (choice !== 'LOCAL' && choice !== 'REMOTE') {
      return { ok: false, error: 'اختيار غير صالح' };
    }
    const { dbPath, dataDir } = getUserDataPaths();
    return resolveConflict(choice, dbPath, dataDir);
  });
}

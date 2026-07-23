import { app, BrowserWindow, Menu } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { startBackend, stopBackend, getUserDataPaths, getInternalSecret } from './services/backendLauncher';
import { startBackupScheduler, stopBackupScheduler, runCatchupIfNeeded } from './services/backupScheduler';
import { performStartupSync, performShutdownSync } from './services/syncEngine.service';
import { registerDialogIpc } from './ipc/dialog.ipc';
import { registerBackupIpc } from './ipc/backup.ipc';
import { registerSessionIpc } from './ipc/session.ipc';
import { registerSyncIpc } from './ipc/sync.ipc';
import { registerContextMenuIpc } from './ipc/contextMenu.ipc';
import { registerPdfIpc } from './ipc/pdf.ipc';
import { registerAttachmentsIpc } from './ipc/attachments.ipc';
import { registerPrintIpc } from './services/printService';
import { registerWysiwygPocIpc } from './ipc/wysiwygPoc.ipc';
import { registerWysiwygViewerGuard } from './ipc/wysiwygViewerGuard.ipc';

const INTERNAL_SECRET = getInternalSecret();

// منع تشغيل أكثر من نسخة من التطبيق في آن واحد
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

async function bootstrap() {
  try {
    registerDialogIpc();
    registerBackupIpc();
    registerSessionIpc();
    registerSyncIpc();
    registerPdfIpc();
    registerAttachmentsIpc();
    // Print Center Foundation v1 — additive. `app:print` / `pdf:export` /
    // `pdf:exportHtml` remain registered above and fully functional.
    registerPrintIpc();
    // True Chromium WYSIWYG Preview POC — additive, preview-artifact only.
    // Prints nothing; the legacy print path above is untouched.
    registerWysiwygPocIpc();
    // مزامنة بدء التشغيل — تُنزّل نسخة أحدث من Google Drive إن وُجدت، قبل تشغيل
    // الخادم الخلفي (الذي يفتح قفل ملف SQLite). محدودة بمهلة داخلية ولا تُعطّل
    // بدء التطبيق أبدًا حتى عند الفشل.
    try {
      const { dbPath, dataDir } = getUserDataPaths();
      await performStartupSync(dbPath, dataDir);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sync] فشلت مزامنة بدء التشغيل — الاستمرار بقاعدة البيانات المحلية:', err);
    }

    await startBackend(INTERNAL_SECRET); // تشغيل الخدمة الخلفية أولًا
    await startBackupScheduler(INTERNAL_SECRET); // ثم جدولة النسخ التلقائي
    runCatchupIfNeeded(INTERNAL_SECRET).catch(console.error); // نسخة تعويضية إذا فات وقت الجدولة

    mainWindow = createMainWindow();
    registerContextMenuIpc(mainWindow);
    // WYSIWYG viewer guard — suppresses PDFium's Ctrl+P / Ctrl+S exits, but ONLY while a
    // WYSIWYG preview is open. One listener for the window's lifetime; no global blocking.
    registerWysiwygViewerGuard(mainWindow);

    // قائمة عربية مبسّطة
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'ملف',
          submenu: [{ role: 'quit', label: 'خروج' }],
        },
        {
          label: 'تحرير',
          submenu: [
            { role: 'undo', label: 'تراجع' },
            { role: 'redo', label: 'إعادة' },
            { type: 'separator' },
            { role: 'cut', label: 'قص' },
            { role: 'copy', label: 'نسخ' },
            { role: 'paste', label: 'لصق' },
          ],
        },
        {
          label: 'عرض',
          submenu: [
            { role: 'reload', label: 'إعادة تحميل' },
            { role: 'togglefullscreen', label: 'ملء الشاشة' },
            { role: 'zoomIn', label: 'تكبير' },
            { role: 'zoomOut', label: 'تصغير' },
          ],
        },
      ]),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('فشل بدء التطبيق:', err);
    app.quit();
  }
}

app.whenReady().then(bootstrap);

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// إغلاق مُتدرّج: نوقف الجدولة والخادم الخلفي أولًا (لتحرير قفل SQLite)، ثم نرفع
// قاعدة البيانات إلى Google Drive إن تغيّرت، ثم نُنهي التطبيق فعليًا. `event.preventDefault`
// يوقف الإغلاق الفوري مرّة واحدة فقط — `quitConfirmed` يمنع حلقة لا نهائية.
let quitConfirmed = false;
app.on('before-quit', (event) => {
  if (quitConfirmed) return;
  event.preventDefault();

  (async () => {
    stopBackupScheduler();
    stopBackend();
    await new Promise((r) => setTimeout(r, 800)); // انتظار إغلاق اتصالات Prisma

    try {
      const { dbPath, dataDir } = getUserDataPaths();
      await performShutdownSync(dbPath, dataDir);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sync] فشلت مزامنة الإغلاق:', err);
    }

    quitConfirmed = true;
    app.quit();
  })();
});

import { app, BrowserWindow, Menu } from 'electron';
import { randomUUID } from 'crypto';
import { createMainWindow } from './windows/mainWindow';
import { startBackend, stopBackend } from './services/backendLauncher';
import { startBackupScheduler, stopBackupScheduler, runCatchupIfNeeded } from './services/backupScheduler';
import { registerDialogIpc } from './ipc/dialog.ipc';
import { registerBackupIpc } from './ipc/backup.ipc';
import { registerSessionIpc } from './ipc/session.ipc';
import { registerContextMenuIpc } from './ipc/contextMenu.ipc';
import { registerPdfIpc } from './ipc/pdf.ipc';
import { registerAttachmentsIpc } from './ipc/attachments.ipc';
import { registerPrintIpc } from './services/printService';
import { registerWysiwygPocIpc } from './ipc/wysiwygPoc.ipc';

const INTERNAL_SECRET = randomUUID();

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
    registerPdfIpc();
    registerAttachmentsIpc();
    // Print Center Foundation v1 — additive. `app:print` / `pdf:export` /
    // `pdf:exportHtml` remain registered above and fully functional.
    registerPrintIpc();
    // True Chromium WYSIWYG Preview POC — additive, preview-artifact only.
    // Prints nothing; the legacy print path above is untouched.
    registerWysiwygPocIpc();
    await startBackend(INTERNAL_SECRET); // تشغيل الخدمة الخلفية أولًا
    await startBackupScheduler(INTERNAL_SECRET); // ثم جدولة النسخ التلقائي
    runCatchupIfNeeded(INTERNAL_SECRET).catch(console.error); // نسخة تعويضية إذا فات وقت الجدولة

    mainWindow = createMainWindow();
    registerContextMenuIpc(mainWindow);

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

app.on('before-quit', () => {
  stopBackupScheduler();
  stopBackend();
});

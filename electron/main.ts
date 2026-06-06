import { app, BrowserWindow, Menu } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { startBackend, stopBackend } from './services/backendLauncher';
import { startBackupScheduler, stopBackupScheduler } from './services/backupScheduler';
import { registerDialogIpc } from './ipc/dialog.ipc';

// منع تشغيل أكثر من نسخة من التطبيق في آن واحد
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

async function bootstrap() {
  try {
    registerDialogIpc();
    await startBackend(); // تشغيل الخدمة الخلفية أولًا
    startBackupScheduler(); // ثم جدولة النسخ التلقائي

    mainWindow = createMainWindow();

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

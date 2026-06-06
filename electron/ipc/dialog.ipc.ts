import { app, BrowserWindow, dialog, ipcMain } from 'electron';

/** تسجيل معالجات IPC الخاصة بحوارات النظام والتطبيق. */
export function registerDialogIpc() {
  // اختيار مسار حفظ (تصدير قاعدة البيانات)
  ipcMain.handle('dialog:save', async (_e, defaultName: string) => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showSaveDialog(win!, {
      title: 'حفظ نسخة من قاعدة البيانات',
      defaultPath: defaultName,
      filters: [{ name: 'قاعدة بيانات', extensions: ['db'] }],
    });
    return result.canceled ? null : result.filePath ?? null;
  });

  // اختيار ملف نسخة احتياطية للاستعادة
  ipcMain.handle('dialog:openBackup', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'اختر ملف النسخة الاحتياطية',
      properties: ['openFile'],
      filters: [{ name: 'قاعدة بيانات', extensions: ['db'] }],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  // إعادة تشغيل التطبيق (بعد الاستعادة)
  ipcMain.handle('app:restart', () => {
    app.relaunch();
    app.exit(0);
  });

  // طباعة الصفحة الحالية
  ipcMain.handle('app:print', async () => {
    const win = BrowserWindow.getFocusedWindow();
    win?.webContents.print({ silent: false, printBackground: true });
  });

  // معلومات التطبيق
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
}

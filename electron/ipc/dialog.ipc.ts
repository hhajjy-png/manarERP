import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { mapPrintCallback, NO_FOCUSED_WINDOW_RESULT } from './printResult';

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
  // خيار landscape اختياري وإضافي: عند تمريره true يُفرض اتجاه الطباعة الأفقي
  // أصلاً عبر Chromium (لا يُعتمد على @page CSS وحده). بدون الخيار يبقى السلوك
  // مطابقًا تمامًا لما كان (لا يتغيّر أي مسار طباعة قائم، بما فيه المعايرة).
  //
  // النتيجة: كانت `webContents.print()` تُستدعى بلا callback (fire-and-forget) —
  // فيُحل الـ IPC فورًا بلا معرفة ما إذا طُبعت الصفحة فعلاً أم أُلغيت أم فشلت.
  // الإصلاح الإضافي الوحيد هنا: تمرير الـ callback الموثّق من Electron نفسه
  // (`success`, `failureReason`) ولفّه بوعد، فيُحل الـ IPC بعد أن يغلق المستخدم
  // حوار الطباعة فعليًا — دون تغيير أي من خيارات الطباعة (silent/printBackground/
  // landscape) أو مسار الطباعة نفسه.
  ipcMain.handle('app:print', (_e, options?: { landscape?: boolean }) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return Promise.resolve(NO_FOCUSED_WINDOW_RESULT);
    return new Promise((resolve) => {
      win.webContents.print(
        {
          silent: false,
          printBackground: true,
          ...(options?.landscape ? { landscape: true } : {}),
        },
        (success, failureReason) => resolve(mapPrintCallback(success, failureReason)),
      );
    });
  });

  // معلومات التطبيق
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
}

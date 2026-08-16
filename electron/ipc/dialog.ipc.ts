import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { mapPrintCallback, NO_FOCUSED_WINDOW_RESULT } from './printResult';
import { buildPrintOptions, type PrintPageOptions } from './printPageOptions';
import { stopBackend, stopBackendForRestart } from '../services/backendLauncher';
import { releaseRuntimeLock } from '../services/runtimeLock';

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
  //
  // `app.exit()` يتجاوز `before-quit`/`will-quit` كليًا، فلا يُستدعى `stopBackend`.
  // وعلى Windows لا يقتل خروجُ العملية الأب العمليةَ الابن المتفرّعة: يبقى الخادم
  // الخلفي حاملًا المنفذ 48211، فتفشل النسخة المُعاد تشغيلها بـ EADDRINUSE — على
  // المسار الأكثر استخدامًا لهذا القناة نفسها (إعادة التشغيل بعد استعادة نسخة
  // احتياطية). لذا نُنهي الخادم فعليًا وننتظر خروجه، ونحرّر قفل التشغيل، قبل
  // `relaunch`. الإنهاء داخل `try` كي لا يمنع فشلُه إعادةَ التشغيل نفسها.
  ipcMain.handle('app:restart', async () => {
    try {
      await stopBackendForRestart();
    } catch (err) {
      console.error('[app:restart] تعذّر إيقاف الخادم الخلفي بشكل مضبوط:', err);
      stopBackend();
    }
    try {
      releaseRuntimeLock();
    } catch (err) {
      console.error('[app:restart] تعذّر تحرير قفل التشغيل:', err);
    }
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
  // ── Deterministic physical page (Cheque Printing Deterministic Geometry &
  // Unified Pipeline Pack v1) ───────────────────────────────────────────────────
  // Previously only `landscape` could be supplied, so a print job carried NO
  // pageSize, NO margins and NO scaleFactor — the physical page came from
  // whatever the OS print dialog happened to be set to. Because every cheque box
  // is sized relative to that page, two prints of the same template could land at
  // different scales and origins (root cause H1/H2/H4).
  //
  // The handler now forwards an explicit physical page when the caller supplies
  // one. Option shapes are taken from the Electron 31 typings installed in this
  // repo (`WebContentsPrintOptions` / `Margins` / `Size`):
  //   • pageSize as an object is in MICRONS (min 353 per platform validation)
  //   • marginType ∈ 'default' | 'none' | 'printableArea' | 'custom'
  //   • scaleFactor is the page scale (100 = actual size)
  //
  // Every field stays OPTIONAL and is forwarded only when present, so existing
  // callers (invoices, reports, calibration test sheet) that pass nothing — or
  // pass only `landscape` — behave exactly as they did before this pack.
  ipcMain.handle('app:print', (_e, options?: PrintPageOptions) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return Promise.resolve(NO_FOCUSED_WINDOW_RESULT);
    return new Promise((resolve) => {
      win.webContents.print(
        { silent: false, printBackground: true, ...buildPrintOptions(options) },
        (success, failureReason) => resolve(mapPrintCallback(success, failureReason)),
      );
    });
  });

  // معلومات التطبيق
  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
}

import { app, BrowserWindow, Menu, dialog } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { beginSyncProgressUI } from './windows/syncProgressWindow';
import { registerMainWindow, shouldQuitOnAllWindowsClosed } from './windows/windowLifecycle';
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
import { registerNbkExportIpc } from './ipc/nbkExport.ipc';
import { acquireRuntimeLock, releaseRuntimeLock, describeLockConflict, runtimeLockPath } from './services/runtimeLock';
import { cleanupOrphanSyncTemps } from './services/syncTempCleanup';

const INTERNAL_SECRET = getInternalSecret();

// منع تشغيل أكثر من نسخة من التطبيق في آن واحد
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;

/**
 * حارس Dev/Packaged Split-Brain — يجب أن يسبق **أي** مزامنة أو تشغيل للخادم.
 *
 * `app.requestSingleInstanceLock()` أعلاه مُفهرَس بمسار `userData`، وهو مختلف بين
 * بيئة التطوير والنسخة المُعبَّأة — فلا يرى أيٌّ منهما قفل الآخر. هذا القفل يعيش في
 * مسار ثابت مشتق من المجلد الشخصي للمستخدم وحده، فيراه الاثنان. انظر
 * `services/runtimeLock.ts`.
 *
 * عند التقاطع: رسالة واضحة ثم خروج. لا حذف ولا دمج ولا نسخ لأي قاعدة بيانات.
 */
function guardAgainstSplitBrain(dataDir: string): boolean {
  const lock = acquireRuntimeLock(dataDir);

  if (!lock.ok) {
    // `HELD` = الحماية عملت ورفضت. `UNAVAILABLE` = تعذّر إنشاء القفل أصلًا.
    // كلتاهما **تمنع التشغيل**: في حزمة غرضها منع الـsplit-brain، المتابعة بلا
    // قفل تعني تشغيلًا غير محمي بصمت — وهو أسوأ من عدم التشغيل. FAIL CLOSED.
    const held = lock.reason === 'HELD';
    dialog.showMessageBoxSync({
      type: held ? 'warning' : 'error',
      title: held ? 'نظام المنار — نسخة أخرى تعمل بالفعل' : 'نظام المنار — تعذّر تأمين التشغيل',
      message: 'تعذّر بدء التشغيل',
      detail: held
        ? describeLockConflict(lock.holder, dataDir)
        : 'تعذّر إنشاء قفل الأمان الذي يمنع تشغيل نسختين من النظام على قاعدتَي بيانات مختلفتين ' +
          'تُزامنان حساب Google Drive نفسه.\n\n' +
          'لم يبدأ التطبيق، ولم تُنفَّذ أي مزامنة، ولم يُغيَّر أي ملف — التشغيل بلا هذه الحماية ' +
          'قد يؤدي إلى فقدان بيانات.\n\n' +
          `المسار: ${runtimeLockPath()}\n` +
          `السبب: ${lock.error}\n\n` +
          'تحقّق من صلاحيات الكتابة في مجلد المستخدم ومن توفّر مساحة على القرص، ثم أعد المحاولة.',
      buttons: ['حسناً'],
    });
    // eslint-disable-next-line no-console
    console.error(`[runtime-lock] رُفض بدء التشغيل (${lock.reason})`);
    return false;
  }

  if (lock.tookOverStaleLock) {
    // eslint-disable-next-line no-console
    console.warn('[runtime-lock] عُثر على قفل يتيم من إغلاق غير نظيف — تم الاستحواذ عليه');
  }
  return true;
}

async function bootstrap() {
  try {
    // ── حارس التقاطع أولًا: قبل المزامنة وقبل تشغيل الخادم وقبل أي كتابة ──────
    const { dataDir: bootDataDir } = getUserDataPaths();
    if (!guardAgainstSplitBrain(bootDataDir)) {
      // بيئة رُفض دخولها ليست بيئة عاملة: يجب ألّا تمرّ بتسلسل الإغلاق المتدرّج
      // إطلاقًا. بدون هذا الوسم كان `app.quit()` يُطلق `before-quit` بـ
      // `quitConfirmed=false` فيُنفَّذ `performShutdownSync` — أي **رفع محتمل إلى
      // Drive من البيئة التي رفضناها للتوّ**، وهو نقض مباشر لغرض الحارس.
      startupAborted = true;
      app.quit();
      return;
    }

    // كنس لقطات المزامنة اليتيمة (بقايا إغلاق قسري أثناء رفع/تنزيل سابق).
    // أفضل جهد بحت — لا يُعطّل بدء التطبيق مهما فشل.
    try {
      const swept = cleanupOrphanSyncTemps(bootDataDir);
      if (swept.deleted.length || swept.failed.length) {
        // eslint-disable-next-line no-console
        console.log(
          `[sync-temp] حُذف ${swept.deleted.length} ملفًا يتيمًا` +
            (swept.skippedRecent.length ? ` · تُرك ${swept.skippedRecent.length} حديثًا` : '') +
            (swept.failed.length ? ` · تعذّر حذف ${swept.failed.length}` : ''),
        );
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sync-temp] فشل كنس الملفات المؤقتة — المتابعة:', err);
    }

    registerDialogIpc();
    registerBackupIpc();
    registerSessionIpc();
    registerSyncIpc();
    registerPdfIpc();
    registerAttachmentsIpc();
    // NBK Salary Export — Native XLS Generation v1 (additive; other Excel exports unchanged).
    registerNbkExportIpc();
    // Print Center Foundation v1 — additive. `app:print` / `pdf:export` /
    // `pdf:exportHtml` remain registered above and fully functional.
    registerPrintIpc();
    // True Chromium WYSIWYG Preview POC — additive, preview-artifact only.
    // Prints nothing; the legacy print path above is untouched.
    registerWysiwygPocIpc();
    // مزامنة بدء التشغيل — تُنزّل نسخة أحدث من Google Drive إن وُجدت، قبل تشغيل
    // الخادم الخلفي (الذي يفتح قفل ملف SQLite). محدودة بمهلة داخلية ولا تُعطّل
    // بدء التطبيق أبدًا حتى عند الفشل.
    // Cloud Sync Progress Dialog v1 — purely additive UI wrapper. The sync
    // call, its try/catch, and its error handling below are UNCHANGED; the
    // dialog only shows/hides around it and never affects whether or how
    // startup sync runs.
    const startupSyncUI = beginSyncProgressUI();
    try {
      const { dbPath, dataDir } = getUserDataPaths();
      await performStartupSync(dbPath, dataDir);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sync] فشلت مزامنة بدء التشغيل — الاستمرار بقاعدة البيانات المحلية:', err);
    } finally {
      await startupSyncUI.finish();
    }

    await startBackend(INTERNAL_SECRET); // تشغيل الخدمة الخلفية أولًا
    await startBackupScheduler(INTERNAL_SECRET); // ثم جدولة النسخ التلقائي
    runCatchupIfNeeded(INTERNAL_SECRET).catch(console.error); // نسخة تعويضية إذا فات وقت الجدولة

    mainWindow = createMainWindow();
    registerMainWindow(mainWindow);
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
  // إغلاق آخر نافذة مساعدة (حوار تقدّم المزامنة أثناء بدء التشغيل، مثلًا) قبل
  // إنشاء النافذة الرئيسية لا يعني أبدًا أن المستخدم يريد إغلاق التطبيق — هذا
  // الحدث لا يميّز بين أنواع النوافذ من تلقاء نفسه، لذا نتحقق صراحةً.
  if (!shouldQuitOnAllWindowsClosed()) return;
  if (process.platform !== 'darwin') app.quit();
});

// إغلاق مُتدرّج: نوقف الجدولة والخادم الخلفي أولًا (لتحرير قفل SQLite)، ثم نرفع
// قاعدة البيانات إلى Google Drive إن تغيّرت، ثم نُنهي التطبيق فعليًا. `event.preventDefault`
// يوقف الإغلاق الفوري مرّة واحدة فقط — `quitConfirmed` يمنع حلقة لا نهائية.
let quitConfirmed = false;
/**
 * صحيح حين رفض حارس التشغيل هذه البيئة (قفل بيد بيئة أخرى، أو تعذّر إنشاء القفل).
 *
 * عندها لم يبدأ خادم خلفي، ولم تُسجَّل معالجات IPC للمزامنة/النسخ الاحتياطي، ولم
 * تجرِ مزامنة بدء. الخروج يجب أن يكون **فوريًا وصامتًا**: لا مزامنة إغلاق، ولا
 * أي عملية Drive أو قاعدة بيانات. مُعرَّف قبل `bootstrap` في ترتيب التنفيذ لأن
 * `bootstrap` لا يعمل إلا بعد `app.whenReady()`.
 */
let startupAborted = false;

app.on('before-quit', (event) => {
  // بيئة مرفوضة: لا `preventDefault` ولا تسلسل إغلاق — اخرج مباشرة.
  if (quitConfirmed || startupAborted) return;
  event.preventDefault();

  (async () => {
    stopBackupScheduler();
    stopBackend();
    await new Promise((r) => setTimeout(r, 800)); // انتظار إغلاق اتصالات Prisma

    // Cloud Sync Progress Dialog v1 — purely additive UI wrapper, same
    // discipline as the startup call site above: the sync call and its
    // error handling are UNCHANGED.
    const shutdownSyncUI = beginSyncProgressUI(mainWindow);
    try {
      const { dbPath, dataDir } = getUserDataPaths();
      await performShutdownSync(dbPath, dataDir);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[sync] فشلت مزامنة الإغلاق:', err);
    } finally {
      await shutdownSyncUI.finish();
    }

    // تحرير قفل التشغيل **بعد** اكتمال مزامنة الإغلاق — القفل يحمي المزامنة نفسها،
    // فتحريره قبلها كان سيفتح نافذة تبدأ فيها بيئة أخرى الرفع بالتوازي.
    releaseRuntimeLock();

    quitConfirmed = true;
    app.quit();
  })();
});

// شبكة أمان: خروج غير مارّ بـ`before-quit` (إنهاء من نظام التشغيل مثلًا) يجب ألّا
// يترك قفلًا حيًّا. البقايا تُعامَل كقفل يتيم لاحقًا، لكن التحرير هنا أنظف.
app.on('will-quit', () => releaseRuntimeLock());

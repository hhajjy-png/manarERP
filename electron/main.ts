import { app, BrowserWindow, Menu, dialog, Notification } from 'electron';
import { createMainWindow } from './windows/mainWindow';
import { beginSyncProgressUI } from './windows/syncProgressWindow';
import { registerMainWindow, shouldQuitOnAllWindowsClosed } from './windows/windowLifecycle';
import { startBackend, stopBackend, getUserDataPaths, getInternalSecret, BackendStartupError } from './services/backendLauncher';
import { createStartupWindow, type StartupWindowHandle } from './windows/startupWindow';
import { reportStartup } from './services/startupProgressBus';
import { startBackupScheduler, stopBackupScheduler, runCatchupIfNeeded } from './services/backupScheduler';
import { performStartupSync, performShutdownSync } from './services/syncEngine.service';
import { registerDialogIpc } from './ipc/dialog.ipc';
import { registerBackupIpc } from './ipc/backup.ipc';
import { registerSessionIpc } from './ipc/session.ipc';
import { registerSyncIpc } from './ipc/sync.ipc';
import { registerContextMenuIpc } from './ipc/contextMenu.ipc';
import { registerPdfIpc } from './ipc/pdf.ipc';
import { registerDocxIpc } from './ipc/docx.ipc';
import { registerAttachmentsIpc } from './ipc/attachments.ipc';
import { registerPrintIpc } from './services/printService';
import { registerWysiwygPocIpc } from './ipc/wysiwygPoc.ipc';
import { registerWysiwygViewerGuard } from './ipc/wysiwygViewerGuard.ipc';
import { registerNbkExportIpc } from './ipc/nbkExport.ipc';
import { registerLegacyRecoveryIpc } from './ipc/legacyRecovery.ipc';
import { acquireRuntimeLock, releaseRuntimeLock, describeLockConflict, runtimeLockPath } from './services/runtimeLock';
import { cleanupOrphanSyncTemps } from './services/syncTempCleanup';
import { readSavedZoomLevel, saveZoomLevel } from './services/viewZoomPreference.pure';

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
    // نافذة بدء التشغيل `alwaysOnTop` — تُغلق قبل الحوار وإلا حجبته عن المستخدم
    // فبدا التطبيق معلّقًا بلا سبب ظاهر.
    startupWindow?.close();
    startupWindow = null;
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

/**
 * Production Startup Pack v1 — نافذة بدء التشغيل، تُنشأ قبل أي عمل بطيء.
 *
 * تُعرَّف على مستوى الوحدة لا داخل `bootstrap` لأن معالج الفشل أدناه يحتاجها،
 * ولأن فتح النافذة الرئيسية يجب أن يُغلقها مهما كان مسار الوصول.
 */
let startupWindow: StartupWindowHandle | null = null;

/**
 * إنهاء التطبيق بعد فشل الإقلاع — **بطلب صريح من المستخدم**.
 *
 * `stopBackend()` أولًا: قد تكون الخدمة الخلفية بدأت فعلًا قبل وقوع الفشل، وعلى
 * وندوز لا يقتل خروجُ العملية الأمّ عمليةَ `fork` الابنة — فتبقى ممسكة بالمنفذ
 * 48211 وتمنع أي محاولة تشغيل تالية بخطأ EADDRINUSE.
 *
 * `app.exit()` لا `app.quit()`: تسلسل `before-quit` يُنفّذ مزامنة إغلاق إلى
 * Google Drive، ولا يجوز أن ترفع بيئةٌ فشل إقلاعُها أي شيء إلى السحابة.
 */
function abortAfterStartupFailure(): void {
  try {
    stopBackend();
  } catch {
    // أفضل جهد — الخروج يجب ألّا يتعطّل بسبب فشل الإيقاف.
  }
  app.exit(1);
}

/**
 * الفشل النهائي للإقلاع — **يُعرَض ولا يُبتلع**.
 *
 * ── ما كان يحدث قبل هذه الحزمة ────────────────────────────────────────────────
 *
 * `catch { console.error(...); app.quit(); }` — و`console.error` في تطبيق مُعبَّأ
 * لا يصل إلى أي طرفية. فكانت النتيجة العملية: نقر المستخدم على الاختصار، ولا
 * يحدث شيء على الإطلاق. لا نافذة، ولا خطأ، ولا أثر.
 *
 * ── العقد الآن ─────────────────────────────────────────────────────────────────
 *
 * لا `app.quit()` قبل أن يرى المستخدم السبب. نافذة بدء التشغيل تتحوّل إلى حالة
 * فشل تعرض الرسالة والتفاصيل الحقيقية (رمز الخروج، آخر أسطر خطأ الخدمة، مسار
 * السجلّ)، وتنتظر ضغط المستخدم على «إغلاق». وإن تعذّر عرضها لأي سبب، يُستخدم
 * حوار النظام كطبقة أخيرة — فلا يوجد مسار فشل صامت واحد.
 */
function reportStartupFailure(err: unknown): void {
  const detail =
    err instanceof BackendStartupError
      ? err.describe()
      : err instanceof Error
        ? err.stack ?? err.message
        : String(err);
  const message = err instanceof Error ? err.message : 'خطأ غير متوقع أثناء بدء التشغيل';

  // eslint-disable-next-line no-console
  console.error('فشل بدء التطبيق:', err);

  if (startupWindow?.isAlive()) {
    reportStartup('FAILED', message, { detail });
    return; // التطبيق يبقى حيًّا حتى يضغط المستخدم «إغلاق» في النافذة.
  }

  // لا نافذة (فشل قبل إنشائها أو أُغلقت) ⇒ حوار النظام، ثم خروج صريح.
  dialog.showMessageBoxSync({
    type: 'error',
    title: 'نظام المنار — تعذّر بدء التشغيل',
    message,
    detail,
    buttons: ['إغلاق'],
  });
  abortAfterStartupFailure();
}

async function bootstrap() {
  try {
    // النافذة أولًا — قبل أي عمل قد يستغرق وقتًا. هذه هي النقطة التي كان
    // المستخدم فيها يرى العدم.
    startupWindow = createStartupWindow({ onQuitRequested: abortAfterStartupFailure });
    reportStartup('ENVIRONMENT', 'فحص بيئة التشغيل...');

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

    // `getUserDataPaths()` أعلاه نفّذ تهيئة مجلد البيانات وبذر أول تشغيل.
    reportStartup('DATA_DIR', 'تهيئة مجلد البيانات...');

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
    // Form Editor UX Rebuild v2 — Word export (additive; PDF/HTML export paths above
    // are unchanged).
    registerDocxIpc();
    registerAttachmentsIpc();
    // NBK Salary Export — Native XLS Generation v1 (additive; other Excel exports unchanged).
    registerNbkExportIpc();
    // Legacy Cheque Template Recovery v1 — read-only lookup of templates stranded
    // in a previous `userData` folder. Registers a handler only; it scans nothing
    // until the renderer asks, and it can neither write nor block startup.
    registerLegacyRecoveryIpc();
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
    reportStartup('CLOUD_SYNC', 'فحص المزامنة السحابية...');
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

    // المرحلة الأطول. عدّاد الثواني يجعل الانتظار مفهومًا على جهاز بطيء بدل أن
    // يبدو تعليقًا — والفشل الحقيقي يُكتشف فورًا عبر خروج العملية لا بانتظار المهلة.
    reportStartup('BACKEND', 'تشغيل الخدمة الخلفية...');
    await startBackend(INTERNAL_SECRET, (elapsedSeconds) => {
      reportStartup('BACKEND', 'تشغيل الخدمة الخلفية...', { elapsedSeconds });
    });

    await startBackupScheduler(INTERNAL_SECRET); // ثم جدولة النسخ التلقائي
    runCatchupIfNeeded(INTERNAL_SECRET).catch(console.error); // نسخة تعويضية إذا فات وقت الجدولة

    reportStartup('READY', 'اكتملت التهيئة — جارٍ فتح النظام');

    mainWindow = createMainWindow();
    // النافذة الرئيسية تُظهر نفسها عند `ready-to-show`؛ إغلاق شاشة البدء عندها
    // يمنع وميض سطح المكتب بين اختفاء الأولى وظهور الثانية.
    mainWindow.once('ready-to-show', () => {
      startupWindow?.close();
      startupWindow = null;
    });
    registerMainWindow(mainWindow);
    registerContextMenuIpc(mainWindow);
    // WYSIWYG viewer guard — suppresses PDFium's Ctrl+P / Ctrl+S exits, but ONLY while a
    // WYSIWYG preview is open. One listener for the window's lifetime; no global blocking.
    registerWysiwygViewerGuard(mainWindow);

    // View Zoom Manual Save Pack v1. Restores the last EXPLICITLY saved zoom
    // level once, on the window's first paint, so a manual "إعادة تحميل" later
    // in this menu keeps behaving exactly as before (it is not treated as a
    // relaunch) — this restoration listener is `.once` and is never registered
    // again for the rest of the process's life. There is no listener anywhere
    // that detects a zoom change: saving happens only from the explicit "حفظ
    // مستوى التكبير الحالي كافتراضي" menu item below, which reads the live zoom
    // and writes it synchronously. See `viewZoomPreference.pure.ts` for why the
    // previous `zoom-changed`-driven auto-save was removed.
    const savedZoomLevel = readSavedZoomLevel(bootDataDir);
    const mainWebContents = mainWindow.webContents;
    if (savedZoomLevel !== null) {
      mainWebContents.once('did-finish-load', () => {
        if (!mainWebContents.isDestroyed()) mainWebContents.setZoomLevel(savedZoomLevel);
      });
    }

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
            { type: 'separator' },
            {
              label: '💾 حفظ مستوى التكبير الحالي كافتراضي',
              // View Zoom Manual Save Pack v1 — the ONLY place a zoom level is ever
              // written to disk. Reads the live level at click time (never a cached
              // or stale value) and writes it synchronously; does not change the
              // live zoom itself. `bootDataDir` and `mainWebContents` are the same
              // values the restoration above already captured.
              click: () => {
                if (mainWebContents.isDestroyed()) return;
                saveZoomLevel(bootDataDir, mainWebContents.getZoomLevel());
                new Notification({
                  title: 'نظام المنار',
                  body: 'تم حفظ مستوى التكبير الحالي كافتراضي',
                }).show();
              },
            },
          ],
        },
      ]),
    );
  } catch (err) {
    // لا `app.quit()` هنا إطلاقًا. `reportStartupFailure` يعرض السبب الحقيقي
    // ويترك القرار للمستخدم — انظر تعليق الدالة لتفصيل ما كان يحدث سابقًا.
    reportStartupFailure(err);
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

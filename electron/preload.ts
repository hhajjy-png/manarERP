import { contextBridge, ipcRenderer } from 'electron';
import type { PrintPageOptions } from './ipc/printPageOptions';

/** معلومات نسخة قاعدة بيانات واحدة (محلية أو سحابية) — لعرضها في حوار حلّ التعارض. */
interface DatabaseVersionInfo {
  sha256: string;
  sizeBytes: number;
  modifiedAt: string;
  deviceId: string | null;
  deviceName: string | null;
}

/**
 * نتيجة النسخة المحلية المضمونة بعد فشل عملية سحابية
 * (Cloud-Failure Local Backup Guarantee v1). موجودة فقط عند فشل العملية السحابية.
 */
interface RescueBackupOutcomeInfo {
  ok: boolean;
  /** مسار الإنتاج: خدمة النسخ في الخادم الخلفي، أو لقطة مباشرة حين يكون متوقفًا. */
  via: 'BACKEND_SERVICE' | 'DIRECT_SNAPSHOT' | null;
  fileName?: string;
  filePath?: string;
  sizeBytes?: number;
  error?: string;
}

interface SyncConflictInfo {
  local: DatabaseVersionInfo;
  remote: DatabaseVersionInfo;
  recommendation: 'LOCAL' | 'REMOTE' | 'UNKNOWN';
}

/**
 * جسر آمن (contextBridge) يكشف واجهة محدودة للواجهة الأمامية فقط.
 * لا نعرّض ipcRenderer كاملًا حفاظًا على الأمان.
 */
const api = {
  /** عنوان الخدمة الخلفية المحلية. */
  apiBaseUrl: 'http://127.0.0.1:48211/api',

  /** اختيار مسار لحفظ نسخة/تصدير قاعدة البيانات. */
  chooseSavePath: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save', defaultName),

  /** اختيار ملف نسخة احتياطية للاستعادة. */
  chooseBackupFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openBackup'),

  /** إعادة تشغيل التطبيق (بعد الاستعادة). */
  restartApp: (): Promise<void> => ipcRenderer.invoke('app:restart'),

  /** طباعة الصفحة الحالية (للفواتير/التقارير). يُحل بعد إغلاق حوار الطباعة فعليًا
   *  بالنتيجة الحقيقية من Electron (نجاح/إلغاء/فشل) — راجع app:print في dialog.ipc.ts.
   *
   *  خيارات الهندسة الفيزيائية (pageSize/marginType/scaleFactor) إضافية واختيارية
   *  — تستخدمها طباعة الشيكات لتثبيت مقاس الورق والهوامش والمقياس بدل توارثها من
   *  حوار نظام التشغيل. المستدعون القدامى (الفواتير/التقارير/ورقة المعايرة) الذين
   *  لا يمرّرون شيئًا أو يمرّرون landscape فقط يبقى سلوكهم مطابقًا تمامًا. */
  printPage: (options?: PrintPageOptions): Promise<{ success: boolean; failureReason?: string }> =>
    ipcRenderer.invoke('app:print', options),

  /** معلومات التطبيق (الإصدار). */
  getAppInfo: (): Promise<{ version: string; platform: string }> =>
    ipcRenderer.invoke('app:info'),

  // ─── Backup / Restore (Electron IPC مباشر — مستقل عن الخادم الخلفي) ────────

  /** إنشاء نسخة احتياطية — يفتح حوار الحفظ في العملية الرئيسية. */
  backupCreate: (): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('backup:create'),

  /**
   * استعادة قاعدة البيانات من ملف .db خارجي.
   * ينشئ نسخة أمان تلقائية قبل الاستعادة ويوقف الخادم الخلفي.
   */
  backupRestore: (sourcePath: string): Promise<{
    success: boolean;
    requiresRestart?: boolean;
    autoBackupPath?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('backup:restore', sourcePath),

  /** إرجاع معلومات مسار قاعدة البيانات الحالية. */
  getDbPath: (): Promise<{
    dir: string;
    backupDir: string;
    exists: boolean;
    sizeBytes: number;
    isDev: boolean;
  }> => ipcRenderer.invoke('backup:getDatabasePath'),

  /** إرسال توكن الجلسة إلى العملية الرئيسية للتحقق منه عبر Backend. */
  setSessionToken: (token: string | null): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('session:setToken', token),

  /** إعادة قراءة إعدادات النسخ التلقائي وتطبيقها على الجدولة. */
  backupReconfigure: (): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke('backup:reconfigure'),

  /** تصدير الصفحة الحالية كملف PDF — يفتح حوار الحفظ في العملية الرئيسية. */
  exportPdf: (suggestedName: string): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('pdf:export', suggestedName),

  /** تصدير HTML كـ PDF عبر Chromium (يُستخدم للتقارير العربية). */
  exportPdfFromHtml: (
    html: string,
    suggestedName: string,
  ): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('pdf:exportHtml', html, suggestedName),

  /** حفظ ملف Word (.docx) جاهز — يُبنى بالكامل في الواجهة عبر مكتبة docx، وهذا
   *  يفتح حوار الحفظ ويكتب البايتات حيث اختار المستخدم (Form Editor UX Rebuild v2). */
  exportDocxBytes: (
    bytes: Uint8Array,
    suggestedName: string,
  ): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('docx:export', bytes, suggestedName),

  /** فتح مربع حوار اختيار ملف للإرفاق — يُعيد المسار أو null إذا ألغى المستخدم. */
  openFileDialog: (): Promise<string | null> =>
    ipcRenderer.invoke('attachments:openFileDialog'),

  /** فتح ملف مرفق بالتطبيق الافتراضي للنظام — يُعيد null عند النجاح أو رسالة الخطأ. */
  openAttachment: (filePath: string): Promise<string | null> =>
    ipcRenderer.invoke('attachments:openPath', filePath),

  // ─── Print Center Foundation v1 (additive — printPage/exportPdf above unchanged) ──

  /** بوابة الطباعة الموحّدة — تُرسل أمر طباعة مُهيكل إلى العملية الرئيسية. */
  printSubmit: (job: unknown): Promise<{
    status: 'printed' | 'exported' | 'canceled' | 'failed';
    filePath?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('print:submit', job),

  /** قائمة الطابعات المتاحة في النظام (لا واجهة تستهلكها بعد — أساس المرحلة القادمة). */
  listPrinters: (): Promise<
    Array<{ name: string; displayName: string; description: string; isDefault: boolean; status: number }>
  > => ipcRenderer.invoke('print:listPrinters'),


  // ─── True Chromium WYSIWYG Preview POC (additive — يولّد PDF للمعاينة فقط، لا يطبع) ──

  /** توليد معاينة مُرقّمة حقيقية عبر Chromium من مستند المعاينة المُركّب نفسه. */
  generateWysiwygPreviewPoc: (html: string): Promise<{
    ok: boolean;
    pdf?: Uint8Array;
    /** `null` عند تعذّر عدّ الصفحات بثقة — لا يُعرض «0» أبدًا. */
    pageCount?: number | null;
    readyMs?: number;
    error?: string;
  }> => ipcRenderer.invoke('wysiwygPoc:generate', html),

  /**
   * إعلام العملية الرئيسية بأن عارض WYSIWYG **مفتوح الآن**، فتكبت اختصاري PDFium
   * (‎Ctrl+P‎ / ‎Ctrl+S‎) اللذين يلتفّان على مسار الطباعة الرسمي. يعيد رمز الجلسة.
   *
   * ليست واجهة تحكّم بلوحة المفاتيح: لا تختار مفاتيح، ولا تكبت شيئًا آخر، ولا تفعل
   * شيئًا إطلاقًا ما لم يكن العارض مفتوحًا.
   */
  wysiwygViewerActivate: (): Promise<number | null> =>
    ipcRenderer.invoke('wysiwygViewer:activate'),

  /** إنهاء جلسة العارض. رمز قديم (حوار سابق) يُتجاهل ولا يُعطّل حارس حوارٍ أحدث. */
  wysiwygViewerDeactivate: (token: number): Promise<boolean> =>
    ipcRenderer.invoke('wysiwygViewer:deactivate', token),

  // ─── Google Drive Sync Foundation v1 ─────────────────────────────────────────

  /** حالة المزامنة الحالية: التهيئة، الاتصال، آخر مزامنة، معلومات القاعدة المحلية. */
  syncGetStatus: (): Promise<{
    status: string;
    message: string;
    configured: boolean;
    authenticated: boolean;
    account: string | null;
    lastSyncAt: string | null;
    lastUploadAt: string | null;
    lastDownloadAt: string | null;
    lastSyncedVersion: number | null;
    lastError: string | null;
    /** Production Hardening Pack v1 — انتهت صلاحية ربط Google ويجب إعادة الربط. */
    needsReauth?: boolean;
    /** سبب انقطاع الربط بالعربية — يبقى بعد إعادة تشغيل التطبيق حتى يُعاد الربط. */
    grantDeadMessage?: string | null;
    localDb: { exists: boolean; sizeBytes: number };
    device: { deviceId: string; deviceName: string };
  }> => ipcRenderer.invoke('sync:getStatus'),

  /** سجلّ آخر عمليات المزامنة (حتى 50 عملية، الأحدث أولًا). */
  syncGetLog: (): Promise<
    Array<{
      at: string;
      action: string;
      result: string;
      message: string;
      deviceId?: string;
      deviceName?: string;
      conflictResolved?: boolean;
      resolutionSelected?: 'LOCAL' | 'REMOTE';
      /** Production Polish Pack v1 — توقيت العملية ومدّتها (تغيب في الإدخالات القديمة). */
      startedAt?: string;
      durationMs?: number;
      /** الإجراء المقترح — يُحسب في العملية الرئيسية من قاعدة واحدة. */
      suggestedAction?: 'NONE' | 'RECONNECT' | 'RETRY' | 'RESOLVE_CONFLICT' | 'CHECK_BACKUPS' | 'CHECK_NETWORK';
    }>
  > => ipcRenderer.invoke('sync:getLog'),

  /** بدء تدفّق تسجيل الدخول إلى Google عبر متصفح النظام. */
  syncAuthenticate: (): Promise<{ ok: boolean; email?: string; error?: string }> =>
    ipcRenderer.invoke('sync:authenticate'),

  /** فصل حساب Google الحالي ومسح التوكنات المخزّنة محليًا. */
  syncDisconnect: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('sync:disconnect'),

  /** مزامنة كاملة تلقائية الاتجاه (رفع أو تنزيل حسب الحاجة). */
  syncNow: (): Promise<{
    ok: boolean;
    action: string;
    error?: string;
    requiresRestart?: boolean;
    /** الخادم الخلفي أُعيد تشغيله تلقائيًا بعد استبدال قاعدة البيانات — الواجهة تحتاج لإعادة تحميل نفسها فقط، لا إعادة تشغيل التطبيق. */
    backendRestarted?: boolean;
    conflict?: SyncConflictInfo;
    /** النسخة المحلية المضمونة — تُملأ عند فشل العملية السحابية فقط. */
    rescueBackup?: RescueBackupOutcomeInfo;
    /** المنحة ميتة — الإجراء المطلوب إعادة ربط الحساب لا إعادة المحاولة. */
    needsReauth?: boolean;
    /** رُفضت العملية لوجود مزامنة أخرى جارية. */
    busy?: boolean;
  }> => ipcRenderer.invoke('sync:now'),

  /**
   * رفع قاعدة البيانات المحلية إلى Google Drive — **بعد المرور بمحرّك القرار**.
   *
   * Data Safety Pack v2 (F-01): لم يعد رفعًا «إجباريًا». يمرّ بنفس فحص التغييرات
   * وكشف التعارض الذي تمرّ به المزامنة الكاملة، ولا يُنفَّذ الرفع إلا إذا كان القرار
   * `UPLOAD`. الحقل `action` يُعلن ما قرّره المحرّك فعلًا.
   */
  syncUpload: (): Promise<{
    ok: boolean;
    error?: string;
    /** قرار المحرّك: UPLOAD نُفِّذ · CONFLICT يحتاج قرارك · DOWNLOAD رُفض الرفع · NONE محدّث. */
    action?: string;
    rescueBackup?: RescueBackupOutcomeInfo;
    /** رُفض الرفع لأن النسخة السحابية تغيّرت من جهاز آخر — يلزم قرار المستخدم. */
    conflict?: SyncConflictInfo;
    needsReauth?: boolean;
    busy?: boolean;
    /** أُلغيت العملية لانتهاء المهلة قبل أي كتابة. */
    aborted?: boolean;
  }> => ipcRenderer.invoke('sync:upload'),

  /** تنزيل يدوي إجباري من Google Drive مع استبدال آمن (ذرّي) لقاعدة البيانات المحلية. */
  syncDownload: (): Promise<{
    ok: boolean;
    error?: string;
    requiresRestart?: boolean;
    backendRestarted?: boolean;
    rescueBackup?: RescueBackupOutcomeInfo;
    needsReauth?: boolean;
    busy?: boolean;
  }> => ipcRenderer.invoke('sync:download'),

  // ─── Google Drive Conflict Resolution Pack v1 ────────────────────────────────

  /** فحص سلبي (بلا آثار جانبية) لوجود تعارض مزامنة حاليًا — يُستخدم لعرض الحوار استباقيًا. */
  syncGetConflict: (): Promise<SyncConflictInfo | null> => ipcRenderer.invoke('sync:getConflict'),

  /** ينفّذ اختيار المستخدم الصريح في حوار حلّ التعارض (الاحتفاظ بالمحلي أو السحابي). */
  syncResolveConflict: (choice: 'LOCAL' | 'REMOTE'): Promise<{
    ok: boolean;
    error?: string;
    requiresRestart?: boolean;
    backendRestarted?: boolean;
    rescueBackup?: RescueBackupOutcomeInfo;
    /** رُفض «الاحتفاظ بالمحلي» لأن النسخة السحابية تغيّرت أثناء فتح الحوار. */
    conflict?: SyncConflictInfo;
    needsReauth?: boolean;
    busy?: boolean;
  }> => ipcRenderer.invoke('sync:resolveConflict', choice),

  // ─── Production UX & Diagnostics Pack v1 ─────────────────────────────────────

  /** تشخيص سلبي كامل — بلا شبكة وبلا استعلام Google (§9). */
  syncGetDiagnostics: (): Promise<{
    items: Array<{ key: string; status: string; tone: string; icon: string; value: string | null }>;
    health: { score: number; grade: 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL'; reasons: string[] };
    /** §5 — متى تغيّرت الصحة ومتى انخفضت آخر مرة. */
    trend: {
      lastChangeAt: string | null;
      previousScore: number | null;
      lastDropAt: string | null;
      lastDropDelta: number | null;
    };
    /** §3 — آخر مرة حدث فيها كل نوع من أحداث التشخيص. */
    history: Array<{ key: string; at: string | null; icon: string; tone: string }>;
    /** تقرير نصّي جاهز للنسخ — بلا أي رمز أو سرّ. */
    report: string;
    /** كتلة دعم فني مختصرة — بلا أي رمز أو سرّ. */
    supportInfo: string;
    /** لقطة الحقائق الخام — تستخدمها الواجهة لقسم «معلومات المحرّك» والتصدير. */
    snapshot: {
      appVersion: string;
      platform: string;
      deviceName: string;
      engine: {
        engineVersion: string;
        engineUpdatedAt: string;
        oauthModel: string;
        driveApi: string;
        localStorage: string;
        tokenStorage: string;
        encryptionAvailable: boolean;
      };
      [key: string]: unknown;
    };
  }> => ipcRenderer.invoke('sync:getDiagnostics'),

  /** اختبار اتصال صريح بطلب المستخدم — الاستدعاء الوحيد الذي يلمس الشبكة. */
  syncTestConnection: (): Promise<{
    ok: boolean;
    internet: 'ok' | 'fail' | 'unknown';
    drive: 'ok' | 'fail' | 'unknown';
    message?: string;
    error?: string;
    needsReauth?: boolean;
    busy?: boolean;
  }> => ipcRenderer.invoke('sync:testConnection'),

  /** §4 — إصلاح الاتصال بضغطة واحدة: فصل ← إعادة ربط ← اختبار تحقّق. */
  syncRepairConnection: (): Promise<{
    ok: boolean;
    email?: string;
    message: string;
    verified?: boolean;
  }> => ipcRenderer.invoke('sync:repairConnection'),

  // ─── NBK Salary Export — Native XLS Generation v1 ────────────────────────────
  // Generates the NBK bank salary .xls through native Microsoft Excel COM automation
  // (replacing SheetJS as the final writer for this export ONLY — proven by manual
  // Excel A/B testing to avoid the Office File Validation Protected View warning).
  generateNbkSalaryXls: (
    sheets: Array<{ name: string; columns: { header: string; key: string }[]; rows: Array<Record<string, string | number>> }>,
  ): Promise<{
    success: boolean;
    bytes?: Uint8Array;
    error?: string;
    errorCode?: string;
  }> => ipcRenderer.invoke('nbkExport:generateXls', sheets),

  // ─── Legacy Cheque Template Recovery v1 ──────────────────────────────────────
  // Read-only lookup of cheque designer templates left behind in a PREVIOUS
  // `userData` folder (the folder moved when `productName` was introduced, and
  // Chromium partitions localStorage by that path). Returns what was found and
  // every location inspected; it writes nothing and decides nothing — the
  // backend owns the "only once, only into an empty database" rules.
  scanLegacyChequeTemplates: (): Promise<{
    found: {
      templates: unknown[];
      source: { userDataName: string; leveldbPath: string; origin: string; file: string };
    } | null;
    inspected: { path: string; outcome: string }[];
  }> => ipcRenderer.invoke('legacyTemplates:scan'),

};

contextBridge.exposeInMainWorld('manar', api);

export type ManarApi = typeof api;

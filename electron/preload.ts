import { contextBridge, ipcRenderer } from 'electron';

/** معلومات نسخة قاعدة بيانات واحدة (محلية أو سحابية) — لعرضها في حوار حلّ التعارض. */
interface DatabaseVersionInfo {
  sha256: string;
  sizeBytes: number;
  modifiedAt: string;
  deviceId: string | null;
  deviceName: string | null;
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

  /** طباعة الصفحة الحالية (للفواتير/التقارير). */
  printPage: (options?: { landscape?: boolean }): Promise<void> => ipcRenderer.invoke('app:print', options),

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
  }> => ipcRenderer.invoke('sync:now'),

  /** رفع يدوي إجباري لقاعدة البيانات المحلية إلى Google Drive. */
  syncUpload: (): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('sync:upload'),

  /** تنزيل يدوي إجباري من Google Drive مع استبدال آمن (ذرّي) لقاعدة البيانات المحلية. */
  syncDownload: (): Promise<{
    ok: boolean;
    error?: string;
    requiresRestart?: boolean;
    backendRestarted?: boolean;
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
  }> => ipcRenderer.invoke('sync:resolveConflict', choice),

};

contextBridge.exposeInMainWorld('manar', api);

export type ManarApi = typeof api;

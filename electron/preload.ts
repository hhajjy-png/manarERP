import { contextBridge, ipcRenderer } from 'electron';

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
  printPage: (): Promise<void> => ipcRenderer.invoke('app:print'),

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
};

contextBridge.exposeInMainWorld('manar', api);

export type ManarApi = typeof api;
